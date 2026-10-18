# Melhoria #6 — Replay de partidas finalizadas

## Comportamento

O site utiliza o widget oficial documentado pelo Lichess em `https://lichess.org/embed/game/ID`, mostrado numa janela modal responsiva. O botão **♜ Rever partida** aparece nas **Rodadas** e nos **Últimos confrontos** somente para partidas finalizadas com metadados da API validados pela reconciliação #3. A interface do tabuleiro Lichess permite passar pelos lances; a janela abre após ação do usuário, sem autoplay ou consultas diretas de exportação pelo navegador.

- Sempre há a opção **Abrir no Lichess** (link original, inclusive links de 12 caracteres), mesmo se o widget estiver inacessível.
- O ID público de 8 caracteres usado no embed é extraído e verificado. Os 4 caracteres extras de links compartilhados não são inseridos no embed.
- O Lichess pode impedir o acesso ao widget de certos jogos de correspondência não públicos, embora o link compartilhado completo funcione. Nesse caso, usar o link original. Não há garantia de que um `iframe` externo consiga confirmar automaticamente uma falha de carregamento.
- O widget só é criado/carregado após clicar e é descarregado ao fechar (incluindo Esc); também existe controle de fechamento acessível por teclado.
- Replays são limitados a partidas com: resultado oficial ou automático `1-0`, `0-1`, `½-½`; `lichessDecision` igual a `manual` ou `finished`; `lichessImport` atual (`ok` ou `cache`); URL/ID idênticos à partida importada; estado final/veredicto coincidentes; sequência de lances não vazia.
- Nenhuma edição no Google Sheets; nenhum segredo no navegador; nenhuma mudança nos jobs do GitHub Actions. As partidas históricas ainda não validadas pela #3 continuam somente com link externo, até futura conciliação.

## Testar no PR

1. Aguarde passar o workflow de PR.
2. Na prévia, acesse **Rodadas** e encontre uma finalizada com resultado confirmado pelo Lichess. Se a sincronização da prévia não tiver exportado jogos, consulte a nota abaixo.
3. Clique **♜ Rever partida** e percorra os lances nos controles internos do Lichess. Confirme o resultado e os jogadores.
4. Teste botão Fechar, tecla Esc, celular e **Abrir no Lichess**. Confira que jogos em andamento/Bye ou sem validação não abrem replay.
5. Confira os testes `node --test tests/*.test.mjs` e os testes Python.

## Limitação da prévia de PR

O workflow de prévia desta branch importa a planilha, valida os jogadores, reaproveita opcionalmente **dados de partidas já publicados no JSON público da produção**, tenta consultar as partidas restantes anonimamente e aplica novamente a reconciliação #3. Não utiliza `LICHESS_API_TOKEN`, mesmo em PRs do repositório principal. Se a página pública ainda não tiver metadados de algum jogo e a API anônima exigir autenticação, o botão de replay pode não aparecer **somente na prévia**. Para partidas privadas, mesmo quando o JSON contiver os metadados, o widget externo pode exigir autenticação: o link original completo continua disponível.

Fonte da interface: https://lichess.org/developers (Embed a chess game in your site).
