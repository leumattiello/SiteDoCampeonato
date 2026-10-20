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

Onze títulos: Rei da Sicília (Siciliana), Rei da Itália (toda a Abertura Italiana, incluindo Giuoco Piano/Pianissimo, Defesa dos Dois Cavalos, Gambito Evans e Fegatello/Fried Liver Attack), Rei da Espanha (Ruy Lopez), Rei da Inglaterra (Inglesa), Rei das Índias (Índia do Rei/da Dama), Rei da França (Francesa), Tzar da Rússia (Petrov), Arquiduque da Áustria (Vienense), Lorde da Escócia (Scotch Game), Imperador da Escandinávia (Escandinava) e Conde da Holanda (Holandesa).

Cada título conta **vitórias** em partidas encerradas com abertura validada pelo Lichess. O nome explícito da abertura tem precedência; ECO é fallback quando o nome não está presente. Empates distribuem a coroa a todos os líderes. Cada medalha utiliza uma silhueta cartográfica estilizada em SVG local. Títulos sem vitórias permanecem sem conquistador. Não há rótulo de «provisória» no site.

### Ampliação do Rei da Itália

São aceitas todas as variantes da família **Abertura Italiana**, incluindo **Giuoco Piano/Pianissimo**, **Defesa dos Dois Cavalos**, **Gambito Evans** e **Fegatello / Fried Liver Attack**. A identificação usa o nome verificado pelo Lichess (por exemplo, `Italian Game: Two Knights Defense, Fried Liver Attack`) e, na ausência de nome, a faixa **ECO C50–C59**. Se houver nome explícito, ele prevalece sobre ECO para evitar misturar outras famílias. Só vitórias entram na contagem; empates na liderança dividem a honraria.


### Vitrine de honrarias na página inicial

A página **Início** mostra **até cinco honrarias em destaque** (não é um histórico de concessão, pois não existem registros de data de outorga das medalhas). A seleção usa as partidas que sustentam cada honraria: prioriza duas tradicionais e três tronos regionais já conquistados, com preferência para o encerramento de partida mais recente em cada grupo. Se não houver cinco conquistas, completa com outras honrarias conquistadas e, por último, tronos ainda sem vencedor. Data ausente não é estimada: o desempate usa a ordem oficial das honrarias.

Os tronos regionais preservam o desenho vetorial do mapa; cada item é clicável e abre a página **Glória**, onde permanecem disponíveis todas as 17 honrarias e seus critérios. As honrarias são dinâmicas e não usam o rótulo de provisoriedade.
