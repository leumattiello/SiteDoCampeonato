"""Segurança da gravação Google Sheets: testes offline, sem credenciais e sem rede."""
import copy
from datetime import datetime, timezone, timedelta
import json
from pathlib import Path
import tempfile
import unittest

from scripts.resolve_lichess_results import reconcile
from scripts.write_lichess_results_to_sheets import (
    SheetWriteError, candidate_matches, check_live_row, validate_destination,
    fresh_import, main, run_writeback, GoogleSheetsClient,
)

SOURCE_ID = '1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc'
BACKUP_ID = 'B' * 44
NOW = datetime(2026, 10, 16, 21, 0, tzinfo=timezone.utc)


def data_fixture(*, score=None, bye=False, active=True, status='Jogador em outra partida'):
    match = {'id': 'ed2-r3-l12', 'round': 3, 'sheetRow': 12,
             'white': 'Ana', 'black': None if bye else 'Beto',
             'url': None if bye else 'https://lichess.org/Ab12Cd34',
             'result': 'bye' if bye else score, 'status': 'Bye' if bye else status,
             'byePoints': .5 if bye else None,
             'lichessGame': {'id': 'Ab12Cd34', 'status': 'mate', 'winner': 'white',
                             'players': {'white': {'id': 'ana_l'}, 'black': {'id': 'beto_l'}}},
             'lichessImport': {'status': 'ok'}}
    data = {'source': {'spreadsheetId': SOURCE_ID, 'type': 'Google Sheets',
                       'lastSync': (NOW - timedelta(minutes=1)).isoformat()},
            'players': [{'name': name, 'lichess': nickname,
                         'lichessValidation': {'status': 'valido', 'id': nickname}}
                        for name, nickname in [('Ana', 'ana_l'), ('Beto', 'beto_l')]],
            'tournaments': [{'sheet': '2', 'active': active, 'matches': [match]}]}
    reconcile(data, checked_at=NOW.isoformat(), log=lambda _: None)
    return data


class FakeClient:
    def __init__(self, row=None, *, fail=False):
        self.row = list(row if row is not None else ['Ana', '', '', 'Beto', 'Em andamento',
                       'https://lichess.org/Ab12Cd34', '', ''])
        self.calls = []
        self.fail = fail

    def read_row(self, target, sheet, row):
        self.calls.append(('read', target, sheet, row))
        return self.row.copy()

    def write_scores(self, target, candidate):
        self.calls.append(('write', target, candidate['row']))
        if self.fail:
            raise SheetWriteError('falha simulada')
        self.row[1], self.row[2] = candidate['scores']
        self.row[4] = 'Finalizado'


class ProtectedWriteTest(unittest.TestCase):
    def test_candidate_only_when_finish_verified_and_no_manual(self):
        self.assertEqual(candidate_matches(data_fixture())[0]['scores'], (1, 0))
        self.assertEqual(candidate_matches(data_fixture(score='1-0')), [])
        self.assertEqual(candidate_matches(data_fixture(bye=True)), [])
        self.assertEqual(candidate_matches(data_fixture(active=False)), [])

    def test_backup_only_allows_verified_manual_same_as_lichess(self):
        d = data_fixture(score='1-0', status='Finalizado')
        self.assertEqual(candidate_matches(d), [])
        self.assertTrue(candidate_matches(d, backup_matching_manual=True)[0]['sourceHasManual'])
        d['tournaments'][0]['matches'][0]['result'] = '0-1'
        reconcile(d, log=lambda _: None)
        self.assertEqual(candidate_matches(d, backup_matching_manual=True), [])

    def test_wrong_players_colors_or_stale_api_never_candidate(self):
        for mutate in ('white', 'black', 'status', 'import', 'id', 'decision'):
            d = data_fixture(); m = d['tournaments'][0]['matches'][0]
            if mutate == 'white': m['lichessGame']['players']['white']['id'] = 'outro'
            if mutate == 'black': m['lichessGame']['players']['black']['id'] = 'outro'
            if mutate == 'status': m['lichessGame']['status'] = 'started'
            if mutate == 'import': m['lichessImport']['status'] = 'desatualizado'
            if mutate == 'id': m['lichessGame']['id'] = 'Ab34Cd12'
            if mutate == 'decision': m['lichessDecision']['status'] = 'conflito'
            self.assertEqual(candidate_matches(d), [], mutate)

    def test_duplicate_ids_or_duplicate_rows_rejected(self):
        for change in ('id', 'row'):
            d = data_fixture()
            m = copy.deepcopy(d['tournaments'][0]['matches'][0]);m['id']='other'
            if change == 'row':m['url']='https://lichess.org/Ab12Cd34';m['sheetRow']=12
            if change == 'id':m['sheetRow']=14
            d['tournaments'][0]['matches'].append(m)
            self.assertEqual(candidate_matches(d), [])

    def test_invalid_backup_target_and_unconfirmed_never_write(self):
        d = data_fixture()
        with self.assertRaises(SheetWriteError):
            validate_destination(d,'apply-backup',SOURCE_ID,SOURCE_ID)
        with self.assertRaises(SheetWriteError):
            validate_destination(d,'apply-backup',BACKUP_ID,'otherid')
        with self.assertRaises(SheetWriteError):
            validate_destination(d,'apply-production',SOURCE_ID,SOURCE_ID)
        with self.assertRaises(SheetWriteError):
            validate_destination(d,'apply-production',BACKUP_ID,BACKUP_ID,prod_enabled=True)
        self.assertEqual(validate_destination(d,'apply-production',SOURCE_ID,SOURCE_ID,
                                               prod_enabled=True), SOURCE_ID)

    def test_preflight_ignores_existing_numbers_even_zero_and_formulas(self):
        d=candidate_matches(data_fixture())[0]
        base=['Ana','','','Beto','Em andamento','https://lichess.org/Ab12Cd34','','']
        self.assertIsNone(check_live_row(base, d))
        for position,value in [(1,0), (2,0), (1,'=SUM(A1:A2)'), (4,'Bye'), (4,'Finalizado'),
                               (0,'Carlos'), (3,'Cida'), (5,'https://lichess.org/ZZ11FF33')]:
            row=base.copy();row[position]=value
            self.assertIsNotNone(check_live_row(row,d), (position,value))

    def test_in_backup_matching_manual_allows_finalizado_only_blank_scores(self):
        item=candidate_matches(data_fixture(score='1-0',status='Finalizado'),backup_matching_manual=True)[0]
        row=['Ana','','','Beto','Finalizado','https://lichess.org/Ab12Cd34','','']
        self.assertEqual(check_live_row(row,item),'status_protegido')
        self.assertIsNone(check_live_row(row,item,backup_mode=True))
        row[1]=1
        self.assertEqual(check_live_row(row,item,backup_mode=True),'placar_ja_preenchido')

    def test_dry_run_never_calls_client_and_writes_audit_only(self):
        d=data_fixture();mock=FakeClient()
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'audit.jsonl'; logs=[]
            r=run_writeback(d,client=mock,audit_file=output,now=NOW,log=logs.append)
            self.assertEqual(r,{'candidatas':1,'simuladas':1})
            self.assertEqual(mock.calls,[])
            self.assertEqual(json.loads(output.read_text())['status'],'simulado_sem_leitura_remota')
            self.assertIn('SIMULAÇÃO',''.join(logs))

    def test_apply_backup_reads_writes_and_reads_back(self):
        d=data_fixture(); mock=FakeClient()
        with tempfile.TemporaryDirectory() as directory:
            result=run_writeback(d,mode='apply-backup',target_id=BACKUP_ID,
                confirm_target_id=BACKUP_ID,client=mock,audit_file=Path(directory)/'audit',now=NOW,log=lambda _:None)
            self.assertEqual(result,{'candidatas':1,'gravadas':1})
            self.assertEqual([x[0] for x in mock.calls],['read','write','read'])
            self.assertEqual(mock.row[1:5],[1,0,'Beto','Finalizado'])
            self.assertEqual(json.loads((Path(directory)/'audit').read_text())['status'],'gravado_e_verificado')

    def test_apply_backup_uses_matching_manual_for_test_only(self):
        d=data_fixture(score='1-0',status='Finalizado');mock=FakeClient()
        mock.row[4]='Finalizado'
        with tempfile.TemporaryDirectory() as directory:
            result=run_writeback(d,mode='apply-backup',target_id=BACKUP_ID,
                confirm_target_id=BACKUP_ID,client=mock,audit_file=Path(directory)/'a',now=NOW,log=lambda _:None)
            self.assertEqual(result['gravadas'],1)

    def test_apply_skip_existing_status_or_changed_identity(self):
        d=data_fixture()
        for p,val in [(1,'0'),(1,0),(4,'Finalizado'),(5,'https://lichess.org/ZZ11FF33')]:
            mock=FakeClient();mock.row[p]=val
            with tempfile.TemporaryDirectory() as directory:
                res=run_writeback(d,mode='apply-backup',target_id=BACKUP_ID,
                    confirm_target_id=BACKUP_ID,client=mock,audit_file=Path(directory)/'a',now=NOW,log=lambda _:None)
                self.assertEqual(res.get('ignoradas'),1,(p,val))
                self.assertNotIn('write',[x[0] for x in mock.calls])

    def test_failures_logged_without_retries_or_secret_leak(self):
        d=data_fixture();mock=FakeClient(fail=True)
        with tempfile.TemporaryDirectory() as directory:
            r=run_writeback(d,mode='apply-backup',target_id=BACKUP_ID,
                confirm_target_id=BACKUP_ID,client=mock,audit_file=Path(directory)/'a',now=NOW,log=lambda _:None)
            self.assertEqual(r['erros'],1)
            self.assertEqual([x[0] for x in mock.calls],['read','write'])

    def test_stale_import_rejected_before_any_io(self):
        d=data_fixture();d['source']['lastSync']=(NOW-timedelta(hours=4)).isoformat()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(SheetWriteError):
                run_writeback(d,mode='apply-backup',target_id=BACKUP_ID,
                    confirm_target_id=BACKUP_ID,client=FakeClient(),audit_file=Path(directory)/'a',now=NOW)
        self.assertFalse(fresh_import(d,now=NOW))

    def test_client_rest_api_shapes_without_any_real_http(self):
        class Response:
            status_code=200
            def raise_for_status(self):pass
            def json(self):return {'values':[['Ana','','','Beto','Em andamento','https://lichess.org/Ab12Cd34']]}
        class Session:
            calls=[]
            def request(self,*args,**kwargs):
                self.calls.append((args,kwargs));return Response()
        sess=Session();client=GoogleSheetsClient('',session=sess)
        row=client.read_row(BACKUP_ID,'2',12)
        self.assertEqual(row[0],'Ana');self.assertEqual(len(row),8)
        client.write_scores(BACKUP_ID,candidate_matches(data_fixture())[0])
        get=sess.calls[0];post=sess.calls[1]
        self.assertEqual(get[0][0],'GET')
        self.assertIn('A12%3AH12',get[0][1])
        self.assertEqual(get[1]['params']['valueRenderOption'],'FORMULA')
        self.assertEqual(post[0][0],'POST')
        body=post[1]['json'];self.assertEqual(body['valueInputOption'],'RAW')
        self.assertEqual(body['data'][0]['values'],[[1,0]])
        self.assertEqual(body['data'][1]['values'],[['Finalizado']])

    def test_cli_default_is_dry_run_without_credentials(self):
        d=data_fixture()
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'data.json'; file.write_text(json.dumps(d),encoding='utf-8')
            audit=Path(directory)/'audit'
            self.assertEqual(main(['--file',str(file),'--audit-file',str(audit)]),0)
            self.assertTrue(audit.exists())


if __name__=='__main__':unittest.main()
