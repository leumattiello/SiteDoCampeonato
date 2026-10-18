import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTournament} from '../js/model.js';
import {gloryAwards} from '../js/glory.js';

const game=(id,white,black,result,props={})=>({
  id,round:1,white,black,result,status:'Finalizado',
  start:'01/10/2026',end:'10/10/2026',
  url:'https://lichess.org/'+id,
  lichessImport:{status:'ok'},
  lichessDecision:{status:'manual'},
  lichessGame:{id,status:'mate',winner:result==='1-0'?'white':result==='0-1'?'black':null,
    moves:'e4 e5 Nf3 Nc6',opening:{eco:'C60',name:'Ruy Lopez'}},
  ...props
});
const tour=(matches,currentRound=1)=>buildTournament({active:true,currentRound,matches});
const byKey=(t,k)=>gloryAwards(t).find(a=>a.key===k);
const names=a=>a.holders;

test('retorna seis honrarias clássicas e onze tronos regionais com critérios auditáveis',()=>{
 const arr=gloryAwards(tour([]));
 assert.deepEqual(arr.slice(0,6).map(a=>a.key),['siege','epic','lightning','conqueror','shield','master']);
 assert.equal(arr.length,17);
 assert.ok(arr.every(a=>a.score===null && a.holders.length===0 && a.games.length===0));
 assert.ok(arr.every(a=>a.criterion && a.detail));
});

test('Grande Cerco compartilha honra com ambos, empata e não usa Bye',()=>{
 const a=game('Ab12Cd34','Ana','Bia','1-0');
 const b=game('Bc23De45','Carol','Dora','½-½',{
   lichessGame:{id:'Bc23De45',status:'draw',winner:null,moves:'e4 e5'}});
 const t=tour([a,b,game('Cd34Ef56','Eva',null,'bye',{status:'Bye',byePoints:1,start:'01/01/2000',end:'01/01/2026'})]);
 const honor=byKey(t,'siege');
 assert.deepEqual(names(honor),['Ana','Bia','Carol','Dora']);
 assert.equal(honor.games.length,2);
 assert.equal(honor.score,'9 dias');
});

test('Batalha Épica e Ataque Relâmpago comparam meio-lances, não duração',()=>{
 const slow=game('Ab12Cd34','Ana','Bia','1-0',{
   end:'02/10/2026',lichessGame:{id:'Ab12Cd34',status:'mate',winner:'white',moves:'e4 e5 Nf3 Nc6 Bb5'}});
 const fast=game('Bc23De45','Carol','Dora','0-1',{
   end:'15/10/2026',lichessGame:{id:'Bc23De45',status:'mate',winner:'black',moves:'e4 e5'}});
 const t=tour([slow,fast]);
 assert.deepEqual(names(byKey(t,'epic')),['Ana','Bia']);
 assert.equal(byKey(t,'epic').score,'5 lances individuais');
 assert.deepEqual(names(byKey(t,'lightning')),['Dora']);
 assert.equal(byKey(t,'lightning').score,'2 lances individuais');
 assert.equal(byKey(t,'lightning').games[0].id,'Bc23De45');
});

test('Empates de mínimo de lances premiam todos os vencedores, nunca os vencidos',()=>{
 const a=game('Ab12Cd34','Ana','Bia','1-0');
 const b=game('Bc23De45','Carol','Dora','0-1',{
   lichessGame:{id:'Bc23De45',status:'mate',winner:'black',moves:'d4 d5 c4 e6'}});
 assert.deepEqual(names(byKey(tour([a,b]),'lightning')),['Ana','Dora']);
});

test('Conquistador conta vitórias efetivas, empate de líderes e Bye não pontuam',()=>{
 const t=tour([
  game('Ab12Cd34','Ana','Bia','1-0'),
  game('Bc23De45','Carol','Dora','0-1'),
  game('Cd34Ef56','Ana','Carol','½-½',{lichessGame:{id:'Cd34Ef56',status:'draw',winner:null,moves:'d4 d5'}}),
  game('De45Fg67','Bia',null,'bye',{status:'Bye',byePoints:1}),
 ]);
 const c=byKey(t,'conqueror');
 assert.equal(c.score,'1 vitória');
 assert.deepEqual(names(c),['Ana','Dora']);
 assert.deepEqual(c.games.map(m=>m.id),['Ab12Cd34','Bc23De45']);
});

test('Escudo Invicto ordena pelas datas, não pela ordem das linhas; derrota reinicia',()=>{
 const t=tour([
   game('Ab12Cd34','Ana','Bia','1-0',{end:'09/10/2026'}),
   game('Bc23De45','Ana','Carol','0-1',{end:'03/10/2026'}),
   game('Cd34Ef56','Ana','Dora','½-½',{end:'05/10/2026',lichessGame:{id:'Cd34Ef56',status:'draw',winner:null,moves:'d4 d5'}}),
   game('De45Fg67','Ana','Eva','1-0',{end:'07/10/2026'}),
 ]);
 const s=byKey(t,'shield');
 assert.equal(s.score,'3 partidas sem derrota');
 assert.deepEqual(names(s),['Ana']);
 assert.deepEqual(s.games.map(m=>m.id),['Ab12Cd34','Cd34Ef56','De45Fg67']);
});

test('Escudo não inventa ordem entre derrota e vitória no mesmo dia',()=>{
 const t=tour([
   game('Ab12Cd34','Ana','Bia','1-0',{end:'01/10/2026'}),
   game('Bc23De45','Ana','Carol','0-1',{end:'02/10/2026'}),
   game('Cd34Ef56','Ana','Dora','1-0',{end:'02/10/2026'}),
 ]);
 const shield=byKey(t,'shield');
 assert.equal(shield.score,'1 partida sem derrota');
 assert.ok(shield.holders.includes('Ana'));
});

test('Mestre das Aberturas exige dois ECO diferentes, sem repetir ECO no mesmo jogador',()=>{
 const t=tour([
  game('Ab12Cd34','Ana','Bia','1-0'),
  game('Bc23De45','Ana','Carol','1-0',{lichessGame:{id:'Bc23De45',status:'mate',winner:'white',moves:'d4 d5',opening:{eco:'D00'}}}),
  game('Cd34Ef56','Ana','Dora','1-0'),
 ]);
 const master=byKey(t,'master');
 assert.equal(master.score,'2 aberturas ECO distintas');
 assert.deepEqual(master.holders,['Ana']);
 assert.equal(master.games.length,3);
 assert.match(master.note,/C60/);
 assert.match(master.note,/D00/);
});

test('Uma única abertura, falta de PGN e metadados conflitantes não criam prêmio de ECO/lances',()=>{
 const x=game('Ab12Cd34','Ana','Bia','1-0',{
  lichessDecision:{status:'conflito'},
  lichessGame:{id:'Ab12Cd34',status:'mate',winner:'white',moves:'e4 e5',opening:{eco:'C60'}}});
 const t=tour([x]);
 assert.equal(byKey(t,'master').score,null);
 assert.equal(byKey(t,'epic').score,null);
 assert.equal(byKey(t,'lightning').score,null);
 assert.equal(byKey(t,'conqueror').score,'1 vitória'); // Sheets prevalece
 assert.equal(byKey(t,'epic').score,null);
});

test('Dados incompletos e torneio em andamento sinalizam prêmio provisório',()=>{
 const t=tour([
  game('Ab12Cd34','Ana','Bia','1-0',{end:null}),
  {id:'Bc23De45',round:1,white:'Carol',black:'Dora',status:'Em andamento',result:null}
 ]);
 const honors=gloryAwards(t);
 assert.ok(honors.every(a=>!('provisional' in a)));
 assert.equal(byKey(t,'siege').score,null);
 assert.equal(byKey(t,'shield').score,null);
 assert.equal(byKey(t,'conqueror').score,'1 vitória');
});

test('Todos os jogos de honrarias são da edição atual, não do histórico',()=>{
 const t=tour([game('Ab12Cd34','Ana','Bia','1-0')]);
 const all=gloryAwards(t);
 assert.ok(all.every(a=>a.games.every(m=>m.id==='Ab12Cd34')));
});
