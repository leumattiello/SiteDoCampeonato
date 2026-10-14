#!/usr/bin/env python3
"""Importa planilhas públicas do Google Sheets para o site estático.

Uso: python3 scripts/sync_google_sheets.py [--strict]
Sem dependências externas. Executado pelo GitHub Actions antes de cada deploy.
A planilha deve permitir acesso público e disponibilizar os dados via Google Visualization CSV.
"""
import argparse
import csv
from datetime import date, datetime, timedelta, timezone
from io import StringIO
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'data'/'campeonatos.json'
DEFAULT_ID='1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc'


def numeric(value):
    if value is None or not str(value).strip():return None
    try:
        text=str(value).strip().replace('½','.5').replace(',','.')
        return float(text)
    except (ValueError,TypeError):return None


def iso_date(value):
    if value is None or not str(value).strip():return None
    text=str(value).strip()
    try:
        if re.fullmatch(r'\d{5}(?:\.0+)?',text):
            return (date(1899,12,30)+timedelta(days=int(float(text)))).isoformat()
        for fmt in ('%d/%m/%Y','%Y-%m-%d','%d/%m/%y','%m/%d/%Y'):
            try:return datetime.strptime(text,fmt).date().isoformat()
            except ValueError:pass
    except (ValueError,OverflowError):pass
    return None


def parse_matches(rows,sheet):
    """Planilha original: A=brancas, B=pontos, C=pontos, D=pretas, E=status, F=URL, G=início, H=fim.
    Rodadas são linhas 'Rodada N' na coluna A; bye possui brancas e E='Bye'.
    """
    matches=[];round_number=None
    for index,row in enumerate(rows,start=1):
        row=list(row)+['']*max(0,8-len(row))
        white,ws,bs,black,status,url,start,end=row[:8]
        white=white.strip();black=black.strip();status=status.strip();url=url.strip()
        header=re.fullmatch(r'rodada\s+(\d+)',white,flags=re.I)
        if header:
            round_number=int(header.group(1));continue
        if not white or round_number is None or not status:continue
        bye=status.casefold()=='bye'
        a=numeric(ws);b=numeric(bs)
        result='bye' if bye else ('1-0' if a==1 and b==0 else '0-1' if a==0 and b==1 else '½-½' if a==.5 and b==.5 else None)
        if not bye and not black:continue
        if url and not re.match(r'^https://(?:www\.)?lichess\.org/',url,re.I):url=''
        matches.append({
            'id':f'ed{sheet}-r{round_number}-l{index}', 'round':round_number,
            'white':white,'black':None if bye else black,'result':result,'status':status,
            # Valor real da coluna B da planilha; inclusive zero e meio ponto.
            'byePoints':a if bye else None,
            'url':url or None,'start':iso_date(start),'end':iso_date(end),'sheetRow':index,
        })
    return matches


def fetch_csv(spreadsheet_id,sheet):
    qs=urlencode({'tqx':'out:csv','sheet':sheet,'headers':0})
    url=f'https://docs.google.com/spreadsheets/d/{spreadsheet_id}/gviz/tq?{qs}'
    request=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; ReinosDoXadrez/1.0)'})
    with urlopen(request,timeout=30) as response:
        raw=response.read(1024*1024)
    text=raw.decode('utf-8-sig')
    if not text.strip() or '<!doctype html' in text[:300].lower() or '<html' in text[:300].lower():
        raise ValueError('A URL retornou HTML em vez de CSV. Confira a publicação/compartilhamento da planilha.')
    return list(csv.reader(StringIO(text)))


def fetch_rows(spreadsheet_id,sheet):
    rows=fetch_csv(spreadsheet_id,sheet)
    if not any(r and re.fullmatch(r'Rodada\s+\d+',r[0].strip(),re.I) for r in rows):
        raise ValueError('Nenhuma linha "Rodada N" encontrada. Confira o nome/ID da aba e o cabeçalho da planilha.')
    return rows


def get_current_round(rows):
    for row in rows:
        if len(row)>1 and row[0].strip().casefold().replace(' ','_') in ('rodada_atual','rodada_de_referencia','currentround'):
            try:
                number=int(row[1].strip())
                return number if 1<=number<=40 else None
            except (ValueError,TypeError):return None
    return None


def get_nicknames(rows):
    if not rows or len(rows[0])<2 or rows[0][0].strip().lower() not in ('nome','name'):
        return {}
    if 'nick' not in rows[0][1].strip().lower() and 'lichess' not in rows[0][1].strip().lower():
        return {}
    return {row[0].strip():row[1].strip() for row in rows[1:] if len(row)>1 and row[0].strip() and row[1].strip()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strict',action='store_true',help='Interrompe o deploy se a importação não funcionar')
    args=parser.parse_args()
    current=json.loads(TARGET.read_text(encoding='utf8'))
    spreadsheet_id=os.getenv('GOOGLE_SHEET_ID',current.get('source',{}).get('spreadsheetId') or DEFAULT_ID)
    fail=[];success=0
    for tournament in current['tournaments']:
        try:
            rows=fetch_rows(spreadsheet_id,str(tournament['sheet']))
            matches=parse_matches(rows,str(tournament['sheet']))
            if len(matches)<3:raise ValueError('Aba retornou poucas partidas; provavelmente está incorreta')
            tournament['matches']=matches
            print(f"Aba {tournament['sheet']}: {len(matches)} confrontos/folgas importados.")
            success+=1
        except Exception as exc:
            fail.append(f"Aba {tournament['sheet']}: {exc}")
            print(f'AVISO: {fail[-1]}',file=sys.stderr)
    if fail:
        if args.strict:raise RuntimeError('Falha ao sincronizar: '+'; '.join(fail))
        print('Mantidos os dados de exemplo/última versão nas abas não importadas.',file=sys.stderr)
    # Abas auxiliares opcionais permitem administrar rodada e apelidos só pelo Google Sheets.
    try:
        config_rows=fetch_csv(spreadsheet_id,'Config')
        round_now=get_current_round(config_rows)
        if round_now:
            for tournament in current['tournaments']:
                if tournament.get('active'):tournament['currentRound']=round_now
            print(f'Config: rodada atual = {round_now}')
    except Exception as exc:
        print(f'Config opcional não aplicada: {exc}',file=sys.stderr)
    try:
        nickname_rows=fetch_csv(spreadsheet_id,'Jogadores')
        nicknames=get_nicknames(nickname_rows)
        if nicknames:
            existing={p['name']:p for p in current.get('players',[])}
            for name,nick in nicknames.items():
                existing.setdefault(name,{'name':name,'lichess':None})['lichess']=nick
            current['players']=list(existing.values())
            print(f'Jogadores: {len(nicknames)} apelidos encontrados.')
    except Exception as exc:
        print(f'Jogadores opcional não aplicada: {exc}',file=sys.stderr)
    if success==len(current['tournaments']):
        current['source']['lastSync']=datetime.now(timezone.utc).isoformat(timespec='seconds')
        current['source']['type']='Google Sheets'
    # Preserve manually maintained nicknames and tournament configuration.
    TARGET.write_text(json.dumps(current,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print('Arquivo:',TARGET)

if __name__=='__main__':main()
