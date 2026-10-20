# Melhoria #10 — Rivalidades e campeões anteriores

- Edições anteriores exibidas individualmente com sua classificação, título, campeão e confrontos.
- Campeão único apenas quando a edição está inteiramente encerrada e há um único líder por pontos; empate de pontuação não define campeão por ordenação alfabética.
- Rivalidade por edição: vitórias, derrotas, empates e partidas vinculadas a cada par de adversários, sem somar Bye ou jogos sem resultado.
- Rivalidade entre edições: exige confrontos do mesmo par em duas ou mais edições, e **ambos** os nicks da edição anterior precisam estar associados explicitamente à aba Jogadores e confirmados na validação de perfis do Lichess. Nicks conflitantes são ignorados. O nome exibido é o atual, mas partidas são identificadas por edição e nomes originais.
- As edições são mantidas separadas no histórico, com links Lichess quando existentes; o campeonato atual continua em destaque na página inicial.
- As partidas históricas permanecem sem enriquecimento da API até mapeamento/validação específica. Não há alteração da planilha, pontuação ou Apps Script.
- Testes: `npm test` e `python -m unittest discover -s tests -p 'test_*.py'`.
