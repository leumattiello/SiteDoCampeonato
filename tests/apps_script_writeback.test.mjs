// Testa o Code.gs REAL, sem rede e sem Google Sheets, em VM Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const ORIGINAL = '1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc';
const json = x => structuredClone(x);
function fixture(opts={}) {
  const props = {LICHESS_API_TOKEN:'TOKEN_NAO_REAL', ...opts.props};
  const rows = json(opts.rows || [
    ['Brancas', 'Pontos', 'Pontos', 'Pretas', 'Status', 'Link'],
    ['Rodada 1', '', '', '', '', ''],
    ['Ana', '', '', 'Beto', 'Em andamento', 'https://lichess.org/Ab12Cd34zzzz'],
    ['Ana', 1, 0, 'Cida', 'Finalizado', 'https://lichess.org/Zb12Cd34'],
    ['Dora', 1, '', '', 'Bye', ''],
  ]);
  const nicks = opts.nicks || [['Nome','Nick Lichess'], ['Ana','ana_l'], ['Beto','beto_l'], ['Cida','cida_l'],['Dora','dora_l']];
  const originals = json(rows);
  const requests = [];
  const logs = [];
  const writes = [];
  const get = (i) => json(rows[i] ?? []);
  class FakeSheet {
    constructor(name, data) {this.name=name;this.data=data;}
    getDataRange(){return {getValues:()=>json(this.data)};}
    getRange(r,c,rowsCount=1,colsCount=1){
      return {
        getValues:()=>{
          if (this.name==='2' && opts.mutateOnRead && !state.mutated) {
            state.mutated=true;
            opts.mutateOnRead(this.data);
          }
          return json(Array.from({length:rowsCount},(_,i)=>this.data[r-1+i].slice(c-1,c-1+colsCount)));
        },
        setValues:matrix=>{
          writes.push({r,c,values:json(matrix)});
          for(let i=0;i<matrix.length;i++)for(let j=0;j<matrix[i].length;j++)this.data[r-1+i][c-1+j]=matrix[i][j];
        },
        setValue:value=>{writes.push({r,c,value});this.data[r-1][c-1]=value;return {setNumberFormat:format=>{writes.push({r,c,format});return this;}};}
      };
    }
    appendRow(row){ this.data.push(json(row)); writes.push({audit:true}); }
  }
  const state={mutated:false, id:opts.id || 'BACKUP-IDENTIFIER', held:false};
  const sheets = {'2':new FakeSheet('2',rows),'Jogadores':new FakeSheet('Jogadores',json(nicks))};
  const ss={
    getId:()=>state.id,
    getSpreadsheetTimeZone:()=>'America/Sao_Paulo',
    getSheetByName:name=>sheets[name] || null,
    insertSheet:name=>{writes.push({created:name});sheets[name]=new FakeSheet(name,[]);return sheets[name];}
  };
  const games = {...(opts.games||{})};
  const world={
    SpreadsheetApp: {getActiveSpreadsheet:()=>ss,flush:()=>{}},
    PropertiesService: {getScriptProperties:()=>({getProperty:key=>props[key]||null})},
    LockService: {getScriptLock:()=>({tryLock:()=>!state.held,releaseLock:()=>{state.held=false;}})},
    Utilities: {sleep:()=>{},formatDate:(date,tz,format)=>{
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
      return format==='yyyy-MM-dd'?`${parts.year}-${parts.month}-${parts.day}`:`${parts.day}/${parts.month}/${parts.year}`;
    }},
    UrlFetchApp: {fetch:(url,request)=>{
      requests.push({url,request});
      const id=url.match(/export\/([^?]+)/)?.[1];
      const game=games[id];
      const code=game?.httpCode || (game ? 200 : 404);
      return {getResponseCode:()=>code,getContentText:()=>JSON.stringify(game)};
    }},
    console:{log:(...s)=>logs.push(s.join(' ')),error:(...s)=>logs.push(s.join(' '))},
    Date,JSON,Error
  };
  vm.createContext(world);
  vm.runInContext(code,world,{filename:'Code.gs'});
  return {world,rows,originals,nicks,props,writes,requests,logs,sheets};
}
const game = (id='Ab12Cd34',status='mate',winner='white',white='ana_l',black='beto_l')=>({
 id,status,winner,players:{white:{user:{id:white}},black:{user:{id:black}}}
});

// Um teste de regressão deliberadamente usa links com 12 caracteres e exige ID público de 8.
test('simulação nunca grava ou cria abas e consulta ID de 8 caracteres',()=>{
 const f=fixture({games:{Ab12Cd34:game()}});
 const out=f.world.simularResultados();
 assert.equal(out.modo,'SIMULACAO');assert.equal(out.candidatos,1);assert.equal(out.aplicados,0);
 assert.deepEqual(f.rows,f.originals);assert.deepEqual(f.writes,[]);
 assert.equal(f.requests.length,2);assert.match(f.requests[0].url,/\/Ab12Cd34\?/);
 assert.doesNotMatch(f.requests[0].url,/zzzz/);
 assert.equal(f.requests[0].request.headers.Authorization,'Bearer TOKEN_NAO_REAL');
});

test('escrita exige habilitação e ID exato do backup',()=>{
 const f=fixture({games:{Ab12Cd34:game()}});
 assert.throws(()=>f.world.aplicarResultados(),/Gravação desabilitada/);
 f.props.GRAVACAO_HABILITADA='SIM';
 assert.throws(()=>f.world.aplicarResultados(),/PLANILHA_ID_AUTORIZADA/);
 f.props.PLANILHA_ID_AUTORIZADA='BACKUP-IDENTIFIER';
 const summary=f.world.aplicarResultados();
 assert.equal(summary.aplicados,1);
 assert.deepEqual(f.rows[2].slice(1,3),[1,0]);assert.equal(f.rows[2][4],'Finalizado');
 assert.deepEqual(f.rows[3],f.originals[3]);assert.deepEqual(f.rows[4],f.originals[4]);
 assert.equal(f.sheets._AuditoriaLichess.data.length,2);
 assert.equal(f.sheets._AuditoriaLichess.data[1][3],'Ab12Cd34');
});

test('não escreve original sem liberação específica',()=>{
 const f=fixture({id:ORIGINAL,props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:ORIGINAL},games:{Ab12Cd34:game()}});
 assert.throws(()=>f.world.aplicarResultados(),/Proteção da planilha original/);
 assert.deepEqual(f.writes,[]);
 f.props.PERMITIR_PLANILHA_ORIGINAL='SIM';
 assert.equal(f.world.aplicarResultados().aplicados,1);
});

test('resultado manual, inclusive 0, e Bye são preservados',()=>{
 const f=fixture({games:{Ab12Cd34:game(),Zb12Cd34:game('Zb12Cd34')}});
 f.world.simularResultados();assert.equal(f.requests.length,2);
 assert.deepEqual(f.rows[3],f.originals[3]); assert.deepEqual(f.rows[4],f.originals[4]);
});

test('jogo ativo, não iniciado, abortado ou encerrado sem vencedor não gravam',()=>{
 for (const status of ['started','created','aborted','mate','noStart']) {
   const f=fixture({games:{Ab12Cd34:game('Ab12Cd34',status,status==='mate'?null:'white')}});
   assert.equal(f.world.simularResultados().candidatos,0,status);
 }
});

test('empate e vitória de pretas são classificados',()=>{
 for(const [status,winner,score] of [['draw',null,[0.5,0.5]],['stalemate',null,[0.5,0.5]],['resign','black',[0,1]],['timeout','white',[1,0]]]){
  const f=fixture({props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'},games:{Ab12Cd34:game('Ab12Cd34',status,winner)}});
  assert.equal(f.world.aplicarResultados().aplicados,1,status);
  assert.deepEqual(f.rows[2].slice(1,3),score,status);
 }
});

test('recusa jogadores invertidos e identificador retornado errado',()=>{
 for (const payload of [game('Ab12Cd34','mate','white','beto_l','ana_l'),game('Zz12Cd34')]) {
   const f=fixture({games:{Ab12Cd34:payload}});
   assert.equal(f.world.simularResultados().candidatos,0);
   assert.equal(f.world.simularResultados().divergencias,1);
 }
});

test('detecta ID duplicado e bloqueia consulta',()=>{
 const rows=[['Brancas','B','C','Pretas','Status','Link'],['Ana','','','Beto','Em andamento','https://lichess.org/Ab12Cd34'],['Beto','','','Ana','Em andamento','https://lichess.org/Ab12Cd34']];
 const f=fixture({rows,games:{Ab12Cd34:game()}});assert.equal(f.world.simularResultados().consultas,0);
 assert.equal(f.world.simularResultados().divergencias,2);
});

test('não sobrescreve linha alterada durante consulta ao Lichess',()=>{
 const f=fixture({props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'},games:{Ab12Cd34:game()},mutateOnRead:rows=>{rows[2][1]=0;rows[2][2]=1;}});
 assert.equal(f.world.aplicarResultados().aplicados,0);
 assert.deepEqual(f.rows[2].slice(1,3),[0,1]);assert.equal(f.sheets._AuditoriaLichess,undefined);
});

test('célula parcialmente preenchida permanece intacta',()=>{
 const f=fixture({rows:[['Brancas','B','C','Pretas','Status','Link'],['Ana',0,'','Beto','Em andamento','https://lichess.org/Ab12Cd34']],games:{Ab12Cd34:game()}});
 assert.equal(f.world.simularResultados().consultas,1);
});

test('token ausente bloqueia inclusive consulta simulada, sem vazamento',()=>{
 const f=fixture({props:{LICHESS_API_TOKEN:''},games:{Ab12Cd34:game()}});
 assert.throws(()=>f.world.simularResultados(),/LICHESS_API_TOKEN/);
 assert.equal(f.requests.length,0);
});

test('HTTP 401 não provoca gravação ou vazamento da credencial',()=>{
 const f=fixture({games:{Ab12Cd34:{httpCode:401}}});
 assert.equal(f.world.simularResultados().erros,2);assert.deepEqual(f.writes,[]);
 assert.ok(f.logs.some(x=>x.includes('HTTP 401')));
 assert.ok(f.logs.every(x=>!x.includes('TOKEN_NAO_REAL')));
});

test('HTTP 429 suspende consultas posteriores',()=>{
 const rows=[['Brancas','B','C','Pretas','Status','Link'],['Ana','','','Beto','Em andamento','https://lichess.org/Ab12Cd34'],['Ana','','','Cida','Em andamento','https://lichess.org/Zb12Cd34']];
 const f=fixture({rows,games:{Ab12Cd34:{httpCode:429},Zb12Cd34:game('Zb12Cd34','mate','white','ana_l','cida_l')}});
 assert.equal(f.world.simularResultados().consultas,1);
});

test('agendamento apenas simula se não habilitado explicitamente',()=>{
 const f=fixture({games:{Ab12Cd34:game()}});
 assert.equal(f.world.sincronizarAutomaticamente().modo,'SIMULACAO');
 assert.deepEqual(f.writes,[]);
 f.props.EXECUCAO_AUTOMATICA_HABILITADA='SIM';
 assert.throws(()=>f.world.sincronizarAutomaticamente(),/Gravação desabilitada/);
});

test('nick ausente/duplicado bloqueia importação',()=>{
 const nicks=[['Nome','Nick Lichess'],['Ana','ana_l'],['Ana','ana_other'],['Beto','beto_l']];
 const f=fixture({nicks,games:{Ab12Cd34:game()}});
 assert.equal(f.world.simularResultados().candidatos,0);
});

test('links forjados não são consultados',()=>{
 const rows=[['Brancas','B','C','Pretas','Status','Link'],['Ana','','','Beto','Em andamento','https://lichess.org.evil/Ab12Cd34']];
 const f=fixture({rows,games:{Ab12Cd34:game()}});
 assert.equal(f.world.simularResultados().consultas,0);
});

test('Bye nunca é escrito mesmo com link e adversário preenchidos por engano',()=>{
 const rows=[['Brancas','B','C','Pretas','Status','Link'],['Ana','','','Beto','Bye','https://lichess.org/Ab12Cd34']];
 const f=fixture({rows,games:{Ab12Cd34:game()}});
 assert.equal(f.world.simularResultados().consultas,0);
});

test('agendamento habilitado com dois bloqueios grava apenas no backup autorizado',()=>{
 const f=fixture({props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER',EXECUCAO_AUTOMATICA_HABILITADA:'SIM'},games:{Ab12Cd34:game()}});
 assert.equal(f.world.sincronizarAutomaticamente().aplicados,1);
});

const TIMESTAMP_CREATED = Date.UTC(2026,9,10,1,30); // horário de São Paulo: 09/10/2026 22h30
const TIMESTAMP_LAST = Date.UTC(2026,9,12,3,15); // São Paulo: 12/10/2026 00h15
const gWithDates=(status='mate',winner='white')=>({...game('Ab12Cd34',status,winner),createdAt:TIMESTAMP_CREATED,lastMoveAt:TIMESTAMP_LAST});

test('#4 simulação de G/H não altera planilha nem cria auditoria',()=>{
 const f=fixture({games:{Ab12Cd34:gWithDates()}});
 const sum=f.world.simularResultados();
 assert.equal(sum.candidatosDatas,1);
 assert.equal(sum.aplicadosDatas,0);
 assert.deepEqual(f.rows,f.originals);
 assert.equal(f.sheets._AuditoriaDatasLichess,undefined);
 assert.ok(f.logs.some(x=>x.includes('G=09/10/2026') && x.includes('H=12/10/2026')));
});

test('#4 escreve G/H como datas reais e com fuso da planilha; sem alterar B/C/E preexistentes',()=>{
 const f=fixture({games:{Ab12Cd34:gWithDates()},props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'}});
 const sum=f.world.aplicarResultados();
 assert.equal(sum.aplicadosDatas,1);
 assert.equal(f.rows[2][6].getTime(),TIMESTAMP_CREATED);
 assert.equal(f.rows[2][7].getTime(),TIMESTAMP_LAST);
 assert.deepEqual(f.rows[2].slice(1,3),[1,0]);
 assert.equal(f.sheets._AuditoriaDatasLichess.data[1][2],3);
 assert.equal(f.sheets._AuditoriaDatasLichess.data[1][8],'09/10/2026');
 assert.ok(f.writes.some(x=>x.c===7 && x.format==='dd/MM/yyyy'));
 assert.ok(f.writes.some(x=>x.c===8 && x.format==='dd/MM/yyyy'));
});

test('#4 preenche datas de jogo com placar manual, sem tocar nos pontos',()=>{
 const rows=[['Brancas','B','C','Pretas','Status','Link','Data Início','Data Fim'],['Ana',1,0,'Beto','Finalizado','https://lichess.org/Ab12Cd34','','']];
 const f=fixture({rows,games:{Ab12Cd34:gWithDates()},props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'}});
 const sum=f.world.aplicarResultados();
 assert.equal(sum.candidatos,0);assert.equal(sum.aplicadosDatas,1);
 assert.deepEqual(f.rows[1].slice(1,3),[1,0]);assert.equal(f.rows[1][4],'Finalizado');
 assert.equal(f.rows[1][6].getTime(),TIMESTAMP_CREATED);
 assert.equal(f.rows[1][7].getTime(),TIMESTAMP_LAST);
});

test('#4 preserva G manual e preenche somente H ausente, registrando divergência',()=>{
 const rows=[['Brancas','B','C','Pretas','Status','Link','Data Início','Data Fim'],['Ana',1,0,'Beto','Finalizado','https://lichess.org/Ab12Cd34','01/10/2026','']];
 const f=fixture({rows,games:{Ab12Cd34:gWithDates()},props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'}});
 const sum=f.world.aplicarResultados();
 assert.equal(sum.divergenciasDatas,1);
 assert.equal(f.rows[1][6],'01/10/2026');
 assert.equal(f.rows[1][7].getTime(),TIMESTAMP_LAST);
 assert.equal(f.writes.filter(x=>x.c===7).length,0);
});

test('#4 jogo iniciado recebe G e nunca H até ter resultado final',()=>{
 const f=fixture({games:{Ab12Cd34:gWithDates('started',undefined)},props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'}});
 const sum=f.world.aplicarResultados();
 assert.equal(sum.aplicadosDatas,1);
 assert.equal(f.rows[2][6].getTime(),TIMESTAMP_CREATED);
 assert.ok(f.rows[2][7]===undefined || f.rows[2][7]==='');
 assert.equal(f.rows[2][1],'');assert.equal(f.rows[2][2],'');
});

test('#4 created/noStart/aborted não recebem datas mesmo que createdAt exista',()=>{
 for(const status of ['created','noStart','aborted']) {
  const f=fixture({games:{Ab12Cd34:gWithDates(status)}});
  const summary=f.world.simularResultados();
  assert.equal(summary.candidatosDatas,0,status);
 }
});

test('#4 recusa lastMoveAt anterior à criação, futuro ou timestamp ausente',()=>{
 const invalids=[{...gWithDates(),lastMoveAt:TIMESTAMP_CREATED-1000},{...gWithDates(),createdAt:Date.UTC(2040,0,1),lastMoveAt:Date.UTC(2040,0,3)},{...gWithDates(),lastMoveAt:null}];
 for(const payload of invalids){
  const f=fixture({games:{Ab12Cd34:payload},props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'}});
  f.world.aplicarResultados();
  assert.ok(f.rows[2][7]===undefined||f.rows[2][7]==='');
 }
});

test('#4 mudança manual em G durante fetch impede escrever G/H',()=>{
 const f=fixture({games:{Ab12Cd34:gWithDates()},props:{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP-IDENTIFIER'},mutateOnRead:rows=>{rows[2][6]='12/10/2026';}});
 const summary=f.world.aplicarResultados();
 assert.equal(summary.aplicadosDatas,0);
 assert.equal(f.rows[2][6],'12/10/2026');
 assert.ok(f.rows[2][7]===undefined||f.rows[2][7]==='');
});

test('#4 Bye e vínculo com cores incorretas nunca recebem datas',()=>{
 const f=fixture({games:{Ab12Cd34:gWithDates()}});
 f.rows[2][3]='Cida'; // jogadores reais não conferem; mock data já estava carregado
 const summary=f.world.simularResultados();
 assert.equal(summary.candidatosDatas,0);
 assert.equal(f.sheets._AuditoriaDatasLichess,undefined);
});
