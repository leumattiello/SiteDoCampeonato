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
 assert.deepEqual(Array.from(got.map(x=>x.row)),[4,5,7]);
 assert.ok(got.every(x=>x.novo==='Aguardando início'));
});
test('partida ativa ocupa ambos e alternativas podem aparecer',()=>{
 const c=setup(),r=rows();r[3][4]='Em andamento';
 const got=c.propostasElegibilidade_(r,6,{});
 assert.deepEqual(Array.from(got.map(x=>x.row)),[5]);
});
test('resultado final validado na mesma execução libera participantes',()=>{
 const c=setup(),r=rows();r[1][1]='';r[1][2]='';r[1][4]='Em andamento';
 assert.deepEqual(Array.from(c.propostasElegibilidade_(r,6,{}).map(x=>x.row)),[]);
 assert.deepEqual(Array.from(c.propostasElegibilidade_(r,6,{2:true}).map(x=>x.row)),[4,5,7]);
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
