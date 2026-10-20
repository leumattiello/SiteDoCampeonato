/** Melhoria #9: honrarias, empates e dados insuficientes, sem modificar pontuação. */
import {parseDate} from './model.js';
import {gameStats} from './game-stats.js';
import {REGIONS,matchesRegion} from './regions.js';

const names=arr=>[...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const winner=m=>m.result==='1-0'?m.white:m.result==='0-1'?m.black:null;
const valid=m=>m&&m.white&&m.black&&['1-0','0-1','½-½'].includes(m.result);
const day=m=>{const d=parseDate(m.end);return d?d.toISOString().slice(0,10):null;};
const both=arr=>names(arr.flatMap(m=>[m.white,m.black]));
function leaders(rows,atLeast=1,ascending=false) {
  const available=[...rows].filter(([,r])=>Number.isFinite(r.score)&&r.score>=atLeast);
  if(!available.length)return {score:null,rows:[]};
  const score=(ascending?Math.min:Math.max)(...available.map(([,r])=>r.score));
  return {score,rows:available.filter(([,r])=>r.score===score)};
}
function related(finished,rows) {
  const selected=new Set(rows.flatMap(([,r])=>r.games));
  return finished.filter(m=>selected.has(m));
}
function award(key,name,icon,criterion,detail,score,holders,games,pending,missing=false,extra='') {
  // Tronos dinâmicos: não existe a categoria visual de honraria provisória.
  return {key,name,icon,criterion,detail,score,holders:names(holders),games,
    note:[missing?'Algumas partidas ainda não possuem dados para este critério.':'',extra].filter(Boolean).join(' ')};
}
export function gloryAwards(t) {
  const finished=(t?.finished||[]).filter(valid);
  const pending=!!(t?.ongoing?.length||t?.pending?.length||(Number.isFinite(t?.total)&&t.total>finished.length));
  const stats=new Map(finished.map(m=>[m,gameStats(m)]));
  const lengths=finished.filter(m=>Number.isInteger(m.duration)&&m.duration>=0);
  const withMoves=finished.filter(m=>Number.isInteger(stats.get(m)?.moves?.plies)&&stats.get(m).moves.plies>0);
  const victories=finished.filter(m=>winner(m));
  const dated=finished.filter(m=>!!day(m));
  const out=[];

  // Em empates, honrar todos os adversários de todas as partidas empatadas.
  const longest=lengths.length?Math.max(...lengths.map(m=>m.duration)):null;
  const siege=longest===null?[]:lengths.filter(m=>m.duration===longest);
  out.push(award('siege','Grande Cerco','♜',
    'Maior duração entre início e fim, em dias corridos.',
    'A honra pertence aos dois adversários. Duração não representa habilidade.',
    longest===null?null:longest+' dias',both(siege),siege,pending,lengths.length<finished.length));

  const mostMoves=withMoves.length?Math.max(...withMoves.map(m=>stats.get(m).moves.plies)):null;
  const epic=mostMoves===null?[]:withMoves.filter(m=>stats.get(m).moves.plies===mostMoves);
  out.push(award('epic','Batalha Épica','⚔',
    'Partida finalizada com maior número de lances individuais (meio-lances).',
    'Os dois adversários recebem a honra; contagens iguais geram empate.',
    mostMoves===null?null:mostMoves+' lances individuais',both(epic),epic,pending,withMoves.length<finished.length));

  const swift=withMoves.filter(m=>winner(m));
  const fewest=swift.length?Math.min(...swift.map(m=>stats.get(m).moves.plies)):null;
  const lightning=fewest===null?[]:swift.filter(m=>stats.get(m).moves.plies===fewest);
  out.push(award('lightning','Ataque Relâmpago','⚡',
    'Vitória com menos lances individuais, independentemente da duração em dias.',
    'Somente quem venceu é homenageado; mesma contagem produz empate.',
    fewest===null?null:fewest+' lances individuais',lightning.map(winner),lightning,
    pending,swift.length<victories.length));

  const victoriesBy=new Map();
  for(const m of victories){
    const name=winner(m);
    if(!victoriesBy.has(name))victoriesBy.set(name,{score:0,games:[]});
    victoriesBy.get(name).score++;
    victoriesBy.get(name).games.push(m);
  }
  const conquer=leaders(victoriesBy);
  out.push(award('conqueror','Conquistador','♛',
    'Maior número de vitórias entre as partidas encerradas da edição.',
    'Empates e Byes não somam vitórias. Jogadores com mesmo total dividem a honra.',
    conquer.score===null?null:conquer.score+' vitória'+(conquer.score===1?'':'s'),
    conquer.rows.map(([name])=>name),related(finished,conquer.rows),pending));

  // Mesma data, ordem desconhecida: dias são grupos. Havendo derrota,
  // o dia inteiro interrompe a sequência, sem supor qual partida terminou antes.
  const perPlayer=new Map();
  for(const m of dated)for(const name of [m.white,m.black]){
    if(!perPlayer.has(name))perPlayer.set(name,[]);
    perPlayer.get(name).push(m);
  }
  const streaks=new Map();
  for(const [name,played] of perPlayer){
    const days=new Map();
    for(const m of played){const when=day(m);if(!days.has(when))days.set(when,[]);days.get(when).push(m);}
    let current=[],best=[];
    for(const when of [...days.keys()].sort()){
      const games=days.get(when);
      current=games.every(m=>m.result==='½-½'||winner(m)===name)?current.concat(games):[];
      if(current.length>best.length)best=current.slice();
    }
    streaks.set(name,{score:best.length,games:best});
  }
  const shield=leaders(streaks);
  out.push(award('shield','Escudo Invicto','❖',
    'Maior sequência de vitórias ou empates na ordem das datas de encerramento.',
    'Uma derrota interrompe a sequência; partidas de mesmo dia são agrupadas.',
    shield.score===null?null:shield.score+' partida'+(shield.score===1?'':'s')+' sem derrota',
    shield.rows.map(([name])=>name),related(finished,shield.rows),
    pending,dated.length<finished.length));

  const ecos=new Map();
  for(const m of finished){
    const eco=stats.get(m)?.eco;
    if(!eco)continue;
    for(const name of [m.white,m.black]){
      if(!ecos.has(name))ecos.set(name,{distinct:new Set(),games:[]});
      const row=ecos.get(name);row.distinct.add(eco);row.games.push(m);
    }
  }
  const ecoLeaders=leaders([...ecos].map(([name,row])=>[name,{score:row.distinct.size,games:row.games}]),2);
  const ecoNames=ecoLeaders.rows.map(([name])=>name);
  const codes=ecoNames.map(name=>name+': '+[...ecos.get(name).distinct].sort().join(', ')).join(' · ');
  out.push(award('master','Mestre das Aberturas','♞',
    'Mais códigos ECO distintos em partidas finalizadas verificadas (mínimo de 2).',
    'Mede diversidade registrada, não qualidade de jogo. Conta para os dois adversários.',
    ecoLeaders.score===null?null:ecoLeaders.score+' aberturas ECO distintas',
    ecoNames,related(finished,ecoLeaders.rows),pending,
    finished.some(m=>!stats.get(m)?.eco),codes));
  // Os tronos regionais contam SOMENTE vitórias. Aberturas são classificadas
  // pelo nome específico do Lichess; ECO entra apenas quando o nome falta.
  for(const region of REGIONS){
    const counts=new Map();
    for(const m of victories){
      if(!matchesRegion(region,stats.get(m)))continue;
      const name=winner(m);
      if(!counts.has(name))counts.set(name,{score:0,games:[]});
      counts.get(name).score++;
      counts.get(name).games.push(m);
    }
    const top=leaders(counts);
    const champion=award(region.key,region.name,'♛',
      'Mais vitórias em '+region.family+'.',
      'Só contam vitórias em partidas encerradas com abertura confirmada pelo Lichess. Empates premiam todos os líderes.',
      top.score===null?null:top.score+' vitória'+(top.score===1?'':'s'),
      top.rows.map(([name])=>name),
      related(finished,top.rows),false,false);
    champion.mapId=region.key;
    champion.mapLabel=region.label;
    champion.family=region.family;
    out.push(champion);
  }
  return out;
}


/** #10 — Até cinco honrarias em destaque na página inicial.
 * Preferência por 2 tradicionais e 3 tronos regionais conquistados.
 * Dentro de cada grupo, a data da partida premiada mais recente prevalece.
 * Sem datas, a ordem original das honrarias resolve o empate sem fingir cronologia.
 * Na ausência de vencedores suficientes, o painel exibe tronos por conquistar.
 */
export function featuredGloryAwards(awards, limit=5) {
  if(!Array.isArray(awards) || !Number.isInteger(limit) || limit<=0)return [];
  const lastDate=a=>{
    const dates=(a?.games||[]).map(m=>parseDate(m?.end)?.getTime()).filter(Number.isFinite);
    return dates.length?Math.max(...dates):-Infinity;
  };
  const earned=a=>a?.score!=null && Array.isArray(a.holders) && a.holders.length>0;
  const indexed=awards.map((a,i)=>({a,i,date:lastDate(a)}));
  const compare=(x,y)=>y.date-x.date || x.i-y.i;
  const ordered=items=>items.sort(compare);
  const classic=ordered(indexed.filter(x=>!x.a?.mapId && earned(x.a)));
  const regional=ordered(indexed.filter(x=>!!x.a?.mapId && earned(x.a)));
  const selected=[...classic.slice(0,Math.min(2,limit)),...regional.slice(0,Math.min(3,Math.max(0,limit-2)))];
  const used=new Set(selected.map(x=>x.i));
  const remaining=ordered(indexed.filter(x=>earned(x.a) && !used.has(x.i)));
  for(const x of remaining) {
    if(selected.length>=limit)break;
    selected.push(x);used.add(x.i);
  }
  // Os mapas regionais continuam presentes mesmo antes das primeiras vitórias.
  const unclaimed=ordered(indexed.filter(x=>!earned(x.a)&&x.a?.mapId&&!used.has(x.i)))
    .concat(ordered(indexed.filter(x=>!earned(x.a)&&!x.a?.mapId&&!used.has(x.i))));
  for(const x of unclaimed){
    if(selected.length>=limit)break;
    selected.push(x);used.add(x.i);
  }
  return ordered(selected).slice(0,limit).map(x=>x.a);
}
