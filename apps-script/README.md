# Google Apps Script — Reinos do Xadrez (#3, #4 e descoberta proativa)

**Atenção:** o `Code.gs` no GitHub é apenas referência. Para funcionar na planilha oficial, é necessário substituir integralmente o código em **Extensões → Apps Script** da planilha. Merge sozinho NÃO instala esta automação.

## Descoberta de jogos sem link
- `simularDescoberta()`: consulta jogos públicos do Lichess (nos dois perfis, por adversário) e registra sugestões nos logs **sem escrever**.
- `aplicarDescoberta()`: com as proteções de escrita habilitadas, preenche **somente F vazia** quando encontra uma partida única de correspondência 1 dia/lance, contas/cor da dupla idênticas, jogo já iniciado/finalizado e ID não vinculado.
- Busca limitada em tempo e quantidade, exige consultas bem-sucedidas nos dois perfis e rejeita duplicidades. Partidas privadas, ausentes da API ou sem `daysPerTurn=1` verificável não são vinculadas automaticamente.
- Nova aba de auditoria `_AuditoriaVinculosLichess` é criada somente após a primeira escrita. O resultado/status/datas continuam na rotina existente #3/#4.

## Propriedades e execução
Conservar os segredos somente nas Propriedades do Script:
- `LICHESS_API_TOKEN` (uso das rotinas existentes de resultados/datas)
- `PLANILHA_ID_AUTORIZADA`: ID exato da planilha.
- `GRAVACAO_HABILITADA=SIM`
- `PERMITIR_PLANILHA_ORIGINAL=SIM` para a planilha oficial.
- `EXECUCAO_AUTOMATICA_HABILITADA=SIM` para execução por gatilho.

O gatilho temporal, após autorização, deve executar **somente** `sincronizarAutomaticamente`. Esta função passa a fazer a descoberta primeiro e depois a sincronização dos links, pontuações e datas. Ela permanece em **simulação por padrão**. Não crie gatilhos para `aplicarDescoberta` ou `aplicarResultados`.

## Homologação e ativação
1. Na planilha de teste, instalar o novo Code.gs e executar `simularDescoberta`. Conferir o log (incluindo a linha 37 — Humberto/Raducol), sem presumir que a partida está disponível publicamente.
2. Somente depois de conferir a partida real no Lichess e confirmar cor/tempo, autorizar as propriedades na cópia e executar `aplicarDescoberta`.
3. Conferir link em F, auditoria e atualização pelo próximo `sincronizarAutomaticamente`.
4. Só então instalar na planilha original e habilitar automação periódica com aprovação do organizador.
5. Se a API não expuser o jogo ou houver ambiguidades, usar link fornecido pelo jogador. **Não inventar ID**, nem forçar associação ou modificar resultados manualmente.

Não salve tokens no código, no repositório ou em células. Gravações revalidam A:H antes de aplicar mas não são atômicas com edições humanas simultâneas.

## Diagnóstico de partida não detectada
Execute `diagnosticarHumbertoLigia()` no Apps Script atualizado: a função **não escreve** e examina apenas a linha Humberto (brancas) × Ligia (pretas). O log mostra jogos retornados por perfil, jogos da dupla, modalidade, datas, campo `daysPerTurn` ausente e quantos jogos foram confirmados. Quando `daysPerTurn` falta na listagem, o script tenta confirmar o prazo no endpoint público de exportação do jogo. Se o prazo continuar ausente, registra a pendência e **não preenche F automaticamente**. Nenhum token nem segredo é exibido.

## Melhoria #18: status da planilha (primeira fatia)
A rotina `simularResultados()` agora detecta alterações verificadas no Lichess para a coluna E de partidas **já vinculadas** à coluna F. `aplicarResultados()` escreve **Em andamento** para `started` somente se B/C estão vazias e a partida não estava marcada como finalizada; para resultado final comprovado, escreve **Finalizado** quando não há conflito com placar manual. O fluxo pré-existente continua a preencher resultado B/C e datas G/H, com a mesma autorização de escrita. Alterações em E são auditadas em `_AuditoriaStatusLichess`.

**Homologação:** instalar o Código.gs em uma **cópia** antes de usar na original. Executar `simularResultados()` e verificar a linha 37 (Humberto x Ligia), depois aplicar apenas na cópia com as propriedades de escrita. Em seguida, conferir auditoria e idempotência. O merge no GitHub **não instala automaticamente** o Apps Script vinculado à planilha. Transições como `created`, `aborted`, conflito de pontuação, ou descoberta geral de jogos sem link **não fazem parte desta primeira fatia**, embora estejam planejadas na #18. A execução automática continua desativando a descoberta de novas partidas, por segurança.

## Melhoria #18: estados de elegibilidade (segunda fatia — PR #12)

Após **consultar os jogos vinculados, processar resultados, status e datas**, a rotina reavalia as partidas pendentes da edição atual, usando `Config!B2` (chave `rodada_atual`) e os marcadores de rodada na aba `2`. Não faz chamadas adicionais ao Lichess.

- Candidata deve estar **sem resultado B/C e sem link F**, não ser Bye e manter E = `Jogador em outra partida` ou `Aguardando início`.
- Para receber **`Aguardando início`**, ambos os jogadores devem estar livres de qualquer partida do campeonato iniciada/ainda inconclusiva; aceita rodadas anteriores e a rodada de referência + 1, mas não as futuras.
- Se deixar de estar apta por surgimento de partida ativa ou mudança de rodada, uma célula previamente `Aguardando início` é revertida a `Jogador em outra partida`. Não altera `Em andamento`, `Finalizado`, `Bye` nem status personalizados.
- Confrontos sem placar mas com link, estado ativo ou finalização inconclusiva continuam ocupando os jogadores. **A seleção reserva os dois participantes**, portanto uma pessoa nunca tem duas partidas marcadas como `Aguardando início`.
- Se várias partidas puderem começar, prioriza a rodada de referência, depois a distância até ela; em empate, rodada anterior antes da futura e, na mesma rodada, a ordem das linhas. Marca apenas um par por jogador e reverte marcações `Aguardando início` excedentes para `Jogador em outra partida`.
- O site e o Apps Script adotam a mesma seleção; confrontos não escolhidos continuam pendentes, mesmo quando isoladamente seriam possíveis.
- Simulação leva em conta resultados Lichess recém-confirmados mesmo antes de gravá-los. Execução com escrita relê a planilha atualizada; cada alteração em E passa por verificação da linha A:H e da rodada de referência, usa as proteções existentes, e é auditada em `_AuditoriaStatusLichess`.
- Em HTTP 429 ou interrupção da varredura, não atualiza elegibilidade nessa execução. Se a configuração de rodada estiver ausente/incorreta, não altera E.

**Homologação:** usar primeiro `simularResultados()` numa cópia, conferir propostas `aguardandoCandidatos`; depois `aplicarResultados()` na cópia autorizada, conferir E e auditoria, repetir para idempotência e simular novo jogo em andamento para ver reversão. Merge GitHub não instala `Code.gs` automaticamente. O site usa seu próprio cálculo; a planilha passa a espelhar essa regra após o acionador.

## Diagnóstico — exportação por dupla com filtros extras (Enrico x Gabriel)

A edição oficial apresentou a partida pública `2Lx5SE4D` de Enrico (`Xarnosqui`,
brancas) contra Gabriel (`Biel009`, pretas), em correspondência 1 dia/lance,
iniciada em 1º/11/2026 e já encerrada. A consulta antiga da API de jogos por usuário
retornava HTTP 200 com zero resultados quando incluía `perfType`, `since`,
`sort` e `opening`; a consulta enxuta por adversário retornou o jogo dos dois lados.

A busca agora solicita somente as partidas da dupla (`vs`) e omite lances,
relógios e avaliações. **Todos os filtros de segurança continuam obrigatórios
dentro de `descobrirPartidas_`**, incluindo os dois nicks, cores exatas,
modalidade `correspondence`, `daysPerTurn=1`, janela de datas, estado
iniciado/finalizado, exclusão de duplicados e vínculo único. Consultas
continuam limitadas (8 por execução; 80 jogos por perfil).

Para testar o caso sem consumir o limite nas partidas anteriores, execute
`diagnosticarEnricoGabriel()` no Apps Script vinculado (simulação, sem escrita).
Se retornar exatamente um candidato válido, execute
`aplicarDescobertaEnricoGabriel()` com as autorizações de escrita já configuradas
e confira F47 e `_AuditoriaVinculosLichess`. Em seguida, use
`sincronizarAutomaticamente()` para conciliar o resultado, E, B/C e datas.

**Importante:** a descoberta geral automática continua desabilitada;
`sincronizarAutomaticamente()` não descobre partidas sem F. O merge no
GitHub não instala automaticamente o Code.gs na planilha.

## Automação proativa — fase da melhoria #18 (PR #15)

`sincronizarAutomaticamente()` passa a executar primeiro a **descoberta de confrontos
com F vazia**, incluindo partidas já encerradas e com B/C preenchidos pelo
organizador (o placar só é aceito quando coincide exatamente com a API).
Depois chama a sincronização habitual de B/C, E, G/H e elegibilidade.
A descoberta automática fica ativa **apenas quando**
`EXECUCAO_AUTOMATICA_HABILITADA=SIM`, com as autorizações usuais de escrita.
Sem autorização, simula e não muda células nem o cursor.

Para abranger os confrontos sem link, o script preserva um cursor
`DESCOBERTA_ULTIMO_CONFRONTO_V1` nas Propriedades do Script.
Cada execução tenta aproximadamente quatro confrontos diferentes (até oito
consultas públicas/consultas complementares); a próxima retoma do confronto
seguinte. O cursor não avança quando uma consulta falha. A busca por adversário
não usa os filtros que haviam ocultado Enrico × Gabriel e **revalida localmente**
contas, cores, modalidade, prazo de 1 dia, janela temporal, ID único e placar
pré-existente. Com API 401/403/429, interrompe o lote, sem insistência;
bloqueios acionam pausa de 30 ou 60 minutos.

### Precedência humana

O simples gatilho `onEdit(e)` registra edições manuais nas colunas B, C, E, F,
G e H da aba `2`, por confronto e coluna, em
`_ControleManualLichess`. Edits do próprio Apps Script não acionam `onEdit`.
As colunas registradas ficam permanentemente protegidas de alteração
automática até que o organizador remova **o registro específico** na aba de
controle. Uma alteração manual em F, inclusive sua remoção, impede
redescoberta do link. Um placar já presente nunca é sobrescrito; se houver
discordância com a API, o confronto não é vinculado.

**Limitação importante:** o histórico de edições anteriores à instalação
não é recuperável pelo gatilho. As células B/C/E/G/H preenchidas continuam
preservadas pelo reconciliador; F preenchida jamais é substituída. Se o
organizador apagar uma célula antes de ativar `onEdit`, a proteção não
será retroativa. Evite usar o editor do Apps Script para alterar valores
manualmente; as proteções são registradas pelas edições humanas na interface
da planilha.

### Homologação

1. Atualizar `apps-script/Code.gs` **em uma cópia** da planilha,
   com as mesmas abas e valores; GitHub e planilha não estão ligados para deploy.
2. Executar `sincronizarAutomaticamente()` com a propriedade automática
   desabilitada; revisar propostas sem escrita.
3. Autorizar apenas a cópia; repetir algumas execuções e observar a rotação
   do cursor, resultados e auditoria `_AuditoriaVinculosLichess`.
4. Editar manualmente um status e apagar um link já preenchido; confirmar
   a criação de `_ControleManualLichess` e a preservação na execução seguinte.
5. Testar 403/429 com um mock ou esperar o limite real; não provocar
   requisições repetidas em produção.
6. Instalar na planilha oficial e ativar o acionador **somente após revisar
   o funcionamento da cópia**. Conservar um acionador único.

O sistema não fornece transação atômica entre a checagem e a gravação.
O lock protege o script, mas não bloqueia edições humanas simultâneas.
