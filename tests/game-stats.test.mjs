import test from 'node:test';
import assert from 'node:assert/strict';
import {countChessMoves,gameStats} from '../js/game-stats.js';

const fixture=(extra={})=>({
 id:'r1',white:'Ana',black:'Bia',status:'Finalizado',result:'1-0',
 url:'https://lichess.org/Ab12Cd34ABCD',
 lichessImport:{status:'ok'},lichessDecision:{status:'manual'},
 lichessGame:{id:'Ab12Cd34',status:'mate',winner:'white',moves:'e4 e5 Nf3 Nc6 Bb5 a6',
   opening:{name:'Ruy Lopez',eco:'C60'}},...extra,
});

test('SAN normalizado: lances individuais e pares completos',()=>{
 assert.deepEqual(countChessMoves('e4 e5 Nf3 Nc6 Bb5'),{plies:5,completePairs:2,unpaired:true});
 assert.deepEqual(countChessMoves('e4 e5 Nf3 Nc6 Bb5 a6'),{plies:6,completePairs:3,unpaired:false});
});
test('PGN: ignora números, comentários, variações, NAGs e resultado',()=>{
 const pgn='[Event "Example"]\n\n1.e4 {abertura} e5 (1...c5 (1...e6)) 2.Nf3 $1 Nc6 ;carta\n 3.Bb5!? a6 1-0';
 assert.deepEqual(countChessMoves(pgn),{plies:6,completePairs:3,unpaired:false});
 assert.deepEqual(countChessMoves('1. e4 e5 2. Nf3 Nc6 3. O-O O-O-O *'),{plies:6,completePairs:3,unpaired:false});
});
test('promoção, capturas e xeques contam como lances',()=>{
 assert.deepEqual(countChessMoves('exd5 Qxd5 Nf3+ exd1=Q#'),{plies:4,completePairs:2,unpaired:false});
});
test('nada inventado para PGN truncado, comentário aberto ou SAN desconhecido',()=>{
 for (const bad of [null,'','{ sem fechar e4','e4 ( e5','e4 Garfo','abcdefgh', 'e4 '.repeat(7100)])
  assert.equal(countChessMoves(bad),null);
});
test('estatísticas vêm somente de jogo validado pela conciliação',()=>{
 assert.deepEqual(gameStats(fixture()),{
   openingName:'Ruy Lopez',eco:'C60',moves:{plies:6,completePairs:3,unpaired:false},
   ending:'Xeque-mate',ongoing:false,
 });
});
test('últimos lances de jogo iniciado: permite dados parciais, não inventa encerramento',()=>{
 const x=fixture({status:'Em andamento',result:null,lichessDecision:{status:'playing'},
   lichessGame:{id:'Ab12Cd34',status:'started',moves:'e4 e5 Nf3',opening:null}});
 assert.deepEqual(gameStats(x),{openingName:null,eco:null,moves:{plies:3,completePairs:1,unpaired:true},ending:null,ongoing:true});
});
test('identidade, URL, estado e conflitos são tratados de modo conservador',()=>{
 for(const patch of [
  {result:'bye',status:'Bye'},
  {lichessDecision:null},{lichessDecision:{status:'conflito'}},{lichessDecision:{status:'ignorado'}},
  {lichessImport:{status:'desatualizado'}},
  {url:'https://fake-lichess.org/Ab12Cd34'},
  {lichessGame:{id:'Bb12Cd34',status:'mate',moves:'e4'}},
  {lichessGame:{id:'Ab12Cd34',status:'started',moves:'e4'}},
  {lichessDecision:{status:'playing'}},
 ]) assert.equal(gameStats(fixture(patch)),null,JSON.stringify(patch));
});
test('términos previstos e informação ausente',()=>{
 for(const [state,ending] of Object.entries({resign:'Desistência',timeout:'Tempo esgotado',
    outoftime:'Tempo esgotado',draw:'Empate',stalemate:'Afogamento',cheat:'Encerramento por infração'})) {
   const s=gameStats(fixture({lichessGame:{id:'Ab12Cd34',status:state,moves:null,opening:{eco:'B20'}}}));
   assert.equal(s.ending,ending); assert.equal(s.openingName,null); assert.equal(s.eco,'B20');assert.equal(s.moves,null);
 }
});
test('ignora abertura inválida e preserva campos sem dados',()=>{
 let stats=gameStats(fixture({lichessGame:{id:'Ab12Cd34',status:'mate',moves:'e4 e5',opening:{name:'x'.repeat(200),eco:'INVALID'}}}));
 assert.equal(stats.openingName,null);assert.equal(stats.eco,null);
});
