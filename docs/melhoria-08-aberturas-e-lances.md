# Melhoria #8 — Aberturas, lances e término

## Dados e apresentação

O Lichess já é consultado pelo importador da #2 usando `opening=true&moves=true`; por isso a #8 **não adiciona requisições**, tokens ou dependências. As fichas das rodadas, últimos confrontos, confrontos em andamento e a batalha selecionada passam a apresentar abertura, lances e, quando encerrada, a forma de término.

**Abertura:** usa `lichessGame.opening.name` e, se disponível, o código ECO. A API pode não identificar uma abertura: mostramos **não identificada**, sem deduzir a partir de lances.

**Contagem:** cada jogada de um jogador (uma SAN) é um **lance individual / meio-lance**; cada par consecutivo brancas + pretas é um **par completo**. Por exemplo: `1.e4 e5 2.Nf3` = **3 individuais; 1 par completo + 1 sem resposta**. O parser aceita SAN normalizada da API ou PGN com numeração, comentários, anotações, variações e resultado, contando apenas a linha principal. Em caso de entrada vazia, truncada ou malformada exibe **não informados**, nunca deduz uma contagem.

**Término:** mapeia os estados finais conhecidos da API (xeque-mate, desistência, tempo esgotado, empate, afogamento etc.). Partidas em andamento não recebem uma conclusão fictícia.

## Segurança e regras

1. Exibe estatísticas apenas de partidas associadas a URL e ID consistentes com a exportação e com `lichessImport` em `ok` ou `cache`.
2. Exige conciliação #3 com `lichessDecision` `playing`, `finished` ou `manual`; conflitos, jogos ignorados, Byes e dados divergentes não são utilizados para cálculo.
3. Estatísticas de partidas em andamento representam o **último registro público**, que pode estar atrasado (incluindo restrições de prevenção a trapaças do Lichess).
4. Dados ausentes são sinalizados; resultados/pontos/Byes originais e Google Sheets não são modificados.
5. Não muda o workflow de publicação nem a prévia, pois ambos já trazem `opening` e `moves` nas importações e já copiam `js/*.js`.

## Testes

`node --test tests/*.test.mjs` cobre contagem de SAN/PGN, numeração, variações, comentários, NAG, roque, promoções, ímpares, términos e proteções contra vínculos inválidos. Após o merge, confirme a prévia com jogos validados e a ausência de dados inventados quando a API não identificar abertura ou lances.
