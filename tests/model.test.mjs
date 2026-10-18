import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTournament,nextMatches,parseDate,durationDays,honors,validLichessUrl,byeScore,resolveMatchDates,lichessLocalDate,correspondenceRating,replayInfo,replayGameId,homeActiveMatches} from '../js/model.js';

const m=(round,white,black,result=null,status='Jogador em outra partida',extra={})=>({round,white,black,result,status,...extra});
test('Resultado final substitui status antigo de em andamento',()=>{
 const t=buildTournament({currentRound:4,matches:[m(4,'Wendell','Emanuel','1-0','Em andamento'),m(4,'Humberto','Enrico',null,'Em andamento'),m(5,'Wendell','Anesio')]});
 assert.equal(t.finished.length,1);assert.equal(t.ongoing.length,1);
 assert.equal(t.matches[2].derivedStatus,'ready');
 assert.equal(t.standings.find(p=>p.name==='Wendell').points,1);
});
test('Não permite outra partida com jogador já ocupado',()=>{
 const t=buildTournament({currentRound:4,matches:[m(4,'Alice','Bruno',null,'Em andamento'),m(5,'Alice','Carlos'),m(5,'Dora','Carlos')]});
 assert.equal(t.matches[1].derivedStatus,'busy');assert.equal(t.matches[2].derivedStatus,'ready');
});
test('Permite rodada seguinte; bloqueia rodada duas à frente',()=>{
 const t=buildTournament({currentRound:4,matches:[m(5,'Alice','Bruno'),m(6,'Carol','Dora'),m(1,'Enrico','Emanuel')]});
 assert.deepEqual(t.matches.map(m=>m.derivedStatus),['ready','future','ready']);
});
test('Bye usa o valor da coluna B, não pontuação fixa, e não conta como partida jogada',()=>{
 const t=buildTournament({currentRound:2,matches:[
   m(1,'Ana',null,'bye','Bye',{byePoints:0.5}),
   m(2,'Ana','Bia','½-½','Finalizado'),
   m(1,'Bia',null,'bye','Bye',{byePoints:0}),
   m(2,'Carlos',null,'bye','Bye',{byePoints:1}),
   m(3,'Dora',null,'bye','Bye',{byePoints:null}),
 ]});
 const ana=t.standings.find(p=>p.name==='Ana');
 assert.equal(ana.points,1);assert.equal(ana.played,1);assert.equal(ana.byes,1);assert.equal(ana.byePoints,0.5);
 const bia=t.standings.find(p=>p.name==='Bia');
 assert.equal(bia.points,0.5);assert.equal(bia.byePoints,0);
 assert.equal(t.standings.find(p=>p.name==='Carlos').byePoints,1);
 assert.equal(t.standings.find(p=>p.name==='Dora').byePoints,0);
});
test('Várias folgas somam os pontos informados',()=>{
 const t=buildTournament({matches:[
   m(1,'Ana',null,'bye','Bye',{byePoints:0.25}),
   m(2,'Ana',null,'bye','Bye',{byePoints:0.5})
 ]});
 const ana=t.standings.find(p=>p.name==='Ana');
 assert.equal(ana.points,0.75);assert.equal(ana.byePoints,0.75);assert.equal(ana.byes,2);
 assert.equal(byeScore('0,5'),0.5);
 assert.equal(byeScore(''),0);
 assert.equal(byeScore(null),0);
});
test('Calcula partidas recentes e duração em dias usando datas',()=>{
 const t=buildTournament({currentRound:1,matches:[m(1,'Ana','Bia','1-0','Finalizado',{start:'01/10/2026',end:'2026-10-15'}),m(1,'Bia','Carlos','0-1','Finalizado',{start:'03/10/2026',end:'2026-10-11'})]});
 assert.equal(t.recent[0].white,'Ana');assert.equal(t.recent[0].duration,14);
 assert.equal(honors(t).longest.white,'Ana');
 assert.equal(durationDays({start:'29/02/2025',end:'01/03/2025'}),null);
 assert.equal(parseDate('2026-10-14').getUTCFullYear(),2026);
});
test('Próxima partida prioriza a que já está em andamento',()=>{
 const t=buildTournament({currentRound:4,matches:[m(4,'Ana','Bia',null,'Em andamento'),m(3,'Ana','Carlos'),m(5,'Ana','Dora')]});
 assert.equal(nextMatches(t,'Ana')[0].black,'Bia');
});
test('Bloqueia URLs que não sejam do Lichess',()=>{
 assert.equal(validLichessUrl('javascript:alert(1)'),null);
 assert.equal(validLichessUrl('https://evil.example/path'),null);
 assert.equal(validLichessUrl('https://lichess.org/abcdef'), 'https://lichess.org/abcdef');
});

test('API Lichess confirmada finaliza automaticamente e soma pontos sem tocar resultado manual',()=>{
 const t=buildTournament({currentRound:4,matches:[
   m(4,'Ana','Bia',null,'Jogador em outra partida',{lichessDecision:{status:'finished',result:'0-1'}}),
   m(5,'Bia','Carlos',null,'Jogador em outra partida'),
 ]});
 assert.equal(t.finished.length,1);
 assert.equal(t.matches[0].result,'0-1');
 assert.equal(t.matches[0].derivedStatus,'finished');
 assert.equal(t.standings.find(p=>p.name==='Bia').points,1);
 assert.equal(t.matches[1].derivedStatus,'ready');
});
test('Partida iniciada no Lichess ocupa ambos os jogadores',()=>{
 const t=buildTournament({currentRound:4,matches:[
  m(4,'Ana','Bia',null,'Jogador em outra partida',{lichessDecision:{status:'playing'}}),
  m(5,'Ana','Carlos'),m(5,'Bia','Dora'),m(5,'Carlos','Dora'),
 ]});
 assert.equal(t.ongoing.length,1);
 assert.equal(t.matches[1].derivedStatus,'busy');
 assert.equal(t.matches[2].derivedStatus,'busy');
 assert.equal(t.matches[3].derivedStatus,'ready');
});
test('Resultado oficial da planilha vence um conflito com o Lichess',()=>{
 const t=buildTournament({currentRound:3,matches:[m(1,'Ana','Bia','1-0','Finalizado',{
  lichessDecision:{status:'conflito',reason:'placar_divergente',apiResult:'0-1'}
 })]});
 assert.equal(t.standings.find(p=>p.name==='Ana').points,1);
 assert.equal(t.standings.find(p=>p.name==='Bia').points,0);
 assert.equal(t.alerts.some(a=>a.includes('divergência')),true);
});
test('Sem decisão verificada não há pontuação por metadados crus da API',()=>{
 const t=buildTournament({matches:[m(1,'Ana','Bia',null,'Jogador em outra partida',{
  lichessGame:{status:'mate',winner:'white'},lichessImport:{status:'ok'}
 })]});
 assert.equal(t.finished.length,0);
 assert.equal(t.standings.find(p=>p.name==='Ana').points,0);
});
test('Bye com zero ou meio ponto continua inalterado após integração',()=>{
 const t=buildTournament({matches:[m(1,'Ana',null,'bye','Bye',{
  byePoints:0.5,lichessDecision:{status:'finished',result:'1-0'}
 })]});
 assert.equal(t.standings[0].points,0.5);
 assert.equal(t.standings[0].byes,1);
 assert.equal(t.finished.length,0);
});
test('Decisão ignorada por diferença de cor não pontua o confronto',()=>{
 const t=buildTournament({matches:[m(1,'Ana','Bia',null,'Jogador em outra partida',{
  lichessDecision:{status:'ignorado',reason:'jogadores_ou_cores_divergentes'}
 })]});
 assert.equal(t.finished.length,0);
 assert.equal(t.alerts.some(a=>a.includes('não aplicados')),true);
});


const verifiedDateGame = (createdAt,lastMoveAt,status='mate')=>({
 lichessImport:{status:'ok'},lichessDecision:{status:'manual',reason:'planilha_prevalece'},
 lichessGame:{status,winner:status==='mate'?'white':null,createdAt,lastMoveAt,id:'Ab12Cd34'},
 url:'https://lichess.org/Ab12Cd34'
});

test('#4 G/H da planilha prevalecem sobre datas distintas da API',()=>{
 const verified=verifiedDateGame('2026-10-09T23:00:00+00:00','2026-10-14T03:00:00+00:00');
 const t=buildTournament({currentRound:1,matches:[m(1,'Ana','Bia','1-0','Finalizado',{...verified,start:'2026-10-01',end:'2026-10-02'})]});
 assert.equal(t.matches[0].start,'2026-10-01');assert.equal(t.matches[0].end,'2026-10-02');
 assert.equal(t.matches[0].duration,1);
 assert.deepEqual(t.matches[0].datesFromLichess,{start:false,end:false});
});

test('#4 sem G/H exibe datas da API somente com decisões verificadas da #3',()=>{
 const verified=verifiedDateGame('2026-10-10T01:30:00+00:00','2026-10-12T03:15:00+00:00');
 const t=buildTournament({currentRound:1,matches:[m(1,'Ana','Bia','1-0','Finalizado',{...verified})]});
 assert.equal(t.matches[0].start,'2026-10-09');assert.equal(t.matches[0].end,'2026-10-12');
 assert.equal(t.matches[0].duration,3);
 assert.deepEqual(t.matches[0].datesFromLichess,{start:true,end:true});
 const noDecision=m(1,'Ana','Bia','1-0','Finalizado',{...verified,lichessDecision:undefined});
 assert.equal(buildTournament({matches:[noDecision]}).matches[0].end,null);
});

test('#4 jogo iniciado fornece somente G, e desafios created/aborted não fornecem datas',()=>{
 const started=verifiedDateGame('2026-10-09T23:00:00+00:00','2026-10-14T03:00:00+00:00','started');
 started.lichessDecision={status:'playing'};
 const t=buildTournament({matches:[m(1,'Ana','Bia',null,'Em andamento',started)]});
 assert.equal(t.matches[0].start,'2026-10-09');assert.equal(t.matches[0].end,null);
 for(const status of ['created','aborted','noStart']){
  const v=verifiedDateGame('2026-10-09T23:00:00+00:00','2026-10-14T03:00:00+00:00',status);
  assert.equal(resolveMatchDates(m(1,'Ana','Bia',null,'Em andamento',v)).start,null);
 }
});

test('#4 lista exatamente as 5 finalizadas com data mais recente em ordem cronológica',()=>{
 const dates=['2026-10-10','2026-10-08','2026-10-11','2026-10-07','2026-10-06','2026-10-12','2026-10-09'];
 const games=dates.map((end,i)=>m(i+1,'Ana','Bia','1-0','Finalizado',{end,start:'2026-10-01'}));
 const t=buildTournament({matches:games});
 assert.deepEqual(t.recent.map(x=>x.end),['2026-10-12','2026-10-11','2026-10-10','2026-10-09','2026-10-08']);
});

test('#4 dias e fuso de São Paulo, ausência segura de timestamps e Bye intacto',()=>{
 assert.equal(lichessLocalDate('2026-10-10T01:30:00+00:00'),'2026-10-09');
 assert.equal(lichessLocalDate('não é timestamp'),null);
 const t=buildTournament({matches:[m(1,'Ana',null,'bye','Bye',{
   byePoints:0.5,...verifiedDateGame('2026-10-10T01:30:00+00:00','2026-10-12T03:15:00+00:00')
 })]});
 assert.equal(t.matches[0].start,undefined);
 assert.equal(t.standings[0].points,0.5);
});


test('#5 rating somente da correspondência com provisório explícito',()=>{
  const player={lichessValidation:{status:'valido'},lichessCorrespondence:{status:'disponivel',rating:1620,provisional:true,games:9}};
  assert.deepEqual(correspondenceRating(player),{label:'Corr. 1620?',value:1620,provisional:true,games:9});
  assert.equal(correspondenceRating({...player,lichessCorrespondence:{...player.lichessCorrespondence,provisional:false}}).label,'Corr. 1620');
});
test('#5 indisponível sem correspondência e sem perfil validado',()=>{
  assert.equal(correspondenceRating({lichessValidation:{status:'valido'},lichessCorrespondence:{status:'indisponivel'}}).label,'Corr. —');
  assert.equal(correspondenceRating({lichessValidation:{status:'indisponivel'},lichessCorrespondence:{status:'disponivel',rating:1600}}).label,'Corr. —');
  assert.equal(correspondenceRating({}).label,'Corr. —');
  assert.equal(correspondenceRating({lichessValidation:{status:'valido'},lichessCorrespondence:{status:'disponivel',rating:'1600'}}).label,'Corr. —');
});


const replayFixture=(extra={})=>({
 id:'ed2-r1-l2',round:1,white:'Ana',black:'Bia',status:'Finalizado',result:'1-0',
 url:'https://lichess.org/Ab12Cd34xYz9',
 lichessDecision:{status:'manual',reason:'planilha_prevalece'},
 lichessImport:{status:'ok'},
 lichessGame:{id:'Ab12Cd34',status:'mate',winner:'white',moves:'e4 e5 Nf3 Nc6'},
 ...extra,
});
test('#6 aceita jogo final validado e preserva URL original de 12 caracteres',()=>{
 const match=buildTournament({currentRound:1,matches:[replayFixture()]}).finished[0];
 assert.deepEqual(replayInfo(match),{
  embedUrl:'https://lichess.org/embed/game/Ab12Cd34?theme=brown&bg=light',
  gameUrl:'https://lichess.org/Ab12Cd34xYz9',id:'Ab12Cd34'
 });
 assert.equal(replayGameId('https://lichess.org/Ab12Cd34'),'Ab12Cd34');
 assert.equal(replayGameId('https://www.lichess.org/Ab12Cd34/'),'Ab12Cd34');
});
test('#6 só usa URLs Lichess de jogo, nunca parâmetros ou esquemas inesperados',()=>{
 for (const url of ['https://lichess.org/study/Ab12Cd34','https://lichess.org/Ab12Cd34?bad=1',
 'https://lichess.org.evil.org/Ab12Cd34','javascript:alert(1)',
 'http://lichess.org/Ab12Cd34','https://lichess.org/Ab12Cd34/black',
 'https://lichess.org/Ab12Cd34foo','https://lichess.org:8080/Ab12Cd34'])
  assert.equal(replayGameId(url),null,url);
});
test('#6 protege Bye, em andamento e partidas não confirmadas',()=>{
 const cases=[{result:'bye',status:'Bye'}, {result:null,status:'Em andamento'},
  {lichessDecision:{status:'playing'}}, {lichessDecision:{status:'ignorado'}},
  {lichessDecision:{status:'conflito'}}, {lichessDecision:null},
  {lichessImport:{status:'desatualizado'}}, {lichessImport:{status:'indisponivel'}},
  {lichessGame:{id:'ZZ22YY11',status:'mate',winner:'white',moves:'e4'}},
  {lichessGame:{id:'Ab12Cd34',status:'started',winner:null,moves:'e4'}},
  {lichessGame:{id:'Ab12Cd34',status:'mate',winner:'black',moves:'e4'}},
  {lichessGame:{id:'Ab12Cd34',status:'mate',winner:'white',moves:''}}];
 for(const changes of cases) assert.equal(replayInfo(replayFixture(changes)),null,JSON.stringify(changes));
});
test('#6 admite vitórias de brancas/pretas e empate apenas quando a API concorda',()=>{
 assert.ok(replayInfo(replayFixture({result:'0-1',lichessGame:{id:'Ab12Cd34',status:'timeout',winner:'black',moves:'e4 e5'}})));
 assert.ok(replayInfo(replayFixture({result:'½-½',lichessGame:{id:'Ab12Cd34',status:'draw',winner:null,moves:'e4 e5'}})));
 assert.equal(replayInfo(replayFixture({result:'1-0',lichessGame:{id:'Ab12Cd34',status:'draw',winner:null,moves:'e4 e5'}})),null);
});

test('Início: confrontos ativos seguem a ordem da planilha, limitados a 10',()=>{
 const matches=[];
 for(let i=1;i<=14;i++) {
   if(i===2) matches.push(m(i,'Ana',null,'bye','Bye',{id:`row-${i}`}));
   else if(i===6) matches.push(m(i,'Ana','Bia','1-0','Finalizado',{id:`row-${i}`}));
   else matches.push(m(i,`Jogador${i}`,`Adversario${i}`,null,'Em andamento',{id:`row-${i}`}));
 }
 const t=buildTournament({matches});
 assert.equal(t.ongoing.length,12);
 const first=homeActiveMatches(t);
 assert.equal(first.length,10);
 assert.deepEqual(first.map(x=>x.id), ['row-1','row-3','row-4','row-5','row-7','row-8','row-9','row-10','row-11','row-12']);
 assert.equal(t.ongoing.length,12); // não modifica nem reordena a fonte
});
test('Início: lista vazia e menos de dez partidas são tratados corretamente',()=>{
 assert.deepEqual(homeActiveMatches(null), []);
 assert.deepEqual(homeActiveMatches(buildTournament({matches:[]})), []);
 const t=buildTournament({matches:[m(4,'Bia','Ana',null,'Em andamento',{id:'fourth'}),m(1,'Ana','Bia',null,'Em andamento',{id:'first'})]});
 assert.deepEqual(homeActiveMatches(t).map(x=>x.id),['fourth','first']);
});
