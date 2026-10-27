import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const setup=()=>{
 const context={Date,JSON,Math,Number,String,Array,Set,Error,console};vm.createContext(context);vm.runInContext(src,context);return context;
};
const rows=()=>[
 ['Rodada 5','','','','','','',''],
 ['Ana',1,0,'Beto','Finalizado','https://lichess.org/Ab12Cd34','',''],
 ['Rodada 6','','','','','','',''],
 ['Ana','','','Cida','Jogador em outra partida','','',''],
 ['Beto','','','Dora','Jogador em outra partida','','',''],
 ['Rodada 7','','','','','','',''],
 ['Ana','','','Dora','Jogador em outra partida','','',''],
 ['Rodada 8','','','','','','',''],
 ['Cida','','','Beto','Jogador em outra partida','','','']
];
test('libera rodada atual e uma à frente, não a segunda à frente',()=>{
 const c=setup(),got=c.propostasElegibilidade_(rows(),6,{});
 assert.deepEqual(Array.from(got.map(x=>x.row)),[4,5]);
 assert.ok(got.every(x=>x.novo==='Aguardando início'));
});
test('partida ativa ocupa ambos sem sugerir outro confronto do jogador',()=>{
 const c=setup(),r=rows();r[3][4]='Em andamento';
 const got=c.propostasElegibilidade_(r,6,{});
 assert.deepEqual(Array.from(got.map(x=>x.row)),[5]);
});
test('resultado final validado na mesma execução libera participantes',()=>{
 const c=setup(),r=rows();r[1][1]='';r[1][2]='';r[1][4]='Em andamento';
 assert.deepEqual(Array.from(c.propostasElegibilidade_(r,6,{}).map(x=>x.row)),[]);
 assert.deepEqual(Array.from(c.propostasElegibilidade_(r,6,{2:true}).map(x=>x.row)),[4,5]);
});
test('estado previamente aguardando é revertido quando jogador fica ocupado',()=>{
 const c=setup(),r=rows();r[3][4]='Em andamento';r[6][4]='Aguardando início';
 const got=c.propostasElegibilidade_(r,6,{});
 assert.equal(got.find(x=>x.row===7).novo,'Jogador em outra partida');
});
test('Bye, link, placar parcial ou fim sem placar não são liberados',()=>{
 const c=setup(),r=rows();r[3][5]='https://lichess.org/Ab12Cd34';r[4][1]=0;r[6][4]='Finalizado';
 const got=c.propostasElegibilidade_(r,6,{});
 assert.deepEqual(Array.from(got.map(x=>x.row)),[]);
});
test('falta ou invalidez de Config impede cálculo de rodada',()=>{
 const c=setup();assert.equal(c.rodadaReferencia_({getSheetByName:()=>null}),null);
 assert.equal(c.rodadaReferencia_({getSheetByName:()=>({getDataRange:()=>({getValues:()=>[['Chave','Valor'],['rodada_atual',6]]})})}),6);
});

test('corrige marcações duplicadas antigas, preservando a rodada atual',()=>{
 const c=setup(),r=rows();
 r[3][4]='Aguardando início';
 r[6][4]='Aguardando início';
 const changes=c.propostasElegibilidade_(r,6,{});
 assert.deepEqual(Array.from(changes.map(p=>[p.row,p.novo])),[
   [5,'Aguardando início'],[7,'Jogador em outra partida']
 ]);
});
test('prioriza a rodada atual mesmo quando ela vem depois na planilha',()=>{
 const c=setup(),r=[
  ['Rodada 5','','','','','','',''],
  ['Ana','','','Bia','Aguardando início','','',''],
  ['Rodada 6','','','','','','',''],
  ['Ana','','','Cida','Jogador em outra partida','','',''],
  ['Rodada 7','','','','','','',''],
  ['Ana','','','Dora','Jogador em outra partida','','',''],
 ];
 const proposals=c.propostasElegibilidade_(r,6,{});
 assert.deepEqual(Array.from(proposals.map(p=>[p.row,p.novo])),[
  [2,'Jogador em outra partida'],[4,'Aguardando início']
 ]);
});
test('distância empatada prioriza rodada anterior à seguinte',()=>{
 const c=setup(),r=[
   ['Rodada 5','','','','','','',''],
   ['Ana','','','Bia','Jogador em outra partida','','',''],
   ['Rodada 7','','','','','','',''],
   ['Ana','','','Cida','Aguardando início','','',''],
 ];
 assert.deepEqual(Array.from(c.propostasElegibilidade_(r,6,{}).map(p=>[p.row,p.novo])),[
  [2,'Aguardando início'],[4,'Jogador em outra partida']
 ]);
});
test('uma mesma rodada resolve conflitos por ordem estável na planilha',()=>{
 const c=setup(),r=[
  ['Rodada 6','','','','','','',''],
  ['Ana','','','Bia','Jogador em outra partida','','',''],
  ['Ana','','','Cida','Aguardando início','','',''],
  ['Dora','','','Eva','Jogador em outra partida','','','']
 ];
 assert.deepEqual(Array.from(c.propostasElegibilidade_(r,6,{}).map(p=>[p.row,p.novo])),[
  [2,'Aguardando início'],[3,'Jogador em outra partida'],[4,'Aguardando início']
 ]);
});
