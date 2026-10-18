/** #8 — Estatísticas de partidas verificadas. Nunca altera placares. */
import {replayGameId} from './model.js';

const FINISH_TYPES = Object.freeze({
  mate:'Xeque-mate', resign:'Desistência', timeout:'Tempo esgotado',
  outoftime:'Tempo esgotado', draw:'Empate', stalemate:'Afogamento',
  cheat:'Encerramento por infração', variantend:'Fim da variante',
  unknownfinish:'Encerramento não especificado',
});
const SAN = /^(?:O-O(?:-O)?|0-0(?:-0)?|[KQRBN](?:[a-h][1-8]|[a-h]|[1-8])?x?[a-h][1-8](?:=[QRBN])?|(?:[a-h]x)?[a-h][1-8](?:=[QRBN])?)[+#]?$/;
const RESULT = new Set(['1-0','0-1','1/2-1/2','½-½','*']);

/**
 * Analisa apenas a linha principal em SAN; ignora comentários, variações, NAG,
 * cabeçalhos e numeração de PGN. A API também entrega SAN simples sem números.
 * Dado malformado ou truncado: null, em vez de estatística inventada.
 */
export function countChessMoves(raw) {
  if (typeof raw!=='string' || !raw.trim() || raw.length>=20000) return null;
  let stripped='', variation=0, comment=0, lineComment=false, tag=false;
  let lineBeginning=true;
  for (let i=0;i<raw.length;i++) {
    const c=raw[i];
    if (lineComment) {if(c==='\n'){lineComment=false;lineBeginning=true;stripped+=' ';}continue;}
    if (tag) {if(c==='\n'){tag=false;lineBeginning=true;stripped+=' ';}continue;}
    if (comment) {if(c==='{')comment++;else if(c==='}')comment--;continue;}
    if (c==='{') {comment=1;continue;}
    if (c==='}' || c===')' && variation===0) return null;
    if (c==='(') {variation++;continue;}
    if (c===')') {variation--;continue;}
    if (variation) continue;
    if (c===';' || (c==='%' && lineBeginning)) {lineComment=true;continue;}
    if (c==='[' && lineBeginning) {tag=true;continue;}
    if (!/\s/.test(c))lineBeginning=false;
    if(c==='\n')lineBeginning=true;
    stripped+=c;
  }
  if (variation || comment) return null;
  const tokens=stripped.replace(/\b\d+\.(?:\.\.)?/g,' ').trim().split(/\s+/);
  let plies=0;
  for(let token of tokens) {
    if (!token || token==='...' || /^\$\d+$/.test(token) || RESULT.has(token) || token==='e.p.') continue;
    token=token.replace(/[!?]+$/g,'');
    if(!SAN.test(token)) return null;
    plies++;
  }
  return plies ? {plies,completePairs:Math.floor(plies/2),unpaired:plies%2===1} : null;
}

/** Retorna null se API, vínculo, identidade ou cor não foram verificados. */
export function gameStats(match) {
  if (!match || match.result==='bye' || String(match.status||'').toLowerCase()==='bye') return null;
  if(!['ok','cache'].includes(match.lichessImport?.status))return null;
  if(!['playing','finished','manual'].includes(match.lichessDecision?.status))return null;
  const id=replayGameId(match.url), game=match.lichessGame;
  if(!id || !game || String(game.id||'').toLowerCase()!==id.toLowerCase())return null;
  const status=String(game.status||'').toLowerCase();
  const ongoing=status==='started' && match.lichessDecision?.status==='playing' && game.winner==null;
  const finished=Object.prototype.hasOwnProperty.call(FINISH_TYPES,status) &&
    ['finished','manual'].includes(match.lichessDecision?.status);
  if(!ongoing && !finished)return null;
  // Se API e Sheets discordam, a conciliação marca conflito e nada é exibido.
  const opening=game.opening && typeof game.opening==='object'?game.opening:{};
  const name=typeof opening.name==='string' && opening.name.trim() && opening.name.length<=150?
    opening.name.trim():null;
  const eco=typeof opening.eco==='string' && /^[A-E]\d{2}$/i.test(opening.eco)?opening.eco.toUpperCase():null;
  return {
    openingName:name,eco,
    moves:countChessMoves(game.moves),
    ending:finished?FINISH_TYPES[status]:null,
    ongoing,
  };
}
