import {buildTournament,nextMatches,validLichessUrl,parseDate,durationDays,byeScore,correspondenceRating,replayInfo,homeActiveMatches,eligibleToStart,alternativeStartPlayers} from './model.js';
import {activeBoardInfo} from './live.js';
import {gameStats} from './game-stats.js';
import {gloryAwards,featuredGloryAwards} from './glory.js';
import {REGION_MAPS} from './regions.js';
import {editionChampion,editionRivalries,interEditionRivalries} from './history.js';
const dataUrl='./data/campeonatos.json';
const storageKey='reinos-xadrez-jogador';
let store=null, current=null, archive=null, selected='', activePage='inicio', roundSelected=4, device='celular';
const byId=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const s=value=>escapeHTML(value);
const number=value=>Number.isInteger(value)?String(value):Number(value).toLocaleString('pt-BR',{maximumFractionDigits:10});
const COLORS=['#456f81','#934e4c','#53806a','#93763d','#685e91','#ac6f42','#657782','#7a5c56','#6f814b','#446e62'];
const colorFor=name=>{let hash=0;for(const ch of String(name)) hash=(hash*31+ch.codePointAt(0))>>>0;return COLORS[hash%COLORS.length];};
const formattedName=name=>{if(!name)return '—';const nick=store?.players?.find(p=>p.name===name)?.lichess;return `${name}${nick?` (${nick})`:''}`;};
const nickFor=name=>store?.players?.find(p=>p.name===name)?.lichess||null;
const ratingBadge=name=>{
  const player=store?.players?.find(p=>p.name===name);
  if (!player?.lichess) return '';
  const info=correspondenceRating(player);
  const nick=player.lichess;
  const validated=player.lichessValidation?.status==='valido' && /^[A-Za-z0-9_-]{2,30}$/.test(nick);
  const link=validated?`<a href="https://lichess.org/@/${encodeURIComponent(nick)}" target="_blank" rel="noopener noreferrer">Abrir perfil no Lichess ↗</a>`:'';
  const detail=info.value===null?'Rating público de correspondência indisponível.':
    `Rating público de correspondência: ${info.value}${info.provisional?' (provisório)':''}.${info.games===null?'':` ${info.games} partida(s) registradas.`}`;
  return `<details class="corr-rating"><summary title="${s(detail)}" aria-label="${s(detail)}">${s(info.label)}</summary><span class="corr-rating-popover">${s(detail)}<small>Não são pontos do campeonato.</small>${link}</span></details>`;
};
const dateText=date=>{const d=parseDate(date);return d?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(d):'Data não informada';};
const flag=(name,winner=false,small=false)=>`<span class="${small?'mini-banner':'banner'}" style="--banner-color:${colorFor(name)}" aria-hidden="true">${winner?'♛':'♞'}</span>`;
const flagSmall=(name,winner=false)=>flag(name,winner,true);
const statusNames={bye:'Folga (Bye)',finished:'Finalizada',playing:'Em andamento',ready:'Pode começar',busy:'Jogador ocupado',future:'Rodada futura','missing-result':'Falta informar o resultado'};
const statusClasses={bye:'bye',finished:'finished',playing:'playing',ready:'ready',busy:'busy',future:'future','missing-result':'future'};
const chip=st=>`<span class="status-chip status-${statusClasses[st]||'future'}">${statusNames[st]||s(st)}</span>`;
const gameStatsMarkup=(m)=>{
  const info=gameStats(m);
  if(!info) return m.url && ['finished','playing'].includes(m.derivedStatus)
    ? '<div class="game-stats muted">Abertura e lances: dados não verificados ou indisponíveis.</div>' : '';
  const opening=info.openingName?info.openingName:'não identificada';
  const eco=info.eco?` (ECO ${info.eco})`:'';
  const moves=info.moves?
    `${info.moves.plies} individuais · ${info.moves.completePairs} pares completos${info.moves.unpaired?' + 1 sem resposta':''}`:'não informados';
  const finish=info.ongoing?' · Partida em curso; posição pública pode ter atraso':
    ` · Término: ${info.ending||'não informado'}`;
  return `<div class="game-stats" aria-label="Estatísticas do Lichess"><span>Abertura: ${s(opening)}${s(eco)}</span><span>Lances: ${s(moves)}${s(finish)}</span></div>`;
};
const urlAnchor=(m,label='Ver no Lichess ↗',klass='action-link')=>{const href=validLichessUrl(m.url);return href?`<a class="${klass}" href="${s(href)}" target="_blank" rel="noopener noreferrer">${s(label)}</a>`:`<span class="${klass} disabled" title="O organizador ainda não cadastrou o link">Link pendente</span>`;};
// #6: ação exibida apenas quando a partida foi verificada na conciliação #3.
const replayButton=(m,klass='action-link')=>replayInfo(m)
  ? `<button type="button" class="replay-trigger ${klass}" data-replay-id="${s(m.id)}" aria-label="Rever ${s(m.white)} contra ${s(m.black)} no tabuleiro">♜ Rever partida</button>` : '';
// #7: apenas tabuleiros de jogos em andamento verificados pela conciliação #3.
const watchButton=(m,klass='action-link')=>activeBoardInfo(m)
  ? `<button type="button" class="replay-trigger live-watch-trigger ${klass}" data-watch-id="${s(m.id)}" aria-label="Acompanhar tabuleiro de ${s(m.white)} contra ${s(m.black)}">♟ Acompanhar tabuleiro</button>` : '';
const liveTime=info=>info?.checkedAt?new Date(info.checkedAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'não informada';
const liveSyncNote=info=>info?`<span class="live-sync-note">Última consulta: ${s(liveTime(info))}${info.stale?' · dados antigos':''} · Posição sujeita a atraso</span>`:'';

function replayDialog() {
  let node=byId('replay-dialog');
  if (node) return node;
  node=document.createElement('dialog');
  node.id='replay-dialog';
  node.className='replay-dialog';
  node.setAttribute('aria-labelledby','replay-heading');
  node.innerHTML=`<div class="replay-panel">
    <header class="replay-header"><div><small id="replay-kicker">♜ Crônica da batalha · Replay</small>
      <h2 id="replay-heading"></h2><p id="replay-details"></p></div>
      <button type="button" class="replay-close" data-replay-close aria-label="Fechar replay">✕ <span>Fechar</span></button></header>
    <div class="replay-embed"><iframe id="replay-iframe" title="Tabuleiro Lichess com navegação pelos lances" referrerpolicy="no-referrer" allowfullscreen></iframe></div>
    <footer class="replay-footer"><p id="replay-instructions">Use os controles dentro do tabuleiro para avançar ou voltar os lances. Se ele não carregar, abra a partida diretamente no Lichess.</p>
      <a id="replay-link" class="button button-gold" target="_blank" rel="noopener noreferrer">Abrir no Lichess ↗</a></footer>
  </div>`;
  document.body.append(node);
  node.querySelector('[data-replay-close]').addEventListener('click',()=>node.close());
  node.addEventListener('click',e=>{if(e.target===node)node.close();});
  node.addEventListener('close',()=>{node.querySelector('#replay-iframe').removeAttribute('src');});
  return node;
}
function openReplay(id) {
  const match=current?.matches.find(m=>m.id===id);
  const info=match&&replayInfo(match);
  if (!info) return;
  const node=replayDialog();
  node.querySelector('#replay-kicker').textContent='♜ Crônica da batalha · Replay';
  node.querySelector('#replay-heading').textContent=`${match.white} × ${match.black}`;
  node.querySelector('#replay-details').textContent=`Rodada ${match.round} · ${match.result} · Partida encerrada`;
  node.querySelector('#replay-instructions').textContent='Use os controles do tabuleiro para percorrer os lances. Se não carregar, abra a partida no Lichess.';
  node.querySelector('#replay-iframe').title='Replay Lichess da partida finalizada';
  node.querySelector('#replay-link').href=info.gameUrl;
  if (typeof node.showModal!=='function') {window.open(info.gameUrl,'_blank','noopener,noreferrer');return;}
  node.querySelector('#replay-iframe').src=info.embedUrl;
  node.showModal();
  node.querySelector('[data-replay-close]').focus();
}
function openWatch(id) {
  const match=current?.matches.find(m=>m.id===id);
  const info=match&&activeBoardInfo(match);
  if (!info) return;
  const node=replayDialog();
  node.querySelector('#replay-kicker').textContent='♟ Observatório · Acompanhamento';
  node.querySelector('#replay-heading').textContent=`${match.white} × ${match.black}`;
  node.querySelector('#replay-details').textContent=`Rodada ${match.round} · Em andamento · Última consulta: ${liveTime(info)}${info.stale?' · Dados possivelmente desatualizados':''}`;
  node.querySelector('#replay-instructions').textContent='Visualização somente para acompanhamento. O Lichess pode ocultar os últimos lances por prevenção a trapaças; a posição exibida não é necessariamente atual. Para jogar, abra a partida no Lichess.';
  node.querySelector('#replay-iframe').title='Tabuleiro público Lichess para acompanhamento, sem comandos de jogar no site';
  node.querySelector('#replay-link').href=info.gameUrl;
  if(typeof node.showModal!=='function') {window.open(info.gameUrl,'_blank','noopener,noreferrer');return;}
  node.querySelector('#replay-iframe').src=info.embedUrl;
  node.showModal();
  node.querySelector('[data-replay-close]').focus();
}
function showToast(text){const toast=byId('toast');toast.textContent=text;toast.classList.add('visible');clearTimeout(showToast.handle);showToast.handle=setTimeout(()=>toast.classList.remove('visible'),3500);}
function showPage(name){
  if(!['inicio','classificacao','rodadas','gloria','academia','historico','sugestoes'].includes(name))name='inicio';
  activePage=name;
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.dataset.page!==name));
  document.querySelectorAll('.nav-link').forEach(btn=>{const active=btn.dataset.view===name;btn.classList.toggle('active',active);if(active)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});
  if(location.hash!==`#${name}`)history.replaceState(null,'',`#${name}`);
  window.scrollTo({top:0,behavior:'auto'});
}
function drawStats(){
  const stats=[['♛',current.finished.length,'Concluídas'],['⚔',current.ongoing.length,'Em andamento'],['✥',current.ready.length,'Prontas para iniciar'],['♜',current.currentRound,'Rodada de referência']];
  byId('stats-grid').innerHTML=stats.map(([icon,num,label])=>`<div class="stat-card"><span class="stat-icon" aria-hidden="true">${icon}</span><div><div class="stat-value">${num}</div><div class="stat-label">${label}</div></div></div>`).join('');
}
function drawMyBattle(){
  const root=byId('my-battle-content');
  if(!selected){root.innerHTML=`<div class="battles-empty"><div class="empty-icon">♞</div><strong>Seu estandarte está esperando!</strong><p>Escolha seu nome no campo no canto superior direito. Vamos mostrar sua partida em andamento ou seu próximo desafio, sem precisar procurar entre todas as rodadas.</p><button type="button" class="button button-light" id="choose-player">Escolher meu jogador ↗</button></div>`;byId('choose-player').addEventListener('click',()=>byId('player-select').focus());return;}
  const next=nextMatches(current,selected);
  if(!next.length){root.innerHTML=`<div class="battles-empty"><div class="empty-icon">♛</div><strong>${s(selected)}, você concluiu suas batalhas!</strong><p>Nenhuma partida pendente. Acompanhe a classificação e o Salão da Glória.</p><button class="button button-light" data-view="classificacao">Ver classificação ›</button></div>`;return;}
  const match=next[0], opponent=match.white===selected?match.black:match.white;
  const whiteWinner=match.result==='1-0',blackWinner=match.result==='0-1';
  let advise='';
  if(match.derivedStatus==='playing')advise='Esta partida está em andamento. Termine antes de iniciar outra.';
  else if(match.derivedStatus==='ready')advise='Ambos estão disponíveis. Vocês já podem criar o desafio no Lichess.';
  else if(match.derivedStatus==='busy')advise='Aguarde: pelo menos um dos jogadores ainda está em outra partida.';
  else if(match.derivedStatus==='future')advise=`Esta rodada ainda não foi liberada. São permitidas partidas até a rodada ${current.currentRound+1}.`;
  else advise='Aguarde a atualização do resultado pelo organizador.';
  root.innerHTML=`<div class="battle-state"><span class="signal"></span>${chip(match.derivedStatus)} <span>· RODADA ${match.round}</span></div>
  <div class="battle-stage"><div class="battle-player">${flag(match.white,whiteWinner)}<strong>${s(match.white)}</strong><small>${s(nickFor(match.white)||'Peças brancas')}</small>${ratingBadge(match.white)}</div><div class="versus">VS</div><div class="battle-player">${flag(match.black,blackWinner)}<strong>${s(match.black)}</strong><small>${s(nickFor(match.black)||'Peças pretas')}</small>${ratingBadge(match.black)}</div></div>
  <div class="battle-caption">${s(advise)}</div>${gameStatsMarkup(match)}<div class="battle-bottom">${watchButton(match,'button button-light')}${validLichessUrl(match.url)?`<a class="button button-gold" href="${s(validLichessUrl(match.url))}" target="_blank" rel="noopener noreferrer">Abrir partida ↗</a>`:`<button type="button" class="button button-gold" data-view="rodadas">Ver confronto ↗</button>`}<button type="button" class="button button-light" data-view="academia">Como jogar? ♜</button></div>`;
}
function drawLeaders(){byId('leaderboard-preview').innerHTML=current.standings.slice(0,5).map((p,i)=>`<div class="leader-row"><span class="rank ${['first','second','third'][i]||''}">${i+1}º</span>${flagSmall(p.name,i===0)}<div class="leader-name">${s(p.name)}<small>${nickFor(p.name)?s(nickFor(p.name)):`${p.wins} vitória${p.wins===1?'':'s'}`}</small>${ratingBadge(p.name)}</div><span class="leader-points">${number(p.points)} <small>pts</small></span></div>`).join('');}
function drawRecent(){
  byId('recent-notice').textContent=current.recentVerified?'Ordenadas pela data de fim. Datas automáticas do Lichess são referências de criação e último lance, não instantes exatos.':'Datas de término ainda não informadas: exibindo as últimas linhas finalizadas da planilha, sem ordem cronológica garantida.';
  byId('recent-matches').innerHTML=current.recent.length?current.recent.map(m=>`<div class="recent-row"><span class="recent-icon">♟</span><div><div class="recent-title">${s(m.white)} <span class="fixture-vs">×</span> ${s(m.black)}</div><span class="recent-sub">Rodada ${m.round} · ${m.end?dateText(m.end):'Data pendente'}${m.duration!==null?` · ${m.duration} dias`:''}</span>${gameStatsMarkup(m)}${replayButton(m,'match-action')}${urlAnchor(m,'Abrir no Lichess ↗','match-action')}</div><div class="result-score">${s(m.result)}</div></div>`).join(''):`<div class="empty-message">As partidas concluídas aparecerão aqui.</div>`;
}
function drawOngoing(){
  const matches=homeActiveMatches(current);
  const total=current.ongoing.length;
  byId('ongoing-notice').textContent=total===0
    ? 'Nenhum confronto em andamento no momento.'
    : total>10
      ? `Exibindo os 10 primeiros de ${total} confrontos em andamento, na ordem da planilha.`
      : `${total} confronto${total===1?'':'s'} em andamento, na ordem da planilha.`;
  byId('ongoing-matches').innerHTML=matches.length?matches.map(m=>{
    const activeInfo=activeBoardInfo(m);
    return `<div class="recent-row ongoing-row"><span class="recent-icon" aria-hidden="true">♟</span><div class="ongoing-row-content"><div class="recent-title">${s(m.white)} <span class="fixture-vs">×</span> ${s(m.black)}</div><span class="recent-sub">Rodada ${m.round}${m.start?` · Início: ${dateText(m.start)}`:''}</span>${liveSyncNote(activeInfo)}${gameStatsMarkup(m)}${watchButton(m,'match-action')}${urlAnchor(m,'Abrir no Lichess ↗','match-action')}</div><span class="status-chip status-playing">Em andamento</span></div>`;
  }).join(''):'<div class="empty-message">As partidas iniciadas aparecerão aqui.</div>';
}
function drawGlory(){
  const awards=gloryAwards(current);
  const medalArt=a=>a.mapId&&REGION_MAPS[a.mapId]
    ? '<span class="medal medal-map" role="img" aria-label="Mapa estilizado de '+s(a.mapLabel)+'"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="'+REGION_MAPS[a.mapId]+'"/></svg></span>'
    : '<span class="medal" aria-hidden="true">'+s(a.icon)+'</span>';
  const preview=featuredGloryAwards(awards);
  byId('glory-preview').innerHTML=preview.map(a=>{
    const holders=a.holders.length?a.holders.join(' · '):(a.mapId?'Trono sem conquistador':'Aguardando resultados');
    const subtitle=a.score?holders+' · '+a.score:holders;
    return '<button type="button" class="glory-preview-card glory-preview-link" data-view="gloria" aria-label="Ver a honraria '+s(a.name)+' no Salão da Glória">'+
      medalArt(a)+'<span class="glory-preview-copy"><span class="glory-preview-type">'+(a.mapId?'Trono regional':'Honraria do campeonato')+'</span>'+
      '<strong>'+s(a.name)+'</strong><span class="glory-preview-subtitle">'+s(subtitle)+'</span></span><span class="glory-preview-chevron" aria-hidden="true">›</span></button>';
  }).join('');
  const matchRefs=games=>'<details class="honor-games"><summary>Partidas relacionadas ('+games.length+')</summary><ul>'+
    games.map(m=>{
      const label='Rodada '+m.round+' · '+m.white+' × '+m.black+(m.result?' · '+m.result:'');
      const href=validLichessUrl(m.url);
      return '<li>'+(href?'<a href="'+s(href)+'" target="_blank" rel="noopener noreferrer">'+s(label)+' ↗</a>':s(label)+' (link não disponível)')+'</li>';
    }).join('')+'</ul></details>';
  byId('glory-content').innerHTML='<h2 class="glory-section-title">Honrarias do campeonato</h2>'+awards.filter(a=>!a.mapId).map(a=>
    '<article class="honor-card honor-'+s(a.key)+'">'+medalArt(a)+
    '<h2>'+s(a.name)+'</h2><p class="honor-criterion"><strong>Critério:</strong> '+s(a.criterion)+'</p>'+
    '<div class="holder">'+(a.holders.length?s(a.holders.join(' · ')):'Aguardando dados suficientes')+'</div>'+
    (a.score?'<p class="honor-metric">'+s(a.score)+'</p>':'')+
    '<p class="honor-detail">'+s(a.detail)+'</p>'+
    (a.note?'<p class="honor-note">'+s(a.note)+'</p>':'')+
    (a.games.length?matchRefs(a.games):'')+
    '</article>'
  ).join('')+'<h2 class="glory-section-title regional-title">Tronos das Aberturas</h2>'+awards.filter(a=>a.mapId).map(a=>
    '<article class="honor-card honor-regional">'+medalArt(a)+
    '<h2>'+s(a.name)+'</h2><p class="honor-criterion"><strong>Critério:</strong> '+s(a.criterion)+'</p>'+
    '<div class="holder">'+(a.holders.length?s(a.holders.join(' · ')):'Trono sem conquistador')+'</div>'+
    (a.score?'<p class="honor-metric">'+s(a.score)+'</p>':'')+
    '<p class="honor-detail">'+s(a.detail)+'</p>'+
    (a.games.length?matchRefs(a.games):'')+'</article>'
  ).join('');
}
function standingsMarkup(t){return `<div class="table-wrap"><table class="standings-table"><thead><tr><th>Pos.</th><th>Jogador</th><th>Pontos</th><th>J</th><th>V</th><th>E</th><th>D</th><th title="Pontos recebidos nas folgas">Bye (pts)</th></tr></thead><tbody>${t.standings.map((p,i)=>`<tr><td>${i===0?'<span class="champion-crown" title="Líder">♛</span>':i+1+'º'}</td><td><div class="table-player">${flagSmall(p.name,i===0)}<span>${s(formattedName(p.name))}</span>${t.active?ratingBadge(p.name):''}</div></td><td class="num"><strong>${number(p.points)}</strong></td><td class="num">${p.played}</td><td class="num">${p.wins}</td><td class="num">${p.draws}</td><td class="num">${p.losses}</td><td class="num">${number(p.byePoints)}</td></tr>`).join('')}</tbody></table></div>`;}
function drawStandings(){
  const conflicts=current.matches.filter(m=>m.lichessDecision?.status==='conflito').length;
  const warning=conflicts?`<p class="lichess-warning" role="status">⚠ ${conflicts} confronto(s) com divergência entre Lichess e planilha. A pontuação da planilha foi mantida; confira a rodada correspondente.</p>`:'';
  byId('classificacao-content').innerHTML=standingsMarkup(current)+warning+`<p class="table-note"><strong>Como calculamos:</strong> vitória = 1 ponto; empate = 0,5; derrota = 0; folga (Bye) = valor informado na coluna B da planilha (sem valor = 0). J = partidas efetivamente disputadas (não inclui folgas). Em caso de igualdade em pontos, a exibição usa vitórias e depois ordem alfabética; esse ordenamento não define um desempate oficial do campeonato.</p>`;}
function fixtureMarkup(m, showRatings=true){
  const whiteWon=m.result==='1-0',blackWon=m.result==='0-1';
  const label=m.derivedStatus==='bye'?'Folga (Bye)':statusNames[m.derivedStatus];
  const score=m.derivedStatus==='bye'?`<div class="fixture-result">${number(byeScore(m.byePoints))} pt</div>`:m.result?`<div class="fixture-result">${s(m.result)}</div>`:'';
  const origin=m.lichessDecision?.status==='finished' && m.result?'<span title="Placar confirmado pela API do Lichess">· Resultado Lichess</span>':'';
  const warning=m.lichessDecision?.status==='conflito'?'<span class="lichess-warning" role="status">⚠ Divergência com Lichess; placar da planilha mantido</span>':m.lichessDecision?.status==='ignorado'?'<span class="lichess-warning">⚠ Vínculo Lichess não confirmado</span>':'';
  const dateParts=[m.start?`Início: ${dateText(m.start)}`:'',m.end?`Fim: ${dateText(m.end)}`:'',m.duration!==null?`${m.duration} dias`:'' ].filter(Boolean).join(' · ');
  const activeInfo=activeBoardInfo(m);
  return `<div class="fixture-row"><div><div class="fixture-names">${flagSmall(m.white,whiteWon)} <span>${s(formattedName(m.white))}</span>${showRatings?ratingBadge(m.white):''} ${m.black?`<span class="fixture-vs">×</span> ${flagSmall(m.black,blackWon)} <span>${s(formattedName(m.black))}</span>${showRatings?ratingBadge(m.black):''}`:'<span class="fixture-vs">— Folga</span>'}</div><div class="fixture-summary">${chip(m.derivedStatus)}${origin}${warning}<span>${dateParts?s(dateParts):m.derivedStatus==='bye'?'Descansa nesta rodada':`Rodada ${m.round}`}</span>${liveSyncNote(activeInfo)}${gameStatsMarkup(m)}</div></div><div class="fixture-action">${score}${m.derivedStatus==='bye'?'':replayButton(m)+watchButton(m)+urlAnchor(m)}</div></div>`;
}
function drawEligibleStarts(){
  const matches=eligibleToStart(current);
  const alternatives=alternativeStartPlayers(matches);
  byId('eligible-start-count').textContent=matches.length+' confronto'+(matches.length===1?'':'s')+' apto'+(matches.length===1?'':'s');
  byId('eligible-start-content').innerHTML=matches.length?matches.map(m=>{
    const shared=alternatives.has(m.white)||alternatives.has(m.black);
    return '<article class="eligible-start-item"><div><strong>Rodada '+s(m.round)+': '+s(formattedName(m.white))+' × '+s(formattedName(m.black))+'</strong>'+
      '<p>Brancas: '+s(m.white)+' · Pretas: '+s(m.black)+'</p>'+
      (shared?'<small class="eligible-start-note">⚠ Opção alternativa: há outra partida apta com pelo menos um destes jogadores. Somente uma pode ser iniciada por vez.</small>':'')+
      '</div><button type="button" class="button button-light" data-round="'+s(m.round)+'" data-view="rodadas">Ver rodada ›</button></article>';
  }).join(''):'<div class="empty-message">Nenhum confronto está liberado para começar no momento.</div>';
}
function drawRounds(){
  drawEligibleStarts();
  const rounds=[...new Set(current.matches.map(m=>m.round))].sort((a,b)=>a-b);
  byId('round-buttons').innerHTML=rounds.map(r=>`<button type="button" class="round-button ${r===roundSelected?'current':''}" data-round="${r}" aria-pressed="${r===roundSelected}">R${r}</button>`).join('');
  const round=current.matches.filter(m=>m.round===roundSelected);
  byId('round-content').innerHTML=`<h2 class="round-summary">Rodada ${roundSelected}${roundSelected===current.currentRound?' · Referência atual':''}</h2>${round.map(m=>fixtureMarkup(m)).join('')}`;
}
const tutorials=[
  {icon:'⚔',title:'Criar uma partida',sub:'Convide seu adversário e configure o tempo correto.',celular:['Abra o Lichess no aplicativo ou no navegador do celular e entre na sua conta.','Encontre o perfil do adversário pelo nome de usuário do Lichess.','No perfil, procure a opção de desafiar o jogador (ícone de espadas ou “Desafiar”).','Escolha a modalidade Correspondência e configure 1 dia por lance.','Confira a cor das peças indicada no site do campeonato antes de enviar o desafio.','Envie o desafio e aguarde a aceitação do adversário.'],computador:['Entre em lichess.org e faça login.','Abra o perfil do adversário usando o apelido dele no Lichess.','Clique ou toque no comando ou ícone para desafiar o jogador.','Escolha a modalidade Correspondência e configure 1 dia por lance.','Escolha a cor correta das peças conforme o confronto publicado.','Envie o desafio e espere a aceitação.']},
  {icon:'✉',title:'Aceitar um desafio',sub:'Recebeu um convite? Veja como entrar na batalha.',celular:['Abra o Lichess com sua conta.','Procure notificações, convites ou desafios recebidos.','Abra o desafio enviado pelo adversário.','Confira se a modalidade é Correspondência e o tempo é de 1 dia por lance.','Toque em Aceitar. A partida aparecerá na sua lista de jogos.'],computador:['Entre no Lichess e verifique as notificações ou a lista de desafios.','Abra o desafio enviado pelo adversário.','Confira modalidade, tempo e cor das peças.','Clique ou toque em Aceitar para começar.']},
];
function drawTutorials(){byId('tutorial-content').innerHTML=tutorials.map((t,i)=>`<article class="tutorial"><div class="tutorial-head"><div class="tutorial-icon">${t.icon}</div><div><h2>${s(t.title)}</h2><div class="subtitle">${s(t.sub)}</div></div></div><details ${i===0?'open':''}><summary>Ver instruções passo a passo</summary><ol>${t[device].map(step=>`<li>${s(step)}</li>`).join('')}</ol>${i===0?'<a class="action-link" href="https://lichess.org" target="_blank" rel="noopener noreferrer">Abrir o Lichess ↗</a>':''}</details></article>`).join('');}
function drawHistory(){
  const root=byId('history-content');
  const editions=(store?.tournaments||[]).map(t=>t.active?current:buildTournament(t));
  const archived=editions.filter(t=>!t.active);
  if(!archived.length){root.innerHTML='<div class="empty-message">Nenhuma edição anterior encontrada.</div>';return;}
  const refs=games=>'<ul class="history-game-list">'+games.map(g=>{
    const m=g.match||g;
    const label=(g.editionTitle?g.editionTitle+' · ':'')+'R'+m.round+': '+m.white+' × '+m.black+' · '+m.result;
    const href=validLichessUrl(m.url);
    return '<li>'+(href?'<a href="'+s(href)+'" target="_blank" rel="noopener noreferrer">'+s(label)+' ↗</a>':s(label))+'</li>';
  }).join('')+'</ul>';
  const pairCard=pair=>'<article class="history-rivalry"><strong>'+s(pair.left)+' × '+s(pair.right)+'</strong>'+
    '<p>'+pair.count+' confrontos · '+s(pair.left)+': '+pair.firstWins+' vitória(s) · '+s(pair.right)+': '+pair.secondWins+' vitória(s) · '+pair.draws+' empate(s)</p>'+
    '<details><summary>Ver confrontos ('+pair.count+')</summary>'+refs(pair.games)+'</details></article>';
  const cross=interEditionRivalries(editions,store?.players);
  const crossMarkup='<section class="history-section"><h2>Rivalidades entre edições</h2>'+
    '<p class="history-helper">Somente adversários que se enfrentaram em mais de uma edição e foram identificados com nicks verificados na aba Jogadores. Resultados seguem separados por edição.</p>'+
    (cross.length?'<div class="history-rivalries">'+cross.map(pairCard).join('')+'</div>':
      '<div class="empty-message">Ainda não há duelos entre edições com ambos os jogadores identificados de forma confiável.</div>')+'</section>';
  const previous=archived.map(t=>{
    const title=t.title||'Edição anterior';
    const champion=editionChampion(t);
    const titleText=champion.state==='champion'?'Campeão: '+champion.leaders[0]:
      champion.state==='tie'?'Liderança empatada — campeão não definido pelo regulamento':
      'Campeão ainda não confirmado';
    const points=champion.points===null?'Dados de classificação incompletos':
      champion.leaders.join(' · ')+' · '+number(champion.points)+' pontos';
    const rivals=editionRivalries(t);
    return '<article class="history-card"><div class="history-title-row"><span class="seal">♛</span><div><h2>'+s(title)+'</h2><p>'+
      s(t.subtitle||'Edição encerrada')+' · '+t.finished.length+' partidas disputadas · '+t.standings.length+' participantes</p></div></div>'+
      '<div class="history-highlight"><span class="crown">♛</span><div><strong>'+s(titleText)+'</strong><small>'+s(points)+'</small></div></div>'+
      standingsMarkup(t)+
      '<section class="history-section"><h3>Rivalidades desta edição</h3><p class="history-helper">Retrospecto restrito aos nomes e resultados desta edição.</p>'+
      (rivals.length?'<div class="history-rivalries">'+rivals.map(pairCard).join('')+'</div>':'<p>Sem confrontos finalizados.</p>')+'</section>'+
      '<details class="history-matches"><summary>Ver todas as partidas desta edição</summary><div>'+t.matches.filter(m=>m.derivedStatus!=='bye').map(m=>fixtureMarkup(m,false)).join('')+'</div></details></article>';
  }).join('');
  root.innerHTML='<p class="history-helper">O campeonato atual continua em destaque nas páginas Início e Tabela. Aqui estão as edições já encerradas.</p>'+
    crossMarkup+previous;
}
function drawSuggestions(){
  const info=store?.unlinkedSuggestions||{};
  const rows=Array.isArray(info.candidates)?info.candidates:[];
  const root=byId('suggestions-content');
  const timestamp=info.checkedAt?new Date(info.checkedAt).toLocaleString('pt-BR'):'Não informada';
  const notes=Array.isArray(info.warnings)?info.warnings.filter(x=>typeof x==='string'):[];
  root.innerHTML='<p class="suggestion-note"><strong>Apenas sugestões.</strong> Confirme jogadores, cores e partida no Lichess antes de preencher manualmente a coluna F da planilha. Partidas privadas podem não aparecer. Última consulta: '+s(timestamp)+'.</p>'+
    (info.status&&info.status!=='ok'?'<p class="suggestion-alert">Busca '+s(info.status)+'. Os resultados podem estar incompletos.</p>':'')+
    notes.map(x=>'<p class="suggestion-alert">'+s(x)+'</p>').join('')+
    (rows.length?'<div class="suggestion-list">'+rows.map(x=>{
      const match=current.matches.find(m=>m.id===x.matchId);
      const url=typeof x.url==='string'&&/^https:\/\/lichess\.org\/[A-Za-z0-9]{8}$/.test(x.url)?x.url:null;
      if(!match||match.url||!url||match.white!==x.white||match.black!==x.black)return '';
      return '<article class="suggestion-card"><h3>Rodada '+s(match.round)+': '+s(match.white)+' × '+s(match.black)+'</h3>'+
        '<p>Criação: '+s(x.createdAt||'Não informada')+' · '+(x.daysPerTurnVerified?'Correspondência: 1 dia por lance confirmado':'Conferir o tempo por lance no Lichess')+'</p>'+
        '<div class="suggestion-actions"><a class="button button-light" href="'+s(url)+'" target="_blank" rel="noopener noreferrer">Verificar no Lichess ↗</a>'+
        '<button type="button" class="button button-light" data-copy-candidate="'+s(url)+'">Copiar URL para coluna F</button></div></article>';
    }).join('')+'</div>':'<div class="empty-message">Nenhuma sugestão disponível nesta consulta. A ausência de sugestões não significa que não existam jogos.</div>');
}
function renderAll(){drawStats();drawMyBattle();drawLeaders();drawRecent();drawOngoing();drawGlory();drawStandings();drawRounds();drawTutorials();drawHistory();drawSuggestions();}
async function init(){
  document.addEventListener('click',e=>{
    const replay=e.target.closest('[data-replay-id]');if(replay){e.preventDefault();openReplay(replay.dataset.replayId);return;}
    const watching=e.target.closest('[data-watch-id]');if(watching){e.preventDefault();openWatch(watching.dataset.watchId);return;}
    const suggestion=e.target.closest('[data-copy-candidate]');if(suggestion){e.preventDefault();const url=suggestion.dataset.copyCandidate;if(/^https:\/\/lichess\.org\/[A-Za-z0-9]{8}$/.test(url)){navigator.clipboard?.writeText(url).then(()=>showToast('URL copiada. Cole na coluna F após conferir no Lichess.')).catch(()=>showToast('Não foi possível copiar; abra o link no Lichess.'));}return;}
    const nav=e.target.closest('[data-view]');if(nav){e.preventDefault();showPage(nav.dataset.view);return;}
    const round=e.target.closest('[data-round]');if(round){roundSelected=Number(round.dataset.round);drawRounds();}
    const dev=e.target.closest('[data-device]');if(dev){device=dev.dataset.device;document.querySelectorAll('[data-device]').forEach(b=>{b.classList.toggle('selected',b===dev);b.setAttribute('aria-pressed',String(b===dev));});drawTutorials();}
  });
  byId('player-select').addEventListener('change',e=>{selected=e.target.value;try{localStorage.setItem(storageKey,selected);}catch{}drawMyBattle();showToast(selected?`Pronto! Mostrando as partidas de ${selected}.`:'Seleção de jogador removida.');});
  window.addEventListener('hashchange',()=>showPage(location.hash.slice(1)));
  try{
    const result=await fetch(dataUrl,{cache:'no-store'});
    if(!result.ok)throw new Error(`HTTP ${result.status}`);
    store=await result.json();
    current=buildTournament(store.tournaments.find(t=>t.active)||store.tournaments[0]);
    archive=store.tournaments.find(t=>!t.active)?buildTournament(store.tournaments.find(t=>!t.active)):null;
    roundSelected=current.currentRound;
    try{selected=localStorage.getItem(storageKey)||'';}catch{}
    if(selected && !current.standings.some(p=>p.name===selected))selected='';
    byId('player-select').innerHTML='<option value="">Escolha seu jogador</option>'+current.standings.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(p=>`<option value="${s(p.name)}">${s(p.name)}</option>`).join('');
    byId('player-select').value=selected;
    const stamp=store.source?.lastSync;
    byId('last-update').textContent=stamp?`Última importação: ${new Date(stamp).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}`:'Versão inicial importada do arquivo fornecido';
    byId('source-pill').classList.add(stamp?'synced':'error');
    byId('source-pill').lastChild.textContent=stamp?' Dados importados':' Prévia da planilha';
    byId('footer-source').textContent=stamp?'Sincronização automática com Google Sheets':'Prévia local; configuração da sincronização pendente';
    renderAll();showPage(location.hash.slice(1)||'inicio');
  }catch(err){console.error(err);byId('source-pill').classList.add('error');byId('source-pill').textContent='Erro nos dados';byId('stats-grid').innerHTML='<div class="empty-message">Não foi possível carregar a planilha. Para testar localmente, execute um servidor HTTP (veja README.md).</div>';}
}
init();
