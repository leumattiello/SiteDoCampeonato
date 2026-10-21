# Melhoria #16 — Desempate Schuring

## Cálculo

Após empate em pontos, utilizar sequencialmente:
1. Pontos obtidos em confrontos diretos entre os empatados (minitorneio para três ou mais);
2. Número de vitórias efetivas (excluindo Bye);
3. Sonneborn–Berger: somar os pontos atuais de cada oponente vencido e metade dos pontos do oponente empatado;
4. Koya: somar os pontos obtidos contra adversários que tenham pelo menos 50% dos pontos possíveis na edição;
5. Número de partidas concluídas com peças pretas (critério local).

Empatados em todos os critérios dividem posição. Nomes podem estabilizar a ordem visual dentro de posição compartilhada, sem constituir sexto critério.

## Parcialidade e Bye

Confrontos pendentes não são tratados como concluídos, nem usados para preencher confronto direto. Bye acrescenta apenas os pontos registrados na planilha: não representa vitória, não concede pontuação a confronto direto/SB/Koya e não soma partida de pretas. A tabela exibe * para cálculos provisórios enquanto restarem partidas pendentes. O cálculo Koya usa metade do total de confrontos previstos mais folgas na edição para definir a pontuação possível do oponente. Os pontos dos oponentes podem mudar ao longo do campeonato.

## Homologação

Validar com cenários de empate em dois e três jogadores, resultados parciais, Bye com zero/um ponto, empates finais e histórico. Confrontar a regra do sistema Koya e os efeitos de confrontos ainda não jogados com o regulamento antes da oficialização. Não alterar a pontuação nem os confrontos da planilha.
