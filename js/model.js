/** Pure tournament rules. No browser dependencies; covered by node:test. */
export const norm = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function parseDate(input) {
  if (!input) return null;
  if (input instanceof Date && !isNaN(input)) return new Date(Date.UTC(input.getUTCFullYear(),input.getUTCMonth(),input.getUTCDate()));
  if (typeof input === 'number' && input > 20000 && input < 80000) return new Date(Date.UTC(1899,11,30) + Math.trunc(input)*86400000);
  const text=String(input).trim();
  const iso=/^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const br=/^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  const bits=iso?[+iso[1],+iso[2],+iso[3]]:br?[+br[3],+br[2],+br[1]]:null;
  if (!bits) return null;
  const dt=new Date(Date.UTC(bits[0],bits[1]-1,bits[2]));
  if (dt.getUTCFullYear()!==bits[0] || dt.getUTCMonth()+1!==bits[1] || dt.getUTCDate()!==bits[2]) return null;
  return dt;
}
export function durationDays(m) {
  const start=parseDate(m.start), end=parseDate(m.end);
  if (!start || !end || end<start) return null;
  return Math.round((end-start)/86400000);
}
export function getResult(m){
  if (norm(m.status)==='bye' || m.result==='bye') return 'bye';
  if (['1-0','0-1','½-½','0.5-0.5','1/2-1/2'].includes(m.result)) return m.result.includes('½') || m.result.includes('0.5') || m.result.includes('1/2')?'½-½':m.result;
  return null;
}
export function getMatchStatus(m, activeNames, referenceRound=1) {
  const result=getResult(m);
  if (result==='bye') return 'bye';
  if (result) return 'finished'; // Result overrides a stale manual status.
  if (norm(m.status)==='em andamento') return 'playing';
  if (norm(m.status)==='finalizado') return 'missing-result';
  if (m.round>referenceRound+1) return 'future';
  if (activeNames.has(m.white) || activeNames.has(m.black)) return 'busy';
  return 'ready';
}
// Nas folgas, a coluna B do Google Sheets define a pontuação.
// Ausência de valor equivale a zero, nunca a um ponto automático.
export function byeScore(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}
export function buildTournament(tournament){
  const source=tournament.matches || [];
  const matches=source.map((m,i)=>({...m,id:m.id || `r${m.round}-${i}`,result:getResult(m),round:Number(m.round)}));
  const activeNames=new Set();
  for (const m of matches) if(!m.result && norm(m.status)==='em andamento' && m.black){ activeNames.add(m.white);activeNames.add(m.black); }
  const currentRound=Number(tournament.currentRound)||1;
  const decorated=matches.map(m=>({...m,derivedStatus:getMatchStatus(m,activeNames,currentRound),duration:durationDays(m)}));
  const regular=decorated.filter(m=>m.derivedStatus!=='bye');
  const finished=regular.filter(m=>m.derivedStatus==='finished');
  const ongoing=regular.filter(m=>m.derivedStatus==='playing');
  const ready=regular.filter(m=>m.derivedStatus==='ready');
  const pending=regular.filter(m=>!['finished','playing'].includes(m.derivedStatus));
  const people=new Map();
  const make=(name)=>{
    if(!name) return null;
    if(!people.has(name))people.set(name,{name,points:0,wins:0,draws:0,losses:0,played:0,byes:0,ongoing:0,byePoints:0});
    return people.get(name);
  };
  for(const m of decorated){
    const a=make(m.white),b=make(m.black);
    if(m.derivedStatus==='bye'){if(a){const pts=byeScore(m.byePoints);a.points+=pts;a.byePoints+=pts;a.byes+=1;}continue;}
    if(m.derivedStatus==='playing'){if(a)a.ongoing++;if(b)b.ongoing++;continue;}
    if(m.derivedStatus!=='finished')continue;
    if(a)a.played++;
    if(b)b.played++;
    if(m.result==='1-0'){a.points++;a.wins++;b.losses++;}
    else if(m.result==='0-1'){b.points++;b.wins++;a.losses++;}
    else if(m.result==='½-½'){a.points+=.5;b.points+=.5;a.draws++;b.draws++;}
  }
  const standings=[...people.values()].sort((a,b)=>b.points-a.points || b.wins-a.wins || a.name.localeCompare(b.name,'pt-BR'));
  const withDates=finished.filter(m=>parseDate(m.end));
  const recent=withDates.length?withDates.slice().sort((a,b)=>parseDate(b.end)-parseDate(a.end) || b.round-a.round).slice(0,5):finished.slice(-5).reverse();
  const alerts=[];
  const playedIds=new Set();
  for(const m of ongoing)for(const n of [m.white,m.black]) {if(playedIds.has(n))alerts.push(`${n} aparece em duas partidas em andamento.`);playedIds.add(n);}
  for(const m of decorated) if(m.derivedStatus==='missing-result')alerts.push(`Rodada ${m.round}: status Finalizado sem placar informado.`);
  return {...tournament,currentRound,matches:decorated,standings,finished,ongoing,ready,pending,recent,recentVerified:withDates.length>0,alerts,total:regular.length,byes:decorated.filter(m=>m.derivedStatus==='bye').length};
}
export function playerMatches(t,name){
  if(!name)return [];
  return t.matches.filter(m=>m.derivedStatus!=='bye' && (m.white===name || m.black===name));
}
export function nextMatches(t,name){
  return playerMatches(t,name).filter(m=>!['finished'].includes(m.derivedStatus)).sort((a,b)=>{
    const priority={playing:0,ready:1,busy:2,'missing-result':3,future:4};
    return (priority[a.derivedStatus]??9)-(priority[b.derivedStatus]??9)||a.round-b.round;
  });
}
export function honors(t){
  const mostWins=[...t.standings].sort((a,b)=>b.wins-a.wins || b.points-a.points)[0] || null;
  const withDuration=t.finished.filter(m=>m.duration!==null);
  const longest=withDuration.slice().sort((a,b)=>b.duration-a.duration)[0]||null;
  const quickest=withDuration.filter(m=>m.result==='1-0'||m.result==='0-1').slice().sort((a,b)=>a.duration-b.duration)[0]||null;
  const ordered=t.finished.filter(m=>parseDate(m.end)).slice().sort((a,b)=>parseDate(a.end)-parseDate(b.end));
  const streaks=new Map();let record=null;
  for(const m of ordered){
    for(const p of [m.white,m.black]){
      const won=(p===m.white&&m.result==='1-0')||(p===m.black&&m.result==='0-1');
      const drawn=m.result==='½-½';
      const score=(won||drawn)?(streaks.get(p)||0)+1:0;
      streaks.set(p,score);
      if(score>0 && (!record || score>record.count)) record={name:p,count:score};
    }
  }
  return {mostWins,longest,quickest,streak:record};
}
export function validLichessUrl(url){
  if(!url)return null;
  try {const parsed=new URL(url);return parsed.protocol==='https:' && ['lichess.org','www.lichess.org'].includes(parsed.hostname)?parsed.href:null;}catch{return null;}
}
