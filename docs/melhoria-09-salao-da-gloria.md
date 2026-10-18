# Melhoria #9 — Salão da Glória

## Regras
1. **Grande Cerco:** maior duração em dias corridos (G/H), premiando ambos os participantes; duração não representa habilidade.
2. **Batalha Épica:** partida concluída com maior quantidade de lances individuais (meio-lances) verificados; premia ambos.
3. **Ataque Relâmpago:** vitória com menos meio-lances verificados; somente vencedor.
4. **Conquistador:** maior número de vitórias efetivas. Bye e empate não são vitórias.
5. **Escudo Invicto:** maior sequência de vitórias ou empates, ordenada por data final. Sem horário disponível, jogos encerrados na mesma data são agrupados; havendo derrota no dia, a sequência é interrompida, sem inventar ordem.
6. **Mestre das Aberturas:** maior número de códigos ECO distintos confirmados nas partidas finalizadas de um jogador, com mínimo dois. Uma partida conta para ambos os participantes. Mede variedade, não habilidade.

Empates no melhor resultado incluem todos os premiados e suas partidas. Informações de lances/ECO dependem da validação da #3/#8. Faltas de dados não geram estatísticas inventadas; a honraria fica provisória se o torneio está incompleto ou faltam dados relevantes.

O widget lista participantes, critérios, métricas e partidas, com links Lichess quando existentes. Não edita a planilha, resultados, datas ou Bye. Validação: `node --test tests/*.test.mjs` e prévia do PR.
