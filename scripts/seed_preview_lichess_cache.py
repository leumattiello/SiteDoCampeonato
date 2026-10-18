#!/usr/bin/env python3
"""Semente opcional do cache de replay na prévia, a partir do JSON público em produção.

Nunca consulta nem expõe segredos. Usa somente dados que já estão publicados
no próprio site oficial, e a reconciliação da #3 os valida novamente.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.request import Request, urlopen

if __package__:
    from .sync_lichess_games import parse_game_id
else:
    from sync_lichess_games import parse_game_id

DEFAULT_SOURCE = 'https://leumattiello.github.io/SiteDoCampeonato/data/campeonatos.json'
DEFAULT_CACHE = Path(__file__).resolve().parents[1] / '.cache' / 'lichess-games.json'
MAX_JSON = 3 * 1024 * 1024
FINAL_WINS = {'mate', 'resign', 'timeout', 'outoftime', 'cheat', 'variantend', 'unknownfinish'}
FINAL_DRAWS = {'draw', 'stalemate'}


def derive_cache(public_json, now=None):
    """Dá preferência só a jogos completos e com ID consistente; sem rede."""
    now = now or datetime.now(timezone.utc)
    stamp = now.isoformat(timespec='seconds')
    games = {}
    for tournament in public_json.get('tournaments', []):
        for match in tournament.get('matches', []):
            if not isinstance(match, dict):
                continue
            gid = parse_game_id(match.get('url'))
            game = match.get('lichessGame')
            if not gid or not isinstance(game, dict) or str(game.get('id') or '').lower() != gid.lower():
                continue
            state = str(game.get('status') or '').casefold()
            winner = game.get('winner')
            if not ((state in FINAL_WINS and winner in ('white','black')) or
                    (state in FINAL_DRAWS and winner is None)):
                continue
            if not isinstance(game.get('moves'), str) or not game['moves'].strip():
                continue
            # Não usa dados de partidas que já estavam sinalizados como inválidos.
            imported = match.get('lichessImport')
            if not isinstance(imported, dict) or imported.get('status') not in ('ok','cache'):
                continue
            games[gid.lower()] = {'fetchedAt': stamp, 'game': game}
    return {'version': 1, 'games': games}


def load_public(source=DEFAULT_SOURCE, opener=urlopen):
    request=Request(source, headers={'User-Agent': 'ReinosDoXadrez-PR-Preview/1.0'})
    with opener(request, timeout=12) as response:
        payload = response.read(MAX_JSON + 1)
    if len(payload) > MAX_JSON:
        raise ValueError('JSON público excede o limite')
    data=json.loads(payload)
    if not isinstance(data, dict) or not isinstance(data.get('tournaments'), list):
        raise ValueError('JSON público não contém lista de campeonatos')
    return data


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=DEFAULT_SOURCE)
    parser.add_argument('--cache', type=Path, default=DEFAULT_CACHE)
    args=parser.parse_args(argv)
    try:
        previous=load_public(args.source)
        cache=derive_cache(previous)
        args.cache.parent.mkdir(parents=True, exist_ok=True)
        args.cache.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8')
        print(f'Prévia Lichess: {len(cache["games"])} jogo(s) finalizado(s) do JSON público em cache.')
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f'Aviso: não foi possível obter o cache público da produção: {type(exc).__name__}', file=sys.stderr)
        return 0  # consulta pública opcional; o importador tentará a API anônima
    return 0


if __name__ == '__main__':
    sys.exit(main())
