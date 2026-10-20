import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualHelp} from '../js/contextual-help.js';
const p=[{name:'Bia',lichess:'Bia123',lichessValidation:{status:'valido',id:'bia123'}}];
test('ajuda exibe oponente validado e cor correta',()=>{
 const x=contextualHelp({white:'Ana',black:'Bia',derivedStatus:'ready'},'Ana',p);
 assert.equal(x.opponent,'Bia');assert.equal(x.color,'brancas');assert.equal(x.canStart,true);assert.equal(x.profile,'https://lichess.org/@/Bia123');
 const y=contextualHelp({white:'Ana',black:'Bia',derivedStatus:'ready'},'Bia',p);
 assert.equal(y.color,'pretas');
});
test('perfil não validado jamais vira link e partida bloqueada não convida a iniciar',()=>{
 const x=contextualHelp({white:'Ana',black:'Bia',derivedStatus:'busy'},'Ana',[{name:'Bia',lichess:'Bia123',lichessValidation:{status:'indisponivel'}}]);
 assert.equal(x.profile,null);assert.equal(x.canStart,false);
});
test('não sugere perfil ou desafio para bye ou jogador que não participa',()=>{
 assert.equal(contextualHelp({white:'Ana',black:null},'Ana',p),null);
 assert.equal(contextualHelp({white:'Ana',black:'Bia'},'Carlos',p),null);
});
