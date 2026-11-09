/** #7: posição pública de jogos em andamento, somente para visualização. */
import {getResult, replayGameId, validLichessUrl} from './model.js';

function utcTimestamp(value, now) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i.test(value)) return null;
  const millis=Date.parse(value);
  if (!Number.isFinite(millis) || millis<Date.UTC(2020,0,1) || millis>now+60000) return null;
  return new Date(millis).toISOString();
}

/** Exige decisão da #3 (ID, nicks, cores, unicidade), e jogo realmente iniciado. */
export function activeBoardInfo(match, now=Date.now()) {
  if (!match || (match.derivedStatus && match.derivedStatus!=='playing') ||
      getResult(match)!==null || match.lichessDecision?.status!=='playing' ||
      !['ok','cache'].includes(match.lichessImport?.status)) return null;
  const game=match.lichessGame;
  const id=replayGameId(match.url);
  if (!id || !game || String(game.id||'').toLowerCase()!==id.toLowerCase() ||
      String(game.status||'').toLowerCase()!=='started' || game.winner!=null) return null;
  // Em cache, checkedAt descreve apenas a verificação local; usar fetchedAt real.
  const checkedAt=utcTimestamp(game.fetchedAt,now) ||
    (match.lichessImport.status==='ok' ? utcTimestamp(match.lichessImport.checkedAt,now) : null);
  return {
    id,
    embedUrl:`https://lichess.org/embed/game/${id}?theme=brown&bg=light`,
    gameUrl:validLichessUrl(match.url),
    checkedAt,
    stale:!checkedAt || now-Date.parse(checkedAt)>70*60000,
  };
}
