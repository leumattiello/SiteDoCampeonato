# Melhoria #3 — Resultados e status automáticos

## Objetivo

Consultar as informações já importadas do Lichess (#2), validar **ID da partida, ambos os jogadores e respectivas cores** contra os nicks confirmados (#1) e **utilizar resultado/status verificado no site** quando não houver resultado oficial preenchido no Google Sheets.

## Ordem das fontes e regras de segurança

1. **Folga (Bye)**: permanece exatamente com `result = "bye"` e o valor `byePoints` importado da coluna B. Lichess nunca concede pontos de Bye.
2. **Placar oficial informado em B/C** (`1-0`, `0-1`, `½-½`): SEMPRE prevalece sobre o Lichess. Se a API discordar, o placar não muda; registra-se `conflito` nos logs/JSON e aviso no site.
3. **Sem placar oficial**: a API só pode fornecer o resultado se o jogo for o da coluna F, os IDs de ambos os jogadores forem os nicks validados e as cores corresponderem exatamente a A (brancas) e D (pretas).
4. Partida `started` sem placar oficial é considerada **em andamento** e ocupa ambos os jogadores para o controle da próxima partida; estados `created`, `aborted` e `noStart` não geram automaticamente status de andamento.
5. Partida encerrada com vitória comprovada ou empate usa o placar informado pela API na classificação, sem escrever no Google Sheets. Jogo encerrado sem vencedor/empate verificável NÃO é pontuado.
6. Falha, cache vencido, HTTP 401/404, link errado, nick sem validação ou jogo repetido em dois confrontos **não** geram pontuação automática.
7. Edições históricas não são automaticamente alteradas; dependem de mapeamento explícito de nicks antigos (#10).

## Dados publicados

`data/campeonatos.json` permanece gerado pelo GitHub Actions. Os campos originais dos confrontos (`result`, `status`, `byePoints`, `url`, `start`, `end`) continuam representando a planilha. O campo adicional opcional `lichessDecision` pode conter:

- `{ "status": "finished", "result": "1-0" }`: placar verificado aplicado pelo **modelo do site**.
- `{ "status": "playing" }`: jogo ativo confirmado, ocupa ambos os jogadores.
- `{ "status": "manual", "reason": "planilha_prevalece" }`: resultado oficial preservado.
- `{ "status": "conflito", "reason": "placar_divergente", "apiResult": "0-1" }`: divergência sem mudança do placar oficial.
- `{ "status": "ignorado", "reason": "jogadores_ou_cores_divergentes" }`: sem aplicação automática.

Os contadores ficam em `source.lichessResultsSummary`, com horário em `source.lichessResultsCheckedAt`.

**Não há segredo ou token em nenhuma dessas informações.** A autenticação de leitura Lichess continua no secret GitHub `LICHESS_API_TOKEN`, usado pela etapa #2.

## Workflow

1. `scripts/sync_google_sheets.py` — importa planilha.
2. `scripts/validate_lichess_players.py` — valida nicks (#1).
3. `scripts/sync_lichess_games.py` — baixa/cacha partidas (#2).
4. `scripts/resolve_lichess_results.py` — resolve os resultados e estados (#3).
5. GitHub Pages — publica o site que usa `js/model.js` para classificar e bloquear partidas.

Para executar localmente, a partir da raiz do repositório:

```bash
python3 scripts/resolve_lichess_results.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

`resolve_lichess_results.py` é seguro de reexecutar no JSON local: remove decisões antigas e somente usa importação atual `ok` ou `cache`. Ele não consulta a rede.

## Verificação após o push

No GitHub → Actions → **Publicar campeonato** procure a etapa **Conciliar resultados e status Lichess (melhoria #3)**. O log informa contadores de `auto_finalizados`, `em_andamento`, `manuais`, `conflitos` e `ignorados`. Depois, no Pages, compare a classificação, os confrontos e as próximas partidas.

Como já existem muitos placares manuais, **é esperado que o contador `manuais` seja alto e `auto_finalizados` possa ser zero**; o objetivo é que futuras partidas terminadas sejam pontuadas automaticamente **enquanto B/C estiverem vazias**. Não apague resultados oficiais apenas para testar.

Critérios de aceite: ao terminar uma partida sem placar preenchido, o site deve exibir placar e pontos corretamente; jogos iniciados devem impedir outros confrontos dos envolvidos; divergências devem manter o placar da planilha e emitir aviso; valores de Bye devem permanecer idênticos.
