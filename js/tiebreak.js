/** Critérios aprovados do campeonato. Apenas partidas concluídas contam; Bye não é confronto. */
const final=m=>m.derivedStatus==='finished'&&['1-0','0-1','½-½'].includes(m.result)&&!!m.black;
const gamePoints=(m,n)=>m.result==='½-½'?.5:(m.white===n?(m.result==='1-0'?1:0):(m.result==='0-1'?1:0));
const pointsOf=(p)=>Number(p.points)||0;
const compare=(a,b)=>Math.abs(a-b)<1e-8?0:a>b?-1:1;

/** Retorna posições compartilhadas e trilha verificável de cada critério.
 * O confronto direto é calculado uma única vez sobre todos os empatados em pontos,
 * sem inventar resultados de partidas não disputadas.
 */
export function applyTiebreakers(standings,matches){
 const finished=(matches||[]).filter(final),all=(matches||[]).filter(m=>m.black&&m.white);
 const byName=new Map(standings.map(p=>[p.name,p]));
 const maxPossible=new Map();
 for(const p of standings){
   const encounters=all.filter(m=>m.white===p.name||m.black===p.name).length;
   const byes=(matches||[]).filter(m=>(m.white===p.name)&&m.derivedStatus==='bye').length;
   maxPossible.set(p.name,encounters+byes);
 }
 const computed=new Map();
 for(const p of standings){
   const games=finished.filter(m=>m.white===p.name||m.black===p.name);
   const blacks=games.filter(m=>m.black===p.name).length;
   const sb=games.reduce((sum,m)=>{
     const enemy=m.white===p.name?m.black:m.white;
     return sum+gamePoints(m,p.name)*pointsOf(byName.get(enemy)||{});
   },0);
   const koya=games.reduce((sum,m)=>{
     const enemy=m.white===p.name?m.black:m.white;
     const possible=maxPossible.get(enemy)||0;
     return sum+(possible>0&&pointsOf(byName.get(enemy)||{})>=possible/2?gamePoints(m,p.name):0);
   },0);
   computed.set(p.name,{sb,koya,blacks});
 }
 const groups=new Map();
 for(const p of standings){const key=pointsOf(p);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
 const output=[];
 for(const [score,group] of [...groups].sort((a,b)=>b[0]-a[0])){
   const groupNames=new Set(group.map(p=>p.name));
   const relevant=finished.filter(m=>groupNames.has(m.white)&&groupNames.has(m.black));
   const playedBetween=new Set(relevant.map(m=>[m.white,m.black].sort().join('|')));
   const complete=group.every((p,i)=>group.slice(i+1).every(q=>playedBetween.has([p.name,q.name].sort().join('|'))));
   const direct=new Map(group.map(p=>[p.name,relevant.reduce((v,m)=>(m.white===p.name||m.black===p.name)?v+gamePoints(m,p.name):v,0)]));
   const enriched=group.map(p=>({...p,tiebreak:{direct:direct.get(p.name),wins:p.wins||0,...computed.get(p.name),directComplete:complete,provisional:finished.length<all.length}}));
   enriched.sort((a,b)=>{
     for(const key of ['direct','wins','sb','koya','blacks']){const c=compare(a.tiebreak[key],b.tiebreak[key]);if(c)return c;}
     return a.name.localeCompare(b.name,'pt-BR'); // só exibição, jamais altera posição
   });
   for(const p of enriched){
     const prior=output[output.length-1];
     const tied=prior&&compare(prior.points,p.points)===0&&['direct','wins','sb','koya','blacks'].every(k=>compare(prior.tiebreak[k],p.tiebreak[k])===0);
     output.push({...p,position:tied?prior.position:output.length+1});
   }
 }
 return output;
}
