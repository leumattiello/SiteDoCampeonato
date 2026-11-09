/**
 * Reinos do Xadrez — melhorias #3 e #4: resultados e datas via Apps Script.
 *
 * VINCULAR ESTE PROJETO À PLANILHA DE BACKUP PRIMEIRO.
 * Por padrão, NENHUMA função escreve na planilha.
 *
 * Script Properties (Configurações do projeto > Propriedades do script):
 * - LICHESS_API_TOKEN: token pessoal Lichess de leitura (não publicar)
 * - PLANILHA_ID_AUTORIZADA: ID EXATO da planilha que este script pode editar
 * - GRAVACAO_HABILITADA: SIM (autoriza as funções de escrita)
 * - PERMITIR_PLANILHA_ORIGINAL: SIM (segundo bloqueio na produção)
 * - EXECUCAO_AUTOMATICA_HABILITADA: SIM (somente após aprovação)
 *
 * IMPORTANTE: nunca configurar acionador para aplicarResultados.
 * O acionador temporal, quando aprovado, chama sincronizarAutomaticamente.
 */

const REINOS_CONFIG = Object.freeze({
  ABA_CONFRONTOS: '2',
  ABA_JOGADORES: 'Jogadores',
  ABA_AUDITORIA: '_AuditoriaLichess',
  ABA_AUDITORIA_VINCULOS: '_AuditoriaVinculosLichess',
  ID_PLANILHA_ORIGINAL: '1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc',
  MAX_CONSULTAS: 80,
  MAX_CONSULTAS_DESCOBERTA: 8,
  PAUSA_MS: 1100,
  CURSOR_DESCOBERTA: 'DESCOBERTA_ULTIMO_CONFRONTO_V1',
  PAUSA_DESCOBERTA: 'DESCOBERTA_PAUSA_ATE_V1'
});

/** Execução manual, somente com propriedades de segurança preenchidas. */
function aplicarResultados() {
  return executarSincronizacao_(true);
}

/** Para acionadores de tempo: simula até receber habilitações explícitas. */
function sincronizarAutomaticamente() {
  const props = PropertiesService.getScriptProperties();
  const habilitado = props.getProperty('EXECUCAO_AUTOMATICA_HABILITADA') === 'SIM';
  console.log('Reinos: execução automática ' + (habilitado ? 'habilitada' : 'em simulação'));
  // Sempre descobrir ANTES de conciliar resultados/status/datas, para
  // integrar vínculos recém-confirmados na mesma execução.
  const pausaAte = Number(props.getProperty(REINOS_CONFIG.PAUSA_DESCOBERTA) || 0);
  if (Date.now() < pausaAte) {
    console.log('Reinos: Lichess em pausa após resposta de proteção; sem novas requisições.');
    return {descoberta:{status:'em_pausa'}, consolidacao:{status:'adiada'}};
  }
  const descoberta = descobrirPartidas_(habilitado, {automatica:true});
  if (descoberta.interrompida) {
    console.log('Reinos: consolidação adiada para evitar consultas após erro da API.');
    return {descoberta:descoberta, consolidacao:{status:'adiada'}};
  }
  const consolidacao = executarSincronizacao_(habilitado);
  return Object.assign({}, consolidacao, {descoberta:descoberta});
}

/**
 * Acesso a uma planilha vinculada ao projeto; a origem é deliberadamente fixa.
 * A vinculação elimina o risco de um ID fornecido por terceiros redirecionar escrita.
 */
function obterAmbiente_(solicitouEscrita) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Abra este projeto por Extensões > Apps Script dentro da planilha.');
  const props = PropertiesService.getScriptProperties();
  const id = spreadsheet.getId();
  const original = id === REINOS_CONFIG.ID_PLANILHA_ORIGINAL;
  if (solicitouEscrita) {
    if (props.getProperty('GRAVACAO_HABILITADA') !== 'SIM') {
      throw new Error('Gravação desabilitada. Configure GRAVACAO_HABILITADA=SIM para autorizar.');
    }
    if (!props.getProperty('PLANILHA_ID_AUTORIZADA') || props.getProperty('PLANILHA_ID_AUTORIZADA') !== id) {
      throw new Error('PLANILHA_ID_AUTORIZADA não corresponde à planilha vinculada.');
    }
    if (original && props.getProperty('PERMITIR_PLANILHA_ORIGINAL') !== 'SIM') {
      throw new Error('Proteção da planilha original: falta PERMITIR_PLANILHA_ORIGINAL=SIM.');
    }
  }
  return {spreadsheet: spreadsheet, props: props, id: id, original: original};
}


/** Linha congelada: finalizada + todos os campos A:H preenchidos.
 * Zero é um valor preenchido. Uma linha incompleta continua atualizável.
 * Aceita a variante "Finalizada" além de "Finalizado".
 */
function linhaFinalizadaCompleta_(row) {
  return ['finalizado','finalizada'].includes(normalizarNome_(row[4])) &&
    Array.from({length:8},(_,i)=>i).every(i=>!celulaVazia_(row[i]));
}

/** O Lichess é a fonte principal de B/C, E, G/H.
 * Quando a API não informa data de criação/último lance, mantemos a data
 * existente (não inventamos um valor). Para jogo iniciado, limpamos H e
 * qualquer placar manual anterior, pois não há resultado homologado.
 */
function planoAtualizacaoLichess_(row,game,timezone) {
  const result=placarLichess_(game);
  const estado=statusLichess_(game,result);
  if(!estado)return null;
  const datas=datasLichess_(game,result!==null);
  const desired=row.slice(0,8);
  desired[1]=result?result[0]:'';
  desired[2]=result?result[1]:'';
  desired[4]=estado;
  if(datas.inicio)desired[6]=datas.inicio;
  if(estado==='Em andamento')desired[7]='';
  else if(datas.fim)desired[7]=datas.fim;
  const changed=[];
  for(const i of [1,2,4,6,7]) {
    const before=row[i],after=desired[i];
    const equal=(i===6||i===7) && !celulaVazia_(before) && !celulaVazia_(after)
      ? mesmaDataCalendario_(before,after,timezone)
      : valorSnapshotIgual_(before,after);
    if(!equal)changed.push(i);
  }
  return {desired,changed,result,estado};
}

/** Grava apenas campos cuja fonte Lichess fornece estado comprovado.
 * Revalida identidade, link e a exceção de linha completa imediatamente
 * antes de escrever; revisões humanas em outras células podem ser corrigidas.
 */
function aplicarPlanoLichess_(sheet,rowNumber,expected,gameId,plano,spreadsheet) {
  const current=sheet.getRange(rowNumber,1,1,8).getValues()[0];
  if(linhaFinalizadaCompleta_(current))return false;
  if(normalizarNome_(current[0])!==normalizarNome_(expected[0]) ||
     normalizarNome_(current[3])!==normalizarNome_(expected[3]) ||
     extrairIdPublico_(current[5])!==gameId)return false;
  const regenerated=planoAtualizacaoLichess_(current,plano.game,spreadsheet.getSpreadsheetTimeZone());
  if(!regenerated || !regenerated.changed.length)return false;
  const before=current.slice(0,8), updated=regenerated.desired;
  for(const i of regenerated.changed){
    const cell=sheet.getRange(rowNumber,i+1);
    if((i===6||i===7)&&updated[i] instanceof Date)
      cell.setValue(updated[i]).setNumberFormat('dd/MM/yyyy');
    else cell.setValue(updated[i]);
  }
  SpreadsheetApp.flush();
  const after=sheet.getRange(rowNumber,1,1,8).getValues()[0];
  if(regenerated.changed.some(i=>i===6||i===7 ?
      (!celulaVazia_(updated[i]) && !mesmaDataCalendario_(after[i],updated[i],spreadsheet.getSpreadsheetTimeZone())) ||
      (celulaVazia_(updated[i]) && !celulaVazia_(after[i])) :
      !valorSnapshotIgual_(after[i],updated[i]))) {
    throw new Error('Linha '+rowNumber+': resultado escrito mas verificação falhou; revisar planilha.');
  }
  try {
    let audit=spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA);
    if(!audit){
      audit=spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA);
      audit.appendRow(['Data UTC','Aba','Linha','ID jogo','Brancas','Pretas',
        'Antes B','Antes C','Antes E','Depois B','Depois C','Depois E']);
    }
    audit.appendRow([new Date().toISOString(),REINOS_CONFIG.ABA_CONFRONTOS,rowNumber,
      gameId,before[0],before[3],before[1],before[2],before[4],
      after[1],after[2],after[4]]);
  }catch(e){
    console.error('Reinos: linha '+rowNumber+' alterada, mas a auditoria falhou.');
  }
  return true;
}

function executarSincronizacao_(solicitouEscrita) {
  const env=obterAmbiente_(solicitouEscrita);
  let lock=null;
  if(solicitouEscrita){
    lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))throw new Error('Outra sincronização está em andamento.');
  }
  try {
    const sheet=env.spreadsheet.getSheetByName(REINOS_CONFIG.ABA_CONFRONTOS);
    const playerSheet=env.spreadsheet.getSheetByName(REINOS_CONFIG.ABA_JOGADORES);
    if(!sheet||!playerSheet)throw new Error('Faltam as abas 2 e/ou Jogadores.');
    const grid=sheet.getDataRange().getValues();
    const preview=grid.map(r=>r.slice());
    const nicks=mapaJogadores_(playerSheet.getDataRange().getValues());
    const indices=contarIdsJogo_(grid);
    const token=env.props.getProperty('LICHESS_API_TOKEN');
    if(!token||/[\r\n]/.test(token))
      throw new Error('Configure LICHESS_API_TOKEN válido nas Propriedades do script.');
    const tz=env.spreadsheet.getSpreadsheetTimeZone();
    const resumo={modo:solicitouEscrita?'GRAVACAO':'SIMULACAO',
      candidatos:0,aplicados:0,candidatosDatas:0,aplicadosDatas:0,
      candidatosStatus:0,aplicadosStatus:0,conflitosStatus:0,
      aguardandoCandidatos:0,aguardandoAplicados:0,aguardandoRevertidos:0,
      aguardandoConflitos:0,elegibilidadeIgnorada:null,
      consultas:0,erros:0,ignorados:0,divergencias:0,congelados:0,atualizados:0};
    const consultados={};
    let interrompida=false;
    for(let idx=0;idx<grid.length;idx++){
      const row=grid[idx],rowNumber=idx+1;
      const white=normalizarNome_(row[0]),black=normalizarNome_(row[3]);
      if(!white||!black||white===black||/^rodada\s+\d+$/.test(white)||
         normalizarNome_(row[4])==='bye')continue;
      if(linhaFinalizadaCompleta_(row)){resumo.congelados++;continue;}
      const id=extrairIdPublico_(row[5]);
      if(!id){resumo.ignorados++;continue;}
      if(indices[id.toLowerCase()]!==1){
        resumo.divergencias++;
        console.log('Reinos: linha '+rowNumber+': ID vinculado em mais de um confronto.');
        continue;
      }
      const w=nicks[white],b=nicks[black];
      if(!w||!b||w===b){resumo.divergencias++;continue;}
      if(!Object.prototype.hasOwnProperty.call(consultados,id)){
        if(resumo.consultas>=REINOS_CONFIG.MAX_CONSULTAS){interrompida=true;break;}
        resumo.consultas++;
        consultados[id]=consultarPartida_(id,token);
        Utilities.sleep(REINOS_CONFIG.PAUSA_MS);
      }
      const lookup=consultados[id];
      if([401,403,429].includes(lookup.httpStatus)){
        interrompida=true;resumo.erros++;
        console.log('Reinos: HTTP '+lookup.httpStatus+
          ', interrompendo as consultas ao Lichess.');
        if(solicitouEscrita)env.props.setProperty(REINOS_CONFIG.PAUSA_DESCOBERTA,
          String(Date.now()+(lookup.httpStatus===429?3600000:1800000)));
        break;
      }
      if(lookup.error){resumo.erros++;continue;}
      const game=lookup.game;
      if(String(game.id||'').toLowerCase()!==id.toLowerCase() ||
         idJogadorLichess_(game.players&&game.players.white)!==w ||
         idJogadorLichess_(game.players&&game.players.black)!==b ||
         (game.perf && String(game.perf).toLowerCase()!=='correspondence') ||
         (game.daysPerTurn!=null && game.daysPerTurn!==1)){
        resumo.divergencias++;
        console.log('Reinos: linha '+rowNumber+': metadados de jogo divergentes; ignorado.');
        continue;
      }
      const plano=planoAtualizacaoLichess_(row,game,tz);
      if(!plano||!plano.changed.length){resumo.ignorados++;continue;}
      const mudouResultado=plano.changed.some(i=>i===1||i===2);
      const mudouStatus=plano.changed.includes(4);
      const mudouDatas=plano.changed.some(i=>i===6||i===7);
      if(mudouResultado)resumo.candidatos++;
      if(mudouStatus)resumo.candidatosStatus++;
      if(mudouDatas)resumo.candidatosDatas++;
      console.log('Reinos: linha '+rowNumber+' ('+row[0]+' x '+row[3]+'): '+
        plano.changed.map(i=>'ABCDEFGH'[i]).join(',')+' <- Lichess'+
        (solicitouEscrita?'':' [SIMULAÇÃO]'));
      if(solicitouEscrita){
        if(aplicarPlanoLichess_(sheet,rowNumber,row,id,
            Object.assign({game},plano),env.spreadsheet)){
          resumo.atualizados++;
          if(mudouResultado)resumo.aplicados++;
          if(mudouStatus)resumo.aplicadosStatus++;
          if(mudouDatas)resumo.aplicadosDatas++;
        }else resumo.divergencias++;
      }else{
        preview[idx]=plano.desired;
      }
    }
    if(!interrompida){
      const ref=rodadaReferencia_(env.spreadsheet);
      if(ref===null)resumo.elegibilidadeIgnorada='Config.rodada_atual ausente ou inválida';
      else sincronizarElegibilidade_(sheet,solicitouEscrita?
          sheet.getDataRange().getValues():preview,ref,solicitouEscrita,
          env.spreadsheet,resumo,{},{}); // apenas estado/rodada; sem proteção de revisão
    }else resumo.elegibilidadeIgnorada='Consultas interrompidas; recalcular depois';
    console.log('Reinos: resumo '+JSON.stringify(resumo));
    return resumo;
  }finally{if(lock)lock.releaseLock();}
}

function celulaVazia_(value) {
  return value === '' || value === null || value === undefined;
}

function nomeNormalizado_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function normalizarNome_(value) {
  return nomeNormalizado_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mapaJogadores_(rows) {
  if (!rows.length || normalizarNome_(rows[0][0]) !== 'nome' ||
      !normalizarNome_(rows[0][1]).includes('nick')) {
    throw new Error('A aba Jogadores deve começar com Nome | Nick Lichess.');
  }
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    const name = normalizarNome_(rows[i][0]);
    const nick = nomeNormalizado_(rows[i][1]).toLowerCase();
    if (!name) continue;
    if (!/^[a-z0-9_-]{1,30}$/.test(nick) || result[name] !== undefined) {
      result[name] = null; // evita utilizar nicks ausentes ou nomes repetidos.
    } else result[name] = nick;
  }
  return result;
}

function extrairIdPublico_(link) {
  const value = nomeNormalizado_(link);
  const match = /^https:\/\/(?:www\.)?lichess\.org\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?\/?(?:[?#].*)?$/i.exec(value);
  return match ? match[1] : null; // os 4 caracteres privados NUNCA vão à API ou ao log.
}

function contarIdsJogo_(rows) {
  const counts = {};
  for (const row of rows) {
    if (normalizarNome_(row[4]).toLowerCase() === 'bye') continue;
    const id = extrairIdPublico_(row[5]);
    if (id) counts[id.toLowerCase()] = (counts[id.toLowerCase()] || 0) + 1;
  }
  return counts;
}

function consultarPartida_(gameId, token) {
  try {
    const response = UrlFetchApp.fetch(
      `https://lichess.org/game/export/${encodeURIComponent(gameId)}?moves=false&opening=false&clocks=false&evals=false`,
      {method: 'get', headers: {'Accept': 'application/json', 'Authorization': `Bearer ${token}`},
       muteHttpExceptions: true, followRedirects: false}
    );
    const code = response.getResponseCode();
    if (code !== 200) return {error: `HTTP ${code} ao consultar Lichess`, httpStatus: code};
    const game = JSON.parse(response.getContentText());
    if (!game || typeof game !== 'object' || Array.isArray(game)) return {error: 'JSON inválido'};
    return {game: game};
  } catch (error) {
    // NÃO imprimir mensagens da exceção nem headers: podem incluir credenciais.
    return {error: 'Falha de rede ou resposta inválida da API'};
  }
}

function idJogadorLichess_(player) {
  if (!player || typeof player !== 'object') return null;
  const ident = player.user && player.user.id ? player.user.id : player.userId;
  return typeof ident === 'string' && ident ? ident.toLowerCase() : null;
}

function placarLichess_(game) {
  const status = String(game.status || '').toLowerCase();
  if ((status === 'draw' || status === 'stalemate') && !game.winner) return [0.5, 0.5];
  const finais = ['mate', 'resign', 'timeout', 'outoftime', 'cheat', 'variantend', 'unknownfinish'];
  if (!finais.includes(status)) return null;
  if (game.winner === 'white') return [1, 0];
  if (game.winner === 'black') return [0, 1];
  return null;
}

/**
 * Referências temporais da API Lichess em milissegundos UTC.
 * createdAt = CRIAÇÃO da partida, não primeiro lance.
 * lastMoveAt = ÚLTIMO LANCE, não necessariamente fim exato (ex.: timeout).
 * Por segurança, G só é preenchida se o jogo começou ou finalizou.
 * H só é preenchida quando o resultado final é comprovado.
 */
function dataApi_(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) ||
      timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now() + 86400000) return null;
  const result = new Date(timestamp);
  return Number.isNaN(result.getTime()) ? null : result;
}

function datasLichess_(game, resultadoFinalConfirmado) {
  const status = String(game.status || '').toLowerCase();
  if (status !== 'started' && !resultadoFinalConfirmado) return {inicio: null, fim: null};
  const inicio = dataApi_(game.createdAt);
  let fim = resultadoFinalConfirmado ? dataApi_(game.lastMoveAt) : null;
  if (inicio && fim && fim.getTime() < inicio.getTime()) fim = null;
  return {inicio: inicio, fim: fim};
}

function dataCalendario_(value, timezone) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  const t = nomeNormalizado_(value);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (br) return br[3] + '-' + br[2].padStart(2, '0') + '-' + br[1].padStart(2, '0');
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return iso ? iso[0] : null;
}

function mesmaDataCalendario_(manual, lichess, timezone) {
  const a = dataCalendario_(manual, timezone);
  const b = dataCalendario_(lichess, timezone);
  return a !== null && a === b;
}

/** A comparação de snapshots deve respeitar Date (getValues gera novos objetos Date). */
function valorSnapshotIgual_(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return valoresIguais_(a, b);
}

function valoresIguais_(a, b) {
  return a === b || (celulaVazia_(a) && celulaVazia_(b));
}

/**
 * #11 ampliada: busca ativa de confrontos sem URL (F) na planilha.
 * Independente da sincronização #3/#4 e protegida pelas MESMAS propriedades.
 * Só vincula partidas públicas em correspondência de um dia, com contas e
 * cores idênticas e UMA única candidata por confronto.
 */
/** Execução manual opcional da descoberta; a função agendada já a executa. */
function aplicarDescoberta() { return descobrirPartidas_(true); }

/** Consulta apenas metadados de uma partida pública para confirmar o prazo.
 * A listagem por usuário pode omitir daysPerTurn, mesmo em correspondência.
 */
function consultarDetalhesPublicos_(gameId) {
  if (!/^[a-zA-Z0-9]{8}$/.test(String(gameId||''))) return null;
  try {
    const response=UrlFetchApp.fetch(
      'https://lichess.org/game/export/'+encodeURIComponent(gameId)+
      '?moves=false&opening=false&clocks=false&evals=false',
      {headers:{'Accept':'application/json'},muteHttpExceptions:true,followRedirects:false}
    );
    if(response.getResponseCode()!==200)return null;
    const game=JSON.parse(response.getContentText());
    return game&&typeof game==='object'&&game.id===gameId?game:null;
  }catch(e){return null;}
}

function jogosPublicosPorDupla_(nick, adversario) {
  // Com filtros extras (perfType/since/sort), o endpoint retornou HTTP 200
  // com zero jogos para um confronto público confirmado. Buscar somente
  // pela dupla e aplicar as restrições de modalidade, data, estado, tempo
  // por lance, jogadores e cores localmente em descobrirPartidas_.
  // A consulta continua limitada a 80 registros, sem lances/relógios/avaliações.
  const params = ['vs='+encodeURIComponent(adversario),'max=80',
    'ongoing=true','finished=true','moves=false','clocks=false',
    'evals=false'].join('&');
  const endpoint = 'https://lichess.org/api/games/user/'+encodeURIComponent(nick)+'?'+params;
  try {
    const response = UrlFetchApp.fetch(endpoint, {
      headers: {'Accept':'application/x-ndjson'},muteHttpExceptions:true,followRedirects:false
    });
    const status=response.getResponseCode();
    if (status!==200) return {status:status,jogos:[]};
    const txt=response.getContentText();
    if (txt.length>950000) return {status:413,jogos:[]};
    const jogos=txt.split(/\r?\n/).filter(Boolean).slice(0,80).map(line=>JSON.parse(line));
    return {status:200,jogos:jogos.filter(g=>g && typeof g==='object')};
  } catch(e) {return {status:0,jogos:[]};}
}
/**
 * Fallback para jogos ativos que não aparecem na exportação pública.
 * Só usa dados da conta se o token pertencer a um jogador cadastrado.
 * Nunca devolve fullId (8 caracteres públicos + segredo), apenas gameId.
 */
function obterJogosAtivosAutenticados_(token, participantes) {
  const vazio={status:'indisponivel',owner:null,jogos:[]};
  if(!token || /[\r\n]/.test(token))return vazio;
  function obterJson(url) {
    try {
      const response=UrlFetchApp.fetch(url,{
        method:'get',headers:{'Accept':'application/json','Authorization':'Bearer '+token},
        muteHttpExceptions:true,followRedirects:false
      });
      if(response.getResponseCode()!==200)return null;
      const data=JSON.parse(response.getContentText());
      return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
    } catch(e){return null;}
  }
  const account=obterJson('https://lichess.org/api/account');
  const owner=String(account&&(account.id||account.username)||'').toLowerCase();
  if(!owner || !/^[a-z0-9_-]{2,30}$/.test(owner))return vazio;
  if(!participantes.includes(owner))return {status:'token_de_outra_conta',owner:null,jogos:[]};
  const active=obterJson('https://lichess.org/api/account/playing?nb=50');
  if(!active || !Array.isArray(active.nowPlaying))
    return {status:'jogos_ativos_indisponiveis',owner,jogos:[]};
  // Não carregar FEN, últimos lances, fullId ou dados de jogos não pertencentes à dupla.
  const jogos=active.nowPlaying.map(x=>({
    gameId:String(x.gameId||''),color:x.color,
    opponentId:String(x.opponent&&x.opponent.id||'').toLowerCase(),
    perf:String(x.perf||x.speed||'').toLowerCase()
  })).filter(x=>/^[A-Za-z0-9]{8}$/.test(x.gameId));
  return {status:'ok',owner,jogos};
}
function inicioBuscaVinculos_(grid) {
  const datas=[];
  for(const row of grid) {
    const value=row[6];
    if(value instanceof Date && !isNaN(value.getTime())) datas.push(value.getTime());
  }
  // Somente partidas da edição atual: última janela fundamentada em G.
  if(!datas.length)return null;
  return Math.min(...datas)-14*86400000;
}
function partidaElegivelVinculo_(g, esperadoWhite, esperadoBlack, desde) {
  if(!g || !/^[a-zA-Z0-9]{8}$/.test(String(g.id||'')))return false;
  if(String(g.perf||g.speed||'').toLowerCase()!=='correspondence')return false;
  if(g.daysPerTurn!==1)return false; // sem comprovação de 1 dia: somente sugestão
  if(!Number.isFinite(g.createdAt)||g.createdAt<desde||g.createdAt>Date.now()+120000)return false;
  if(['created','nostart','aborted'].includes(String(g.status||'').toLowerCase()))return false;
  return idJogadorLichess_(g.players&&g.players.white)===esperadoWhite &&
    idJogadorLichess_(g.players&&g.players.black)===esperadoBlack;
}
function gravarVinculoSeInalterado_(sheet,rowNumber,expected,game,spreadsheet) {
  const range=sheet.getRange(rowNumber,1,1,8);
  const now=range.getValues()[0];
  if(linhaFinalizadaCompleta_(now) ||
     !now[3] || normalizarNome_(now[4]).toLowerCase()==='bye' ||
     normalizarNome_(now[0])!==normalizarNome_(expected[0]) ||
     normalizarNome_(now[3])!==normalizarNome_(expected[3]) ||
     extrairIdPublico_(now[5]))return false;
  const url='https://lichess.org/'+game.id;
  sheet.getRange(rowNumber,6).setValue(url);
  SpreadsheetApp.flush();
  if(sheet.getRange(rowNumber,6).getValue()!==url)throw new Error('Falha de confirmação de vínculo; conferir linha '+rowNumber);
  try {
    let audit=spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA_VINCULOS);
    if(!audit){audit=spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA_VINCULOS);
      audit.appendRow(['UTC','Aba','Linha','Brancas','Pretas','ID público','F antes','F depois','Verificação']);}
    audit.appendRow([new Date().toISOString(),REINOS_CONFIG.ABA_CONFRONTOS,rowNumber,
      expected[0],expected[3],game.id,String(now[5]||''),url,'Cores, contas, modalidade e 1 dia confirmados; candidato único']);
  }catch(e){console.error('Reinos: vínculo aplicado mas auditoria falhou na linha '+rowNumber);}
  return true;
}
function descobrirPartidas_(escrever, opcoes) {
  opcoes=opcoes||{};
  const automatica=!!opcoes.automatica;
  const env=obterAmbiente_(escrever);
  let lock=null;
  if(escrever) {
    lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))throw new Error('Outra sincronização em andamento.');
  }
  try {
    const sheet=env.spreadsheet.getSheetByName(REINOS_CONFIG.ABA_CONFRONTOS);
    const players=env.spreadsheet.getSheetByName(REINOS_CONFIG.ABA_JOGADORES);
    if(!sheet||!players)throw new Error('Abas 2 e Jogadores obrigatórias.');
    const grid=sheet.getDataRange().getValues();
    const nicks=mapaJogadores_(players.getDataRange().getValues());
    const ids=contarIdsJogo_(grid);
    const desde=inicioBuscaVinculos_(grid);
    const resumo={modo:escrever?'GRAVACAO':'SIMULACAO',consultas:0,candidatos:0,aplicados:0,
      ambiguos:0,ignorados:0,erros:0,interrompida:false,consultaParcial:false,
      linhasAnalisadas:0,jogosRetornados:0,jogosDaDupla:0,
      descartadosPorCores:0,descartadosPorModalidade:0,descartadosPorData:0,
      prazoNaoConfirmado:0,jogosConfirmados:0,consultasDetalhes:0,semJogos:0,
      consultasConta:0,jogosAtivosConta:0,jogosDaDuplaNaConta:0,
      cursorAnterior:null,cursorNovo:null,pendentes:0};
    if(desde===null){
      console.log('Reinos: não há datas para delimitar a descoberta.');
      return resumo;
    }
    const nomes=Object.values(nicks).filter(Boolean);
    const duplicates=new Set(nomes.filter((nick,i)=>nomes.indexOf(nick)!==i));
    const vistos={};
    const keys=chavesConfrontos_(grid);
    const pendentes=[];
    for(let idx=0;idx<grid.length;idx++){
      const row=grid[idx],white=normalizarNome_(row[0]),black=normalizarNome_(row[3]);
      if(!white||!black||white===black||/^rodada\s+\d+$/.test(white)||
          normalizarNome_(row[4])==='bye')continue;
      // Só uma linha FINALIZADA e completamente preenchida é imutável.
      // Links válidos com formato reconhecido serão sincronizados no passo seguinte.
      // Links desconhecidos/ausentes continuam candidatos à descoberta.
      if(linhaFinalizadaCompleta_(row)||extrairIdPublico_(row[5])){
        resumo.ignorados++;continue;
      }
      const w=nicks[white],b=nicks[black];
      if(!w||!b||w===b||duplicates.has(w)||duplicates.has(b))continue;
      const occurrences=grid.filter(r=>normalizarNome_(r[0])===white &&
        normalizarNome_(r[3])===black).length;
      if(occurrences!==1){resumo.ambiguos++;continue;}
      pendentes.push({idx,rowNumber:idx+1,key:keys[idx],white,black,w,b});
    }
    resumo.pendentes=pendentes.length;
    const props=env.props;
    // Cursor persistente: em cada acionamento, verificar os próximos pares,
    // inclusive os antigos, os finalizados manualmente e rodadas futuras.
    let ordered=pendentes;
    if(automatica && pendentes.length) {
      const previous=props.getProperty(REINOS_CONFIG.CURSOR_DESCOBERTA);
      resumo.cursorAnterior=previous||null;
      let next=pendentes.findIndex(x=>x.key+'#'+x.rowNumber===previous)+1;
      if(!previous || next===0){
        const oldRow=Number((previous||'').split('#').pop());
        next=Number.isInteger(oldRow)&&oldRow>0?
          Math.max(0,pendentes.findIndex(x=>x.rowNumber>oldRow)):0;
      }
      next%=pendentes.length;
      ordered=pendentes.slice(next).concat(pendentes.slice(0,next));
    }
    let consultaConta=null;
    // Cursor só avança após duas respostas válidas para a mesma dupla;
    // candidaturas incertas jamais são gravadas.
    for(const pending of ordered){
      if(resumo.consultas+2>REINOS_CONFIG.MAX_CONSULTAS_DESCOBERTA)break;
      const {idx,rowNumber,white,black,w,b,key}=pending;
      const expected=Array.from({length:8},(_,i)=>grid[idx][i]===undefined?'':grid[idx][i]);
      resumo.linhasAnalisadas++;
      const games=[],returned=[];
      console.log('Reinos: verificando linha '+rowNumber+' ('+expected[0]+' x '+expected[3]+')');
      let complete=true;
      for(const [nick,opponent] of [[w,b],[b,w]]){
        const response=jogosPublicosPorDupla_(nick,opponent);
        resumo.consultas++;
        if(response.status===403||response.status===429||response.status===401){
          resumo.erros++;resumo.interrompida=true;
          console.log('Reinos: API bloqueou consulta HTTP '+response.status+
            '; interrompendo todas as novas requisições.');
          if(automatica && escrever)props.setProperty(REINOS_CONFIG.PAUSA_DESCOBERTA,
            String(Date.now()+((response.status===429)?3600000:1800000)));
          return resumo;
        }
        if(response.status!==200){
          resumo.erros++;complete=false;
          console.log('Reinos: consulta indisponível HTTP '+response.status+
            ' para linha '+rowNumber+'; não vincular.');
          break;
        }
        returned.push(nick+': '+response.jogos.length);
        games.push(...response.jogos);
        Utilities.sleep(REINOS_CONFIG.PAUSA_MS);
      }
      if(!complete){
        resumo.consultaParcial=true;
        // Não consolidar elegibilidade e resultados sob falha de rede.
        resumo.interrompida=true;
        return resumo;
      }
      console.log('Reinos: linha '+rowNumber+' jogos por perfil: '+returned.join(' / '));
      resumo.jogosRetornados+=games.length;
      if(!games.length) {
        resumo.semJogos++;
        console.log('Reinos: linha '+rowNumber+': nenhum jogo retornado na busca por dupla.');
        // Opcional, só para jogador dono do token; pode retornar partidas
        // ainda não disponibilizadas na exportação pública.
        if(consultaConta===null) {
          const participantes=Object.values(nicks).filter(Boolean);
          consultaConta=obterJogosAtivosAutenticados_(props.getProperty('LICHESS_API_TOKEN'),participantes);
          resumo.consultasConta+=consultaConta.status==='ok'?2:1;
          resumo.jogosAtivosConta=consultaConta.jogos.length;
        }
        if(consultaConta.status==='ok'&&(consultaConta.owner===w||consultaConta.owner===b)){
          const cor=consultaConta.owner===w?'white':'black';
          const outro=consultaConta.owner===w?b:w;
          for(const candidato of consultaConta.jogos.filter(j=>j.opponentId===outro &&
            j.color===cor && j.perf==='correspondence')){
            if(resumo.consultas>=REINOS_CONFIG.MAX_CONSULTAS_DESCOBERTA)break;
            resumo.jogosDaDuplaNaConta++;
            resumo.consultas++;
            const lookup=consultarPartida_(candidato.gameId,props.getProperty('LICHESS_API_TOKEN'));
            if(lookup.httpStatus===429||lookup.httpStatus===403){
              resumo.erros++;resumo.interrompida=true;return resumo;
            }
            if(lookup.game)games.push(lookup.game);
          }
        }
      }
      const validos={},inconclusivos={},evaluated=new Set();
      for(const listed of games) {
        if(!listed||!/^[A-Za-z0-9]{8}$/.test(String(listed.id||'')))continue;
        const gid=listed.id.toLowerCase();
        if(evaluated.has(gid))continue;
        evaluated.add(gid);
        if(idJogadorLichess_(listed.players&&listed.players.white)!==w ||
           idJogadorLichess_(listed.players&&listed.players.black)!==b){
          resumo.descartadosPorCores++;continue;
        }
        resumo.jogosDaDupla++;
        if(String(listed.perf||listed.speed||'').toLowerCase()!=='correspondence'){
          resumo.descartadosPorModalidade++;continue;
        }
        if(!Number.isFinite(listed.createdAt)||listed.createdAt<desde ||
           listed.createdAt>Date.now()+120000){resumo.descartadosPorData++;continue;}
        if(['created','nostart','aborted'].includes(String(listed.status||'').toLowerCase()))continue;
        if(ids[gid]||vistos[gid])continue;
        let game=listed;
        if(game.daysPerTurn===undefined||game.daysPerTurn===null){
          if(resumo.consultas>=REINOS_CONFIG.MAX_CONSULTAS_DESCOBERTA){
            inconclusivos[gid]=game;resumo.prazoNaoConfirmado++;continue;
          }
          resumo.consultas++;resumo.consultasDetalhes++;
          const details=consultarDetalhesPublicos_(game.id);
          if(details&&idJogadorLichess_(details.players&&details.players.white)===w&&
             idJogadorLichess_(details.players&&details.players.black)===b)game=details;
          Utilities.sleep(REINOS_CONFIG.PAUSA_MS);
        }
        if(game.daysPerTurn!==1){
          if(game.daysPerTurn===undefined||game.daysPerTurn===null){
            inconclusivos[gid]=game;resumo.prazoNaoConfirmado++;
          }else resumo.descartadosPorModalidade++;
          continue;
        }
        if(!partidaElegivelVinculo_(game,w,b,desde))continue;
        // Datas e placares da planilha podem estar desatualizados:
        // só o identificador, as contas, as cores e o tipo de jogo
        // são usados para decidir a associação.
        resumo.jogosConfirmados++;validos[gid]=game;
      }
      const choices=Object.values(validos),suspeitos=Object.values(inconclusivos);
      if(suspeitos.length)console.log('Reinos: linha '+rowNumber+
        ': metadados inconclusivos em '+suspeitos.length+' jogo(s); não vincular.');
      if(choices.length===1&&!suspeitos.length) {
        const game=choices[0],gid=game.id.toLowerCase();
        resumo.candidatos++;vistos[gid]=true;
        console.log('Reinos: possível vínculo linha '+rowNumber+' ID '+game.id+
          (escrever?'':' [SIMULAÇÃO]'));
        if(escrever&&gravarVinculoSeInalterado_(sheet,rowNumber,expected,game,env.spreadsheet)){
          ids[gid]=1;resumo.aplicados++;
        }
      } else if(choices.length>1 || (choices.length&&suspeitos.length)){
        resumo.ambiguos++;
      }
      // Avançar mesmo sem jogos, para não repetir os primeiros confrontos.
      // Um cursor pós-linha é armazenado somente no modo automático com escrita.
      if(automatica && escrever) {
        props.setProperty(REINOS_CONFIG.CURSOR_DESCOBERTA,(key||'')+'#'+rowNumber);
        resumo.cursorNovo=(key||'')+'#'+rowNumber;
      }
    }
    console.log('Reinos: descoberta '+JSON.stringify(resumo));
    return resumo;
  }finally{if(lock)lock.releaseLock();}
}

/** #18: somente estados publicamente comprovados; não inferir estados
 * de desafio, abortos ou falta de resultados. */
function statusLichess_(game, result) {
  if (result !== null) return 'Finalizado';
  if (String(game.status || '').toLowerCase() === 'started') return 'Em andamento';
  return null;
}
/** #18: a rodada de referência fica em Config!B (chave rodada_atual).
 * A falta de configuração desliga apenas a automação de elegibilidade. */
function rodadaReferencia_(spreadsheet) {
  const config=spreadsheet.getSheetByName('Config');
  if(!config)return null;
  const dados=config.getDataRange().getValues();
  for(const row of dados) {
    if(normalizarNome_(row[0]) !== 'rodada_atual')continue;
    const value=String(row[1]===undefined?'':row[1]).trim();
    if(!/^\d+$/.test(value))return null;
    const rodada=Number(value);
    return Number.isSafeInteger(rodada)&&rodada>=1&&rodada<=1000?rodada:null;
  }
  return null;
}
/** #18: uma única proposta por participante, alinhada ao site.
 * Prioridade: rodada atual, distância absoluta à rodada de referência,
 * rodada anterior antes da seguinte em empate, linha da planilha.
 * "Aguardando início" não ocupa jogador: só a seleção o reserva.
 */
function propostasElegibilidade_(rows,referencia,finaisVerificados,protecoes) {
  protecoes=protecoes||{};
  const ocupados=new Set();
  const confrontos=[];
  let rodada=0;
  for(let i=0;i<rows.length;i++){
    const r=rows[i]||[];
    const white=normalizarNome_(r[0]),black=normalizarNome_(r[3]);
    const round=/^rodada\s+(\d+)$/i.exec(nomeNormalizado_(r[0]));
    if(round) {
      rodada=Number(round[1]);continue;
    }
    if(!white||!black||white===black||!Number.isInteger(rodada)||rodada<1)continue;
    if(normalizarNome_(r[4])==='bye')continue;
    const completos=!celulaVazia_(r[1])&&!celulaVazia_(r[2]);
    const final=!!finaisVerificados[i+1]||completos;
    const temLink=!celulaVazia_(r[5]);
    const parcial=!celulaVazia_(r[1])||!celulaVazia_(r[2]);
    const estado=normalizarNome_(r[4]);
    // O link e/ou estado em andamento significam ocupação até que
    // resultado conferido prove a liberação. Finalizado sem placar é
    // inconclusivo e também bloqueia um segundo jogo.
    if(!final && (temLink||parcial||estado==='em andamento'||estado==='finalizado')){
      ocupados.add(white);ocupados.add(black);
    }
    confrontos.push({row:i+1,white,black,round:rodada,estado,final,temLink,parcial,raw:r});
  }
  // Primeiro selecionar globalmente; nunca liberar duas partidas que
  // compartilhem um jogador, mesmo que ambas pudessem iniciar isoladamente.
  const candidatas=confrontos.filter(m=>
    ['jogador em outra partida','aguardando inicio'].includes(m.estado) &&
    !m.final && !m.temLink && !m.parcial && m.round<=referencia+1 &&
    !ocupados.has(m.white) && !ocupados.has(m.black));
  candidatas.sort((a,b)=>
    Math.abs(a.round-referencia)-Math.abs(b.round-referencia) ||
    a.round-b.round || a.row-b.row);
  const reservados=new Set();
  const escolhidas=new Set();
  for(const m of candidatas) {
    if(reservados.has(m.white) || reservados.has(m.black))continue;
    escolhidas.add(m.row);
    reservados.add(m.white);
    reservados.add(m.black);
  }
  // Reverter também marcações antigas excedentes: elas não devem continuar
  // aparecendo em "Aguardando início" depois de corrigida a regra.
  const propostas=[];
  for(const m of confrontos) {
    if(!['jogador em outra partida','aguardando inicio'].includes(m.estado))continue;
    if(m.final||m.temLink||m.parcial||linhaFinalizadaCompleta_(m.raw))continue;
    const novo=escolhidas.has(m.row)?'Aguardando início':'Jogador em outra partida';
    if(nomeNormalizado_(m.raw[4])!==novo)propostas.push({row:m.row,original:m.raw,novo});
  }
  return propostas;
}
/** Escreve SOMENTE E para um confronto livre confirmado, sob lock.
 * Revalida A:H, Config, link, pontuação, Bye e rodada.
 */
function gravarElegibilidadeSeInalterada_(sheet,proposal,referencia,spreadsheet) {
  if(rodadaReferencia_(spreadsheet)!==referencia)return false;
  const r=sheet.getRange(proposal.row,1,1,8).getValues()[0];
  const expected=Array.from({length:8},(_,i)=>proposal.original[i]===undefined?'':proposal.original[i]);
  if(linhaFinalizadaCompleta_(r) ||
    !celulaVazia_(r[5])||!celulaVazia_(r[1])||!celulaVazia_(r[2])||
    !['jogador em outra partida','aguardando inicio'].includes(normalizarNome_(r[4])) ||
    !['Aguardando início','Jogador em outra partida'].includes(proposal.novo))return false;
  sheet.getRange(proposal.row,5).setValue(proposal.novo);
  SpreadsheetApp.flush();
  if(sheet.getRange(proposal.row,5).getValue()!==proposal.novo)
    throw new Error('Linha '+proposal.row+': gravação de elegibilidade não confirmada');
  try{
    let audit=spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA_STATUS);
    if(!audit){
      audit=spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA_STATUS);
      audit.appendRow(['UTC','Aba','Linha','ID público','Brancas','Pretas','Status anterior','Status novo']);
    }
    audit.appendRow([new Date().toISOString(),REINOS_CONFIG.ABA_CONFRONTOS,proposal.row,'',
      expected[0],expected[3],expected[4],proposal.novo]);
  }catch(error){console.error('Reinos: elegibilidade gravada, mas auditoria falhou na linha '+proposal.row);}
  return true;
}
function sincronizarElegibilidade_(sheet,rows,referencia,escrever,spreadsheet,resumo,finaisVerificados,protecoes) {
  const propostas=propostasElegibilidade_(rows,referencia,finaisVerificados,protecoes);
  for(const proposta of propostas){
    resumo.aguardandoCandidatos++;
    console.log('Reinos: linha '+proposta.row+': E='+proposta.novo+
      (escrever?'':' [SIMULAÇÃO]'));
    if(!escrever)continue;
    // Antes de qualquer escrita, refazer a elegibilidade contra a grade
    // atual (inclusive linhas que o organizador tenha modificado).
    const agora=sheet.getDataRange().getValues();
    const ainda=propostasElegibilidade_(agora,referencia,{},protecoes)
      .some(p=>p.row===proposta.row&&p.novo===proposta.novo);
    if(!ainda||!gravarElegibilidadeSeInalterada_(sheet,proposta,referencia,spreadsheet)){
      resumo.aguardandoConflitos++;continue;
    }
    if(proposta.novo==='Aguardando início')resumo.aguardandoAplicados++;
    else resumo.aguardandoRevertidos++;
  }
}


/** Identifica um confronto na rodada para manter o cursor de descoberta. */
function chavesConfrontos_(grid) {
  let rodada=0;
  return grid.map(row=>{
    const header=/^rodada\s+(\d+)$/i.exec(nomeNormalizado_(row[0]));
    if(header){rodada=Number(header[1]);return null;}
    const white=normalizarNome_(row[0]),black=normalizarNome_(row[3]);
    return rodada>0&&white&&black&&white!==black?
      rodada+'|'+white+'|'+black:null;
  });
}
