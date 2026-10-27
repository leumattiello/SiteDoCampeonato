import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const init=()=>{const c={Date,JSON,Math,Number,String,Array,Set,Error,console};vm.createContext(c);vm.runInContext(src,c);return c;};
const grid=()=>[
 ['Rodada 1','','','','','','','','','Jogador','Pontos','Partidas'],
 ['Ana',1,0,'Beto','Finalizado','','','','','ana','',''],
 ['Cida',.5,.5,'Dora','Finalizado','','','','','beto','',''],
 ['Ana',1,'','','Bye','','','','','cida','',''],
 ['Beto',0,'','','Bye','','','','','dora','',''],
 ['Rodada 2','','','','','','','','','','',''],
 ['Ana','','','Cida','Em andamento','','','','','','','']
];
const nicks=()=>({'ana':'ana','beto':'beto','cida':'cida','dora':'dora'});
test('soma resultados e folgas sem contar Bye como jogo',()=>{
 const c=init(),r=c.apurarResumoJogadores_(grid(),nicks());
 assert.equal(r.error,undefined);
 assert.equal(r.roster.ana.points,2);assert.equal(r.roster.ana.played,1);
 assert.equal(r.roster.beto.points,0);assert.equal(r.roster.beto.played,1);
 assert.equal(r.roster.cida.points,.5);assert.equal(r.roster.cida.played,1);
 assert.equal(r.roster.dora.points,.5);assert.equal(r.roster.dora.played,1);
});
test('placar parcial ou impossível bloqueia o quadro inteiro',()=>{
 const c=init(),r=grid();r[6][1]=0;
 assert.match(c.apurarResumoJogadores_(r,nicks()).error,/inconsistente/);
 r[6][2]=2;assert.match(c.apurarResumoJogadores_(r,nicks()).error,/inconsistente/);
});
test('pontuação inválida de Bye não é ignorada silenciosamente',()=>{
 const c=init(),r=grid();r[3][1]=2;
 assert.match(c.apurarResumoJogadores_(r,nicks()).error,/inconsistente/);
});
test('simulação preserva K/L; aplicação escreve apenas K/L e não duplica auditoria',()=>{
 const c=init(),r=grid(),writes=[],sheets={};
 const fake={
  getDataRange:()=>({getValues:()=>r.map(x=>x.slice())}),
  getRange:(row,col,n=1,m=1)=>({
   getValues:()=>Array.from({length:n},(_,i)=>r[row+i-1].slice(col-1,col-1+m)),
   getFormulas:()=>Array.from({length:n},()=>Array(m).fill('')),
   setValues:mat=>{writes.push(['K/L',row,col]);mat.forEach((v,i)=>v.forEach((z,j)=>r[row+i-1][col+j-1]=z));}
  })
 };
 const spreadsheet={
  getSheetByName:k=>sheets[k]||null,
  insertSheet:k=>(sheets[k]={appendRow:()=>{writes.push(['audit'])}}),
 };
 const out={resumoCandidatos:0,resumoAplicados:0,resumoConflitos:0};
 c.sincronizarResumoJogadores_(fake,r,nicks(),false,spreadsheet,out);
 assert.equal(out.resumoCandidatos,4);assert.deepEqual(writes,[]);
 c.SpreadsheetApp={flush:()=>{}};
 c.sincronizarResumoJogadores_(fake,r,nicks(),true,spreadsheet,out);
 assert.equal(out.resumoAplicados,4);
 assert.deepEqual(r.slice(1,5).map(x=>x.slice(10,12)),[[2,1],[0,1],[.5,1],[.5,1]]);
 const before=writes.length;
 c.sincronizarResumoJogadores_(fake,r,nicks(),true,spreadsheet,out);
 assert.equal(out.resumoCandidatos,0);assert.equal(writes.length,before);
});
