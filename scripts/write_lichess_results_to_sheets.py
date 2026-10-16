#!/usr/bin/env python3
"""Escrita protegida dos resultados da melhoria #3 no Google Sheets.

Por padrão é somente uma simulação (SEM credenciais e SEM escrita).
O modo apply-backup exige ID da cópia, confirmação e autenticação de conta de serviço.
Escrita na planilha oficial fica travada por configuração externa adicional.

Ordem: importar Sheets -> validar contas -> buscar Lichess -> conciliar -> este script.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote

if __package__:
    from .resolve_lichess_results import game_result, verified_nick, manual_result
    from .sync_lichess_games import parse_game_id
else:
    from resolve_lichess_results import game_result, verified_nick, manual_result
    from sync_lichess_games import parse_game_id

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILE = ROOT / 'data' / 'campeonatos.json'
DEFAULT_AUDIT = ROOT / '.cache' / 'sheets-write-audit.jsonl'
ID_PATTERN = re.compile(r'[A-Za-z0-9_-]{20,160}\Z')
SCORES = {'1-0': (1, 0), '0-1': (0, 1), '½-½': (0.5, 0.5)}
SCOPE = ['https://www.googleapis.com/auth/spreadsheets']
SAFE_STATUSES = {'', 'aguardando', 'não iniciada', 'nao iniciada', 'jogador em outra partida',
                 'em andamento', 'a iniciar', 'desafio enviado', 'pronta', 'disponível',
                 'disponivel', 'não iniciado', 'nao iniciado'}


class SheetWriteError(Exception):
    pass


def now_utc():
    return datetime.now(timezone.utc)


def append_audit(path, record):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf-8') as out:
        out.write(json.dumps(record, ensure_ascii=False, separators=(',', ':')) + '\n')


def player_id_for_match(players, name):
    return verified_nick(players, name)


def candidate_matches(data, *, backup_matching_manual=False):
    """Partidas ativas validadas; em backup também admite placar manual idêntico à API."""
    players = {p.get('name'): p for p in data.get('players', []) if isinstance(p, dict)}
    result = []
    candidates_by_row = Counter()
    seen_game_ids = Counter()
    for tournament in data.get('tournaments', []):
        if not tournament.get('active'):
            continue
        sheet = str(tournament.get('sheet', ''))
        if not re.fullmatch(r'\d+', sheet):
            continue  # abas auxiliares nunca são destino
        for match in tournament.get('matches', []):
            if match.get('result') == 'bye' or str(match.get('status') or '').casefold() == 'bye':
                continue
            official = manual_result(match.get('result'))
            decision = match.get('lichessDecision')
            if not isinstance(decision, dict):
                continue
            if decision.get('status') == 'finished' and official is None:
                result_text = decision.get('result')
                existing_manual = False
            elif (backup_matching_manual and official is not None and
                  decision.get('status') == 'manual'):
                # Teste na cópia: o placar oficial deve ter sido previamente
                # confirmado pela reconciliação como idêntico ao Lichess.
                result_text = official
                existing_manual = True
            else:
                continue
            if result_text not in SCORES:
                continue
            game = match.get('lichessGame')
            if not isinstance(game, dict) or game_result(game) != result_text:
                continue
            if match.get('lichessImport', {}).get('status') not in ('ok', 'cache'):
                continue
            gid = parse_game_id(match.get('url'))
            if not gid or str(game.get('id', '')).casefold() != gid.casefold():
                continue
            expected_white = player_id_for_match(players, match.get('white'))
            expected_black = player_id_for_match(players, match.get('black'))
            sides = game.get('players') if isinstance(game.get('players'), dict) else {}
            white = sides.get('white') if isinstance(sides.get('white'), dict) else {}
            black = sides.get('black') if isinstance(sides.get('black'), dict) else {}
            if (not expected_white or not expected_black or expected_white == expected_black or
                expected_white != str(white.get('id', '')).casefold() or
                expected_black != str(black.get('id', '')).casefold()):
                continue
            row_index = match.get('sheetRow')
            if type(row_index) is not int or not 2 <= row_index <= 10000:
                continue
            result.append({'sheet': sheet, 'row': row_index, 'white': match['white'],
                           'black': match['black'], 'url': match['url'], 'gameId': gid,
                           'matchId': match['id'], 'result': result_text, 'scores': SCORES[result_text],
                           'sourceHasManual': existing_manual})
            candidates_by_row[(sheet, row_index)] += 1
            seen_game_ids[gid.casefold()] += 1
    # Impedir pontuação dupla se mesmo ID ou linha tiver sido associado a mais de um confronto.
    return [x for x in result if candidates_by_row[(x['sheet'], x['row'])] == 1 and
            seen_game_ids[x['gameId'].casefold()] == 1]


def parse_live_row(response):
    """Google values.get pode suprimir células vazias e elementos finais."""
    rows = response.get('values', [])
    if not isinstance(rows, list) or len(rows) > 1:
        raise SheetWriteError('formato inesperado da leitura da linha')
    cells = list(rows[0]) if rows else []
    return (cells + [''] * 8)[:8]


def is_empty_cell(value):
    return value is None or (isinstance(value, str) and not value.strip())


def check_live_row(row, candidate, *, backup_mode=False):
    """Revalidar a linha concreta; qualquer edição ambígua falha fechada."""
    white, point_white, point_black, black, status, url, _start, _end = row
    if (str(white).strip() != candidate['white'] or str(black).strip() != candidate['black']
        or str(url).strip() != candidate['url']):
        return 'jogadores_ou_link_alterados'
    if not is_empty_cell(point_white) or not is_empty_cell(point_black):
        return 'placar_ja_preenchido'
    allowed = SAFE_STATUSES | ({'finalizado'} if backup_mode and candidate['sourceHasManual'] else set())
    if str(status).strip().casefold() not in allowed:
        return 'status_protegido'
    return None


class GoogleSheetsClient:
    """Acesso autenticado à API oficial, construído somente no modo de gravação."""

    def __init__(self, service_account_json, *, session=None):
        if session is None:
            try:
                from google.oauth2.service_account import Credentials
                from google.auth.transport.requests import AuthorizedSession
            except ImportError as exc:
                raise SheetWriteError('instale google-auth e requests para o modo de gravação') from exc
            if not service_account_json:
                raise SheetWriteError('GitHub Secret GOOGLE_SERVICE_ACCOUNT_JSON não configurado')
            try:
                info = json.loads(service_account_json)
                if info.get('type') != 'service_account':
                    raise ValueError('credencial não é uma conta de serviço')
                credentials = Credentials.from_service_account_info(info, scopes=SCOPE)
            except (ValueError, KeyError, TypeError) as exc:
                # Não incluir conteúdo de credenciais ou exceções possivelmente sensíveis em logs.
                raise SheetWriteError('JSON da conta de serviço inválido') from exc
            session = AuthorizedSession(credentials)
        self.session = session

    def request(self, method, url, *, params=None, body=None):
        try:
            response = self.session.request(method, url, params=params, json=body, timeout=20)
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            # Não registrar corpo HTTP, headers nem credenciais.
            code = getattr(getattr(exc, 'response', None), 'status_code', None)
            if not code:
                code = getattr(locals().get('response', None), 'status_code', None)
            raise SheetWriteError(f'Google Sheets API indisponível (HTTP {code or "sem resposta"})') from exc

    def read_row(self, spreadsheet_id, sheet, row):
        addr = quote(f"'{sheet}'!A{row}:H{row}", safe='')
        url = f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{addr}'
        result = self.request('GET', url, params={'valueRenderOption': 'FORMULA'})
        return parse_live_row(result)

    def write_scores(self, spreadsheet_id, candidate):
        sheet = candidate['sheet']; row = candidate['row']; white, black = candidate['scores']
        url = f'https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values:batchUpdate'
        body = {'valueInputOption': 'RAW', 'data': [
            {'range': f"'{sheet}'!B{row}:C{row}", 'values': [[white, black]]},
            {'range': f"'{sheet}'!E{row}", 'values': [['Finalizado']]},
        ]}
        return self.request('POST', url, body=body)


def fresh_import(data, *, now=None):
    """Recusar gravação se o snapshot da planilha não é desta execução."""
    source = data.get('source') or {}
    if source.get('type') != 'Google Sheets':
        return False
    try:
        last = datetime.fromisoformat(str(source['lastSync']).replace('Z', '+00:00'))
        if last.tzinfo is None:
            return False
        age = ((now or now_utc()) - last).total_seconds()
        return 0 <= age <= 30 * 60
    except (ValueError, TypeError, KeyError):
        return False


def validate_destination(data, mode, target, confirmation, *, prod_enabled=False, auto_approved=False):
    source = str(data.get('source', {}).get('spreadsheetId') or '')
    if not ID_PATTERN.fullmatch(source):
        raise SheetWriteError('ID da planilha oficial ausente/inválido no JSON')
    if mode == 'dry-run':
        return target or source
    if not ID_PATTERN.fullmatch(str(target or '')) or str(confirmation or '') != target:
        raise SheetWriteError('modo de gravação exige target-id válido e confirm-target-id idêntico')
    if mode == 'apply-backup' and target == source:
        raise SheetWriteError('modo backup recusa o ID da planilha oficial')
    if mode == 'apply-production':
        if target != source:
            raise SheetWriteError('modo produção exige o ID da planilha oficial')
        if not prod_enabled:
            raise SheetWriteError('escrita na produção bloqueada: habilitação administrativa ausente')
        if not auto_approved and confirmation != source:
            raise SheetWriteError('confirmação explícita da planilha oficial ausente')
    return target


def run_writeback(data, *, mode='dry-run', target_id=None, confirm_target_id=None,
                  prod_enabled=False, auto_approved=False, client=None,
                  audit_file=DEFAULT_AUDIT, now=None, log=print):
    stamp = (now or now_utc()).isoformat(timespec='seconds')
    target = validate_destination(data, mode, target_id, confirm_target_id,
                                  prod_enabled=prod_enabled, auto_approved=auto_approved)
    if mode != 'dry-run' and not fresh_import(data, now=now):
        raise SheetWriteError('importação da planilha desatualizada/incompleta; nenhuma célula alterada')
    candidates = candidate_matches(data, backup_matching_manual=(mode == 'apply-backup'))
    summary = Counter()
    summary['candidatas'] = len(candidates)
    log(f'Google Sheets: modo={mode}; candidatas={len(candidates)}; destino={"backup" if mode == "apply-backup" else "original/simulação"}')
    for item in candidates:
        base = {'timestamp': stamp, 'mode': mode, 'sheet': item['sheet'], 'row': item['row'],
                'gameId': item['gameId'], 'result': item['result'], 'matchId': item['matchId']}
        if mode == 'dry-run':
            summary['simuladas'] += 1
            append_audit(audit_file, {**base, 'status': 'simulado_sem_leitura_remota',
                                      'proposal': {'B': item['scores'][0], 'C': item['scores'][1], 'E': 'Finalizado'}})
            log(f"SIMULAÇÃO: '{item['sheet']}'!B{item['row']}:C{item['row']}={item['scores']}; E{item['row']}=Finalizado (pendente de releitura remota)")
            continue
        try:
            if client is None:
                raise SheetWriteError('cliente Google Sheets não inicializado')
            # A leitura ocorre IMEDIATAMENTE antes de cada escrita.
            before = client.read_row(target, item['sheet'], item['row'])
            reason = check_live_row(before, item, backup_mode=(mode == 'apply-backup'))
            if reason:
                summary['ignoradas'] += 1
                append_audit(audit_file, {**base, 'status': 'ignorado', 'reason': reason,
                                          'before': {'B': before[1], 'C': before[2], 'E': before[4]}})
                log(f"Google Sheets: '{item['sheet']}' linha {item['row']}: ignorada ({reason})")
                continue
            client.write_scores(target, item)
            after = client.read_row(target, item['sheet'], item['row'])
            expected_w, expected_b = item['scores']
            if (str(after[1]).strip() != str(expected_w) or str(after[2]).strip() != str(expected_b)
                    or str(after[4]).strip() != 'Finalizado'):
                summary['erros'] += 1
                append_audit(audit_file, {**base, 'status': 'verificacao_falhou',
                                          'before': {'B': before[1], 'C': before[2], 'E': before[4]},
                                          'after': {'B': after[1], 'C': after[2], 'E': after[4]}})
                log(f"Google Sheets: '{item['sheet']}' linha {item['row']}: falha de verificação após escrita")
            else:
                summary['gravadas'] += 1
                append_audit(audit_file, {**base, 'status': 'gravado_e_verificado',
                                          'before': {'B': before[1], 'C': before[2], 'E': before[4]},
                                          'after': {'B': after[1], 'C': after[2], 'E': after[4]}})
                log(f"Google Sheets: '{item['sheet']}' linha {item['row']}: gravada e verificada ({item['result']})")
        except SheetWriteError as exc:
            summary['erros'] += 1
            append_audit(audit_file, {**base, 'status': 'erro', 'reason': str(exc)})
            log(f"Google Sheets: '{item['sheet']}' linha {item['row']}: {exc}")
    log('Google Sheets: ' + ', '.join(f'{key}={summary[key]}' for key in
        ('candidatas', 'simuladas', 'gravadas', 'ignoradas', 'erros')))
    return dict(summary)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, default=DEFAULT_FILE)
    parser.add_argument('--audit-file', type=Path, default=DEFAULT_AUDIT)
    parser.add_argument('--mode', choices=('dry-run', 'apply-backup', 'apply-production'), default='dry-run')
    parser.add_argument('--target-id', default='')
    parser.add_argument('--confirm-target-id', default='')
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.file.read_text(encoding='utf-8'))
        source = str(data.get('source', {}).get('spreadsheetId', ''))
        auto_approved = (os.getenv('GITHUB_EVENT_NAME') == 'schedule'
                         and os.getenv('SHEETS_AUTO_WRITE_ENABLED') == 'true'
                         and os.getenv('SHEETS_PRODUCTION_WRITE_ENABLED') == 'true')
        mode = 'apply-production' if auto_approved else args.mode
        target = source if auto_approved else args.target_id
        confirm = source if auto_approved else args.confirm_target_id
        enabled = os.getenv('SHEETS_PRODUCTION_WRITE_ENABLED') == 'true'
        validate_destination(data, mode, target, confirm, prod_enabled=enabled,
                             auto_approved=auto_approved)
        client = (GoogleSheetsClient(os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON', ''))
                  if mode != 'dry-run' else None)
        counts = run_writeback(data, mode=mode, target_id=target, confirm_target_id=confirm,
                               prod_enabled=enabled, auto_approved=auto_approved,
                               client=client, audit_file=args.audit_file)
        return 1 if counts.get('erros') else 0
    except (SheetWriteError, ValueError, OSError, KeyError, TypeError) as exc:
        # Nunca serializar token ou conteúdo de GOOGLE_SERVICE_ACCOUNT_JSON.
        print('ERRO: escrita segura no Google Sheets: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
