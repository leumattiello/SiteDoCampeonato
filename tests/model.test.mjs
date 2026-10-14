import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTournament,nextMatches,parseDate,durationDays,honors,validLichessUrl} from '../js/model.js';

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
test('Bye soma 1 ponto, mas não entra nas partidas jogadas',()=>{
 const t=buildTournament({currentRound:2,matches:[m(1,'Ana',null,'bye','Bye'),m(2,'Ana','Bia','½-½','Finalizado')]});
 const ana=t.standings.find(p=>p.name==='Ana');
 assert.equal(ana.points,1.5);assert.equal(ana.played,1);assert.equal(ana.byes,1);
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
