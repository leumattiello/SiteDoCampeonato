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

## Melhoria #18: totais por jogador — J/K/L

Na aba **2**, a tabela J1:L10 já existe, com esta ordem: **J=Jogador (nick Lichess), K=Pontos, L=Partidas**. A nova sincronização preserva os nicks e sua ordem e preenche **somente K/L**, depois de conferir os resultados no Lichess e atualizar B/C, E, G/H.

- **Pontos (K):** somatório de B/C de resultados completos e válidos, mais os pontos de Bye registrados em B (inclusive 0 ou 0,5); Bye sem pontuação vale 0.
- **Partidas (L):** número de confrontos com placar completo (1–0, 0–1, 0,5–0,5); não inclui partidas em andamento, futuras ou folgas.
- A rotina não utiliza APIs adicionais. A composição da tabela é calculada novamente, conferida com os nomes na aba Jogadores e revalidada antes da gravação, com idempotência e auditoria `_AuditoriaResumoLichess`.
- Falhas de consulta que interrompam o lote, resultados incompletos/inconsistentes, nicks ausentes/duplicados, cabeçalhos inesperados ou fórmulas presentes em K/L impedem a atualização em vez de produzir um quadro incorreto.
- **Simulação:** `simularResultados()` mostra quantos totais seriam atualizados, sem alterar células. **Aplicação:** `aplicarResultados()` exige os mesmos bloqueios de segurança anteriores.
- Homologar primeiro em cópia. O merge no GitHub não altera o Apps Script já instalado na planilha original.
