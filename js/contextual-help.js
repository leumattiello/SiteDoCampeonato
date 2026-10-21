/** #12: ajuda para a próxima partida sem iniciar desafios automaticamente. */
export function contextualHelp(match,selected,players=[]) {
 if(!match||!selected||![match.white,match.black].includes(selected)||!match.black)return null;
 const opponent=match.white===selected?match.black:match.white;
 const p=players.find(x=>x.name===opponent);
 const nick=p?.lichess;
 const verified=p?.lichessValidation?.status==='valido' && typeof nick==='string' &&
   /^[A-Za-z0-9_-]{2,30}$/.test(nick) && p.lichessValidation.id?.toLowerCase()===nick.toLowerCase();
 const color=match.white===selected?'brancas':'pretas';
 const state=match.derivedStatus;
 return {opponent,color,nick:verified?nick:null,
  profile:verified?'https://lichess.org/@/'+encodeURIComponent(nick):null,
  canStart:state==='ready'&&!match.url,
  tutorial:state==='playing'?'accept':state==='ready'?'create':'create',
  message:state==='ready'
   ?'Ambos estão livres. Confira a cor das peças e crie ou aceite um desafio de correspondência de 1 dia por lance.'
   :state==='playing'?'Partida em andamento. Acompanhe-a no Lichess antes de iniciar outra.'
   :state==='future'?'Esta rodada ainda não foi liberada. Aguarde a janela permitida.':
    'Aguarde a liberação do confronto. Você pode conhecer o perfil do adversário e consultar as instruções.'};
}
