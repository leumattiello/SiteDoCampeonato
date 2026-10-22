#!/usr/bin/env python3
"""#11 - Sugere links publicos Lichess para jogos da edicao atual sem coluna F.

Somente leitura: nunca altera a planilha, resultados ou vinculos oficiais.
Consulta a API de partidas por usuario com perfil correspondence. Nenhum token.
Jogos privados e APIs indisponiveis podem nao aparecer.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
from http.client import HTTPException
import json
import re
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

if __package__:
    from .sync_lichess_games import parse_game_id
else:
    from sync_lichess_games import parse_game_id

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "campeonatos.json"
NICK = re.compile(r"^[A-Za-z0-9_-]{2,30}$")
PUBLIC_ID = re.compile(r"^[A-Za-z0-9]{8}$")
MAX_GAMES = 80
MAX_RESPONSE = 750_000
MAX_PER_MATCH = 3
MAX_QUERIES = 18
MIN_DATE = date(2020, 1, 1)
TERMINAL_WIN = {"mate", "resign", "timeout", "outoftime", "cheat", "variantend", "unknownfinish"}
TERMINAL_DRAW = {"draw", "stalemate"}


class SearchUnavailable(Exception):
    pass


class RateLimitReached(SearchUnavailable):
    pass


def verified_id(player):
    if not isinstance(player, dict) or not isinstance(player.get("lichessValidation"), dict):
        return None
    info = player["lichessValidation"]
    nick = player.get("lichess")
    ident = info.get("id")
    if (info.get("status") != "valido" or not isinstance(nick, str) or
            not isinstance(ident, str) or not NICK.fullmatch(nick) or
            nick.casefold() != ident.casefold()):
        return None
    return ident.casefold()


def parse_ymd(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
        return parsed if parsed >= MIN_DATE else None
    except ValueError:
        return None


def epoch_ms(value):
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        return None
    try:
        return datetime.fromtimestamp(value / 1000, timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None


def api_users(game):
    players = game.get("players")
    if not isinstance(players, dict):
        return None
    def ident(side):
        entry = players.get(side)
        if not isinstance(entry, dict):
            return None
        user = entry.get("user")
        raw = user.get("id") if isinstance(user, dict) else entry.get("userId")
        return raw.casefold() if isinstance(raw, str) else None
    white, black = ident("white"), ident("black")
    return (white, black) if white and black and white != black else None


def result_of(game):
    state = str(game.get("status") or "").casefold()
    winner = game.get("winner")
    if state in TERMINAL_WIN and winner in ("white", "black"):
        return "1-0" if winner == "white" else "0-1"
    if state in TERMINAL_DRAW and winner is None:
        return "½-½"
    return None


def fetch_user_games(nick, since_ms, *, vs=None, opener=urlopen):
    """Le ate MAX_GAMES jogos recentes NDJSON; uma requisicao anonima por usuario."""
    if not NICK.fullmatch(nick):
        raise ValueError("Nick invalido")
    params = urlencode({
        "since": since_ms, "max": MAX_GAMES, "perfType": "correspondence",
        "ongoing": "true", "finished": "true", "moves": "false",
        "clocks": "false", "evals": "false", "opening": "false", "sort": "dateDesc",
    })
    if vs is not None:
        if not NICK.fullmatch(vs):
            raise ValueError("Adversario invalido")
        params += "&" + urlencode({"vs": vs})
    url = "https://lichess.org/api/games/user/" + quote(nick, safe="") + "?" + params
    req = Request(url, headers={
        "Accept": "application/x-ndjson",
        "User-Agent": "ReinosDoXadrez/1.0 (GitHub Actions; sugestoes de partidas publicas)",
    })
    try:
        with opener(req, timeout=16) as response:
            payload = response.read(MAX_RESPONSE + 1)
        if len(payload) > MAX_RESPONSE:
            raise SearchUnavailable("Resposta excedeu o limite")
        games = []
        for line in payload.decode("utf-8").splitlines():
            if not line.strip():
                continue
            game = json.loads(line)
            if not isinstance(game, dict):
                raise SearchUnavailable("Linha NDJSON invalida")
            games.append(game)
            if len(games) > MAX_GAMES:
                raise SearchUnavailable("Numero excessivo de jogos")
        return games
    except HTTPError as exc:
        if exc.code == 429:
            raise RateLimitReached("Lichess limitou as consultas (HTTP 429)") from exc
        raise SearchUnavailable("HTTP " + str(exc.code)) from exc
    except (URLError, TimeoutError, OSError, HTTPException, UnicodeError, ValueError) as exc:
        raise SearchUnavailable(type(exc).__name__) from exc


def candidate_matches(data, *, lookup=fetch_user_games, now=None):
    """Gera sugestões nunca automáticas. Respeita IDs ligados e cores Schuring."""
    now = now or datetime.now(timezone.utc)
    active = next((t for t in data.get("tournaments", []) if t.get("active")), None)
    result = {"status": "ok", "checkedAt": now.isoformat(timespec="seconds"),
              "checkedPlayers": 0, "eligibleMatches": 0, "candidates": [], "warnings": []}
    if not active:
        result["status"] = "sem_edicao_atual"
        return result
    all_matches = [m for t in data.get("tournaments", []) for m in t.get("matches", [])]
    linked = {gid.casefold() for m in all_matches if (gid := parse_game_id(m.get("url")))}
    absent = [m for m in active.get("matches", []) if not m.get("url") and m.get("black") and
              m.get("result") != "bye" and str(m.get("status") or "").casefold() != "bye"]
    result["eligibleMatches"] = len(absent)
    if not absent:
        return result

    dates = [parse_ymd(m.get("start")) for m in active.get("matches", [])]
    dates = [d for d in dates if d is not None]
    if not dates:
        result["status"] = "sem_referencia_de_inicio"
        result["warnings"].append("Sem data inicial confirmada para delimitar a busca.")
        return result
    # Margem para desafio criado antes do inicio da edicao.
    earliest = min(dates) - timedelta(days=14)
    since_ms = int(datetime(earliest.year, earliest.month, earliest.day, tzinfo=timezone.utc).timestamp() * 1000)
    people = {p.get("name"): p for p in data.get("players", []) if isinstance(p, dict)}
    # A mesma conta nao pode ser associada a dois participantes ativos.
    active_names = {m.get(side) for m in active.get("matches", []) for side in ("white", "black")}
    validated = {name: verified_id(people.get(name)) for name in active_names}
    used = {}
    for name, uid in validated.items():
        if uid:
            used.setdefault(uid, set()).add(name)
    validated = {name: uid for name, uid in validated.items() if uid and len(used[uid]) == 1}

    expected = {}
    white_users = {}
    for m in absent:
        white = validated.get(m.get("white"))
        black = validated.get(m.get("black"))
        if not white or not black or white == black:
            continue
        expected.setdefault((white, black), []).append(m)
        white_users[white] = people[m["white"]]["lichess"]
    # Mesmos pares em rodadas distintas sao ambiguos, nao sugerir.
    expected = {key: matches for key, matches in expected.items() if len(matches) == 1}
    # Consultas dirigidas: API recebe um adversário exato por vez. Isso evita
    # omitir partidas do campeonato se 80 jogos recentes do perfil são outros jogos.
    # Priorizar partidas de rodadas autorizadas (inclusive atrasadas).
    reference_round = active.get("currentRound") or 1
    ordered_expected = sorted(expected.items(), key=lambda kv: (kv[1][0].get("round", 999) > reference_round + 1, kv[1][0].get("round", 999)))
    if not expected:
        result["status"] = "sem_jogadores_verificados"
        return result

    by_match = {}
    seen = set()
    rate_limited = False
    for (white_uid, black_uid), matches_for_pair in ordered_expected:
        if result["checkedPlayers"] >= MAX_QUERIES or rate_limited:
            result["status"] = "parcial" if len(ordered_expected) > result["checkedPlayers"] else result["status"]
            break
        white_name = matches_for_pair[0]["white"]
        black_name = matches_for_pair[0]["black"]
        # Validar nos dois sentidos: a API pública pode omitir jogos de um perfil.
        pair_games = []
        for nick, opponent in [(people[white_name]["lichess"],people[black_name]["lichess"]),
                               (people[black_name]["lichess"],people[white_name]["lichess"])]:
            if result["checkedPlayers"] >= MAX_QUERIES: break
            try:
                try:
                    games = lookup(nick, since_ms, vs=opponent)
                except TypeError:
                    # Compatibilidade com lookup injetado nos testes antigos.
                    games = lookup(nick, since_ms)
                result["checkedPlayers"] += 1
                pair_games.extend(games)
            except RateLimitReached:
                result["status"] = "parcial"
                result["warnings"].append("Limite do Lichess atingido; busca interrompida.")
                rate_limited = True
                break
            except SearchUnavailable:
                result["status"] = "parcial"
                result["warnings"].append("Um perfil não pôde ser consultado; a busca pode estar incompleta.")
                continue
        for game in pair_games:
            if not isinstance(game, dict):
                continue
            gid = game.get("id")
            if not isinstance(gid, str) or not PUBLIC_ID.fullmatch(gid):
                continue
            key = gid.casefold()
            if key in linked or key in seen:
                continue
            if str(game.get("perf") or game.get("speed") or "").casefold() != "correspondence":
                continue
            days = game.get("daysPerTurn")
            if days is not None and (isinstance(days, bool) or not isinstance(days, (int, float)) or days != 1):
                continue
            sides = api_users(game)
            if not sides or sides != (white_uid, black_uid) or sides not in expected:
                continue
            created = epoch_ms(game.get("createdAt"))
            if not created or created.timestamp() * 1000 < since_ms or created > now + timedelta(minutes=2):
                continue
            m = expected[sides][0]
            start = parse_ymd(m.get("start"))
            if start and abs((created.date() - start).days) > 5:
                continue
            recorded = m.get("result")
            public_result = result_of(game)
            if recorded in ("1-0", "0-1", "½-½") and recorded != public_result:
                continue
            status = str(game.get("status") or "").casefold()
            if status in {"created", "nostart", "aborted"}:
                continue
            seen.add(key)
            candidate = {"matchId": m.get("id"), "round": m.get("round"),
                         "white": m["white"], "black": m["black"], "gameId": gid,
                         "url": "https://lichess.org/" + gid,
                         "createdAt": created.date().isoformat(), "gameStatus": status,
                         "daysPerTurnVerified": days == 1,
                         "result": public_result}
            by_match.setdefault(m.get("id"), []).append(candidate)
    for m in absent:
        choices = by_match.get(m.get("id"), [])
        choices.sort(key=lambda c: (c["createdAt"], c["gameId"]), reverse=True)
        result["candidates"].extend(choices[:MAX_PER_MATCH])
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DATA)
    args = parser.parse_args(argv)
    data = json.loads(args.input.read_text(encoding="utf-8"))
    outcome = candidate_matches(data)
    data["unlinkedSuggestions"] = outcome
    args.input.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Sugestoes Lichess #11: " + str(len(outcome["candidates"])) +
          " candidato(s); " + str(outcome["checkedPlayers"]) + " perfil(is) consultado(s); status=" + outcome["status"])


if __name__ == "__main__":
    main()
