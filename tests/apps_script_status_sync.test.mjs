import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url),'utf8');
function fixture({apiStatus='started',winner=null,sheetStatus='Jogador em outra partida',score=['',''],authorized=false}={}){
 const rows=[['Brancas','B','C','Pretas','Status','Link','G','H'],
   ['Humberto',score[0],score[1],'Ligia',sheetStatus,'https://lichess.org/HC7e1Za1','','']];
 const players=[['Nome','Nick Lichess'],['Humberto','Humberto_M'],['Ligia','Raducol']];
 const sheets={};
 const changes=[],logs=[];
 class Sheet{
   constructor(name,data){this.name=name;this.data=data;}
   getDataRange(){return {getValues:()=>this.data.map(r=>r.slice())};}
   getRange(r,c,n=1,m=1){
     const self=this;
     return {getValues:()=>Array.from({length:n},(_,i)=>self.data[r-1+i].slice(c-1,c-1+m)),
       getValue:()=>self.data[r-1][c-1],
       setValue(v){changes.push([self.name,r,c,v]);self.data[r-1][c-1]=v;return {setNumberFormat:()=>{}};},
       setValues(matrix){changes.push([self.name,r,c,matrix]);for(let i=0;i<matrix.length;i++)for(let j=0;j<matrix[i].length;j++)self.data[r-1+i][c-1+j]=matrix[i][j];}};
   }
   appendRow(r){this.data.push(r.slice());changes.push(['audit',this.name]);}
 }
 sheets['2']=new Sheet('2',rows);sheets.Jogadores=new Sheet('Jogadores',players);
 const props={LICHESS_API_TOKEN:'FAKE',...(authorized?{GRAVACAO_HABILITADA:'SIM',PLANILHA_ID_AUTORIZADA:'BACKUP'}:{})};
 const world={
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=> 'BACKUP',getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet(n,[])),getSpreadsheetTimeZone:()=> 'America/Sao_Paulo'}),flush:()=>{}},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({id:'HC7e1Za1',status:apiStatus,winner,players:{white:{user:{id:'humberto_m'}},black:{user:{id:'raducol'}}}})})},
  Utilities:{sleep:()=>{},formatDate:()=> '01/10/2026'},
  console:{log:(x)=>logs.push(x),error:(x)=>logs.push(x)},
  Date,JSON,Math,Object,Number,Array,Set,Error,String
 };
 vm.createContext(world);vm.runInContext(script,world);
 return {world,rows,sheets,changes,logs};
}
test('simulação detecta Humberto x Ligia sem gravar',()=>{
 const f=fixture();const s=f.world.simularResultados();
 assert.equal(s.candidatosStatus,1);assert.equal(s.aplicadosStatus,0);
 assert.equal(f.rows[1][4],'Jogador em outra partida');assert.equal(f.changes.length,0);
});
test('status iniciado atualiza E, cria auditoria e é idempotente',()=>{
 const f=fixture({authorized:true});
 const first=f.world.aplicarResultados();
 assert.equal(first.aplicadosStatus,1);assert.equal(f.rows[1][4],'Em andamento');
 assert.equal(f.sheets._AuditoriaStatusLichess.data[1][7],'Em andamento');
 const second=f.world.aplicarResultados();
 assert.equal(second.aplicadosStatus,0);
 assert.equal(f.sheets._AuditoriaStatusLichess.data.length,2);
});
test('resultado final validado atualiza placar B/C e E pelo fluxo existente',()=>{
 const f=fixture({apiStatus:'mate',winner:'white',authorized:true});
 const s=f.world.aplicarResultados();
 assert.equal(s.aplicados,1);assert.deepEqual(f.rows[1].slice(1,3),[1,0]);
 assert.equal(f.rows[1][4],'Finalizado');
});
test('status finalizado com placar idêntico pode ser reconciliado',()=>{
 const f=fixture({apiStatus:'mate',winner:'white',score:[1,0],authorized:true});
 const s=f.world.aplicarResultados();
 assert.equal(s.aplicadosStatus,1);assert.equal(f.rows[1][4],'Finalizado');
 assert.equal(s.aplicados,0);
});
test('placar manual divergente impede alteração de E, B e C',()=>{
 const f=fixture({apiStatus:'mate',winner:'white',score:[0,1],authorized:true});
 const s=f.world.aplicarResultados();
 assert.equal(s.aplicadosStatus,0);assert.equal(s.conflitosStatus,1);
 assert.equal(f.rows[1][4],'Jogador em outra partida');
 assert.deepEqual(f.rows[1].slice(1,3),[0,1]);
});
test('não rebaixa Finalizado quando Lichess informa started',()=>{
 const f=fixture({apiStatus:'started',sheetStatus:'Finalizado',authorized:true});
 const s=f.world.aplicarResultados();
 assert.equal(s.aplicadosStatus,0);assert.equal(f.rows[1][4],'Finalizado');
});
test('Bye, falta de ID e estados inconclusivos não atualizam status',()=>{
 const f=fixture({apiStatus:'created',authorized:true});
 const s=f.world.aplicarResultados();
 assert.equal(s.aplicadosStatus,0);assert.equal(f.rows[1][4],'Jogador em outra partida');
});
