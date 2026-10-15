#!/usr/bin/env python3
"""Valida o nick Lichess de cada participante do torneio atual (melhoria #1).

Executado APÓS a importação do Google Sheets, durante GitHub Actions.
Consulta somente perfis públicos. Nunca edita o Google Sheets; nunca precisa de token.
Falhas de rede geram estado 'indisponivel' sem interromper a publicação.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
from http.client import HTTPException
from pathlib import Path
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / "data" / "campeonatos.json"
API_ROOT = "https://lichess.org/api/user/"
VALID_NICK = re.compile(r"^[A-Za-z0-9_-]{2,30}$")
USER_AGENT = "ReinosDoXadrez/1.0 (GitHub Actions; public profile verifier)"


class NickNotFound(Exception):
    """O Lichess retornou 404 para o perfil solicitado."""


class ProfileUnavailable(Exception):
    """O Lichess não pôde ser consultado com confiança."""


def get_public_profile(nick, *, request_timeout=12, attempts=2, wait=time.sleep):
    """Consulta sequencial, respeitando HTTP 429 (esperar 60 s antes de repetir)."""
    url = API_ROOT + quote(nick, safe="")
    request = Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=request_timeout) as response:
                data = json.load(response)
            if not isinstance(data, dict):
                raise ProfileUnavailable("resposta inesperada (JSON não é objeto)")
            return data
        except HTTPError as err:
            if err.code == 404:
                raise NickNotFound(nick) from err
            if err.code == 429:
                if attempt + 1 < attempts:
                    print("Lichess: limite 429; aguardando 60 segundos antes de nova consulta.")
                    wait(60)
                    continue
                raise ProfileUnavailable("limite de requisições HTTP 429") from err
            raise ProfileUnavailable(f"HTTP {err.code}") from err
        except (URLError, TimeoutError, HTTPException, json.JSONDecodeError, ValueError, OSError) as err:
            raise ProfileUnavailable(type(err).__name__) from err
    raise ProfileUnavailable("número máximo de tentativas")


def active_participant_names(data):
    """Limita a verificação à edição atual, evitando perfis de edições passadas."""
    names = set()
    active = [t for t in data.get("tournaments", []) if t.get("active")]
    for tournament in active:
        for match in tournament.get("matches", []):
            for side in ("white", "black"):
                name = match.get(side)
                if isinstance(name, str) and name.strip():
                    names.add(name.strip())
    return names


def verify_players(data, *, lookup=get_public_profile, checked_at=None, pause=time.sleep):
    """Altera apenas metadados lichessValidation dos jogadores, preservando nicks e jogos."""
    stamp = checked_at or datetime.now(timezone.utc).isoformat(timespec="seconds")
    players = data.get("players", [])
    names = active_participant_names(data)
    if not names:
        print("AVISO: nenhuma pessoa encontrada nos confrontos da edição ativa; validação não executada.", file=sys.stderr)
        return {}

    players_by_name = {p.get("name"): p for p in players if isinstance(p, dict) and p.get("name")}
    for name in sorted(names - players_by_name.keys()):
        # Não inventar contas quando não existe cadastro na aba Jogadores.
        player = {"name": name, "lichess": None}
        players.append(player)
        players_by_name[name] = player

    used = Counter(str(players_by_name[name].get("lichess") or "").strip().casefold() for name in names)
    statuses = {}
    for name in sorted(names, key=str.casefold):
        player = players_by_name[name]
        nick = str(player.get("lichess") or "").strip()
        status = None
        if not nick:
            status = {"status": "ausente"}
        elif not VALID_NICK.fullmatch(nick):
            status = {"status": "invalido", "motivo": "formato"}
        elif used[nick.casefold()] > 1:
            status = {"status": "duplicado"}
        else:
            try:
                profile = lookup(nick)
                canonical = profile.get("username") or profile.get("id")
                user_id = profile.get("id")
                if (not isinstance(canonical, str) or not isinstance(user_id, str)
                        or user_id.casefold() != nick.casefold()):
                    status = {"status": "indisponivel", "motivo": "resposta_inconsistente"}
                else:
                    status = {"status": "valido", "username": canonical,
                              "id": user_id.casefold(), "url": f"https://lichess.org/@/{quote(canonical)}"}
            except NickNotFound:
                status = {"status": "invalido", "motivo": "perfil_nao_encontrado"}
            except ProfileUnavailable as err:
                status = {"status": "indisponivel", "motivo": str(err)}
            except Exception as err:
                # Erro transitório / inesperado: NÃO marcar o nick como inexistente.
                status = {"status": "indisponivel", "motivo": type(err).__name__}
            pause(0.35)
        player["lichessValidation"] = {**status, "checkedAt": stamp}
        statuses[name] = status["status"]
        print(f"Lichess: {name} — {nick or '(sem nick)'} — {status['status']}" +
              (f" ({status['motivo']})" if status.get("motivo") else ""))

    # Campo de sincronização apenas para a validação; NÃO altera source.lastSync do Sheets.
    data.setdefault("source", {})["lichessPlayersCheckedAt"] = stamp
    return statuses


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_JSON, help="JSON consolidado do campeonato")
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.file.read_text(encoding="utf-8"))
        statuses = verify_players(data)
        if statuses:
            args.file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        totals = Counter(statuses.values())
        print("Lichess: " + ", ".join(f"{key}={totals[key]}" for key in
              ("valido", "ausente", "invalido", "duplicado", "indisponivel")))
        return 0
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(f"ERRO: não foi possível ler/gravar o JSON local: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
