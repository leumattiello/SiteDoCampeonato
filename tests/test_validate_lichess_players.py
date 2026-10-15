"""Testes offline da melhoria #1, sem chamadas HTTP reais."""
import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from contextlib import redirect_stdout
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.validate_lichess_players import (
    NickNotFound, ProfileUnavailable, get_public_profile,
    main, verify_players,
)


def fixture():
    return {
        "source": {"lastSync": "2026-10-15T10:00:00+00:00"},
        "players": [
            {"name": "Alice", "lichess": "Akiqui"},
            {"name": "Anesio", "lichess": "TitoRicci"},
            {"name": "Gabriel", "lichess": None},
        ],
        "tournaments": [
            {"active": True, "matches": [
                {"white": "Alice", "black": "Anesio", "result": "1-0"},
                {"white": "Gabriel", "black": None, "result": "bye"},
            ]},
            {"active": False, "matches": [{"white": "Historico", "black": "X"}]},
        ],
    }


class ValidatePlayersTest(unittest.TestCase):
    def test_valid_and_missing_and_preserve_official_data(self):
        obj = fixture()
        originals = copy.deepcopy(obj["tournaments"])
        calls = []
        def lookup(nick):
            calls.append(nick)
            return {"id": nick.lower(), "username": nick}
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lookup, checked_at="2026-10-15T13:00:00Z", pause=lambda s: None)
        self.assertEqual(result, {"Alice": "valido", "Anesio": "valido", "Gabriel": "ausente"})
        self.assertEqual(calls, ["Akiqui", "TitoRicci"])
        self.assertEqual(obj["tournaments"], originals)
        self.assertEqual(obj["source"]["lastSync"], "2026-10-15T10:00:00+00:00")
        self.assertEqual(obj["source"]["lichessPlayersCheckedAt"], "2026-10-15T13:00:00Z")
        self.assertEqual(obj["players"][0]["lichessValidation"]["url"], "https://lichess.org/@/Akiqui")
        self.assertNotIn("Historico", result)

    def test_not_found_is_invalid_not_fatal(self):
        obj = fixture()
        def lookup(nick):
            if nick == "Akiqui":
                raise NickNotFound(nick)
            return {"id": nick.lower(), "username": nick}
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lookup, pause=lambda s: None)
        self.assertEqual(result["Alice"], "invalido")
        self.assertEqual(obj["players"][0]["lichessValidation"]["motivo"], "perfil_nao_encontrado")

    def test_duplicate_case_insensitive_no_http(self):
        obj = fixture()
        obj["players"][1]["lichess"] = "AKIQUI"
        called = []
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lambda nick: called.append(nick), pause=lambda s: None)
        self.assertEqual(result["Alice"], "duplicado")
        self.assertEqual(result["Anesio"], "duplicado")
        self.assertEqual(called, [])

    def test_bad_format_no_http(self):
        obj = fixture()
        obj["players"][0]["lichess"] = "tem espaço"
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lambda nick: self.fail("não deve consultar"), pause=lambda s: None)
        self.assertEqual(result["Alice"], "invalido")

    def test_http_failure_is_unavailable_not_invalid(self):
        obj = fixture()
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lambda nick: (_ for _ in ()).throw(ProfileUnavailable("HTTP 503")), pause=lambda s: None)
        self.assertEqual(result["Alice"], "indisponivel")
        self.assertEqual(result["Anesio"], "indisponivel")
        self.assertEqual(obj["players"][0]["lichess"], "Akiqui")

    def test_mismatched_response_never_verified(self):
        obj = fixture()
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lambda nick: {"id": "outra-pessoa", "username": "Outro"}, pause=lambda s: None)
        self.assertEqual(result["Alice"], "indisponivel")
        self.assertNotIn("url", obj["players"][0]["lichessValidation"])

    def test_adds_missing_roster_entry_without_guessing_nick(self):
        obj = fixture()
        obj["players"] = []
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj, lookup=lambda nick: self.fail("no request"), pause=lambda s: None)
        self.assertEqual(len(obj["players"]), 3)
        self.assertTrue(all(value == "ausente" for value in result.values()))

    def test_no_active_players_leaves_data_unchanged(self):
        obj = fixture()
        obj["tournaments"][0]["active"] = False
        original = copy.deepcopy(obj)
        with redirect_stdout(io.StringIO()):
            result = verify_players(obj)
        self.assertEqual(result, {})
        self.assertEqual(obj, original)

    def test_429_waits_full_minute_then_retries(self):
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b'{"id":"akiqui","username":"Akiqui"}'
        attempts = []
        def fake_open(*args, **kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                raise HTTPError("https://lichess.org/api/user/Akiqui", 429, "rate limited", {}, None)
            return FakeResponse()
        waits = []
        with patch("scripts.validate_lichess_players.urlopen", side_effect=fake_open):
            with redirect_stdout(io.StringIO()):
                profile = get_public_profile("Akiqui", wait=waits.append)
        self.assertEqual(profile["id"], "akiqui")
        self.assertEqual(waits, [60])
        self.assertEqual(len(attempts), 2)

    def test_cli_writes_json_with_validation_metadata(self):
        obj = fixture()
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "campeonatos.json"
            file.write_text(json.dumps(obj), encoding="utf-8")
            with patch("scripts.validate_lichess_players.get_public_profile", return_value={"id": "akiqui", "username": "Akiqui"}):
                # main() uses verify_players default lookup, test CLI with missing-only data to avoid requests
                obj["players"] = [{"name": x, "lichess": None} for x in ("Alice", "Anesio", "Gabriel")]
                file.write_text(json.dumps(obj), encoding="utf-8")
                with redirect_stdout(io.StringIO()):
                    self.assertEqual(main(["--file", str(file)]), 0)
            saved = json.loads(file.read_text(encoding="utf-8"))
            self.assertEqual(len(saved["players"]), 3)
            self.assertEqual(saved["players"][0]["lichessValidation"]["status"], "ausente")
            self.assertEqual(saved["tournaments"], obj["tournaments"])

if __name__ == "__main__":
    unittest.main()
