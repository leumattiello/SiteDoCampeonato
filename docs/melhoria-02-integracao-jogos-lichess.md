# Melhoria #2 — Integração dos jogos Lichess ao GitHub Actions

Esta entrega implementa a funcionalidade de ID **2** da aba `Melhorias` da planilha `Campeonato de Xadrez`.

## Escopo

O workflow `Publicar campeonato` foi ampliado com uma etapa **Consultar partidas no Lichess (melhoria #2)**, executada **após** a importação do Google Sheets e a validação de nicks (#1), mas **antes** da publicação no GitHub Pages.

- Para cada partida não-Bye com URL na coluna **F**, extrai o ID apenas de URLs válidas `https://lichess.org/<ID>` ou `https://lichess.org/<ID>/white|black`.
- A URL da API é construída apenas com esse ID. Links inválidos são registrados, nunca requisitados.
- Consulta sequencialmente `GET https://lichess.org/game/export/{gameId}` com `Accept: application/json`, recuperando informações públicas da partida (jogadores, estado, quem venceu, datas públicas, movimentos, abertura quando disponível).
- Cada partida recebe `lichessGame` e `lichessImport` no `data/campeonatos.json` **gerado durante o workflow**, sem alterar `white`, `black`, `result`, `status`, `byePoints`, `start` ou `end` oficiais.
- A origem mantém `source.lastSync` como instante de importação do Google Sheets e acrescenta `source.lichessGamesCheckedAt` e `source.lichessGamesSummary`.
- Uma falha (404, 5xx, timeout, JSON incompatível) fica nos logs e não derruba a página. Se houver cache anterior da mesma partida, o registro é mantido com status `desatualizado`.
- Em HTTP 429, espera **60 segundos** e tenta mais uma vez; persistindo a limitação, suspende novas consultas naquela execução. Recomendações oficiais: <https://lichess.org/page/api-tips>.
- Jogos finalizados são reutilizados do cache. Jogos ativos são reconsultados após 15 minutos; `Run workflow` ignora esse prazo para os ativos.
- O cache **não** é publicado no Pages ou armazenado no repositório. É reutilizado entre execuções via `actions/cache@v4` (arquivos `.cache/lichess-games.json`). Cache pode expirar: script continua funcionando sem ele.
- Se não houver links na coluna F, a etapa termina com sucesso e registra `0 links`, sem chamadas à API.

## Como publicar

1. Extrair o ZIP desta melhoria **na raiz do repositório já atualizado com #1**, preservando caminhos.
2. Verificar mudanças com `git diff --check` e `git status`.
3. Testar: `py -m unittest discover -s tests -p 'test_*.py' -v` (Windows) e `npm test` se Node.js instalado.
4. Enviar para o GitHub:
   ```powershell
   git add .github/workflows/pages.yml .gitignore scripts/sync_lichess_games.py tests/test_sync_lichess_games.py docs/melhoria-02-integracao-jogos-lichess.md
   git commit -m "feat: integrar partidas do Lichess no Actions (#2)"
   git push
   ```
5. Conferir GitHub → Actions → **Publicar campeonato** → etapa **Consultar partidas no Lichess (melhoria #2)**. Ela exibe total de links, partidas únicas, consultas reais, cache, links inválidos e indisponibilidades.
6. Preencher na aba de campeonato (`2`) a **coluna F** de uma partida real (URL pública do Lichess) para testar. Executar **Run workflow** manualmente e depois conferir `<endereço do site>/data/campeonatos.json` e os campos `lichessGame`/`lichessImport` dessa partida.

## Estrutura do resultado (exemplo fictício)

```json
{
  "lichessImport": {"status": "ok", "checkedAt": "2026-10-15T20:00:00+00:00"},
  "lichessGame": {
    "id": "aB12cD34",
    "url": "https://lichess.org/aB12cD34",
    "status": "started",
    "winner": null,
    "players": {
      "white": {"id": "brancas", "name": "Brancas"},
      "black": {"id": "pretas", "name": "Pretas"}
    },
    "createdAt": "2026-10-01T12:00:00+00:00",
    "lastMoveAt": "2026-10-15T11:00:00+00:00",
    "moves": "e4 e5 Nf3 Nc6",
    "opening": null,
    "perf": "correspondence",
    "daysPerTurn": 1,
    "fetchedAt": "2026-10-15T20:00:00+00:00"
  }
}
```

`lichessImport.status` é `ok` (consulta feita), `cache` (dados reutilizados), `desatualizado` (falha com cache anterior), `indisponivel` (falha sem cache) ou `link_invalido` (URL rejeitada).

## Limites e próximas entregas

- **Esta melhoria #2 NÃO substitui resultados da planilha, NÃO altera a classificação, NÃO edita o Google Sheets nem exige login de jogadores.** Para calcular e exibir resultados com base no Lichess, implementar a melhoria #3, incluindo validação de pares/cores.
- `createdAt` e `lastMoveAt` **não** são garantia das datas oficiais exatas de primeiro lance ou encerramento (#4).
- Recursos adicionais de visualização de tabuleiro (#6) e estatísticas (#8) poderão consumir o JSON já consolidado.
- A consulta real ainda depende de links válidos na coluna F. Até que existam, testes do endpoint são simulados (sem chamadas de rede).


## Correção dos erros HTTP 401 e 404 (outubro/2026)

- **Links de 12 caracteres:** o link de partida pode ter 8 caracteres públicos seguidos de 4 caracteres adicionais de acesso. O endpoint `GET /game/export/{gameId}` requer **8 caracteres**. A integração extrai os oito primeiros automaticamente, não altera a coluna F nem mostra os quatro caracteres extras nos logs. Ex.: `Ab12Cd34wxyz` → `Ab12Cd34`.
- **HTTP 401:** a API recusou a consulta sem autorização; não significa necessariamente que o link da planilha esteja errado. O script registra `lichessImport.status = acesso_restrito` e `httpStatus = 401`. Confira se o link `https://lichess.org/game/export/<ID-PUBLICO-DE-8-CHARS>` abre sem login, em janela privada do navegador. Se não abrir, é necessário investigar acesso/visibilidade do jogo no Lichess. **Não adicionar token dos jogadores à planilha, ao código, ao JSON público ou ao repositório.**
- **HTTP 404:** jogo não encontrado pela API para o ID consultado. O script registra `nao_encontrado` e `httpStatus = 404`. Após esta correção, links de 12 caracteres deixam de provocar requisições com ID incorreto. Outros casos de 404 exigem conferência do link.
- **Cache e dados oficiais:** se houver jogo válido em cache, continua sendo preservado com `desatualizado`; o HTTP é acrescentado em `lichessImport.httpStatus` para diagnóstico. A consulta não altera resultados, Bye, status oficial nem classificações.
- **Resumo:** mantém `indisponivel` para compatibilidade e acrescenta contagens `acesso_restrito` e `nao_encontrado`.

Para publicar esta correção após a melhoria #2, extrair o ZIP na raiz do repositório e executar:

```powershell
git diff --check
git status
git add scripts/sync_lichess_games.py tests/test_sync_lichess_games.py docs/melhoria-02-integracao-jogos-lichess.md
git commit -m "fix: corrigir IDs privados e diagnósticos da API Lichess"
git push
```

**Validação:** GitHub Actions → Publicar campeonato → Run workflow, e verificar a etapa `Consultar partidas no Lichess (melhoria #2)`. Uma resposta HTTP 401 persistente não pode ser resolvida somente cortando o ID ou alterando o User-Agent; a causa precisa ser verificada no Lichess.

Fontes: documentação oficial <https://lichess.org/api#tag/Games/operation/gamePgn> e <https://lichess.org/page/api-tips>.
