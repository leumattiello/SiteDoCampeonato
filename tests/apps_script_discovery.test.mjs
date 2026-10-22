import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const created=Date.UTC(2026,9,20);
function fixture({listDays=null,detailDays=1,omitGame=false}={}){
 const rows=[
  ['Brancas','B','C','Pretas','Status','Link','Início','Fim'],
  ['Rodada 5','','','','','','',''],
  ['Alice','','','Emanuel','Finalizado','https://lichess.org/Ab12Cd34',new Date(created-86400000),''],
  ['Rodada 6','','','','','','',''],
  ['Humberto','','','Ligia','Jogador em outra partida','','','']];
 const props={},logs=[],writes=[],urls=[];
 const game={id:'Hi12Lm34',players:{white:{user:{id:'humberto_m'}},black:{user:{id:'raducol'}}},perf:'correspondence',status:'started',createdAt:created};
 if(listDays!==null)game.daysPerTurn=listDays;
 const sheets={};
 const makeSheet=(values)=>({getDataRange:()=>({getValues:()=>values.map(r=>r.slice())}),
  getRange:(row,col,count=1,cols=1)=>({
    getValues:()=>Array.from({length:count},(_,i)=>values[row+i-1].slice(col-1,col-1+cols)),
    getValue:()=>values[row-1][col-1],
    setValue:(v)=>{writes.push([row,col,v]);values[row-1][col-1]=v;return {setNumberFormat:()=>{}}},
  }),appendRow:(row)=>values.push(row)});
 sheets['2']=makeSheet(rows);
 sheets.Jogadores=makeSheet([['Nome','Nick Lichess'],['Humberto','Humberto_M'],['Ligia','Raducol']]);
 const context={Date,JSON,Error,Object,Math,Number,String,Array,Set,RegExp,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=> 'SHEET-TEST',getSheetByName:x=>sheets[x]||null,
   getSpreadsheetTimeZone:()=> 'America/Sao_Paulo',insertSheet:x=>{sheets[x]=makeSheet([]);return sheets[x];}}),flush:()=>{}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 Utilities:{sleep:()=>{}},
 UrlFetchApp:{fetch:(url)=>{urls.push(url);
   if(url.includes('/api/games/user/'))return {getResponseCode:()=>200,
     getContentText:()=>omitGame?'':JSON.stringify(game)};
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
 const r=f.context.diagnosticarHumbertoLigia();
 assert.equal(r.candidatos,1);assert.equal(r.aplicados,0);
 assert.equal(r.consultasDetalhes,1);
 assert.equal(f.writes.length,0);
 assert.equal(f.rows[4][5],'');
 assert.equal(f.urls.filter(s=>s.includes('api/games/user/')).length,2);
 assert.ok(f.logs.some(s=>s.includes('possível vínculo linha 5')));
});
test('export também sem prazo: não faz vinculação automática e explica motivo',()=>{
 const f=fixture({detailDays:null});
 const r=f.context.diagnosticarHumbertoLigia();
 assert.equal(r.candidatos,0);
 assert.equal(r.prazoNaoConfirmado,1);
 assert.equal(f.writes.length,0);
});
test('sem partidas retornadas: informa claramente, sem atribuir a filtro',()=>{
 const f=fixture({omitGame:true});
 const r=f.context.diagnosticarHumbertoLigia();
 assert.equal(r.jogosRetornados,0);
 assert.equal(r.semJogos,1);
 assert.ok(f.logs.some(s=>s.includes('nenhum jogo retornado')));
});
test('jogo com 3 dias/lance não é vinculado',()=>{
 const f=fixture({listDays:3,detailDays:3});
 const r=f.context.diagnosticarHumbertoLigia();
 assert.equal(r.candidatos,0);
 assert.equal(f.writes.length,0);
});
