"""Testes offline da melhoria #2: jogos públicos do Lichess."""
import copy
from datetime import datetime, timedelta, timezone
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from scripts.sync_lichess_games import (
    GameUnavailable, GameNotFound, GameAccessDenied, RateLimited, cache_fresh, fetch_public_game,
    load_cache, main, normalize_game, parse_game_id, sync_games,
)

NOW = datetime(2026, 10, 15, 20, 0, tzinfo=timezone.utc)


def game(id='aB12cD34', status='started'):
    return {
        'id': id, 'status': status, 'createdAt': 1792000000000,
        'lastMoveAt': 1792001000000, 'players': {
            'white': {'user': {'id': 'humberto_m', 'name': 'Humberto_M'}},
            'black': {'user': {'id': 'xarnosqui', 'name': 'Xarnosqui'}},
        }, 'moves': 'e4 e5 Nf3 Nc6', 'perf': 'correspondence', 'daysPerTurn': 1,
    }


def fixture(url='https://lichess.org/aB12cD34'):
    return {
        'source': {'lastSync': '2026-10-15T19:00:00Z'},
        'tournaments': [
            {'active': True, 'matches': [
                {'id': 'm1', 'white': 'Humberto', 'black': 'Enrico',
                 'result': '1-0', 'status': 'Finalizado', 'url': url, 'byePoints': None},
                {'id': 'm2', 'white': 'Humberto', 'black': None,
                 'result': 'bye', 'status': 'Bye', 'url': url, 'byePoints': .5},
                {'id': 'm3', 'white': 'Anesio', 'black': 'Wendell',
                 'result': None, 'status': 'Em andamento', 'url': None},
            ]},
        ],
    }


class GameSyncTest(unittest.TestCase):
    def test_game_link_validated_and_non_lichess_blocked(self):
        self.assertEqual(parse_game_id('https://lichess.org/aB12cD34/white?foo=bar#12'), 'aB12cD34')
        self.assertEqual(parse_game_id('https://www.lichess.org/aB12cD34'), 'aB12cD34')
        self.assertIsNone(parse_game_id('https://lichess.org/study/abcdefgh'))
        self.assertIsNone(parse_game_id('https://lichess.org/@/aB12cD34'))
        self.assertIsNone(parse_game_id('https://lichess.org.evil.test/aB12cD34'))
        self.assertIsNone(parse_game_id('http://lichess.org/aB12cD34'))
        self.assertIsNone(parse_game_id('https://lichess.org/aB12cD34/abcdefghi'))
        self.assertIsNone(parse_game_id(''))

    def test_12_char_link_uses_8_char_public_id_without_leaking_private_suffix(self):
        self.assertEqual(parse_game_id('https://lichess.org/Ab12Cd34wxyz'), 'Ab12Cd34')
        self.assertEqual(parse_game_id('https://lichess.org/Ef56Gh78jkLM/white#12'), 'Ef56Gh78')
        self.assertEqual(parse_game_id('https://lichess.org/Ab12Cd34'), 'Ab12Cd34')
        data = fixture(url='https://lichess.org/Ab12Cd34wxyz')
        called = []
        with redirect_stdout(io.StringIO()):
            summary = sync_games(data, lookup=lambda gid: called.append(gid) or game(id=gid), now=NOW, pause=lambda _: None)
        self.assertEqual(called, ['Ab12Cd34'])
        self.assertEqual(summary['jogos_unicos'], 1)
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessGame']['id'], 'Ab12Cd34')
        self.assertEqual(data['tournaments'][0]['matches'][0]['url'], 'https://lichess.org/Ab12Cd34wxyz')

    def test_secret_and_public_urls_for_same_game_deduplicate_api_calls(self):
        data = fixture(url='https://lichess.org/Ef56Gh78jkLM')
        other = copy.deepcopy(data['tournaments'][0]['matches'][0])
        other['url'] = 'https://lichess.org/Ef56Gh78'
        data['tournaments'][0]['matches'].append(other)
        calls = []
        with redirect_stdout(io.StringIO()):
            summary = sync_games(data, lookup=lambda ident: calls.append(ident) or game(id=ident), now=NOW, pause=lambda _:None)
        self.assertEqual(calls, ['Ef56Gh78'])
        self.assertEqual(summary['jogos_unicos'], 1)
        self.assertEqual(summary['links'], 2)

    def test_http_401_is_distinguished_from_http_404(self):
        data = fixture()
        m = copy.deepcopy(data['tournaments'][0]['matches'][0])
        m['url'] = 'https://lichess.org/eF34gH56'
        data['tournaments'][0]['matches'].append(m)
        def look(gid):
            if gid == 'aB12cD34':
                raise GameAccessDenied('HTTP 401')
            raise GameNotFound('HTTP 404')
        with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
            summary = sync_games(data, lookup=look, now=NOW, pause=lambda _:None)
        matches = data['tournaments'][0]['matches']
        self.assertEqual(summary['acesso_restrito'], 1)
        self.assertEqual(summary['nao_encontrado'], 1)
        self.assertEqual(summary['indisponivel'], 2)
        self.assertEqual(matches[0]['lichessImport']['status'], 'acesso_restrito')
        self.assertEqual(matches[0]['lichessImport']['httpStatus'], 401)
        self.assertEqual(matches[-1]['lichessImport']['status'], 'nao_encontrado')
        self.assertEqual(matches[-1]['lichessImport']['httpStatus'], 404)
        self.assertEqual(matches[0]['result'], '1-0')

    def test_export_rejects_12_character_ids_even_if_link_parser_accepts_them(self):
        with self.assertRaisesRegex(ValueError, '8 caracteres'):
            fetch_public_game('Ab12Cd34wxyz', opener=lambda *args, **kw: self.fail('no request expected'))

    def test_actual_http_401_maps_to_access_denied_not_rate_limit(self):
        def fake_open(*_a, **_kw):
            raise HTTPError('https://lichess.org/game/export/aB12cD34', 401, 'Unauthorized', {}, None)
        with self.assertRaises(GameAccessDenied):
            fetch_public_game('aB12cD34', opener=fake_open)

    def test_game_data_is_additive_and_preserves_official_scores_and_bye(self):
        data = fixture()
        old = copy.deepcopy(data['tournaments'])
        cache = {}
        with redirect_stdout(io.StringIO()):
            summary = sync_games(data, cache=cache, lookup=lambda _: game(), now=NOW, pause=lambda _: None)
        self.assertEqual(summary['links'], 1)
        self.assertEqual(summary['consultados'], 1)
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessGame']['players']['white']['id'], 'humberto_m')
        self.assertEqual(data['tournaments'][0]['matches'][0]['result'], old[0]['matches'][0]['result'])
        self.assertEqual(data['tournaments'][0]['matches'][1], old[0]['matches'][1])
        self.assertEqual(data['tournaments'][0]['matches'][2], old[0]['matches'][2])
        self.assertEqual(data['source']['lastSync'], '2026-10-15T19:00:00Z')
        self.assertIn('ab12cd34', cache)

    def test_same_game_multiple_matches_only_one_query(self):
        data = fixture()
        match = copy.deepcopy(data['tournaments'][0]['matches'][0])
        match['id'] = 'm4'
        data['tournaments'][0]['matches'].append(match)
        calls = []
        with redirect_stdout(io.StringIO()):
            sync_games(data, lookup=lambda id: calls.append(id) or game(), now=NOW, pause=lambda _: None)
        self.assertEqual(calls, ['aB12cD34'])
        self.assertEqual(data['tournaments'][0]['matches'][-1]['lichessGame']['id'], 'aB12cD34')

    def test_active_game_uses_cache_under_15_minutes_unless_forced(self):
        data = fixture()
        old = (NOW - timedelta(minutes=5)).isoformat()
        prior = normalize_game(game(), checked_at=old)
        cache = {'ab12cd34': {'game': prior, 'fetchedAt': old}}
        with redirect_stdout(io.StringIO()):
            result = sync_games(data, cache=cache, lookup=lambda _: self.fail('cache fresh'), now=NOW)
        self.assertEqual(result['cache'], 1)
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessImport']['status'], 'cache')
        with redirect_stdout(io.StringIO()):
            result = sync_games(data, cache=cache, lookup=lambda _: game(), now=NOW, refresh_active=True, pause=lambda _: None)
        self.assertEqual(result['consultados'], 1)

    def test_completed_game_cache_never_refetched(self):
        data = fixture()
        old = (NOW - timedelta(days=120)).isoformat()
        prior = normalize_game(game(status='mate'), checked_at=old)
        cache = {'ab12cd34': {'game': prior, 'fetchedAt': old}}
        with redirect_stdout(io.StringIO()):
            result = sync_games(data, cache=cache, lookup=lambda _: self.fail('must not refetch'), now=NOW)
        self.assertEqual(result['cache'], 1)

    def test_api_failure_retains_cache_and_never_breaks_site(self):
        data = fixture()
        old = (NOW - timedelta(hours=4)).isoformat()
        prior = normalize_game(game(), checked_at=old)
        cache = {'ab12cd34': {'game': prior, 'fetchedAt': old}}
        with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
            summary = sync_games(data, cache=cache, lookup=lambda _: (_ for _ in ()).throw(GameUnavailable('HTTP 503')), now=NOW, pause=lambda _: None)
        self.assertEqual(summary['indisponivel'], 1)
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessImport']['status'], 'desatualizado')
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessGame'], prior)

    def test_missing_game_can_fail_without_affecting_other_games(self):
        data = fixture()
        other = copy.deepcopy(data['tournaments'][0]['matches'][0])
        other['url'] = 'https://lichess.org/CC12dd34'
        data['tournaments'][0]['matches'].append(other)
        def lookup(id):
            if id == 'aB12cD34':
                raise GameNotFound('HTTP 404')
            return game(id='CC12dd34')
        with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
            summary = sync_games(data, lookup=lookup, now=NOW, pause=lambda _: None)
        self.assertEqual(summary['indisponivel'], 1)
        self.assertEqual(summary['consultados'], 1)
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessImport']['status'], 'nao_encontrado')
        self.assertEqual(data['tournaments'][0]['matches'][-1]['lichessGame']['id'], 'CC12dd34')

    def test_429_stops_following_calls(self):
        data = fixture()
        other = copy.deepcopy(data['tournaments'][0]['matches'][0])
        other['url'] = 'https://lichess.org/CC12dd34'
        data['tournaments'][0]['matches'].append(other)
        calls = []
        def lookup(id):
            calls.append(id)
            raise RateLimited('429')
        with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
            result = sync_games(data, lookup=lookup, now=NOW, pause=lambda _: None)
        self.assertEqual(calls, ['aB12cD34'])
        self.assertEqual(result['indisponivel'], 2)

    def test_invalid_link_is_logged_without_network_calls(self):
        data = fixture(url='https://evil.example.com/aB12cD34')
        with redirect_stdout(io.StringIO()):
            summary = sync_games(data, lookup=lambda _: self.fail('not expected'), now=NOW)
        self.assertEqual(summary['links_invalidos'], 1)
        self.assertEqual(data['tournaments'][0]['matches'][0]['lichessImport']['status'], 'link_invalido')

    def test_no_links_is_safe_and_no_network(self):
        data = fixture(url=None)
        with redirect_stdout(io.StringIO()):
            summary = sync_games(data, lookup=lambda _: self.fail('not expected'), now=NOW)
        self.assertEqual(summary['links'], 0)
        self.assertEqual(summary['jogos_unicos'], 0)

    def test_http_429_wait_minute_then_retry(self):
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, *_): return json.dumps(game()).encode()
        n = []
        waits = []
        def fake_open(*_a, **_kw):
            n.append(1)
            if len(n) == 1:
                raise HTTPError('https://lichess.org/game/export/aB12cD34', 429, '429', {}, None)
            return FakeResponse()
        result = fetch_public_game('aB12cD34', opener=fake_open, pause=waits.append)
        self.assertEqual(result['id'], 'aB12cD34')
        self.assertEqual(waits, [60])

    def test_mismatched_response_id_rejected(self):
        class FakeResponse:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, *_): return json.dumps(game(id='xxxxxxxx')).encode()
        with self.assertRaises(GameUnavailable):
            fetch_public_game('aB12cD34', opener=lambda *_a, **_kw: FakeResponse())

    def test_normalizes_opening_and_players(self):
        obj = game(status='mate')
        obj['winner'] = 'white'
        obj['opening'] = {'name': 'Italian Game', 'eco': 'C50'}
        norm = normalize_game(obj, checked_at=NOW.isoformat())
        self.assertEqual(norm['winner'], 'white')
        self.assertEqual(norm['opening'], {'name': 'Italian Game', 'eco': 'C50'})
        self.assertTrue(norm['createdAt'].startswith('2026-'))
        self.assertTrue(norm['moves'].startswith('e4'))

    def test_invalid_cache_file_falls_back_gracefully(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / 'cache.json'
            f.write_text('{bad', encoding='utf8')
            self.assertEqual(load_cache(f), {})

    def test_cli_processes_zero_links_and_creates_cache(self):
        data = fixture(url=None)
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'site.json'
            c = Path(tmp) / 'cache.json'
            p.write_text(json.dumps(data), encoding='utf8')
            with redirect_stdout(io.StringIO()):
                self.assertEqual(main(['--file', str(p), '--cache', str(c)]), 0)
            self.assertTrue(c.exists())
            after = json.loads(p.read_text(encoding='utf8'))
            self.assertEqual(after['tournaments'][0]['matches'][0]['result'], '1-0')
            self.assertEqual(after['source']['lichessGamesSummary']['links'], 0)

if __name__ == '__main__': unittest.main()
