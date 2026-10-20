# Melhoria #11 — Sugerir partidas não vinculadas

O script consulta apenas a API pública de partidas por jogador no Lichess (correspondência), por janela de datas da edição atual. Considera nicks explicitamente validados, cores oficiais, data de criação compatível, tempo 1 dia por lance quando a API informar, resultado compatível e inexistência de vínculo anterior pelo ID. Não sugere se o mesmo par/cores tem vários confrontos pendentes. Limita a consulta a doze perfis e oitenta jogos por perfil; trata indisponibilidade e HTTP 429 como busca incompleta.

A aba **Sugestões** mostra até três candidatos por confronto. Cada link deve ser conferido pelo organizador, que pode copiá-lo para a coluna F do Sheets. Não há autenticação de escrita, nenhuma ação modifica Sheets, e nenhuma partida vira oficial apenas porque foi sugerida. Sem acesso público, o jogo pode não ser encontrado.

Testes: `python -m unittest discover -s tests -p 'test_*.py'` e `npm test`. O workflow de PR usa API anônima; produção mantém o token do sincronizador apenas para jogos já vinculados.

## Confrontos aptos a iniciar

Na aba **Rodadas**, a lista de partidas aptas segue a ordem original da planilha, sem impor limite artificial. Exige confronto não iniciado, sem link Lichess, sem resultado/Bye, com ambos os jogadores livres, na rodada de referência ou em qualquer rodada anterior ainda pendente, admitindo no máximo a rodada de referência + 1. Um resultado marcado Finalizado sem placar não libera indevidamente os jogadores. Jogos na lista podem compartilhar participantes; nesse caso são **opções alternativas** e iniciar uma impede iniciar a outra. A lista é consultiva e atualizada apenas com os dados importados; não cria desafios nem altera a planilha.
