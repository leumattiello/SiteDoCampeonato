import test from 'node:test';
import assert from 'node:assert/strict';
import {REGIONS,REGION_MAPS,matchesRegion} from '../js/regions.js';
import {gloryAwards} from '../js/glory.js';
import {buildTournament} from '../js/model.js';
const r=key=>REGIONS.find(x=>x.key===key);
const g=(id,a,b,result,opening)=>({id,round:1,white:a,black:b,status:'Finalizado',result,url:'https://lichess.org/'+id,lichessImport:{status:'ok'},lichessDecision:{status:'manual'},lichessGame:{id,status:'mate',winner:result==='1-0'?'white':'black',moves:'e4 e5 Nf3 Nc6',opening}});
test('onze tronos e onze mapas regionais vetoriais',()=>{assert.equal(REGIONS.length,11);assert.equal(Object.keys(REGION_MAPS).length,11);for(const x of REGIONS)assert.match(REGION_MAPS[x.key],/^M/);});
test('familias por nome e ECO quando nome ausente',()=>{for(const [key,name,eco] of [['sicily','Sicilian Defense: Najdorf Variation','B90'],['italy','Giuoco Pianissimo','C54'],['spain','Ruy Lopez: Berlin Defense','C65'],['england','English Opening','A15'],['india',"King's Indian Defense",'E76'],['india',"Queen's Indian Defense",'E14'],['france','French Defense','C01'],['russia',"Petrov's Defense",'C42'],['austria','Vienna Game','C28'],['scotland','Scotch Game','C45'],['scandinavia','Scandinavian Defense','B01'],['netherlands','Dutch Defense','A81']]){assert.equal(matchesRegion(r(key),{openingName:name,eco:null}),true,key+' name');assert.equal(matchesRegion(r(key),{openingName:null,eco}),true,key+' eco');}});
test('aberturas vizinhas nao causam falsos positivos',()=>{assert.equal(matchesRegion(r('italy'),{openingName:'Italian Game: Two Knights Defense',eco:'C50'}),true);assert.equal(matchesRegion(r('india'),{openingName:"King's Indian Attack",eco:'E60'}),false);assert.equal(matchesRegion(r('scotland'),{openingName:'Scotch Gambit',eco:'C45'}),false);});
test('vitorias por familia e empate no trono; derrotados nao ganham',()=>{const t=buildTournament({matches:[g('Ab12Cd34','Ana','Bia','1-0',{name:'Sicilian Defense',eco:'B20'}),g('Bc23De45','Carol','Dora','0-1',{name:'Sicilian Defense',eco:'B21'})]});const a=gloryAwards(t).find(x=>x.key==='sicily');assert.deepEqual(a.holders,['Ana','Dora']);assert.equal(a.games.length,2);assert.equal(a.score,'1 vitória');});
test('todos os 17 prêmios continuam sem selo de provisoriedade',()=>{const t=buildTournament({matches:[]});const a=gloryAwards(t);assert.equal(a.length,17);assert.ok(a.every(x=>!('provisional' in x)));});

test('Rei da Itália inclui toda a família italiana, Fegatello/Fried Liver e alternativas de escrita',()=>{
 const italian=[
   ['Italian Game','C50'],
   ['Italian Opening','C50'],
   ['Italian Game: Giuoco Piano','C53'],
   ['Giuoco Pianissimo','C54'],
   ['Italian Game: Evans Gambit','C51'],
   ['Italian Game: Two Knights Defense','C55'],
   ['Italian Game: Two Knights Defense, Fried Liver Attack','C57'],
   ['Fried Liver Attack','C57'],
   ['Fegatello Attack','C57'],
   ['Two Knights Defense','C58'],
 ];
 for(const [name,eco] of italian){
   assert.equal(matchesRegion(r('italy'),{openingName:name,eco}),true,name);
   assert.equal(matchesRegion(r('italy'),{openingName:null,eco}),true,eco);
 }
 assert.equal(matchesRegion(r('italy'),{openingName:null,eco:'C59'}),true);
 assert.equal(matchesRegion(r('italy'),{openingName:null,eco:'C49'}),false);
 assert.equal(matchesRegion(r('italy'),{openingName:null,eco:'C60'}),false);
 for(const other of ['Sicilian Defense','Ruy Lopez','French Defense','Russian Game']){
   assert.equal(matchesRegion(r('italy'),{openingName:other,eco:'C57'}),false,other+' must override ECO fallback');
 }
});
test('Rei da Itália soma vitórias em Fegatello, Giuoco e outras variantes sem contar derrotas',()=>{
 const t=buildTournament({matches:[
   g('Ab12Cd34','Ana','Bia','1-0',{name:'Italian Game: Two Knights Defense, Fried Liver Attack',eco:'C57'}),
   g('Bc23De45','Ana','Carol','1-0',{name:'Italian Game: Giuoco Piano',eco:'C53'}),
   g('Cd34Ef56','Dora','Ana','1-0',{name:'Italian Game: Evans Gambit',eco:'C51'}),
   g('De45Fg67','Eva','Ana','0-1',{name:'Sicilian Defense',eco:'B20'}),
   g('Ef56Gh78','Ana','Eva','0-1',{name:'French Defense',eco:'C00'}),
 ]});
 const italy=gloryAwards(t).find(x=>x.key==='italy');
 assert.equal(italy.score,'2 vitórias');
 assert.deepEqual(italy.holders,['Ana']);
 assert.deepEqual(italy.games.map(x=>x.id),['Ab12Cd34','Bc23De45']);
});
