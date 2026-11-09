# Apps Script — Sincronização automática pelo Lichess

## Regra de precedência

O Lichess é a fonte principal de resultados, datas e status das partidas do campeonato. Em toda execução de `sincronizarAutomaticamente()`:

1. A descoberta procura partidas sem URL pública reconhecida, **mesmo que B/C, E, G ou H já tenham sido preenchidos manualmente**, e vincula somente quando existe um candidato inequívoco, com identidade dos dois participantes, cores, controle de 1 dia/lance e modalidade correspondência confirmados. Requisições são distribuídas em rodízio com cursor persistente para não esgotar a API.
2. Para jogos vinculados pela URL da coluna F, a sincronização consulta o jogo e **substitui B/C, E, G/H quando há informação confirmada pelo Lichess**, inclusive valores manuais conflitantes. Jogo iniciado não tem resultado final: B/C e H são limpos. Datas que a API não informa permanecem como estavam, pois não podemos inventá-las.
3. Atualiza as marcações de elegibilidade `Aguardando início` / `Jogador em outra partida` após as partidas verificadas, respeitando o limite de rodadas e a regra de um confronto ativo por participante.

**Única exceção:** a linha marcada como `Finalizado` ou `Finalizada` com A, B, C, D, E, F, G e H **todos preenchidos** permanece completamente intocada — nem descoberta, nem correção de dados, nem atualização de elegibilidade. Um zero em B/C é um preenchimento válido. Qualquer campo vazio libera a linha para novos dados do Lichess.

As alterações humanas feitas na planilha **não têm mais proteção especial**. A aba histórica `_ControleManualLichess`, quando existir, não é mais consultada pelo script. O gatilho `onEdit` foi removido. O organizador pode continuar editando, mas suas alterações em partidas incompletas poderão ser substituídas na sincronização seguinte.

## Regras de segurança que continuam valendo

- A associação entre jogo e confronto exige contas correspondentes, cores exatas, modalidade correta, prazo de um dia por lance, ID público único e candidato inequívoco. Nenhum ID é inventado.
- Nenhum link existente reconhecido é substituído pela descoberta; a sincronização do link só aplica metadados quando a identidade do jogo confere. URLs em formato não reconhecido precisam ser ajustadas na planilha. O parser de URLs **não foi alterado**.
- A execução de gravação exige `GRAVACAO_HABILITADA=SIM`, `PLANILHA_ID_AUTORIZADA` com o ID da planilha e, para a planilha original, `PERMITIR_PLANILHA_ORIGINAL=SIM`.
- `EXECUCAO_AUTOMATICA_HABILITADA=SIM` autoriza escrita na execução agendada; sem ela, a rotina apenas simula.
- As consultas param diante de HTTP 401/403/429. Existe pausa de proteção para evitar novas tentativas sucessivas.
- Alterações feitas pelo Apps Script são conferidas após escrita e registradas em auditoria. O lock protege contra outras execuções do script, **não** contra edições simultâneas de uma pessoa na planilha.

## Funções disponíveis

- `sincronizarAutomaticamente()`: fluxo completo, destinado ao acionador periódico.
- `simularResultados()`: simula atualização dos jogos já vinculados, sem escrever.
- `aplicarResultados()`: atualiza jogos vinculados, com autorizações de gravação.
- `simularDescoberta()`: descobre vínculos possíveis sem escrever.
- `aplicarDescoberta()`: preenche apenas F onde houver um candidato único e confirmado.
- `diagnosticarEnricoGabriel()` e `diagnosticarHumbertoLigia()`: diagnósticos dirigidos.

## Homologação

1. Instale o `apps-script/Code.gs` desta PR em **uma cópia** da planilha. O merge no GitHub não instala o script no Apps Script.
2. Com `EXECUCAO_AUTOMATICA_HABILITADA` desabilitada, execute `sincronizarAutomaticamente()` e revise os logs (nenhuma escrita).
3. Em cópia autorizada, execute o agendamento algumas vezes e confira: atualização de B/C/E/G/H apesar de valores antigos, resultado final e partidas em andamento, descoberta gradual de F, e ausência de mudanças em linhas Finalizado/Finalizada completas.
4. Compare partidas disponíveis na rodada de referência e na seguinte. A lógica existente escolhe a rodada prioritária e evita duas partidas simultâneas por participante.
5. Somente depois de homologar, instale o código na planilha original, sem criar acionadores duplicados. Não altere a planilha oficial como parte desta PR.

## Observação sobre status e datas

A API informa `createdAt` (criação do jogo) e `lastMoveAt` (último lance), que não são necessariamente o início do primeiro lance ou a hora exata do fim. Essas referências temporais são tratadas como datas do jogo com essa limitação.
