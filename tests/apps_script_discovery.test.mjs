import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const created=Date.UTC(2026,9,20);
function fixture({listDays=null,detailDays=1,omitGame=false,caseEnrico=false,legacyFiltersReturnEmpty=false,wrongColors=false}={}){
 const rows=[
  ['Brancas','B','C','Pretas','Status','Link','Início','Fim'],
  ['Rodada 5','','','','','','',''],
  ['Alice','','','Emanuel','Finalizado','https://lichess.org/Ab12Cd34',new Date(created-86400000),''],
  ['Rodada 6','','','','','','',''],
  [caseEnrico?'Enrico':'Humberto','','',caseEnrico?'Gabriel':'Ligia','Jogador em outra partida','','','']];
 const props={},logs=[],writes=[],urls=[];
 const w=caseEnrico?'xarnosqui':'humberto_m',b=caseEnrico?'biel009':'raducol';
 const game={id:caseEnrico?'2Lx5SE4D':'Hi12Lm34',
   players:{white:{user:{id:wrongColors?b:w}},black:{user:{id:wrongColors?w:b}}},
   perf:'correspondence',status:caseEnrico?'mate':'started',
   createdAt:caseEnrico?Date.UTC(2026,10,1,22,26,15):created};
 if(listDays!==null)game.daysPerTurn=listDays;
 const sheets={};
 const makeSheet=(values)=>({getDataRange:()=>({getValues:()=>values.map(r=>r.slice())}),
  getRange:(row,col,count=1,cols=1)=>({
    getValues:()=>Array.from({length:count},(_,i)=>values[row+i-1].slice(col-1,col-1+cols)),
    getValue:()=>values[row-1][col-1],
    setValue:(v)=>{writes.push([row,col,v]);values[row-1][col-1]=v;return {setNumberFormat:()=>{}}},
  }),appendRow:(row)=>values.push(row)});
 sheets['2']=makeSheet(rows);
 sheets.Jogadores=makeSheet(caseEnrico?
    [['Nome','Nick Lichess'],['Enrico','Xarnosqui'],['Gabriel','Biel009']]:
    [['Nome','Nick Lichess'],['Humberto','Humberto_M'],['Ligia','Raducol']]);
 const context={Date,JSON,Error,Object,Math,Number,String,Array,Set,RegExp,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=> 'SHEET-TEST',getSheetByName:x=>sheets[x]||null,
   getSpreadsheetTimeZone:()=> 'America/Sao_Paulo',insertSheet:x=>{sheets[x]=makeSheet([]);return sheets[x];}}),flush:()=>{}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 Utilities:{sleep:()=>{}},
 UrlFetchApp:{fetch:(url)=>{urls.push(url);
   if(url.includes('/api/games/user/'))return {getResponseCode:()=>200,
     getContentText:()=>omitGame || (legacyFiltersReturnEmpty && /[?&](?:perfType|since|sort|opening)=/.test(url))?'':JSON.stringify(game)};
   if(url.includes('/game/export/'))return {getResponseCode:()=>200,
     getContentText:()=>JSON.stringify({...game,daysPerTurn:detailDays})};
   return {getResponseCode:()=>404,getContentText:()=>''};
 }},
 console:{log:(...msg)=>logs.push(msg.join(' ')),error:(...msg)=>logs.push(msg.join(' '))}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,logs,writes,urls,rows};
}
test('sem daysPerTurn na listagem, export confirma 1 dia e permite candidato apenas em simulação',()=>{
 const f=fixture();
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.candidatos,1);assert.equal(r.aplicados,0);
 assert.equal(r.consultasDetalhes,1);
 assert.equal(f.writes.length,0);
 assert.equal(f.rows[4][5],'');
 assert.equal(f.urls.filter(s=>s.includes('api/games/user/')).length,2);
 assert.ok(f.logs.some(s=>s.includes('possível vínculo linha 5')));
});
test('export também sem prazo: não faz vinculação automática e explica motivo',()=>{
 const f=fixture({detailDays:null});
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.candidatos,0);
 assert.equal(r.prazoNaoConfirmado,1);
 assert.equal(f.writes.length,0);
});
test('sem partidas retornadas: informa claramente, sem atribuir a filtro',()=>{
 const f=fixture({omitGame:true});
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.jogosRetornados,0);
 assert.equal(r.semJogos,1);
 assert.ok(f.logs.some(s=>s.includes('nenhum jogo retornado')));
});
test('jogo com 3 dias/lance não é vinculado',()=>{
 const f=fixture({listDays:3,detailDays:3});
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.candidatos,0);
 assert.equal(f.writes.length,0);
});

test('Enrico x Gabriel: busca reduzida encontra jogo ocultado pelos filtros extras',()=>{
 const f=fixture({caseEnrico:true,listDays:1,legacyFiltersReturnEmpty:true});
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.erros,0);
 assert.equal(r.candidatos,1);
 assert.equal(r.jogosConfirmados,1);
 assert.equal(r.aplicados,0);
 assert.equal(f.rows[4][5],'');
 const requests=f.urls.filter(u=>u.includes('/api/games/user/'));
 assert.equal(requests.length,2);
 for(const url of requests){
   assert.match(url,/\bvs=(?:xarnosqui|biel009)/);
   assert.doesNotMatch(url,/[?&](?:since|perfType|sort|opening)=/);
 }
 assert.ok(f.logs.some(s=>s.includes('possível vínculo linha 5 ID 2Lx5SE4D')));
});
test('busca reduzida mantém checagem local de jogadores e cores',()=>{
 const f=fixture({caseEnrico:true,listDays:1,wrongColors:true});
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.candidatos,0);
 assert.equal(r.descartadosPorCores,1);
 assert.equal(f.writes.length,0);
});
test('busca reduzida continua recusando jogos fora da data mínima',()=>{
 const f=fixture({caseEnrico:true,listDays:1});
 // A data mínima é calculada a partir do primeiro jogo com G preenchida.
 // Como o jogo novo é de 1º de novembro, mover a referência inicial para frente o exclui.
 f.rows[2][6]=new Date(Date.UTC(2026,11,20));
 const r=f.context.descobrirPartidas_(false);
 assert.equal(r.candidatos,0);
 assert.equal(r.descartadosPorData,1);
});

test('varredura proativa circula por confrontos sem link e atualiza o cursor',()=>{
 const f=fixture({omitGame:true});
 // Adiciona mais quatro duplas nas mesmas contas de teste. O cursor avança
 // por linha (e não fixa indefinidamente os primeiros confrontos).
 for(let i=0;i<5;i++)
   f.rows.push(['Humberto','','','Ligia','Jogador em outra partida','','','']);
 const props={};
 // Teste do algoritmo do cursor: chamadas simuladas não devem gravar.
 const first=f.context.descobrirPartidas_(false,{automatica:true});
 assert.equal(first.modo,'SIMULACAO');
 assert.equal(first.aplicados,0);
 assert.equal(first.cursorNovo,null);
 assert.ok(first.consultas<=8);
});
test('descoberta ignora placar manual divergente se identifica uma única partida válida',()=>{
 const f=fixture({caseEnrico:true,listDays:1});
 f.rows[4][1]=0;
 f.rows[4][2]=1;
 f.rows[4][4]='Finalizado';
 const result=f.context.descobrirPartidas_(false);
 assert.equal(result.candidatos,1);
 assert.equal(f.rows[4][5],'');
 assert.equal(f.writes.length,0);
});
test('descoberta respeita linha totalmente Finalizada e preenchida',()=>{
 const f=fixture({caseEnrico:true,listDays:1});
 f.rows[4]=['Enrico',1,0,'Gabriel','Finalizada','https://lichess.org/2Lx5SE4D',
    new Date(created),new Date(created+86400000)];
 const result=f.context.descobrirPartidas_(false);
 assert.equal(result.candidatos,0);
 assert.equal(result.consultas,0);
});
