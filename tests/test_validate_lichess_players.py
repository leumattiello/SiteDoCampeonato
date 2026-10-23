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
    main, verify_players, correspondence_rating,
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


    def test_profile_cache_skips_unchanged_nick_for_24_hours(self):
        x = fixture()
        cache = {}
        calls = []
        def lookup(nick):
            calls.append(nick)
            return {"id":nick.lower(),"username":nick,"perfs":{"correspondence":{"rating":1400}}}
        with redirect_stdout(io.StringIO()):
            verify_players(x, lookup=lookup, cache=cache, checked_at="2026-10-20T10:00:00Z", pause=lambda _ :None)
            verify_players(x, lookup=lookup, cache=cache, checked_at="2026-10-20T11:00:00Z", pause=lambda _ :None)
        self.assertEqual(len(calls),2)
        self.assertEqual(x["players"][0]["lichessValidation"]["status"],"valido")
        with redirect_stdout(io.StringIO()):
            verify_players(x, lookup=lookup, cache=cache, checked_at="2026-10-21T11:01:00Z", pause=lambda _:None)
        self.assertEqual(len(calls),4)

    def test_cache_not_reused_after_nick_changes(self):
        x = fixture()
        cache = {}
        calls = []
        with redirect_stdout(io.StringIO()):
            verify_players(x, cache=cache, lookup=lambda nick:(calls.append(nick) or {"id":nick.lower(),"username":nick}),
                           checked_at="2026-10-20T10:00:00Z", pause=lambda _:None)
            x["players"][0]["lichess"]="NewNick"
            verify_players(x, cache=cache, lookup=lambda nick:(calls.append(nick) or {"id":nick.lower(),"username":nick}),
                           checked_at="2026-10-20T11:00:00Z", pause=lambda _:None)
        self.assertEqual(calls,["Akiqui","TitoRicci","NewNick"])

    def test_correspondence_only_and_provisional(self):
        obj = fixture()
        def lookup(nick):
            return {'id': nick.lower(), 'username': nick, 'perfs': {
                'correspondence': {'rating': 1620, 'prov': True, 'games': 5},
                'rapid': {'rating': 2600}, 'blitz': {'rating': 2400}}}
        with redirect_stdout(io.StringIO()):
            verify_players(obj, lookup=lookup, checked_at='2026-10-17T10:00:00Z', pause=lambda s: None)
        corr = obj['players'][0]['lichessCorrespondence']
        self.assertEqual(corr, {'status': 'disponivel', 'rating': 1620,
                                'provisional': True, 'games': 5, 'checkedAt': '2026-10-17T10:00:00Z'})
        self.assertEqual(obj['source']['lichessCorrespondenceCheckedAt'], '2026-10-17T10:00:00Z')

    def test_missing_correspondence_does_not_fall_back_to_rapid(self):
        obj = fixture()
        with redirect_stdout(io.StringIO()):
            verify_players(obj, lookup=lambda nick: {'id': nick.lower(), 'username': nick,
                'perfs': {'rapid': {'rating': 1800}}}, pause=lambda s: None)
        self.assertEqual(obj['players'][0]['lichessCorrespondence']['status'], 'indisponivel')

    def test_invalid_or_failed_profile_discards_old_rating(self):
        obj = fixture()
        obj['players'][0]['lichessCorrespondence'] = {'status': 'disponivel', 'rating': 3000}
        with redirect_stdout(io.StringIO()):
            verify_players(obj, lookup=lambda nick: (_ for _ in ()).throw(ProfileUnavailable('HTTP 503')), pause=lambda s: None)
        self.assertEqual(obj['players'][0]['lichessCorrespondence']['status'], 'indisponivel')
        self.assertNotIn('rating', obj['players'][0]['lichessCorrespondence'])

    def test_rating_defensive_validation(self):
        stamp='2026-10-17T10:00:00Z'
        for invalid in [None, True, 1.5, -10, 999999, '1500']:
            self.assertEqual(correspondence_rating({'perfs': {'correspondence': {'rating': invalid}}}, stamp)['status'], 'indisponivel')
        self.assertFalse(correspondence_rating({'perfs': {'correspondence': {'rating': 1500, 'prov': False}}}, stamp)['provisional'])
        self.assertNotIn('games', correspondence_rating({'perfs': {'correspondence': {'rating': 1500, 'games': True}}}, stamp))

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
