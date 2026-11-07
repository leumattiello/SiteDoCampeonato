/**
 * Reinos do Xadrez — melhorias #3 e #4: resultados e datas via Apps Script.
 *
 * VINCULAR ESTE PROJETO À PLANILHA DE BACKUP PRIMEIRO.
 * Por padrão, NENHUMA função escreve na planilha.
 *
 * Script Properties (Configurações do projeto > Propriedades do script):
 * - LICHESS_API_TOKEN: token pessoal Lichess de leitura (não publicar)
 * - PLANILHA_ID_AUTORIZADA: ID EXATO da planilha que este script pode editar
 * - GRAVACAO_HABILITADA: SIM (apenas para aplicarResultados)
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
  ABA_AUDITORIA_DATAS: '_AuditoriaDatasLichess',
  ABA_AUDITORIA_VINCULOS: '_AuditoriaVinculosLichess',
  ABA_AUDITORIA_STATUS: '_AuditoriaStatusLichess',
  ABA_CONTROLE_MANUAL: '_ControleManualLichess',
  ID_PLANILHA_ORIGINAL: '1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc',
  MAX_CONSULTAS: 80,
  MAX_CONSULTAS_DESCOBERTA: 8,
  PAUSA_MS: 1100,
  CURSOR_DESCOBERTA: 'DESCOBERTA_ULTIMO_CONFRONTO_V1',
  PAUSA_DESCOBERTA: 'DESCOBERTA_PAUSA_ATE_V1'
});

/** Simulação, sem modificar NENHUMA célula (nem cria a aba de auditoria). */
function simularResultados() {
  return executarSincronizacao_(false);
}

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
  const descoberta = descobrirPartidas_(habilitado, null, {automatica:true});
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

function executarSincronizacao_(solicitouEscrita) {
  // Simulação também não cria planilhas, gatilhos nem propriedades.
  const env = obterAmbiente_(solicitouEscrita);
  let lock = null;
  if (solicitouEscrita) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Outra sincronização está em andamento.');
  }
  try {
    const jogosSheet = env.spreadsheet.getSheetByName(REINOS_CONFIG.ABA_CONFRONTOS);
    const jogadoresSheet = env.spreadsheet.getSheetByName(REINOS_CONFIG.ABA_JOGADORES);
    if (!jogosSheet || !jogadoresSheet) throw new Error('Faltam as abas 2 e/ou Jogadores.');
    const grid = jogosSheet.getDataRange().getValues();
    const protecoes = lerProtecoesManuais_(env.spreadsheet,grid);
    const nicks = mapaJogadores_(jogadoresSheet.getDataRange().getValues());
    const indices = contarIdsJogo_(grid);
    const token = env.props.getProperty('LICHESS_API_TOKEN');
    if (!token || /[\r\n]/.test(token)) {
      throw new Error('Configure um LICHESS_API_TOKEN válido em Propriedades do script (não nos logs).');
    }
    const resumo = {modo: solicitouEscrita ? 'GRAVACAO' : 'SIMULACAO', planilha: env.original ? 'ORIGINAL' : 'COPIA',
      candidatos: 0, aplicados: 0, candidatosDatas: 0, aplicadosDatas: 0, divergenciasDatas: 0,
      divergencias: 0, ignorados: 0, consultas: 0, erros: 0,
      candidatosStatus: 0, aplicadosStatus: 0, conflitosStatus: 0,
      aguardandoCandidatos: 0, aguardandoAplicados: 0, aguardandoRevertidos: 0,
      aguardandoConflitos: 0, elegibilidadeIgnorada: null};
    const finaisVerificados = {};
    let consultaInterrompida = false;
    const consultados = {};
    for (let index = 0; index < grid.length; index++) {
      const row = grid[index];
      const rowNumber = index + 1;
      const expected = [0, 1, 2, 3, 4, 5, 6, 7].map(i => row[i] === undefined ? '' : row[i]);
      const white = nomeNormalizado_(expected[0]);
      const black = nomeNormalizado_(expected[3]);
      const status = nomeNormalizado_(expected[4]);
      if (!white || !black || status.toLowerCase() === 'bye' || /^rodada\s+\d+$/i.test(white)) continue;
      // Desde a #4, consultamos também jogos COM placar para preencher G/H ausentes.
      // Mesmo zero é placar manual: nenhuma escrita de B/C se estiverem preenchidas.
      const gameId = extrairIdPublico_(expected[5]);
      if (!gameId) { resumo.ignorados++; continue; }
      if (indices[gameId.toLowerCase()] !== 1) {
        resumo.divergencias++;
        console.log(`Reinos: linha ${rowNumber}: mesmo ID em mais de um confronto; ignorado.`);
        continue;
      }
      const expectedWhiteId = nicks[normalizarNome_(white)];
      const expectedBlackId = nicks[normalizarNome_(black)];
      if (!expectedWhiteId || !expectedBlackId || expectedWhiteId === expectedBlackId) {
        resumo.divergencias++;
        console.log(`Reinos: linha ${rowNumber}: nicks não confirmados/duplicados; ignorado.`);
        continue;
      }
      if (!(gameId in consultados)) {
        if (resumo.consultas >= REINOS_CONFIG.MAX_CONSULTAS) {
          console.log('Reinos: limite de consultas atingido; restante ignorado nesta execução.');
          consultaInterrompida = true;
          break;
        }
        resumo.consultas++;
        consultados[gameId] = consultarPartida_(gameId, token);
        Utilities.sleep(REINOS_CONFIG.PAUSA_MS);
      }
      const lookup = consultados[gameId];
      if ([401,403,429].includes(lookup.httpStatus)) {
        resumo.erros++;
        console.log('Reinos: HTTP '+lookup.httpStatus+
          '; consultas suspensas para respeitar proteção do Lichess.');
        consultaInterrompida = true;
        if (solicitouEscrita)env.props.setProperty(REINOS_CONFIG.PAUSA_DESCOBERTA,
          String(Date.now()+(lookup.httpStatus===429?3600000:1800000)));
        break;
      }
      if (lookup.error) {
        resumo.erros++;
        console.log(`Reinos: linha ${rowNumber}: ${lookup.error}.`);
        continue;
      }
      const game = lookup.game;
      if (String(game.id || '').toLowerCase() !== gameId.toLowerCase()) {
        resumo.divergencias++;
        console.log(`Reinos: linha ${rowNumber}: ID retornado diferente; ignorado.`);
        continue;
      }
      const sides = game.players || {};
      const apiWhite = idJogadorLichess_(sides.white);
      const apiBlack = idJogadorLichess_(sides.black);
      if (!apiWhite || !apiBlack || apiWhite !== expectedWhiteId || apiBlack !== expectedBlackId) {
        resumo.divergencias++;
        console.log(`Reinos: linha ${rowNumber}: jogadores/cores divergentes; ignorado.`);
        continue;
      }
      const result = placarLichess_(game);
      const statusProposto = statusLichess_(game, result);
      // Não rebaixar finais confirmados nem sobrescrever um placar manual divergente.
      const conflitoResultado = ( !celulaVazia_(expected[1]) || !celulaVazia_(expected[2]) ) &&
        (result === null || !valoresIguais_(expected[1], result[0]) ||
         !valoresIguais_(expected[2], result[1]));
      // Somente para projetar simulações: as partidas finalizadas e validadas
      // liberam os jogadores mesmo que o resultado ainda não tenha sido gravado.
      if (result !== null && !conflitoResultado) finaisVerificados[rowNumber] = true;
      const podeMudarStatus = statusProposto &&
        !estaProtegidoManualmente_(protecoes,rowNumber,'E') &&
        !(statusProposto === 'Em andamento' && normalizarNome_(expected[4]).toLowerCase() === 'finalizado') &&
        (statusProposto === 'Finalizado'
          ? !conflitoResultado
          : celulaVazia_(expected[1]) && celulaVazia_(expected[2])) &&
        expected[4] !== statusProposto;
      if (statusProposto && expected[4] !== statusProposto && !podeMudarStatus) {
        resumo.conflitosStatus++;
        console.log('Reinos: linha '+rowNumber+': status divergente, preservado para revisão.');
      }
      const datas = datasLichess_(game, result !== null);
      const faltamDatas = {
        inicio: celulaVazia_(expected[6]) && !!datas.inicio &&
          !estaProtegidoManualmente_(protecoes,rowNumber,'G'),
        fim: celulaVazia_(expected[7]) && !!datas.fim &&
          !estaProtegidoManualmente_(protecoes,rowNumber,'H')
      };
      const dadosDatas = faltamDatas.inicio || faltamDatas.fim;
      const faltaPlacar = result !== null && celulaVazia_(expected[1]) && celulaVazia_(expected[2]) &&
        !['B','C','E'].some(col=>estaProtegidoManualmente_(protecoes,rowNumber,col));

      // Datas digitadas pelo organizador não são substituídas. Divergências
      // são registradas para conferência, nunca corrigidas automaticamente.
      const tz = env.spreadsheet.getSpreadsheetTimeZone();
      for (const [indexCol, label, instante] of [[6, 'G', datas.inicio], [7, 'H', datas.fim]]) {
        if (instante && !celulaVazia_(expected[indexCol]) &&
            !mesmaDataCalendario_(expected[indexCol], instante, tz)) {
          resumo.divergenciasDatas++;
          console.log(`Reinos: linha ${rowNumber}: ${label} já preenchida, difere da referência Lichess; preservada.`);
        }
      }
      if (!dadosDatas && !faltaPlacar && !podeMudarStatus) { resumo.ignorados++; continue; }

      // #4 primeiro: valida A:H e preenche somente as datas faltantes.
      if (dadosDatas) {
        resumo.candidatosDatas++;
        console.log(`Reinos: linha ${rowNumber}: datas: ` +
          `${faltamDatas.inicio ? 'G=' + textoData_(datas.inicio, tz) + ' ' : ''}` +
          `${faltamDatas.fim ? 'H=' + textoData_(datas.fim, tz) : ''}` +
          `${solicitouEscrita ? '' : ' [SIMULAÇÃO]'}`);
        if (solicitouEscrita) {
          if (gravarDatasSeInalteradas_(jogosSheet, rowNumber, expected, datas, faltamDatas, gameId, env.spreadsheet)) {
            resumo.aplicadosDatas++;
          } else {
            resumo.divergencias++;
          }
        }
      }

      // #18: status é sincronizado com segurança, independentemente das datas.
      // Quando faltam B/C, a rotina de placar final abaixo mantém sua gravação.
      if (podeMudarStatus && !(faltaPlacar && statusProposto === 'Finalizado')) {
        resumo.candidatosStatus++;
        console.log('Reinos: linha '+rowNumber+': E='+statusProposto+
          (solicitouEscrita?'':' [SIMULAÇÃO]'));
        if (solicitouEscrita) {
          if (gravarStatusSeInalterado_(jogosSheet,rowNumber,expected,statusProposto,gameId,env.spreadsheet)) {
            resumo.aplicadosStatus++;
          } else resumo.conflitosStatus++;
        }
      }
      // #3 em separado: nenhuma mudança nas regras de placar/Bye.
      if (faltaPlacar) {
        resumo.candidatos++;
        console.log(`Reinos: linha ${rowNumber}: ${white} x ${black}, jogo ${gameId}, ` +
          `proposta B=${result[0]} C=${result[1]} E=Finalizado${solicitouEscrita ? '' : ' [SIMULAÇÃO]'}`);
        if (solicitouEscrita) {
          if (gravarSeInalterado_(jogosSheet, rowNumber, expected, result, gameId, env.spreadsheet)) {
            resumo.aplicados++;
          } else {
            resumo.divergencias++;
          }
        }
      }
    }
    // Executar SOMENTE após aferir resultados e estados Lichess. O novo passe
    // não faz nenhuma chamada HTTP: trabalha sobre a grade revalidada.
    if (!consultaInterrompida) {
      const rodadaRef = rodadaReferencia_(env.spreadsheet);
      if (rodadaRef === null) {
        resumo.elegibilidadeIgnorada = 'Config.rodada_atual ausente ou inválida';
      } else {
        const atual = solicitouEscrita ? jogosSheet.getDataRange().getValues() : grid;
        sincronizarElegibilidade_(jogosSheet,atual,rodadaRef,solicitouEscrita,
          env.spreadsheet,resumo,solicitouEscrita ? {} : finaisVerificados,protecoes);
      }
    } else resumo.elegibilidadeIgnorada = 'Consulta Lichess interrompida; recalcular na próxima execução';
    console.log('Reinos: resumo ' + JSON.stringify(resumo));
    return resumo;
  } finally {
    if (lock) lock.releaseLock();
  }
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

function textoData_(value, timezone) {
  return Utilities.formatDate(value, timezone, 'dd/MM/yyyy');
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

/**
 * Grava individualmente somente G/H vazias, depois de conferir A:H novamente.
 * Não sobrescreve valores existentes, fórmulas ou quaisquer pontos/status.
 * Faltas/alterações no snapshot fazem a linha inteira ser ignorada.
 */
function gravarDatasSeInalteradas_(sheet, rowNumber, expected, datas, faltam, gameId, spreadsheet) {
  const range = sheet.getRange(rowNumber, 1, 1, 8);
  const now = range.getValues()[0];
  if (!expected.every((oldValue, idx) => valorSnapshotIgual_(oldValue, now[idx])) ||
      normalizarNome_(now[4]).toLowerCase() === 'bye' ||
      extrairIdPublico_(now[5]) !== gameId ||
      (faltam.inicio && !celulaVazia_(now[6])) ||
      (faltam.fim && !celulaVazia_(now[7]))) {
    console.log(`Reinos: linha ${rowNumber}: A:H mudou desde a leitura; datas NÃO gravadas.`);
    return false;
  }
  const timezone = spreadsheet.getSpreadsheetTimeZone();
  if (faltam.inicio) sheet.getRange(rowNumber, 7).setValue(datas.inicio).setNumberFormat('dd/MM/yyyy');
  if (faltam.fim) sheet.getRange(rowNumber, 8).setValue(datas.fim).setNumberFormat('dd/MM/yyyy');
  SpreadsheetApp.flush();
  const after = sheet.getRange(rowNumber, 1, 1, 8).getValues()[0];
  if ((faltam.inicio && !mesmaDataCalendario_(after[6], datas.inicio, timezone)) ||
      (faltam.fim && !mesmaDataCalendario_(after[7], datas.fim, timezone))) {
    throw new Error(`Linha ${rowNumber}: datas gravadas mas leitura de confirmação falhou; conferir planilha.`);
  }
  try {
    let audit = spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA_DATAS);
    if (!audit) {
      audit = spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA_DATAS);
      audit.appendRow(['Data UTC', 'Aba', 'Linha', 'ID público', 'Brancas', 'Pretas',
        'Antes G', 'Antes H', 'Depois G', 'Depois H', 'Referência G', 'Referência H']);
    }
    audit.appendRow([new Date().toISOString(), REINOS_CONFIG.ABA_CONFRONTOS, rowNumber,
      gameId, expected[0], expected[3], String(expected[6] || ''), String(expected[7] || ''),
      faltam.inicio ? textoData_(datas.inicio, timezone) : String(expected[6] || ''),
      faltam.fim ? textoData_(datas.fim, timezone) : String(expected[7] || ''),
      'createdAt (criação)', 'lastMoveAt (último lance)']);
  } catch (error) {
    console.error(`Reinos: ALERTA: datas da linha ${rowNumber} GRAVADAS, mas auditoria falhou.`);
  }
  console.log(`Reinos: linha ${rowNumber}: gravação de datas confirmada.`);
  return true;
}

function valoresIguais_(a, b) {
  return a === b || (celulaVazia_(a) && celulaVazia_(b));
}

function gravarSeInalterado_(sheet, rowNumber, expected, result, gameId, spreadsheet) {
  // A:F deve continuar exatamente como na primeira leitura; evita sobrescrita
  // de edições manuais concluídas durante a consulta ao Lichess.
  const now = sheet.getRange(rowNumber, 1, 1, 6).getValues()[0];
  if (!expected.slice(0, 6).every((oldValue, idx) => valoresIguais_(oldValue, now[idx])) ||
      !celulaVazia_(now[1]) || !celulaVazia_(now[2]) ||
      normalizarNome_(now[4]).toLowerCase() === 'bye' ||
      extrairIdPublico_(now[5]) !== gameId) {
    console.log(`Reinos: linha ${rowNumber}: modificada desde a leitura; NÃO escrita.`);
    return false;
  }
  // O Apps Script não fornece compare-and-swap de células: persiste uma pequena
  // janela de corrida entre esta validação e a escrita. Lock cobre execuções
  // concorrentes deste mesmo script, NÃO alterações manuais externas.
  sheet.getRange(rowNumber, 2, 1, 2).setValues([[result[0], result[1]]]);
  sheet.getRange(rowNumber, 5).setValue('Finalizado');
  SpreadsheetApp.flush();
  const after = sheet.getRange(rowNumber, 1, 1, 6).getValues()[0];
  if (!valoresIguais_(after[1], result[0]) || !valoresIguais_(after[2], result[1]) ||
      after[4] !== 'Finalizado') {
    throw new Error(`Linha ${rowNumber}: leitura de confirmação falhou; conferir manualmente a planilha.`);
  }
  // A auditoria NÃO pode afetar resultados já gravados: falha de auditoria
  // é sinalizada explicitamente, sem afirmar que a escrita foi revertida.
  try {
    let audit = spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA);
    if (!audit) {
      audit = spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA);
      audit.appendRow(['Data UTC', 'Aba', 'Linha', 'ID jogo', 'Brancas', 'Pretas',
        'Antes B', 'Antes C', 'Antes E', 'Depois B', 'Depois C', 'Depois E']);
    }
    audit.appendRow([new Date().toISOString(), REINOS_CONFIG.ABA_CONFRONTOS, rowNumber,
      gameId, expected[0], expected[3], expected[1], expected[2], expected[4],
      result[0], result[1], 'Finalizado']);
  } catch (error) {
    console.error(`Reinos: ALERTA: linha ${rowNumber} GRAVADA, mas falhou auditoria. Registrar manualmente.`);
  }
  console.log(`Reinos: linha ${rowNumber}: gravação confirmada.`);
  return true;
}

/**
 * #11 ampliada: busca ativa de confrontos sem URL (F) na planilha.
 * Independente da sincronização #3/#4 e protegida pelas MESMAS propriedades.
 * Só vincula partidas públicas em correspondência de um dia, com contas e
 * cores idênticas e UMA única candidata por confronto; nunca sobrescreve F.
 */
function simularDescoberta() { return descobrirPartidas_(false); }
function aplicarDescoberta() { return descobrirPartidas_(true); }
/**
 * Diagnóstico dirigido: executa somente as duas consultas do confronto
 * Humberto (brancas) x Lígia (pretas), sem escrever ou criar abas.
 * Não usa o token OAuth do navegador nem revela token de Apps Script.
 */
function diagnosticarHumbertoLigia() {
  return descobrirPartidas_(false, {white:'humberto',black:'ligia'});
}
/** Diagnóstico dirigido para a rodada 7: nenhuma gravação. */
function diagnosticarEnricoGabriel() {
  return descobrirPartidas_(false, {white:'enrico',black:'gabriel'});
}
/** Vincula APENAS Enrico x Gabriel após conferir único jogo compatível.
 * Requer todas as autorizações já usadas por aplicarDescoberta().
 */
function aplicarDescobertaEnricoGabriel() {
  return descobrirPartidas_(true, {white:'enrico',black:'gabriel'});
}

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
  if(!expected.every((value,index)=>valorSnapshotIgual_(value,now[index])) ||
     !celulaVazia_(now[5])||!now[3]||
     normalizarNome_(now[4]).toLowerCase()==='bye')return false;
  const url='https://lichess.org/'+game.id;
  sheet.getRange(rowNumber,6).setValue(url);
  SpreadsheetApp.flush();
  if(sheet.getRange(rowNumber,6).getValue()!==url)throw new Error('Falha de confirmação de vínculo; conferir linha '+rowNumber);
  try {
    let audit=spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA_VINCULOS);
    if(!audit){audit=spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA_VINCULOS);
      audit.appendRow(['UTC','Aba','Linha','Brancas','Pretas','ID público','F antes','F depois','Verificação']);}
    audit.appendRow([new Date().toISOString(),REINOS_CONFIG.ABA_CONFRONTOS,rowNumber,
      expected[0],expected[3],game.id,'',url,'Cores, contas, modalidade e 1 dia confirmados; candidato único']);
  }catch(e){console.error('Reinos: vínculo aplicado mas auditoria falhou na linha '+rowNumber);}
  return true;
}
function descobrirPartidas_(escrever, filtro, opcoes) {
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
    const protecoes=lerProtecoesManuais_(env.spreadsheet,grid);
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
      if(filtro && (white!==filtro.white||black!==filtro.black))continue;
      if(!white||!black||white===black||/^rodada\s+\d+$/.test(white)||
          normalizarNome_(row[4])==='bye')continue;
      if(!celulaVazia_(row[5]) || estaProtegidoManualmente_(protecoes,idx+1,'F')){
        resumo.ignorados++;continue;
      }
      // Preenchimentos incompletos, corrigidos à mão, não podem ser inferidos.
      if(celulaVazia_(row[1])!==celulaVazia_(row[2])){
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
    if(automatica && !filtro && pendentes.length) {
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
        if(expected[6] instanceof Date &&
           Math.abs(expected[6].getTime()-game.createdAt)>6*86400000){
          resumo.descartadosPorData++;continue;
        }
        // Se organizador lançou placar antes de inserir URL, só reconhecer
        // jogo finalizado que confirme ambos os pontos exatamente.
        const manualPlacar=!celulaVazia_(expected[1])||!celulaVazia_(expected[2]);
        if(manualPlacar){
          const result=placarLichess_(game);
          if(result===null||!valoresIguais_(expected[1],result[0])||
             !valoresIguais_(expected[2],result[1]))continue;
        }
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
        if(escrever&&!estaProtegidoManualmente_(protecoes,rowNumber,'F')&&
           gravarVinculoSeInalterado_(sheet,rowNumber,expected,game,env.spreadsheet)){
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
/** Atualiza apenas E, sem sobrescrever B/C, F ou células alteradas.
 * Edições manuais simultâneas ainda não têm transação compare-and-swap;
 * o lock cobre somente duas execuções deste script.
 */
function gravarStatusSeInalterado_(sheet,rowNumber,expected,status,gameId,spreadsheet) {
  if (status !== 'Em andamento' && status !== 'Finalizado') return false;
  const before=sheet.getRange(rowNumber,1,1,8).getValues()[0];
  if (!expected.every((v,i)=>valorSnapshotIgual_(v,before[i]) ||
      ((i===6||i===7) && !celulaVazia_(before[i]) && celulaVazia_(v))) ||
      extrairIdPublico_(before[5])!==gameId ||
      normalizarNome_(before[4]).toLowerCase()==='bye') return false;
  // Status ativo não substitui placares, inclusive um zero isolado.
  if (status==='Em andamento' && (!celulaVazia_(before[1]) || !celulaVazia_(before[2]))) return false;
  if (before[4]===status || (status==='Em andamento' && normalizarNome_(before[4]).toLowerCase()==='finalizado')) return false;
  sheet.getRange(rowNumber,5).setValue(status);
  SpreadsheetApp.flush();
  if(sheet.getRange(rowNumber,5).getValue()!==status)
    throw new Error('Falha ao confirmar status na linha '+rowNumber);
  try {
    let audit=spreadsheet.getSheetByName(REINOS_CONFIG.ABA_AUDITORIA_STATUS);
    if(!audit){
      audit=spreadsheet.insertSheet(REINOS_CONFIG.ABA_AUDITORIA_STATUS);
      audit.appendRow(['UTC','Aba','Linha','ID público','Brancas','Pretas','Status anterior','Status novo']);
    }
    audit.appendRow([new Date().toISOString(),REINOS_CONFIG.ABA_CONFRONTOS,rowNumber,gameId,
      expected[0],expected[3],expected[4],status]);
  } catch(e) {
    console.error('Reinos: status gravado, mas auditoria falhou na linha '+rowNumber);
  }
  return true;
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
    if (estaProtegidoManualmente_(protecoes,i+1,'E') && estado==='aguardando inicio') {
      ocupados.add(white);ocupados.add(black);
    }
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
    if(m.final||m.temLink||m.parcial||estaProtegidoManualmente_(protecoes,m.row,'E'))continue;
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
  if(!expected.every((v,i)=>valorSnapshotIgual_(v,r[i])) ||
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

/** Identidade estável da linha: rodada + nomes/cor. A numeração da linha
 * pode mudar sem liberar uma correção humana previamente protegida. */
function chavesConfrontos_(grid) {
  let rodada=0;
  return grid.map(row=>{
    const branco=normalizarNome_(row[0]),preto=normalizarNome_(row[3]);
    const header=/^rodada\s+(\d+)$/i.exec(nomeNormalizado_(row[0]));
    if(header){rodada=Number(header[1]);return null;}
    if(!rodada || !branco || !preto || branco===preto)return null;
    return rodada+'|'+branco+'|'+preto;
  });
}
/** Guarda local das colunas corrigidas pelo organizador.
 * Nunca é criada por simulações; permanece até remoção manual do registro.
 * Marcadores são criados por onEdit (edições de usuário na interface). */
function lerProtecoesManuais_(spreadsheet,grid) {
  const control=spreadsheet.getSheetByName(REINOS_CONFIG.ABA_CONTROLE_MANUAL);
  if(!control)return {};
  const lines=control.getDataRange().getValues();
  const byKey={};
  for(let i=1;i<lines.length;i++){
    const key=String(lines[i][1]||''),col=String(lines[i][2]||'');
    if(!key||!['B','C','E','F','G','H'].includes(col))continue;
    if(!byKey[key])byKey[key]=new Set();
    byKey[key].add(col);
  }
  const result={},keys=chavesConfrontos_(grid);
  keys.forEach((key,i)=>{if(key&&byKey[key])result[i+1]=byKey[key];});
  return result;
}
function estaProtegidoManualmente_(protecoes,rowNumber,coluna) {
  return !!(protecoes && protecoes[rowNumber] && protecoes[rowNumber].has(coluna));
}
/** Trigger simples: só edições humanas disparam onEdit. Escritas do próprio
 * Apps Script e recálculos de fórmulas não disparam este evento.
 * Em uma nova instalação, alterações anteriores não são retroativas. */
function onEdit(e) {
  if(!e || !e.range || !e.source)return;
  const sheet=e.range.getSheet();
  if(!sheet || sheet.getName()!==REINOS_CONFIG.ABA_CONFRONTOS)return;
  const firstCol=e.range.getColumn(),lastCol=firstCol+e.range.getNumColumns()-1;
  if(lastCol<2 || firstCol>8)return;
  const cols=['B','C','E','F','G','H'];
  const selected=[];
  for(let c=Math.max(2,firstCol);c<=Math.min(8,lastCol);c++){
    const label='ABCDEFGH'[c-1];
    if(cols.includes(label))selected.push(label);
  }
  if(!selected.length)return;
  const rows=sheet.getDataRange().getValues();
  const keys=chavesConfrontos_(rows);
  let control=e.source.getSheetByName(REINOS_CONFIG.ABA_CONTROLE_MANUAL);
  const records=[];
  for(let row=e.range.getRow();row<e.range.getRow()+e.range.getNumRows();row++){
    if(!keys[row-1])continue;
    for(const col of selected)records.push([new Date().toISOString(),keys[row-1],col,row]);
  }
  if(!records.length)return;
  if(!control){
    control=e.source.insertSheet(REINOS_CONFIG.ABA_CONTROLE_MANUAL);
    control.appendRow(['UTC','Rodada | brancas | pretas','Coluna protegida','Linha na edição']);
  }
  for(const record of records)control.appendRow(record);
}
