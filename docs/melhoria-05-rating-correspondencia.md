# Melhoria #5 — Rating de correspondência do Lichess

## Fonte

A etapa existente `scripts/validate_lichess_players.py` (melhoria #1) já consulta `GET https://lichess.org/api/user/{username}` durante cada GitHub Actions. Reutilizamos **a mesma resposta**, sem acrescentar consultas ou tokens.

Para cada participante da edição ativa, a propriedade `players[].lichessCorrespondence` contém:

- `status`: `disponivel`/`indisponivel`;
- `rating`: valor inteiro de `perfs.correspondence.rating` quando disponível;
- `provisional`: `true` somente quando `perfs.correspondence.prov === true`;
- `games`: número de partidas, quando disponível;
- `checkedAt`: horário da atualização dos perfis.

`source.lichessCorrespondenceCheckedAt` registra a mesma sincronização. A indisponibilidade do perfil ou ausência de `perfs.correspondence` **não** permite recorrer a blitz, rapid ou classical. Dados de rating antigos são descartados quando a validação falha. Nenhuma célula do Google Sheets é escrita.

## Site

Ao lado dos jogadores na classificação, partidas e prévia dos líderes, `Corr. 1620` é mostrado discretamente. `Corr. 1620?` indica provisório, `Corr. —` indica indisponível. Clique/toque no selo ou use Tab + Enter/Espaço para abrir detalhes, incluindo quantidade de partidas e link ao perfil validado. Histórico de campeonatos encerrados não recebe o rating atual.

O rating Lichess é distinto dos **pontos do campeonato** e nunca altera classificação, regra de desempate ou partidas.

## Verificação

1. Publique a branch no GitHub (merge do PR). Execute Actions → Publicar campeonato → Run workflow.
2. Confira `players[].lichessCorrespondence` no `data/campeonatos.json` publicado.
3. Abra a página em celular e computador e teste clique/toque e teclado no selo.
4. Confirme que o selo de rating não interfere com o placar oficial nem com Bye.

Execute localmente `python3 -m unittest discover -s tests -p "test_*.py"` e `node --test tests/*.test.mjs`.
