# Melhoria #9 — Salão da Glória

## Regras
1. **Grande Cerco:** maior duração em dias corridos (G/H), premiando ambos os participantes; duração não representa habilidade.
2. **Batalha Épica:** partida concluída com maior quantidade de lances individuais (meio-lances) verificados; premia ambos.
3. **Ataque Relâmpago:** vitória com menos meio-lances verificados; somente vencedor.
4. **Conquistador:** maior número de vitórias efetivas. Bye e empate não são vitórias.
5. **Escudo Invicto:** maior sequência de vitórias ou empates, ordenada por data final. Sem horário disponível, jogos encerrados na mesma data são agrupados; havendo derrota no dia, a sequência é interrompida, sem inventar ordem.
6. **Mestre das Aberturas:** maior número de códigos ECO distintos confirmados nas partidas finalizadas de um jogador, com mínimo dois. Uma partida conta para ambos os participantes. Mede variedade, não habilidade.

Empates no melhor resultado incluem todos os premiados e suas partidas. Informações de lances/ECO dependem da validação da #3/#8. Faltas de dados não geram estatísticas inventadas. As honrarias são tronos dinâmicos que mudam automaticamente conforme novos resultados, sem indicação de provisoriedade.

O widget lista participantes, critérios, métricas e partidas, com links Lichess quando existentes. Não edita a planilha, resultados, datas ou Bye. Validação: `node --test tests/*.test.mjs` e prévia do PR.

## Tronos regionais

Onze títulos: Rei da Sicília (Siciliana), Rei da Itália (Giuoco Piano/Pianissimo), Rei da Espanha (Ruy Lopez), Rei da Inglaterra (Inglesa), Rei das Índias (Índia do Rei/da Dama), Rei da França (Francesa), Tzar da Rússia (Petrov), Arquiduque da Áustria (Vienense), Lorde da Escócia (Scotch Game), Imperador da Escandinávia (Escandinava) e Conde da Holanda (Holandesa).

Cada título conta **vitórias** em partidas encerradas com abertura validada pelo Lichess. O nome explícito da abertura tem precedência; ECO é fallback quando o nome não está presente. Empates distribuem a coroa a todos os líderes. Cada medalha utiliza uma silhueta cartográfica estilizada em SVG local. Títulos sem vitórias permanecem sem conquistador. Não há rótulo de «provisória» no site.
