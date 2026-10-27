# Melhoria #17 — Regras do Campeonato

Página **Regras 📜** adicionada ao menu com conteúdo estático e acessível, sem gravação em planilha ou acesso adicional à API.

## Conteúdo
1. Correspondência Lichess: **1 dia por lance = prazo de resposta**, não limite de um lance por dia.
2. Schuring, cores fixas, um confronto ativo por jogador e liberação até rodada de referência + 1; partidas anteriores pendentes podem começar se ambos livres.
3. Vitória 1, empate 0,5, derrota 0; Bye usa somente pontuação registrada no Sheets e não equivale a vitória. Na coluna J (rodadas disputadas), apenas Bye de exatamente 1 ponto aumenta a contagem; Bye com 0 ou 0,5 não aumenta. Bye continua excluído dos critérios de desempate por jogos efetivos.
4. Ordem de desempates da melhoria #16: confronto direto (incluindo minitorneio), vitórias, Sonneborn–Berger, Koya e jogos efetivamente concluídos com pretas; posição compartilhada se o empate persistir, projeções parciais sinalizadas.
5. Fair play: jogador não pode empregar engine, IA para sugerir lances nem conselhos enquanto joga; livros e exploradores de abertura sem engine são permitidos no correspondence do Lichess. É permitido e incentivado **assistir** a partidas alheias ativas, mas não **comentar ou divulgar avaliações/análises** sobre elas até serem encerradas; depois, debater e analisar é incentivado.
6. Contato privado com o organizador em caso de problemas; não se inventam punições nem se modificam regras do Lichess.

## Homologação
- Desktop e celular: menu com oito opções, destaque da aba atual, âncoras dentro de Regras e botões para Rodadas, Tabela e Ajuda.
- Conferir compreensão dos participantes sobre a distinção entre assistir e comentar partidas ativas.
- Confirmar por escrito a redação final e, especialmente, os cinco desempates antes da comunicação aos jogadores.
- Executar `npm test`, testes Python existentes e CI de prévia da PR.
