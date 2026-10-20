import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTournament} from '../js/model.js';
import {editionChampion,editionRivalries,interEditionRivalries,verifiedHistoricAliases} from '../js/history.js';
const m=(id,white,black,result,other={})=>({id,round:1,white,black,result,status:result==='bye'?'Bye':'Finalizado',...other});
const t=(id,active,matches)=>buildTournament({id,active,title:id,matches,currentRound:1});
const validated=[
 {name:'Ana',lichess:'anita',lichessValidation:{status:'valido'}},
 {name:'Bia',lichess:'bia123',lichessValidation:{status:'valido'}},
 {name:'Carol',lichess:'carol77',lichessValidation:{status:'valido'}},
];
test('campeã única apenas em edição encerrada e com líder isolado por pontos',()=>{
 const old=t('antigo',false,[m('a','Ana','Bia','1-0'),m('b','Ana','Carol','1-0'),m('c','Bia','Carol','0-1')]);
 assert.deepEqual(editionChampion(old),{state:'champion',leaders:['Ana'],points:2});
 assert.equal(editionChampion({...old,active:true}).state,'current');
 assert.equal(editionChampion(t('antigo',false,[m('a','Ana','Bia',null,{status:'Em andamento'})])).state,'incomplete');
});
test('empate de pontuação não inventa campeão por ordem alfabética',()=>{
 const old=t('antigo',false,[m('a','Ana','Bia','1-0'),m('b','Bia','Ana','1-0')]);
 assert.deepEqual(editionChampion(old),{state:'tie',leaders:['Ana','Bia'],points:1});
});
test('Bye não vira vitória, não entra em rivalidades nem torna edição incompleta',()=>{
 const old=t('antigo',false,[m('a','Ana','Bia','1-0'),m('bye','Ana',null,'bye',{byePoints:0.5})]);
 assert.equal(editionChampion(old).state,'champion');
 assert.equal(editionRivalries(old).length,1);
 assert.equal(editionRivalries(old)[0].count,1);
});
test('retrospecto por edição apura vitória de ambos os lados e empate',()=>{
 const old=t('antigo',false,[m('a','Ana','Bia','1-0'),m('b','Bia','Ana','1-0'),m('c','Ana','Bia','½-½')]);
 const a=editionRivalries(old)[0];
 assert.equal(a.count,3);assert.equal(a.firstWins,1);assert.equal(a.secondWins,1);assert.equal(a.draws,1);
});
test('nicks históricos explícitos e validados permitem retrospecto cruzado',()=>{
 const current=t('atual',true,[m('a','Ana','Bia','1-0')]);
 const old=t('antigo',false,[m('b','bia123','anita','1-0')]);
 const result=interEditionRivalries([current,old],validated);
 assert.equal(result.length,1);
 assert.deepEqual([result[0].left,result[0].right],['Ana','Bia']);
 assert.equal(result[0].count,2);assert.equal(result[0].firstWins,1);assert.equal(result[0].secondWins,1);
 assert.equal(result[0].editions.length,2);
});
test('sem validação ou com aliases ambíguos não associa participantes',()=>{
 const current=t('atual',true,[m('a','Ana','Bia','1-0')]);
 const old=t('antigo',false,[m('b','bia123','anita','1-0')]);
 assert.deepEqual(interEditionRivalries([current,old],[]),[]);
 const ambiguous=[...validated,{name:'Outra pessoa',lichess:'anita',lichessValidation:{status:'valido'}}];
 assert.equal(verifiedHistoricAliases(ambiguous).has('anita'),false);
 assert.deepEqual(interEditionRivalries([current,old],ambiguous),[]);
});
test('nome histórico parecido sem mapping não une edições',()=>{
 const current=t('atual',true,[m('a','Ana','Bia','1-0')]);
 const old=t('antigo',false,[m('b','Ana','bia123','1-0')]);
 assert.deepEqual(interEditionRivalries([current,old],validated),[]);
});
test('não cria retrospecto cruzado quando par só enfrentou uma edição',()=>{
 const current=t('atual',true,[m('a','Ana','Carol','1-0')]);
 const old=t('antigo',false,[m('b','bia123','anita','1-0')]);
 assert.deepEqual(interEditionRivalries([current,old],validated),[]);
});
