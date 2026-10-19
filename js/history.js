/** #10: retrospectos por edição e rivalidades entre edições.
 * Nunca deduz que um nome histórico é o mesmo jogador sem mapeamento verificado.
 * Não altera placares, standings nem fontes de dados.
 */
const collator=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
const norm=value=>typeof value==='string'?value.trim().toLowerCase():'';
const ordered=(a,b)=>collator.compare(a,b)<=0?[a,b]:[b,a];
const outcome=match=>['1-0','0-1','½-½'].includes(match?.result) ? match.result : null;
const isPlayed=m=>m?.derivedStatus==='finished' && m.white && m.black && m.white!==m.black && outcome(m);
const comparePairs=(a,b)=>b.count-a.count || collator.compare(a.left,b.left) || collator.compare(a.right,b.right);

export function editionChampion(tournament) {
  if(!tournament || tournament.active) return {state:'current',leaders:[],points:null};
  const matches=tournament.matches||[];
  const regular=matches.filter(m=>m.derivedStatus!=='bye');
  if(!regular.length || regular.some(m=>!isPlayed(m))) return {state:'incomplete',leaders:[],points:null};
  const ranking=(tournament.standings||[]).filter(p=>Number.isFinite(p.points));
  if(!ranking.length) return {state:'incomplete',leaders:[],points:null};
  const best=Math.max(...ranking.map(p=>p.points));
  const leaders=ranking.filter(p=>p.points===best).map(p=>p.name).sort(collator.compare);
  return {state:leaders.length===1?'champion':'tie',leaders,points:best};
}

function pairTable(games, identity) {
  const pairs=new Map();
  for(const entry of games){
    const m=entry.match;
    if(!isPlayed(m))continue;
    const white=identity(entry.tournament,m.white),black=identity(entry.tournament,m.black);
    if(!white || !black || white===black)continue;
    const [left,right]=ordered(white,black);
    const key=JSON.stringify([left,right]);
    if(!pairs.has(key))pairs.set(key,{left,right,count:0,firstWins:0,secondWins:0,draws:0,games:[],editions:new Set()});
    const pair=pairs.get(key);
    const won=m.result==='½-½'?null:m.result==='1-0'?white:black;
    pair.count++;
    if(won===null)pair.draws++;
    else if(won===left)pair.firstWins++;
    else pair.secondWins++;
    pair.editions.add(entry.tournament.id);
    pair.games.push({editionId:entry.tournament.id,editionTitle:entry.tournament.title||entry.tournament.id,
      match:m});
  }
  return [...pairs.values()].map(p=>({...p,editions:[...p.editions]})).sort(comparePairs);
}

/** Confrontos da edição: usa apenas nomes da própria edição, sem conversões. */
export function editionRivalries(tournament) {
  if(!tournament)return [];
  return pairTable((tournament.matches||[]).map(match=>({match,tournament})),(_t,name)=>name);
}

/** Somente apelidos explicitamente mapeados na aba Jogadores E validados.
 * Duplicatas e apelidos ambíguos jamais vinculam dois jogadores.
 */
export function verifiedHistoricAliases(players) {
  const aliases=new Map(),ambiguous=new Set();
  for(const p of players||[]){
    if(!p || !p.name || p.lichessValidation?.status!=='valido')continue;
    const nick=norm(p.lichess);
    if(!/^[a-z0-9_-]{2,30}$/.test(nick))continue;
    if(aliases.has(nick) && aliases.get(nick)!==p.name)ambiguous.add(nick);
    else aliases.set(nick,p.name);
  }
  for(const nick of ambiguous)aliases.delete(nick);
  return aliases;
}

/** Lista apenas duelos repetidos em >=2 edições, com ambos os nomes históricos
 * identificados por apelidos Lichess verificados na tabela Jogadores.
 */
export function interEditionRivalries(tournaments,players) {
  const active=(tournaments||[]).find(t=>t.active);
  if(!active)return [];
  const allowed=new Set((active.standings||[]).map(p=>p.name));
  const aliases=verifiedHistoricAliases(players);
  const entries=(tournaments||[]).flatMap(t=>(t.matches||[]).map(match=>({tournament:t,match})));
  const resolve=(t,name)=>{
    if(t.active)return allowed.has(name)?name:null;
    const mapped=aliases.get(norm(name));
    return mapped && allowed.has(mapped)?mapped:null;
  };
  return pairTable(entries,resolve).filter(p=>p.editions.length>=2);
}
