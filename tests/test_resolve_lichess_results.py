"""Testes offline da melhoria #3: nenhum acesso à rede ou credenciais reais."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.resolve_lichess_results import reconcile, main

NICKS = {'Ana': 'ana_l', 'Beto': 'beto_l', 'Cida': 'cida_l', 'Dora': 'dora_l'}


def fixture(result=None, status='Jogador em outra partida', api_status='mate', winner='white',
            white='Ana', black='Beto', url='https://lichess.org/Ab12Cd34'):
    match = {'id': 'r1', 'round': 1, 'white': white, 'black': black, 'url': url,
             'result': result, 'status': status, 'byePoints': None,
             'lichessImport': {'status': 'ok'},
             'lichessGame': {
                 'id': 'Ab12Cd34', 'status': api_status, 'winner': winner,
                 'players': {'white': {'id': 'ana_l'}, 'black': {'id': 'beto_l'}}}}
    return {'source': {'lastSync': '2026-10-16T18:00:00Z'},
            'players': [{'name': k, 'lichess': v, 'lichessValidation':
                         {'status': 'valido', 'id': v, 'url': f'https://lichess.org/@/{v}'}}
                        for k, v in NICKS.items()],
            'tournaments': [{'active': True, 'matches': [match]}]}


def run(data):
    logs = []
    result = reconcile(data, checked_at='2026-10-16T18:30:00Z', log=logs.append)
    return result, logs


class ReconcileTest(unittest.TestCase):
    def test_auto_win_when_sheet_result_missing(self):
        data = fixture()
        old = copy.deepcopy(data['tournaments'][0]['matches'][0])
        summary, logs = run(data)
        m = data['tournaments'][0]['matches'][0]
        self.assertEqual(m['lichessDecision'], {'status': 'finished', 'result': '1-0'})
        self.assertEqual(summary['auto_finalizados'], 1)
        for col in ('result', 'status', 'white', 'black', 'byePoints', 'url'):
            self.assertEqual(m[col], old[col])
        self.assertEqual(data['source']['lastSync'], '2026-10-16T18:00:00Z')
        self.assertIn('encerrada', ''.join(logs))

    def test_auto_black_win_and_draw(self):
        for status, winner, expected in [('resign', 'black', '0-1'), ('outoftime', 'black', '0-1'),
                                         ('draw', None, '½-½'), ('stalemate', None, '½-½')]:
            with self.subTest(status=status):
                d=fixture(api_status=status, winner=winner)
                run(d)
                self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['result'], expected)

    def test_manual_score_wins_conflict_and_logs(self):
        d=fixture(result='0-1')
        counts, logs=run(d)
        m=d['tournaments'][0]['matches'][0]
        self.assertEqual(m['result'], '0-1')
        self.assertEqual(m['lichessDecision']['status'], 'conflito')
        self.assertEqual(m['lichessDecision']['apiResult'], '1-0')
        self.assertEqual(counts['conflitos'], 1)
        self.assertIn('prevalece Sheets', ''.join(logs))

    def test_matching_manual_score_retained(self):
        d=fixture(result='1-0')
        run(d)
        self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['status'], 'manual')
        self.assertEqual(d['tournaments'][0]['matches'][0]['result'], '1-0')

    def test_manual_score_vs_ongoing_is_conflict_but_not_overwritten(self):
        d=fixture(result='1-0', api_status='started', winner=None)
        run(d)
        self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['status'], 'conflito')
        self.assertEqual(d['tournaments'][0]['matches'][0]['result'], '1-0')

    def test_playing_marks_when_no_manual_result(self):
        d=fixture(api_status='started', winner=None)
        counts, _=run(d)
        self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['status'], 'playing')
        self.assertEqual(counts['em_andamento'],1)

    def test_created_aborted_nostart_do_not_count_as_active(self):
        for status in ('created', 'aborted', 'noStart'):
            with self.subTest(status=status):
                d=fixture(api_status=status, winner=None)
                counts,_=run(d)
                self.assertNotIn('lichessDecision', d['tournaments'][0]['matches'][0])
                self.assertEqual(counts['aguardando_inicio_ou_cancelado'],1)

    def test_wrong_colors_do_not_auto_score(self):
        d=fixture()
        m=d['tournaments'][0]['matches'][0]
        m['lichessGame']['players']={'white': {'id':'beto_l'}, 'black': {'id':'ana_l'}}
        _, logs=run(d)
        self.assertEqual(m['lichessDecision']['reason'],'jogadores_ou_cores_divergentes')
        self.assertNotIn('result', m['lichessDecision'])
        self.assertIn('cores divergentes',''.join(logs))

    def test_missing_invalid_validation_does_not_assume_account(self):
        for status in ('invalido','indisponivel','ausente'):
            d=fixture()
            d['players'][0]['lichessValidation']['status']=status
            run(d)
            self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['status'],'ignorado')

    def test_api_cache_expired_or_restricted_fails_closed(self):
        for import_status in ('desatualizado','acesso_restrito','nao_encontrado', 'indisponivel'):
            d=fixture()
            d['tournaments'][0]['matches'][0]['lichessImport']['status']=import_status
            counts,_=run(d)
            self.assertNotIn('lichessDecision',d['tournaments'][0]['matches'][0])
            self.assertEqual(counts.get('auto_finalizados', 0),0)

    def test_url_or_id_wrong_rejected(self):
        d=fixture()
        d['tournaments'][0]['matches'][0]['lichessGame']['id']='WW11xx33'
        run(d)
        self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['reason'],'id_divergente')

    def test_private_url_suffix_preserved_and_validated_by_eight_id(self):
        d=fixture(url='https://lichess.org/Ab12Cd34abcd')
        run(d)
        self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['result'],'1-0')
        self.assertTrue(d['tournaments'][0]['matches'][0]['url'].endswith('abcd'))

    def test_duplicate_game_link_never_scores_multiple_confronts(self):
        d=fixture()
        second=copy.deepcopy(d['tournaments'][0]['matches'][0]);second['id']='r2'
        d['tournaments'][0]['matches'].append(second)
        run(d)
        self.assertEqual([m['lichessDecision']['reason'] for m in d['tournaments'][0]['matches']],
                         ['jogo_duplicado','jogo_duplicado'])

    def test_bye_keeps_fractional_points_and_no_auto_score(self):
        d=fixture()
        bye=copy.deepcopy(d['tournaments'][0]['matches'][0]);bye.update(id='bye',result='bye',status='Bye',black=None,byePoints=0.5)
        d['tournaments'][0]['matches'].append(bye)
        run(d)
        self.assertEqual(bye['result'], 'bye')
        self.assertEqual(bye['byePoints'],0.5)
        self.assertNotIn('lichessDecision',bye)

    def test_finished_without_provable_winner_not_counted(self):
        d=fixture(api_status='mate',winner=None)
        run(d)
        self.assertEqual(d['tournaments'][0]['matches'][0]['lichessDecision']['reason'],'resultado_incompleto')

    def test_rerun_clears_stale_decisions(self):
        d=fixture()
        run(d)
        m=d['tournaments'][0]['matches'][0]
        m['lichessImport']['status']='acesso_restrito'
        run(d)
        self.assertNotIn('lichessDecision',m)

    def test_archive_keeps_its_historical_results_and_no_warning(self):
        d=fixture()
        archive=copy.deepcopy(d['tournaments'][0]);archive['active']=False
        archive['matches'][0]['id']='archive_game'
        archive['matches'][0]['result']='1-0'
        d['tournaments'].append(archive)
        run(d)
        self.assertEqual(d['tournaments'][1]['matches'][0]['result'],'1-0')
        self.assertNotIn('lichessDecision',d['tournaments'][1]['matches'][0])

    def test_cli_writes_json_only_without_network(self):
        d=fixture()
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'campeonatos.json'
            p.write_text(json.dumps(d),encoding='utf8')
            self.assertEqual(main(['--file', str(p)]),0)
            post=json.loads(p.read_text(encoding='utf8'))
            self.assertEqual(post['tournaments'][0]['matches'][0]['lichessDecision']['result'],'1-0')


if __name__=='__main__': unittest.main()
