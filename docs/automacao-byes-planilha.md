# Automação dos Byes na planilha oficial

Na aba `2`, a coluna **B** das nove linhas com **E = Bye** contém
fórmulas nativas do Google Sheets, e não valores constantes. A referência é
`Config!B2` (`rodada_atual`).

Exemplo, na célula **B48** (Bye da rodada 7, identificada em A43):

```gs
=IF(Config!$B$2>=VALUE(REGEXEXTRACT($A$43;"[0-9]+"));1;0)
```

A fórmula é análoga em B6/A1, B13/A8, B20/A15, B27/A22,
B34/A29, B41/A36, B48/A43, B55/A50 e B62/A57.

- Rodada do Bye **menor ou igual** à rodada atual: B = **1**.
- Rodada do Bye **futura**: B = **0**.
- Ao mudar `Config!B2`, a pontuação de todas as folgas é recalculada
  automaticamente **sem Apps Script, token, gatilho ou nova consulta ao Lichess**.
- As fórmulas de K2:L10 já somam esses pontos; apenas Bye de exatamente
  um ponto aumenta a contagem de rodadas disputadas. A regra de desempate,
  vitórias e jogos efetivamente jogados não muda.
- Os valores do Bye são importados como resultado pelo Python e exibidos
  pelo site como antes. A automação existe **na planilha oficial** e não
  depende do merge do repositório.
- Atenção: se for necessário deslocar linhas ou adicionar novas rodadas,
  revisar os endereços dos cabeçalhos e dos Byes; fórmulas novas devem
  seguir a mesma regra.

## Verificação

Com `Config!B2=6`, as seis primeiras folgas mostram 1 e as três
últimas mostram 0. Ao mudar a rodada de referência para 7, B48
passará a 1, e as demais manterão sua pontuação esperada. Usar
`scripts/check_bye_formulas.py` para verificar a regra e os endereços
esperados, sem modificar a planilha.
