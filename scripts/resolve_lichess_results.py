#!/usr/bin/env python3
"""Melhoria #3: concilia informações Lichess com confrontos da planilha.

Somente adiciona `lichessDecision` a cada confronto no JSON publicado; nunca
substitui `result`, `status`, `byePoints` ou as abas do Google Sheets. O site
utiliza a decisão verificada como fallback quando a planilha não tem placar.

Executar após sync_google_sheets, validate_lichess_players e sync_lichess_games.
"""

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

if __package__:
    from .sync_lichess_games import parse_game_id
else:  # `python3 scripts/resolve_lichess_results.py` no GitHub Actions
    from sync_lichess_games import parse_game_id

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILE = ROOT / 'data' / 'campeonatos.json'

# Os valores reais da API são strings; partidas canceladas ou aguardando aceite
# não têm resultado esportivo e nunca passam automaticamente a 'em andamento'.
ONGOING_STATUSES = {'started'}
DRAW_STATUSES = {'draw', 'stalemate'}
WIN_STATUSES = {'mate', 'resign', 'timeout', 'outoftime', 'cheat', 'variantend', 'unknownfinish'}
ALLOWED_IMPORT = {'ok', 'cache'}  # Dados expirados/indisponíveis não comandam placares.
MANUAL_RESULTS = {'1-0', '0-1', '½-½'}


def manual_result(value):
    if value in MANUAL_RESULTS:
        return value
    if value in ('0.5-0.5', '1/2-1/2'):
        return '½-½'
    return None


def game_result(game):
    status = str(game.get('status') or '').casefold()
    winner = game.get('winner')
    if status in DRAW_STATUSES and winner is None:
        return '½-½'
    if status in WIN_STATUSES and winner in ('white', 'black'):
        return '1-0' if winner == 'white' else '0-1'
    return None


def verified_nick(players, name):
    player = players.get(name)
    if not isinstance(player, dict):
        return None
    val = player.get('lichessValidation')
    if not isinstance(val, dict) or val.get('status') != 'valido':
        return None
    uid = val.get('id')
    nick = player.get('lichess')
    if not isinstance(uid, str) or not isinstance(nick, str) or uid.casefold() != nick.casefold():
        return None
    return uid.casefold()


def reconcile(data, *, checked_at=None, log=print):
    """Concilia de modo determinístico; não acessa rede e não altera colunas oficiais."""
    stamp = checked_at or datetime.now(timezone.utc).isoformat(timespec='seconds')
    players = {p.get('name'): p for p in data.get('players', []) if isinstance(p, dict) and p.get('name')}
    tournaments = data.get('tournaments', [])
    # Validação de nicks (#1) cobre somente o torneio atual. A edição histórica
    # permanece intacta até termos mapeamento explícito de aliases (#10).
    all_matches = [m for t in tournaments for m in t.get('matches', [])]
    for m in all_matches:
        m.pop('lichessDecision', None)
    matches = [m for t in tournaments if t.get('active') for m in t.get('matches', [])]
    id_to_matches = defaultdict(list)
    for m in matches:
        if m.get('result') == 'bye' or str(m.get('status') or '').casefold() == 'bye':
            continue
        ident = parse_game_id(m.get('url'))
        if ident:
            id_to_matches[ident.casefold()].append(m)

    counts = Counter()
    for m in matches:
        if m.get('result') == 'bye' or str(m.get('status') or '').casefold() == 'bye':
            counts['bye_preservado'] += 1
            continue
        game = m.get('lichessGame')
        import_info = m.get('lichessImport') or {}
        if not isinstance(game, dict) or not isinstance(import_info, dict) or import_info.get('status') not in ALLOWED_IMPORT:
            counts['sem_dados_confirmados'] += 1
            continue
        gid = parse_game_id(m.get('url'))
        if not gid or str(game.get('id', '')).casefold() != gid.casefold():
            m['lichessDecision'] = {'status': 'ignorado', 'reason': 'id_divergente'}
            counts['ignorados'] += 1
            log(f"Lichess resultado: {m.get('id')}: ID da partida divergente; ignorado")
            continue
        if len(id_to_matches[gid.casefold()]) != 1:
            m['lichessDecision'] = {'status': 'ignorado', 'reason': 'jogo_duplicado'}
            counts['ignorados'] += 1
            log(f"Lichess resultado: {m.get('id')}: mesmo jogo vinculado a mais de um confronto; ignorado")
            continue
        white_id = verified_nick(players, m.get('white'))
        black_id = verified_nick(players, m.get('black'))
        sides = game.get('players') if isinstance(game.get('players'), dict) else {}
        white = sides.get('white') if isinstance(sides.get('white'), dict) else {}
        black = sides.get('black') if isinstance(sides.get('black'), dict) else {}
        api_white = white.get('id')
        api_black = black.get('id')
        if (not white_id or not black_id or white_id == black_id or
            not isinstance(api_white, str) or not isinstance(api_black, str) or
            white_id != api_white.casefold() or black_id != api_black.casefold()):
            m['lichessDecision'] = {'status': 'ignorado', 'reason': 'jogadores_ou_cores_divergentes'}
            counts['ignorados'] += 1
            log(f"Lichess resultado: {m.get('id')}: jogadores, nicks ou cores divergentes; ignorado")
            continue

        state = str(game.get('status') or '').casefold()
        official = manual_result(m.get('result'))
        result = game_result(game)
        if official:
            if result and result != official:
                m['lichessDecision'] = {'status': 'conflito', 'reason': 'placar_divergente', 'apiResult': result}
                counts['conflitos'] += 1
                log(f"Lichess resultado: {m.get('id')}: CONFLITO de placar (Sheets {official}; Lichess {result}); prevalece Sheets")
            elif state in ONGOING_STATUSES or state in {'created'}:
                m['lichessDecision'] = {'status': 'conflito', 'reason': 'placar_manual_jogo_nao_encerrado'}
                counts['conflitos'] += 1
                log(f"Lichess resultado: {m.get('id')}: CONFLITO: placar manual e jogo ainda não encerrado; prevalece Sheets")
            else:
                m['lichessDecision'] = {'status': 'manual', 'reason': 'planilha_prevalece'}
                counts['manuais'] += 1
            continue
        if result:
            m['lichessDecision'] = {'status': 'finished', 'result': result}
            counts['auto_finalizados'] += 1
            log(f"Lichess resultado: {m.get('id')}: encerrada; placar automático {result}")
        elif state in ONGOING_STATUSES:
            m['lichessDecision'] = {'status': 'playing'}
            counts['em_andamento'] += 1
        elif state in DRAW_STATUSES or state in WIN_STATUSES:
            m['lichessDecision'] = {'status': 'ignorado', 'reason': 'resultado_incompleto'}
            counts['ignorados'] += 1
            log(f"Lichess resultado: {m.get('id')}: encerramento sem vencedor/empate verificável; ignorado")
        else:
            # created, noStart, aborted: NÃO confundir desafio com jogo começado.
            counts['aguardando_inicio_ou_cancelado'] += 1

    data.setdefault('source', {})['lichessResultsCheckedAt'] = stamp
    data['source']['lichessResultsSummary'] = dict(counts)
    log('Lichess resultado: ' + ', '.join(f'{key}={counts[key]}' for key in
        ('auto_finalizados', 'em_andamento', 'manuais', 'conflitos', 'ignorados', 'sem_dados_confirmados', 'bye_preservado')))
    return dict(counts)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, default=DEFAULT_FILE)
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.file.read_text(encoding='utf-8'))
        reconcile(data)
        args.file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return 0
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f'ERRO: conciliação Lichess: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
