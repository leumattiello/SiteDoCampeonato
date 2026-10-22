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
  ID_PLANILHA_ORIGINAL: '1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc',
  MAX_CONSULTAS: 80,
  PAUSA_MS: 400
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
  const descoberta = descobrirPartidas_(habilitado);
  const consolidacao = executarSincronizacao_(habilitado);
  return {descoberta: descoberta, consolidacao: consolidacao};
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
    const nicks = mapaJogadores_(jogadoresSheet.getDataRange().getValues());
    const indices = contarIdsJogo_(grid);
    const token = env.props.getProperty('LICHESS_API_TOKEN');
    if (!token || /[\r\n]/.test(token)) {
      throw new Error('Configure um LICHESS_API_TOKEN válido em Propriedades do script (não nos logs).');
    }
    const resumo = {modo: solicitouEscrita ? 'GRAVACAO' : 'SIMULACAO', planilha: env.original ? 'ORIGINAL' : 'COPIA',
      candidatos: 0, aplicados: 0, candidatosDatas: 0, aplicadosDatas: 0, divergenciasDatas: 0,
      divergencias: 0, ignorados: 0, consultas: 0, erros: 0};
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
          break;
        }
        resumo.consultas++;
        consultados[gameId] = consultarPartida_(gameId, token);
        Utilities.sleep(REINOS_CONFIG.PAUSA_MS);
      }
      const lookup = consultados[gameId];
      if (lookup.httpStatus === 429) {
        resumo.erros++;
        console.log('Reinos: HTTP 429; consultas suspensas para respeitar limite do Lichess.');
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
      const datas = datasLichess_(game, result !== null);
      const faltamDatas = {
        inicio: celulaVazia_(expected[6]) && !!datas.inicio,
        fim: celulaVazia_(expected[7]) && !!datas.fim
      };
      const dadosDatas = faltamDatas.inicio || faltamDatas.fim;
      const faltaPlacar = result !== null && celulaVazia_(expected[1]) && celulaVazia_(expected[2]);

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
      if (!dadosDatas && !faltaPlacar) { resumo.ignorados++; continue; }

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

function jogosPublicosPorDupla_(nick, adversario, desde) {
  const params = ['max=80','perfType=correspondence','ongoing=true','finished=true',
    'moves=false','clocks=false','evals=false','opening=false','sort=dateDesc',
    'since='+encodeURIComponent(desde),'vs='+encodeURIComponent(adversario)].join('&');
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
function descobrirPartidas_(escrever) {
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
      ambiguos:0,ignorados:0,erros:0};
    if(desde===null){console.log('Reinos: não há datas para delimitar a descoberta.');return resumo;}
    const nomes=Object.values(nicks).filter(Boolean);
    const duplicates=new Set(nomes.filter((nick,i)=>nomes.indexOf(nick)!==i));
    const vistos={};
    for(let idx=0;idx<grid.length;idx++){
      const expected=Array.from({length:8},(_,i)=>grid[idx][i]===undefined?'':grid[idx][i]);
      if(!celulaVazia_(expected[5])||!celulaVazia_(expected[1])||!celulaVazia_(expected[2])){
        resumo.ignorados++;continue;
      }
      const white=normalizarNome_(expected[0]),black=normalizarNome_(expected[3]);
      if(!white||!black||white===black||/^rodada\s+\d+$/.test(white)||white==='bye'||black==='bye')continue;
      const w=nicks[white],b=nicks[black];
      if(!w||!b||w===b||duplicates.has(w)||duplicates.has(b))continue;
      const pair=w+'|'+b;
      if(resumo.consultas>=REINOS_CONFIG.MAX_CONSULTAS)break;
      const games=[];
      for(const [nick,opponent] of [[w,b],[b,w]]){
        if(resumo.consultas>=REINOS_CONFIG.MAX_CONSULTAS)break;
        const lookup=jogosPublicosPorDupla_(nick,opponent,desde);
        resumo.consultas++;
        if(lookup.status===429){resumo.erros++;console.log('Reinos: HTTP 429, busca interrompida.');return resumo;}
        if(lookup.status!==200){resumo.erros++;continue;}
        games.push(...lookup.jogos);
        Utilities.sleep(REINOS_CONFIG.PAUSA_MS);
      }
      const validos={};
      for(const game of games){
        if(!partidaElegivelVinculo_(game,w,b,desde))continue;
        const gid=game.id.toLowerCase();
        if(ids[gid]||vistos[gid])continue;
        validos[gid]=game;
      }
      const choices=Object.values(validos);
      if(choices.length!==1){if(choices.length>1)resumo.ambiguos++;continue;}
      const game=choices[0],gid=game.id.toLowerCase();
      if(!Number.isFinite(game.createdAt))continue;
      // Evita vínculo de jogos de torneios anteriores: janela conservadora.
      const start=expected[6];
      if(start instanceof Date &&
        Math.abs(start.getTime()-game.createdAt)>6*86400000)continue;
      resumo.candidatos++;vistos[gid]=true;
      console.log('Reinos: possível vínculo linha '+(idx+1)+' ID '+game.id+
         (escrever?'':' [SIMULAÇÃO]'));
      if(escrever&&gravarVinculoSeInalterado_(sheet,idx+1,expected,game,env.spreadsheet)){
        ids[gid]=1;resumo.aplicados++;
      }
    }
    console.log('Reinos: descoberta '+JSON.stringify(resumo));
    return resumo;
  }finally{if(lock)lock.releaseLock();}
}
