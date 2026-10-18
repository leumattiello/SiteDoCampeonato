# Melhoria #7 — Acompanhar jogos em andamento

## Critérios de exibição

- **♟ Acompanhar tabuleiro** aparece apenas para partidas ativas da edição atual com `lichessDecision.status=playing` da conciliação #3, que já verifica ID, nicks, cores e unicidade.
- Exige `lichessImport.status=ok` ou `cache`, ID coincidente, estado Lichess `started`, nenhum vencedor nem resultado final/Bye. Estado manual sozinho não permite o botão.
- A incorporação oficial usa somente ID público de oito caracteres em `https://lichess.org/embed/game/{id}`; o link original completo permanece disponível em **Abrir no Lichess**.
- Tabuleiro somente para visualizar: o site não recebe tokens, não chama a Board API e não apresenta controles para fazer lances. A janela fecha por botão, clique fora ou Esc, descarregando o iframe.
- Data de última consulta vem de `lichessGame.fetchedAt`, nunca de `lichessImport.checkedAt` em itens do cache. Em consulta nova, `checkedAt` só é fallback se `fetchedAt` estiver ausente. Acima de 70 minutos ou sem data, marca dados antigos.
- O Lichess pode ocultar os últimos lances de jogos ativos por prevenção a trapaças, independentemente do horário da consulta. Isto **não** é transmissão em tempo real.
- Em jogos privados ou embed indisponível, usar o link original do Lichess; falhas do iframe externo não são detectáveis com segurança pelo site estático.

## Testes e prévia

- `node --test tests/*.test.mjs` inclui casos de Bye, encerramento, IDs incorretos, validação, cache e timestamps.
- `python -m unittest discover -s tests -p 'test_*.py'` cobre a verificação de cores, jogadores e a conciliação #3.
- A prévia do PR utiliza Lichess anônimo e dados anteriormente públicos: jogos restritos podem não aparecer; o site oficial mantém o token no GitHub Secret.
- O workflow de publicação existente permanece inalterado. Nenhuma alteração no Google Sheets ou Apps Script.
