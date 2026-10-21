/** Tradução de apresentação: não modifica ECO ou classificação das honrarias. */
const families=[
 [/^sicilian defense/i,'Defesa Siciliana'],[/^italian game/i,'Abertura Italiana'],
 [/^giuoco piano/i,'Giuoco Piano'],[/^ruy lopez|^spanish game/i,'Abertura Espanhola'],
 [/^english opening/i,'Abertura Inglesa'],[/^french defense/i,'Defesa Francesa'],
 [/^petrov.s defense|^petroff defense|^russian game/i,'Defesa Russa (Petrov)'],
 [/^king.s indian defense/i,'Defesa Índia do Rei'],[/^queen.s indian defense/i,'Defesa Índia da Dama'],
 [/^scandinavian defense/i,'Defesa Escandinava'],[/^dutch defense/i,'Defesa Holandesa'],
 [/^vienna game/i,'Abertura Vienense'],[/^scotch game/i,'Abertura Escocesa'],
 [/^london system/i,'Sistema Londres'],[/^queen.s gambit declined/i,'Gambito da Dama Recusado'],
 [/^queen.s gambit accepted/i,'Gambito da Dama Aceito'],[/^queen.s gambit/i,'Gambito da Dama'],
 [/^king.s gambit/i,'Gambito do Rei'],[/^caro-kann defense/i,'Defesa Caro-Kann'],
 [/^pirc defense/i,'Defesa Pirc'],[/^modern defense/i,'Defesa Moderna'],
 [/^nimzo-indian defense/i,'Defesa Nimzoíndia'],[/^grünfeld defense|^grunfeld defense/i,'Defesa Grünfeld'],
 [/^slav defense/i,'Defesa Eslava'],[/^semi-slav defense/i,'Defesa Semieslava'],
 [/^alekhine defense/i,'Defesa Alekhine'],[/^four knights game/i,'Abertura dos Quatro Cavalos'],
 [/^three knights opening/i,'Abertura dos Três Cavalos'],[/^philidor defense/i,'Defesa Philidor'],
 [/^bishop.s opening/i,'Abertura do Bispo'],[/^center game/i,'Abertura Central'],
 [/^king.s pawn game/i,'Abertura do Peão do Rei'],[/^queen.s pawn game/i,'Abertura do Peão da Dama'],
 [/^réti opening|^reti opening/i,'Abertura Réti'],[/^bird opening/i,'Abertura Bird'],
 [/^benoni defense/i,'Defesa Benoni'],[/^benko gambit/i,'Gambito Benko'],
 [/^bogo-indian defense/i,'Defesa Bogoíndia'],[/^catalan opening/i,'Abertura Catalã'],
 [/^trompowsky attack/i,'Ataque Trompowsky'],[/^colle system/i,'Sistema Colle'],
 [/^evans gambit/i,'Gambito Evans'],[/^fried liver attack/i,'Ataque Fegatello'],
 [/^blackmar-diemer gambit/i,'Gambito Blackmar-Diemer'],[/^danish gambit/i,'Gambito Dinamarquês'],
 [/^polish opening/i,'Abertura Polonesa'],[/^hungarian opening/i,'Abertura Húngara'],
 [/^old indian defense/i,'Defesa Índia Antiga'],[/^king.s indian attack/i,'Ataque Índio do Rei'],
 [/^english defense/i,'Defesa Inglesa'],[/^owen.s defense/i,'Defesa Owen'],
];
const terms=[
 [/variation/gi,'Variante'],[/attack/gi,'Ataque'],[/defense/gi,'Defesa'],
 [/gambit/gi,'Gambito'],[/accepted/gi,'Aceito'],[/declined/gi,'Recusado'],
 [/exchange/gi,'Trocas'],[/classical/gi,'Clássica'],[/modern/gi,'Moderna'],
 [/advanced?/gi,'Avanço'],[/main line/gi,'Linha principal'],
 [/closed/gi,'Fechada'],[/open/gi,'Aberta'],[/accelerated/gi,'Acelerada'],
 [/delayed/gi,'Adiada'],[/four knights/gi,'Quatro Cavalos'],
 [/two knights/gi,'Dois Cavalos'],[/three knights/gi,'Três Cavalos'],
 [/knight/gi,'Cavalo'],[/bishop/gi,'Bispo'],[/queen/gi,'Dama'],
 [/king/gi,'Rei'],[/early/gi,'Precoce'],[/quiet/gi,'Tranquila'],
];
export function openingNamePt(name){
 if(typeof name!=='string'||!name.trim())return null;
 let out=name.trim();
 for(const [pattern,translation] of families){
  if(pattern.test(out)){out=out.replace(pattern,translation);break;}
 }
 // Nomes próprios de variantes são preservados para não inventar traduções.
 const segments=out.split(/(:\s*)/);
 for(let i=2;i<segments.length;i+=2){
  const part=segments[i].trim();
  // Em português, o tipo precede o nome: "Variante Najdorf".
  const named=/^(.+?) (Variation|Attack|Defense|Gambit)$/i.exec(part);
  if(named){
    const kind={variation:'Variante',attack:'Ataque',defense:'Defesa',gambit:'Gambito'}[named[2].toLowerCase()];
    if(/^Two Knights$/i.test(named[1]))segments[i]='Defesa dos Dois Cavalos';
    else if(/^Fried Liver$/i.test(named[1]))segments[i]='Ataque Fegatello';
    else segments[i]=kind+' '+named[1];
  } else {
    for(const [pattern,translation] of terms)segments[i]=segments[i].replace(pattern,translation);
  }
 }
 return segments.join('');
}
