# Melhoria #4 — Datas, duração e cinco partidas recentes

## Escopo

1. O `apps-script/Code.gs` passa a consultar as partidas referenciadas na **aba 2**, inclusive as que já têm placar, para complementar datas ainda vazias.
2. Somente após validar **ID público do jogo, ambos os nicks e as cores**, poderá preencher G (**Data Início**) e H (**Data Fim**). Não afeta a aba histórica `1`, Bye, A–F, rodadas ou resultados oficiais.
3. G: data local de `createdAt` (criação da partida). Só se o estado for `started` ou existir resultado final verificável. **Não representa necessariamente o momento do primeiro lance**.
4. H: data local de `lastMoveAt` (último lance). **Somente após resultado final verificável** (vitória/empate). Pode anteceder a conclusão efetiva por abandono ou tempo; por isso é referência aproximada do fim, **não certificado de hora de encerramento**.
5. Fuso: o configurado na planilha, atualmente `America/Sao_Paulo`. Escreve valores do tipo **data/hora do Google Sheets**, exibidos como `dd/MM/yyyy`; não grava texto arbitrário. A importação existente converte a data exibida para ISO.
6. **Valores preexistentes em G/H sempre prevalecem**, mesmo divergindo da API. Divergência em datas é registrada no log, sem sobrescrita.
7. Antes de escrever, relê A:H e compara o snapshot completo. Rejeita linha alterada, inclusive quando G/H foram preenchidas por alguém enquanto o Lichess era consultado. Usa `LockService`, mas não há transação atômica contra edição humana simultânea.
8. Toda escrita de datas é confirmada por releitura e auditada na nova aba `_AuditoriaDatasLichess`. A aba antiga `_AuditoriaLichess` dos resultados permanece intacta.
9. A rotina da #3 para B, C e E continua funcionando, com os mesmos bloqueios. Uma partida pode ter G/H preenchidas mesmo quando B/C já contêm resultado manual.
10. No site, G/H manuais prevalecem. Na ausência de G/H, há fallback a `lichessGame.createdAt/lastMoveAt` **somente quando `lichessDecision` confirmar vínculo e jogadores**, com `lichessImport = ok/cache`. O site calcula dias corridos e ordena até cinco partidas concluídas com datas válidas de fim. Sem dados cronológicos suficientes, não inventa datas.

## Como atualizar o Apps Script já instalado

**Não altere o token ou os IDs configurados se a #3 já funciona.** Atualize somente o código e valide as novas escritas.

1. **Se o acionador horário já está ativo na planilha original**, abra seu Apps Script → Configurações do projeto → Propriedades do script e altere temporariamente `EXECUCAO_AUTOMATICA_HABILITADA` para `NAO` (o gatilho passará a simular). Faça isso antes de substituir o código.
2. Na **cópia de backup**, abra **Extensões → Apps Script**. Salve uma cópia do `Código.gs` antigo e então **substitua seu conteúdo integral** pelo novo `apps-script/Code.gs` deste pacote. O arquivo é completo e conserva as funções públicas `simularResultados`, `aplicarResultados` e `sincronizarAutomaticamente`.
3. Execute **`simularResultados`**. Confira o log `Reinos: resumo`, especialmente `candidatosDatas`, `aplicadosDatas` (deve ser zero em simulação) e `divergenciasDatas`. A operação não escreve nada.
4. Confira na cópia um confronto finalizado com G e/ou H vazias. Se necessário, apague **apenas G e H de uma linha na cópia**, mantendo os jogadores, URL e pontuação. Execute `simularResultados` novamente. A data proposta pode divergir da data do primeiro lance: é o comportamento documentado da API.
5. Com propriedades `GRAVACAO_HABILITADA=SIM` e `PLANILHA_ID_AUTORIZADA` iguais ao backup, execute **`aplicarResultados`**. Confira os novos valores G/H formatados `dd/MM/yyyy`, a aba `_AuditoriaDatasLichess`, B/C/E intactos e as datas de outras linhas preservadas.
6. Na **planilha original**, atualize o Código.gs da mesma forma; execute `simularResultados` e confira os candidatos e divergências. Somente depois execute `aplicarResultados`, se julgar apropriado. O bloqueio adicional `PERMITIR_PLANILHA_ORIGINAL=SIM` continua necessário.
7. Após conferir que a escrita original foi correta, você pode reabilitar o agendamento com `EXECUCAO_AUTOMATICA_HABILITADA=SIM`. O acionador continua apontando para `sincronizarAutomaticamente` e não precisa ser recriado.

**Atenção:** trocar um arquivo no repositório **não atualiza automaticamente** o Apps Script que está instalado via Extensões → Apps Script. É necessário copiar o novo Code.gs para cada projeto vinculado.

## Código do site e publicação

A branch `main` já contém `js/model.js` e `js/app.js` com exibição de datas, duração e lista de partidas recentes. A #4 adiciona fallback para metadados do Lichess **validados pela #3**, evitando lacunas enquanto a planilha ainda não foi atualizada.

Para testar localmente (sem rede nem credenciais):

```bash
node --test tests/model.test.mjs tests/apps_script_writeback.test.mjs
```

O GitHub Actions continua somente leitura da planilha; não houve alteração em `.github/workflows/pages.yml` ou nas credenciais.

## Critérios de aceite

- Uma partida `started` pode obter G, mas H permanece vazia.
- Um jogo `created`, `noStart`, `aborted`, com vínculo divergente ou duplicado não recebe datas.
- Jogo realmente terminado e validado preenche H quando `lastMoveAt` estiver disponível.
- G/H preexistentes, inclusive datas com divergência, nunca são substituídas.
- Partidas com B/C já preenchidos podem receber G/H sem mudar a pontuação.
- As últimas cinco partidas com datas conhecidas de fim aparecem ordenadas corretamente; duração é calculada em dias corridos.
- A aba histórica, Bye e o placar existente ficam inalterados.

## Limitação conhecida

A API não fornece necessariamente `firstMoveAt` nem horário de encerramento definitivo. São usadas **referências de criação e último lance**, expressamente descritas no log/documentação. Para datas exatas verificadas manualmente, o organizador deve preencher G/H; esses valores prevalecem.
