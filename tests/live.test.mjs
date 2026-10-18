import test from 'node:test';
import assert from 'node:assert/strict';
import {activeBoardInfo} from '../js/live.js';

const NOW=Date.parse('2026-10-17T23:00:00Z');
const match=(patch={})=>({
  id:'r4-1',white:'Ana',black:'Bia',round:4,status:'Em andamento',result:null,
  url:'https://lichess.org/Ab12Cd34xYz9',
  lichessDecision:{status:'playing'},
  lichessImport:{status:'ok',checkedAt:'2026-10-17T22:58:00+00:00'},
  lichessGame:{id:'Ab12Cd34',status:'started',winner:null,moves:'e4',fetchedAt:'2026-10-17T22:57:00+00:00'},
  ...patch,
});
test('mostra posição apenas em jogo ativo validado e preserva URL privada original',()=>{
  assert.deepEqual(activeBoardInfo(match(),NOW),{
    id:'Ab12Cd34',embedUrl:'https://lichess.org/embed/game/Ab12Cd34?theme=brown&bg=light',
    gameUrl:'https://lichess.org/Ab12Cd34xYz9',
    checkedAt:'2026-10-17T22:57:00.000Z',stale:false
  });
});
test('mostra posição inicial de jogo started mesmo sem lances',()=>{
  assert.ok(activeBoardInfo(match({lichessGame:{id:'Ab12Cd34',status:'started',moves:''}}),NOW));
});
test('não exibe Byes, jogos encerrados, desconhecidos, conflitantes ou somente status manual',()=>{
  for(const patch of [
    {result:'bye',status:'Bye'}, {result:'1-0',status:'Finalizado'},
    {lichessDecision:null}, {lichessDecision:{status:'finished'}},
    {lichessDecision:{status:'conflito'}}, {lichessDecision:{status:'ignorado'}},
    {lichessImport:{status:'indisponivel'}}, {lichessImport:{status:'desatualizado'}},
    {lichessGame:{id:'Ab12Cd34',status:'mate',winner:'white'}},
    {lichessGame:{id:'Ab12Cd34',status:'created'}},
    {lichessGame:{id:'Zb12Cd34',status:'started'}},
    {derivedStatus:'finished'}, {lichessGame:{id:'Ab12Cd34',status:'started',winner:'white'}},
  ]) assert.equal(activeBoardInfo(match(patch),NOW),null,JSON.stringify(patch));
});
test('nega URLs malformadas ou domínios parecidos',()=>{
  for(const url of ['https://lichess.org.evil.com/Ab12Cd34','javascript:alert(1)',
    'https://lichess.org/study/Ab12Cd34','https://lichess.org/Ab12Cd34?move=1',
    'https://lichess.org:444/Ab12Cd34','https://lichess.org/Ab12Cd345'])
    assert.equal(activeBoardInfo(match({url}),NOW),null,url);
});
test('horário representa a coleta real (cache não usa checkedAt) e dado antigo gera aviso',()=>{
  let data=match({lichessImport:{status:'cache',checkedAt:'2026-10-17T22:59:00+00:00'},
    lichessGame:{id:'Ab12Cd34',status:'started',fetchedAt:'2026-10-17T19:00:00Z'}});
  assert.equal(activeBoardInfo(data,NOW).stale,true);
  assert.equal(activeBoardInfo(data,NOW).checkedAt,'2026-10-17T19:00:00.000Z');
  data.lichessGame.fetchedAt=undefined;
  assert.equal(activeBoardInfo(data,NOW).checkedAt,null);
  assert.equal(activeBoardInfo(data,NOW).stale,true);
});
test('não confia em timestamp malformado, futuro ou sem timezone',()=>{
  for(const ts of ['2026-10-17T22:57:00','2026-10-18T00:01:01Z','invalid',
    '2017-01-01T00:00:00Z']) {
    const b=activeBoardInfo(match({lichessGame:{id:'Ab12Cd34',status:'started',fetchedAt:ts},
      lichessImport:{status:'cache'}}),NOW);
    assert.equal(b.checkedAt,null);
  }
});
test('consulta efetiva pode usar checkedAt quando fetchedAt não foi incluído',()=>{
  const b=activeBoardInfo(match({lichessGame:{id:'Ab12Cd34',status:'started'}}),NOW);
  assert.equal(b.checkedAt,'2026-10-17T22:58:00.000Z');
  assert.equal(b.stale,false);
});
