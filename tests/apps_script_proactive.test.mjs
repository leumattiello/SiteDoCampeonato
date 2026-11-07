import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');

function fixture({httpStatus=200,approved=true}={}) {
  const rows=[['Rodada 7','','','','','','','']];
  const players=[['Nome','Nick Lichess']];
  for(let i=0;i<6;i++) {
    const white='Brancas'+i,black='Pretas'+i;
    rows.push([white,'','',black,'Jogador em outra partida','',
      i===0?new Date(Date.UTC(2026,8,15)):'','']);
    players.push([white,'brancas'+i],[black,'pretas'+i]);
  }
  const sheets={};
  const writes=[],calls=[],logs=[];
  class Sheet {
    constructor(name,values){this.name=name;this.values=values;}
    getName(){return this.name;}
    getDataRange(){return {getValues:()=>this.values.map(x=>x.slice())};}
    getRange(row,col,n=1,m=1) {
      return {
        getValues:()=>Array.from({length:n},(_,i)=>this.values[row-1+i].slice(col-1,col-1+m)),
        getValue:()=>this.values[row-1][col-1],
        setValue:(value)=>{this.values[row-1][col-1]=value;writes.push([this.name,row,col,value]);return {setNumberFormat:()=>{}};},
        setValues:(matrix)=>{matrix.forEach((item,i)=>item.forEach((value,j)=>{this.values[row-1+i][col-1+j]=value;}));writes.push([this.name,row,col,matrix]);return null;},
        getFormulas:()=>Array.from({length:n},()=>Array(m).fill(''))
      };
    }
    appendRow(value){this.values.push(value);writes.push([this.name,'append',value]);}
  }
  sheets['2']=new Sheet('2',rows);
  sheets.Jogadores=new Sheet('Jogadores',players);
  const book={getId:()=> 'BACKUP',getSheetByName:name=>sheets[name]||null,
    insertSheet:name=>(sheets[name]=new Sheet(name,[])),
    getSpreadsheetTimeZone:()=> 'America/Sao_Paulo'};
  const props=approved?{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP',
    EXECUCAO_AUTOMATICA_HABILITADA:'SIM',LICHESS_API_TOKEN:'FAKE'}:{LICHESS_API_TOKEN:'FAKE'};
  const ctx={
    SpreadsheetApp:{getActiveSpreadsheet:()=>book,flush:()=>{}},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>props[k]||null,setProperty:(k,value)=>{props[k]=value;}
    })},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    UrlFetchApp:{fetch:(url)=>{
      calls.push(url);
      const status=url.includes('/api/games/user/')?httpStatus:401;
      return {getResponseCode:()=>status,getContentText:()=>''};
    }},
    Utilities:{sleep:()=>{}},
    console:{log:(...msg)=>logs.push(msg.join(' ')),error:(...msg)=>logs.push(msg.join(' '))},
    Date,JSON,Math,Number,String,Array,Set,Error,RegExp,Object
  };
  vm.createContext(ctx);vm.runInContext(script,ctx);
  return {ctx,rows,sheets,book,props,calls,logs,writes};
}
function queriedPairs(f) {
  return f.calls.filter(u=>u.includes('/api/games/user/'))
    .map(u=>(/api\/games\/user\/([^?]+)/.exec(u)||[])[1]);
}
test('automatic discovery rotates across six different unlinked pairs without starvation',()=>{
  const f=fixture();
  const first=f.ctx.sincronizarAutomaticamente();
  assert.equal(first.descoberta.interrompida,false);
  assert.equal(first.descoberta.linhasAnalisadas,4);
  assert.equal(first.descoberta.consultas,8);
  assert.deepEqual(queriedPairs(f).filter((_,i)=>i%2===0),
    ['brancas0','brancas1','brancas2','brancas3']);
  assert.match(f.props.DESCOBERTA_ULTIMO_CONFRONTO_V1, /#5$/);
  f.calls.length=0;
  const second=f.ctx.sincronizarAutomaticamente();
  assert.equal(second.descoberta.linhasAnalisadas,4);
  assert.deepEqual(queriedPairs(f).filter((_,i)=>i%2===0),
    ['brancas4','brancas5','brancas0','brancas1']);
  assert.match(f.props.DESCOBERTA_ULTIMO_CONFRONTO_V1, /#3$/);
});
test('simulação não grava F nem avança cursor persistente',()=>{
 const f=fixture({approved:false});
 const out=f.ctx.sincronizarAutomaticamente();
 assert.equal(out.descoberta.modo,'SIMULACAO');
 assert.equal(out.descoberta.linhasAnalisadas,4);
 assert.equal(f.props.DESCOBERTA_ULTIMO_CONFRONTO_V1,undefined);
 assert.equal(f.writes.length,0);
});
test('HTTP 403 interrompe descoberta, sem insistência e cria pausa',()=>{
 const f=fixture({httpStatus:403});
 const out=f.ctx.sincronizarAutomaticamente();
 assert.equal(out.descoberta.interrompida,true);
 assert.equal(out.descoberta.consultas,1);
 assert.equal(out.consolidacao.status,'adiada');
 assert.equal(queriedPairs(f).length,1);
 assert.ok(Number(f.props.DESCOBERTA_PAUSA_ATE_V1)>Date.now());
});
test('edição humana de F, mesmo removendo link, impede redescoberta',()=>{
 const f=fixture({approved:false});
 const range={getSheet:()=>f.sheets['2'],getColumn:()=>6,getNumColumns:()=>1,
   getRow:()=>2,getNumRows:()=>1};
 f.ctx.onEdit({source:f.book,range});
 assert.equal(f.sheets._ControleManualLichess.values.length,2);
 assert.equal(f.sheets._ControleManualLichess.values[1][2],'F');
 const protectedRows=f.ctx.lerProtecoesManuais_(f.book,f.rows);
 assert.equal(f.ctx.estaProtegidoManualmente_(protectedRows,2,'F'),true);
 const res=f.ctx.simularDescoberta();
 assert.equal(res.pendentes,5);
 assert.equal(res.linhasAnalisadas,4);
 assert.ok(!queriedPairs(f).includes('brancas0'));
});
