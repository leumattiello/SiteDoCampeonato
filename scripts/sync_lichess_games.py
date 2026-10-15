#!/usr/bin/env python3
"""Melhoria #2: incorpora metadados públicos dos jogos Lichess ao JSON do GitHub Pages.

Somente leitura. NÃO modifica o Google Sheets, resultado, status ou bye dos confrontos.
Execute DEPOIS de sync_google_sheets.py e validate_lichess_players.py.

Cache: partidas finalizadas são imutáveis; em andamento são reconsultadas após 15 minutos.
No GitHub Actions, o cache opcional é restaurado por actions/cache, não versionado.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
from http.client import HTTPException
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / 'data' / 'campeonatos.json'
DEFAULT_CACHE = ROOT / '.cache' / 'lichess-games.json'
GAME_ID = re.compile(r'^[A-Za-z0-9]{8}(?:[A-Za-z0-9]{4})?$')
PUBLIC_GAME_ID = re.compile(r'^[A-Za-z0-9]{8}$')
FINAL_STATUSES = {'mate', 'resign', 'stalemate', 'timeout', 'draw', 'outoftime', 'cheat',
                  'noStart', 'unknownFinish', 'variantEnd', 'aborted'}
USER_AGENT = 'ReinosDoXadrez/1.0 (GitHub Actions; public game reader)'
MAX_BYTES = 512 * 1024
ACTIVE_TTL_SECONDS = 15 * 60


class GameUnavailable(Exception):
    """Erro não definitivo de download / resposta inválida."""


class GameNotFound(GameUnavailable):
    pass


class GameAccessDenied(GameUnavailable):
    """HTTP 401: sem acesso público ao recurso; não presume causa."""
    pass


class RateLimited(GameUnavailable):
    pass


def parse_game_id(value):
    """Aceita apenas links de partidas Lichess.

    URLs com 12 caracteres contêm 8 de ID público + 4 do token de acesso
    do link privado. A API game/export aceita SOMENTE os 8 primeiros;
    nunca encaminhar o token de 4 caracteres à API nem imprimi-lo no log.
    """
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parts = urlparse(value.strip())
        if parts.scheme != 'https' or parts.hostname not in {'lichess.org', 'www.lichess.org'}:
            return None
        if parts.username or parts.password or parts.port not in (None, 443):
            return None
        segments = parts.path.strip('/').split('/')
        if not 1 <= len(segments) <= 2:
            return None
        if not GAME_ID.fullmatch(segments[0]):
            return None
        if len(segments) == 2 and segments[1] not in ('white', 'black'):
            return None
        return segments[0][:8]
    except ValueError:
        return None


def fetch_public_game(game_id, *, opener=urlopen, pause=time.sleep, attempts=2, timeout=14):
    """Obtém JSON do endpoint oficial, uma requisição por vez; 429 espera 60s."""
    if not PUBLIC_GAME_ID.fullmatch(game_id):
        raise ValueError('game id público inválido: usar 8 caracteres')
    url = f'https://lichess.org/game/export/{quote(game_id, safe="")}?moves=true&opening=true&clocks=false&evals=false'
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': USER_AGENT})
    for attempt in range(attempts):
        try:
            with opener(request, timeout=timeout) as response:
                raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise GameUnavailable('resposta maior que o limite')
            payload = json.loads(raw.decode('utf-8'))
            if not isinstance(payload, dict) or str(payload.get('id', '')).casefold() != game_id.casefold():
                raise GameUnavailable('ID da resposta diferente do solicitado')
            return payload
        except HTTPError as exc:
            if exc.code == 404:
                raise GameNotFound('HTTP 404: partida não encontrada pela API pública; conferir link e ID') from exc
            if exc.code == 401:
                raise GameAccessDenied('HTTP 401: consulta não autorizada; verificar acesso à partida sem login') from exc
            if exc.code == 429:
                if attempt + 1 < attempts:
                    print('Lichess jogos: HTTP 429 — aguardando 60 segundos antes de tentar novamente.')
                    pause(60)
                    continue
                raise RateLimited('HTTP 429: limite de requisições') from exc
            raise GameUnavailable(f'HTTP {exc.code}') from exc
        except (URLError, TimeoutError, OSError, HTTPException, ValueError, UnicodeError) as exc:
            if isinstance(exc, GameUnavailable):
                raise
            raise GameUnavailable(type(exc).__name__) from exc
    raise GameUnavailable('número máximo de tentativas')


def utc_now():
    return datetime.now(timezone.utc)


def timestamp(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return None
    try:
        # API retorna epoch milliseconds.
        return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat(timespec='seconds')
    except (OverflowError, OSError, ValueError):
        return None


def player_info(p):
    if not isinstance(p, dict):
        return {'id': None, 'name': None}
    user = p.get('user') if isinstance(p.get('user'), dict) else {}
    ident = user.get('id') or p.get('userId')
    name = user.get('name') or p.get('name') or ident
    return {'id': str(ident).lower() if ident is not None else None,
            'name': str(name) if name is not None else None}


def normalize_game(data, *, checked_at):
    """Mantém campos úteis a #3, #4, #6 e #8 sem armazenar dados não públicos."""
    if not isinstance(data, dict) or not PUBLIC_GAME_ID.fullmatch(str(data.get('id', ''))):
        raise GameUnavailable('JSON não contém ID de partida válido')
    players = data.get('players') if isinstance(data.get('players'), dict) else {}
    opening = data.get('opening') if isinstance(data.get('opening'), dict) else {}
    moves = data.get('moves') if isinstance(data.get('moves'), str) else None
    days = data.get('daysPerTurn')
    return {
        'id': data['id'], 'url': f"https://lichess.org/{data['id']}",
        'status': str(data.get('status') or 'desconhecido'),
        'winner': data.get('winner') if data.get('winner') in ('white', 'black') else None,
        'players': {'white': player_info(players.get('white')),
                    'black': player_info(players.get('black'))},
        'createdAt': timestamp(data.get('createdAt')),
        'lastMoveAt': timestamp(data.get('lastMoveAt')),
        'moves': moves[:20000] if moves else None,
        'opening': {'name': opening.get('name'), 'eco': opening.get('eco')} if opening else None,
        'perf': data.get('perf') if isinstance(data.get('perf'), str) else None,
        'daysPerTurn': days if isinstance(days, (int, float)) and not isinstance(days, bool) else None,
        'fetchedAt': checked_at,
    }


FINAL_STATUSES_LOWER = {s.casefold() for s in FINAL_STATUSES}


def final_game(game):
    return str(game.get('status', '')).casefold() in FINAL_STATUSES_LOWER


def load_cache(cache_path):
    try:
        data = json.loads(cache_path.read_text(encoding='utf-8'))
        if isinstance(data, dict) and data.get('version') == 1 and isinstance(data.get('games'), dict):
            return {k: v for k, v in data['games'].items() if isinstance(k, str) and isinstance(v, dict)}
    except (OSError, ValueError, TypeError):
        pass
    return {}


def cache_fresh(entry, now, *, refresh_active=False):
    payload = entry.get('game') if isinstance(entry, dict) else None
    if not isinstance(payload, dict):
        return False
    if final_game(payload):
        return True
    if refresh_active:
        return False
    try:
        age = (now - datetime.fromisoformat(entry['fetchedAt'].replace('Z', '+00:00'))).total_seconds()
        return 0 <= age < ACTIVE_TTL_SECONDS
    except (ValueError, KeyError, TypeError):
        return False


def sync_games(data, *, cache=None, lookup=fetch_public_game, now=None, refresh_active=False, pause=time.sleep):
    """Enriquece partidas com lichessGame/lichessImport, nunca resultados oficiais.

    O lookup é injetável para que testes não dependam de rede. Atraso entre
    requisições reais é sequencial e o bloqueio por 429 suspende chamadas seguintes.
    """
    now = now or utc_now()
    stamp = now.isoformat(timespec='seconds')
    cache = cache if cache is not None else {}
    queue = {}
    matches = []
    for tournament in data.get('tournaments', []):
        for match in tournament.get('matches', []):
            if match.get('result') == 'bye' or (match.get('status') or '').casefold() == 'bye':
                continue
            url = match.get('url')
            if not url:
                continue
            matches.append(match)
            ident = parse_game_id(url)
            if ident is None:
                match['lichessImport'] = {'status': 'link_invalido', 'checkedAt': stamp}
                match.pop('lichessGame', None)
                continue
            queue.setdefault(ident.lower(), {'id': ident, 'matches': []})['matches'].append(match)

    summary = Counter()
    locked = False
    for item in queue.values():
        gid = item['id']
        previous = cache.get(gid.lower(), {})
        game = previous.get('game') if isinstance(previous, dict) else None
        from_cache = cache_fresh(previous, now, refresh_active=refresh_active)
        error_http_status = None
        if from_cache:
            status = 'cache'
            summary['cache'] += 1
        elif locked:
            status = 'desatualizado' if isinstance(game, dict) else 'indisponivel'
            summary['indisponivel'] += 1
        else:
            try:
                payload = lookup(gid)
                game = normalize_game(payload, checked_at=stamp)
                cache[gid.lower()] = {'fetchedAt': stamp, 'game': game}
                status = 'ok'
                summary['consultados'] += 1
            except GameAccessDenied as exc:
                error_http_status = 401
                summary['acesso_restrito'] += 1
                status = 'desatualizado' if isinstance(game, dict) else 'acesso_restrito'
                summary['indisponivel'] += 1
                print(f'Lichess jogos: {gid}: {exc}', file=sys.stderr)
            except GameNotFound as exc:
                error_http_status = 404
                summary['nao_encontrado'] += 1
                status = 'desatualizado' if isinstance(game, dict) else 'nao_encontrado'
                summary['indisponivel'] += 1
                print(f'Lichess jogos: {gid}: {exc}', file=sys.stderr)
            except RateLimited as exc:
                locked = True
                status = 'desatualizado' if isinstance(game, dict) else 'indisponivel'
                summary['indisponivel'] += 1
                print(f'Lichess jogos: {gid}: {type(exc).__name__} — outras consultas suspensas.', file=sys.stderr)
            except GameUnavailable as exc:
                status = 'desatualizado' if isinstance(game, dict) else 'indisponivel'
                summary['indisponivel'] += 1
                print(f'Lichess jogos: {gid}: {exc}', file=sys.stderr)
            except Exception as exc:
                status = 'desatualizado' if isinstance(game, dict) else 'indisponivel'
                summary['indisponivel'] += 1
                print(f'Lichess jogos: {gid}: erro transitório {type(exc).__name__}', file=sys.stderr)
            if status == 'ok':
                pause(0.35)
        for match in item['matches']:
            if isinstance(game, dict) and game.get('id', '').casefold() == gid.lower():
                match['lichessGame'] = game
            else:
                match.pop('lichessGame', None)
            match['lichessImport'] = {'status': status, 'checkedAt': stamp}
            if error_http_status is not None:
                match['lichessImport']['httpStatus'] = error_http_status
        print(f'Lichess jogos: {gid} — {status}')

    summary['links'] = len(matches)
    summary['jogos_unicos'] = len(queue)
    summary['links_invalidos'] = sum(m.get('lichessImport', {}).get('status') == 'link_invalido' for m in matches)
    data.setdefault('source', {})['lichessGamesCheckedAt'] = stamp
    data['source']['lichessGamesSummary'] = dict(summary)
    print(f"Lichess jogos: {summary['links']} links, {summary['jogos_unicos']} jogos únicos, "
          f"{summary['consultados']} consultas, {summary['cache']} em cache, "
          f"{summary['links_invalidos']} links inválidos, {summary['indisponivel']} indisponíveis "
          f"({summary['acesso_restrito']} HTTP 401, {summary['nao_encontrado']} HTTP 404).")
    return dict(summary)


def persist_cache(cache_path, cache):
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    # cache simples e bounded, mais recentes primeiro; neste campeonato são poucas dezenas.
    recent = sorted(cache.items(), key=lambda item: item[1].get('fetchedAt', ''), reverse=True)[:500]
    cache_path.write_text(json.dumps({'version': 1, 'games': dict(recent)}, ensure_ascii=False), encoding='utf-8')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, default=DEFAULT_JSON)
    parser.add_argument('--cache', type=Path, default=DEFAULT_CACHE)
    parser.add_argument('--refresh-active', action='store_true', help='Ignora TTL para jogos não encerrados')
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.file.read_text(encoding='utf-8'))
        cache = load_cache(args.cache)
        sync_games(data, cache=cache, refresh_active=args.refresh_active)
        # Salvar antes de anunciar sucesso; artefato Pages é só dado derivado.
        args.file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        persist_cache(args.cache, cache)
        return 0
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f'ERRO: leitura/gravação de JSON Lichess: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
