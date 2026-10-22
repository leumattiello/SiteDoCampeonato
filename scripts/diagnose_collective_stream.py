#!/usr/bin/env python3
"""Teste de campo, SOMENTE LEITURA, da API coletiva Lichess.

Realiza uma unica chamada POST com os nove jogadores, sem credenciais.
O stream e interrompido apos 14 segundos; nenhum dado muda no Sheets.
A API expõe somente partidas públicas ativas; ausência não prova inexistência.
"""
import json
import re
import subprocess
from datetime import datetime, timezone

USERS = ["Akiqui", "TitoRicci", "emanuelscorrea", "Xarnosqui", "Biel009",
         "Humberto_M", "Adolpho74", "Raducol", "emanlasker"]
ENDPOINT = "https://lichess.org/api/stream/games-by-users?withCurrentGames=true"
MARK = "__REINOS_HTTP_STATUS__:"
GAME_ID = re.compile(r"^[A-Za-z0-9]{8}$")


def test_stream():
    args = [
        "curl", "--silent", "--show-error", "--no-buffer",
        "--connect-timeout", "6", "--max-time", "14",
        "--request", "POST", "--header", "Content-Type: text/plain",
        "--header", "Accept: application/x-ndjson",
        "--data-binary", "@-", "--write-out", "\\n" + MARK + "%{http_code}\\n",
        ENDPOINT,
    ]
    print("API coletiva Lichess: iniciando 1 POST sem token (9 participantes, limite 14s).")
    try:
        proc = subprocess.run(args, input=",".join(USERS), capture_output=True,
                              text=True, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        print("ERRO cliente:", type(e).__name__)
        return 2
    body = proc.stdout
    status = re.search(MARK + r"(\\d{3})", body)
    http_status = status.group(1) if status else "desconhecido"
    print("HTTP:", http_status, "curl exit:", proc.returncode)
    if proc.returncode not in (0, 28):
        print("AVISO: cliente retornou erro (sem expor payload privado).")
    events = {}
    invalid = 0
    for line in body.splitlines():
        if not line.strip() or MARK in line:
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            invalid += 1
            continue
        if not isinstance(obj, dict):
            continue
        gid = str(obj.get("id") or "")
        if not GAME_ID.fullmatch(gid):
            continue
        players = obj.get("players") or {}
        white = (players.get("white") or {}).get("userId")
        black = (players.get("black") or {}).get("userId")
        if not (isinstance(white, str) and isinstance(black, str)):
            continue
        if white.casefold() not in {u.casefold() for u in USERS} or black.casefold() not in {u.casefold() for u in USERS}:
            continue
        created = obj.get("createdAt")
        start = (datetime.fromtimestamp(created / 1000, timezone.utc).date().isoformat()
                 if isinstance(created, int) and created > 0 else "?")
        events[gid.lower()] = (gid, white, black, str(obj.get("status")), str(obj.get("perf")), start)
    print("Eventos válidos (jogos entre participantes):", len(events),
          "linhas não interpretadas:", invalid)
    for gid, white, black, status, perf, start in sorted(events.values()):
        print(f"JOGO id={gid} brancas={white} pretas={black} status={status} perf={perf} criado={start}")
    pair = [g for g in events.values() if g[1].casefold() == "humberto_m" and g[2].casefold() == "raducol"]
    print("HUMBERTO_X_LIGIA:", len(pair), "encontrado(s).")
    if http_status != "200":
        print("CONCLUSAO: sem resposta HTTP 200, teste inconclusivo.")
        return 1
    if not events:
        print("CONCLUSAO: nenhum jogo exposto no fluxo durante esta janela; não confirma inexistência.")
    else:
        print("CONCLUSAO: fluxo respondeu; vínculos ainda precisam de validação.")
    return 0


if __name__ == "__main__":
    raise SystemExit(test_stream())
