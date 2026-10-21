import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTiebreakers} from '../js/tiebreak.js';
const m=(w,b,result)=>({white:w,black:b,result,derivedStatus:'finished'});
const p=(name,points,wins)=>({name,points,wins});
test('confronto direto decide empate em pontos',()=>{
 const got=applyTiebreakers([p('Ana',1,1),p('Bia',1,1)],[m('Bia','Ana','0-1')]);
 assert.deepEqual(got.map(x=>x.name),['Ana','Bia']);
 assert.deepEqual(got.map(x=>x.position),[1,2]);
});
test('empate persiste sem critério que separe; nome não desempata oficialmente',()=>{
 const got=applyTiebreakers([p('Zeca',0,0),p('Ana',0,0)],[]);
 assert.deepEqual(got.map(x=>x.position),[1,1]);
});
test('Bye concede pontos mas não vitória, confronto direto, SB ou partida de pretas',()=>{
 const bye={white:'Ana',black:null,result:'bye',derivedStatus:'bye',byePoints:1};
 const got=applyTiebreakers([p('Ana',1,0),p('Bia',0,0)],[bye]);
 assert.equal(got[0].tiebreak.wins,0);assert.equal(got[0].tiebreak.sb,0);
 assert.equal(got[0].tiebreak.blacks,0);
});
test('Sonneborn-Berger e partidas de pretas consideram somente jogos concluídos',()=>{
 const pending={white:'Bia',black:'Ana',result:null,derivedStatus:'playing'};
 const got=applyTiebreakers([p('Ana',1,1),p('Bia',0,0)],[m('Ana','Bia','1-0'),pending]);
 assert.equal(got[0].tiebreak.sb,0);
 assert.equal(got[0].tiebreak.blacks,0);
 assert.equal(got[0].tiebreak.provisional,true);
});
test('minitorneio computa partidas apenas entre empatados',()=>{
 const list=[p('A',2,1),p('B',2,1),p('C',2,1),p('D',0,0)];
 const games=[m('A','B','1-0'),m('C','A','1-0'),m('B','C','1-0')];
 const got=applyTiebreakers(list,games);
 assert.equal(got[0].tiebreak.direct,1);
 assert.deepEqual(got.slice(0,3).map(x=>x.position),[1,1,1]);
});
