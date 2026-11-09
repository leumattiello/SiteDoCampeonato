/** Honrarias regionais por famílias de abertura verificadas pelo Lichess.
 * Vetores geográficos estilizados em 64×64, sem imagens remotas.
 * Silhuetas de Inglaterra/Escócia são recortes cartográficos estilizados.
 */
export const REGION_MAPS=Object.freeze({
sicily:"M45.5,33.7 L47.6,38.1 L44.6,45.4 L33.7,40.1 L6.5,31.2 L8.5,23.9 L25.2,25.2 L50.6,22.4 L45.5,33.7 Z M53,27 L54.6,18.6 L57.5,18.6 L57.5,26.2 L53,27 Z",
italy:"M44.6,47.8 L42.8,54.8 L31.2,50.5 L31.8,48.3 L44.6,47.8 Z M17.2,34.9 L19.8,37.9 L19.2,43.7 L15.4,44.9 L13.8,43.7 L12.6,36 L17.2,34.9 Z M30,9.2 L37.2,11.8 L37.7,15.8 L30.8,16.7 L31.9,22.3 L43,31.6 L46.4,31.6 L46.2,33.4 L57.5,39.4 L56.7,40.9 L50.5,38.2 L48.7,41 L51.8,42.6 L51.3,44.9 L47.2,48.9 L45.3,49.2 L47.2,44.6 L44.2,39.9 L25.8,29.9 L21.5,23.1 L15.8,21.1 L9.5,24.1 L10,22.2 L7.6,21.6 L6.9,14.1 L16.1,13.9 L17.1,12.1 L22.2,11.9 L22.6,10.1 L30,9.2 Z",
spain:"M8,23.7 L6.5,19 L12.3,16 L37.2,17.3 L46.4,20.8 L57.3,21.2 L57.5,23.6 L48.4,27.2 L43.9,34.2 L45.5,36.5 L42.2,41 L36.2,45 L27.1,45 L23,48 L14.1,41.9 L16.2,39.3 L14.3,32.9 L16,32.6 L16.9,26.8 L18.8,25.7 L17.7,23.6 L12.2,24 L11.1,22 L8,23.7 Z",
england:"M14.1,24.9 L6.5,23.8 L6.5,17.9 L11.1,17.7 L17,21.1 L14.1,24.9 Z M42.1,20.7 L45.9,21.6 L50.8,30.1 L57.5,31.1 L56.8,34.6 L54,36.3 L56.2,39.1 L51.3,42 L31.9,42.4 L28.3,45 L16.4,45.3 L24.5,39.6 L29.4,38.4 L20.8,37.4 L19.2,35.2 L25,33.5 L21.9,30.6 L23,27 L31.2,27.5 L32,24.3 L28.2,20.8 L21.5,19.8 L20.8,17.6 L39.7,17.6 L42.1,20.7 Z",
india:"M23.4,8 L25.2,10 L24.9,14.9 L29.1,17.2 L27.3,19.7 L32.9,22.2 L41.2,23.8 L42.4,20.9 L44.1,23.3 L48.1,23.1 L47.5,21.5 L55.3,18.5 L57.5,21.3 L53.5,23.5 L49.2,31.5 L48.3,28.7 L46.6,28.9 L48.7,26.3 L42.1,23.8 L42.6,32.1 L39.3,32.4 L38.5,34.8 L27.7,42.2 L26.9,51.8 L22.8,56 L15.8,42 L14.3,32.7 L10.5,33.5 L6.5,28.6 L11.5,27.4 L8.8,22.9 L12.8,21.2 L18.9,13.6 L16.2,10 L23.4,8 Z",
france:"M56.9,43.7 L56.3,49.6 L53.8,46.4 L56.9,43.7 Z M36,17.2 L52.2,22.1 L50,27.1 L44.8,30.3 L44.8,32 L47.7,33 L49.8,41.3 L46.6,43.3 L34.2,43.5 L33.8,45.7 L29.6,46.1 L17.6,43.6 L16.2,42.2 L18.1,40.1 L18.7,32.9 L12.4,27.3 L6.9,25.9 L6.5,23.3 L17.2,23.4 L16.1,19.3 L19.5,20.9 L27.9,18.1 L29,15.1 L32.1,14.4 L36,17.2 Z",
russia:"M33.1,26.1 L41.2,28.2 L56.1,28.5 L57.5,30.1 L52,31.9 L49.7,34.8 L49.5,32.9 L52.3,31 L44.9,32.1 L42.5,33.6 L44.6,34.1 L44.2,35.7 L41.1,37.7 L42.5,35.7 L39.2,34.1 L26.6,35.4 L20.5,33.3 L13.3,35 L13.4,38.1 L9.6,36.7 L10.8,35.3 L6.5,32.7 L7.9,30.9 L6.9,28.8 L11.1,29.3 L8.5,29.6 L9.7,30.5 L11.9,28.9 L20.3,29.1 L20.7,27.5 L21.6,29.7 L22.3,27.5 L33.1,26.1 Z",
austria:"M57.4,26.1 L57,32.1 L53.2,32.2 L54.5,33.6 L50.9,39.2 L41.5,40.9 L26.2,38.6 L24.7,36.2 L17.2,38.7 L6.5,36.3 L7.3,33.4 L9.3,33.1 L12.8,34.9 L13.7,33.1 L24.6,32.2 L30,33.8 L29.6,28.2 L34.5,24.2 L39.5,26.4 L45.8,23.1 L54.2,24.9 L57.4,26.1 Z",
scotland:"M29.5,25 L53,23.5 L50.1,32.5 L40.1,42.5 L51.6,43.2 L57.5,51 L19.6,51 L22.4,47.6 L18.7,44.6 L12.7,49.8 L12.1,39.1 L6.5,33.5 L10.5,22 L19.1,13 L41.4,13 L29.5,25 Z",
scandinavia:"M18,45.8 L20.8,45.2 L21.4,46.1 L20.3,47.7 L18,45.8 Z M16.1,47.4 L13.4,47.4 L12.5,44.3 L17.3,42 L18,44.5 L16.1,47.4 Z M31.4,32.3 L30,35 L33.3,37.5 L29.5,40.1 L27.6,45.2 L24.2,46.5 L21.9,46.6 L16.9,38.7 L10.5,41.3 L7.1,38.3 L6.5,33.8 L34,18.6 L44.3,16.3 L57.5,17.4 L55,17.9 L57.1,19.1 L53.8,19.9 L50.6,17.9 L44.8,20.9 L36.9,20 L42.5,22.2 L43.2,26 L31.4,32.3 Z",
netherlands:"M43.8,13.7 L55,14.1 L57.5,18.7 L54.1,31 L50.7,36.1 L42.6,36.1 L44.9,50.3 L28.9,41.2 L16.4,44 L6.5,43 L13.5,39.2 L25.3,19.4 L43.8,13.7 Z"
});
/* Giuoco Piano é subconjunto da Italiana: texto específico prevalece
   sobre faixas ECO largas que também contêm outras variantes. */
export const REGIONS=Object.freeze([
 {key:'sicily',name:'Rei da Sicília',label:'Sicília',family:'Defesa Siciliana',range:['B',20,99],namePattern:/\bsicilian\b/},
 {key:'italy',name:'Rei da Itália',label:'Itália',family:'Abertura Italiana (inclui Giuoco Piano, Dois Cavalos e Fegatello)',range:['C',50,59],namePattern:/\b(?:italian (?:game|opening)|giuoco pian(?:o|issimo)|two knights defen[cs]e|fried liver attack|fegatello(?: attack)?|evans gambit)\b/},
 {key:'spain',name:'Rei da Espanha',label:'Espanha',family:'Ruy Lopez / Abertura Espanhola',range:['C',60,99],namePattern:/\b(?:ruy lopez|spanish (?:game|opening))\b/},
 {key:'england',name:'Rei da Inglaterra',label:'Inglaterra',family:'Abertura Inglesa',range:['A',10,39],namePattern:/\benglish opening\b/},
 {key:'india',name:'Rei das Índias',label:'Índias',family:'Defesa Índia do Rei / Índia da Dama',ranges:[['E',12,19],['E',60,99]],namePattern:/\b(?:king|queen)s? indian\b(?!\s+attack)/},
 {key:'france',name:'Rei da França',label:'França',family:'Defesa Francesa',range:['C',0,19],namePattern:/\bfrench defen[cs]e\b/},
 {key:'russia',name:'Tzar da Rússia',label:'Rússia',family:'Defesa Petrov / Jogo Russo',range:['C',42,43],namePattern:/\b(?:petrov|petroff)(?:s)?(?:\s+defen[cs]e)?\b|\brussian game\b/},
 {key:'austria',name:'Arquiduque da Áustria',label:'Áustria',family:'Abertura Vienense',range:['C',25,29],namePattern:/\bvienna game\b/},
 {key:'scotland',name:'Lorde da Escócia',label:'Escócia',family:'Abertura Escocesa',range:['C',45,45],namePattern:/\bscotch game\b/},
 {key:'scandinavia',name:'Imperador da Escandinávia',label:'Escandinávia',family:'Defesa Escandinava',range:['B',1,1],namePattern:/\bscandinavian defen[cs]e\b/},
 {key:'netherlands',name:'Conde da Holanda',label:'Holanda',family:'Defesa Holandesa',range:['A',80,99],namePattern:/\bdutch defen[cs]e\b/}
]);
function normalizedName(value){
 if(typeof value!=='string')return '';
 return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/['’]/g,'').toLowerCase().trim();
}
export function matchesRegion(region,stats){
 if(!region||!stats||typeof stats!=='object')return false;
 const normalized=normalizedName(stats.openingName);
 if(normalized) return region.namePattern.test(normalized);
 const eco=typeof stats.eco==='string'?stats.eco.toUpperCase():null;
 if(!eco||!/^[A-E]\d{2}$/.test(eco))return false;
 return (region.ranges||[region.range]).some(([prefix,min,max])=>eco[0]===prefix&&Number(eco.slice(1))>=min&&Number(eco.slice(1))<=max);
}
