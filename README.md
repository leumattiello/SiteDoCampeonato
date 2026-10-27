# Reinos do Xadrez

Site gratuito para campeonatos de xadrez por correspondência, hospedado no **GitHub Pages**, com dados vindos de uma planilha pública no **Google Sheets**. HTML/CSS/JavaScript puro: sem backend, banco de dados, contas para os jogadores ou build Node em produção.

## O que já funciona

- Página inicial medieval e responsiva; visualização por participante (seleção salva apenas no próprio navegador).
- Classificação calculada automaticamente: vitória 1, empate 0,5, derrota 0 e folga com pontuação variável definida pela coluna B da respectiva linha na planilha. O indicador J (rodadas disputadas) contabiliza somente Bye de **exatamente 1 ponto**, além dos jogos concluídos; Bye de 0 ou 0,5 ponto não aumenta J.
- Rodadas Schuring; confronto pronto apenas se os dois não estiverem disputando outra partida e sua rodada for no máximo **rodada atual + 1**. Uma partida antiga (abaixo da rodada atual) pode ser iniciada se ambos estiverem livres.
- **Resultado sobrepõe status**: o placar `1–0`, `0–1` ou `½–½` é tratado como finalizado mesmo que E ainda diga `Em andamento`.
- Links do Lichess (quando preenchidos); datas de início/fim; duração em dias; últimas cinco partidas por data de fim (quando informada).
- Salão da Glória (conquistas com dados disponíveis); Academia do Lichess com dois tutoriais (criar uma partida e aceitar um desafio), com instruções para celular e computador. Os passos de computador também podem ser seguidos no navegador do celular (Chrome, Firefox etc.); histórico da edição anterior.
- Arquivos de exemplo são **dados reais da planilha enviada em 14/10/2026**, mas **não representam uma sincronização ao vivo**. O status do site indica isso.

### Melhoria #6 — Replay das partidas finalizadas

Confrontos concluídos **com jogo confirmado na sincronização Lichess (#3)** exibem **♜ Rever partida** nas Rodadas e nas Partidas recentes. Ao selecionar, abre-se um tabuleiro oficial incorporado do Lichess, com navegação por lances, sem sair do site. A incorporação é carregada somente após o clique; a janela fecha por botão ou Esc, em computador e celular. O link **Abrir no Lichess ↗** permanece sempre visível para jogos com URL válida, servindo também como alternativa quando a incorporação for bloqueada por navegador, privacidade ou Lichess.

Por segurança, só há replay quando o resultado final, o ID do jogo e a decisão validada pela melhoria #3 concordam. Jogos em andamento, Byes, inconsistências e edições históricas ainda não verificadas não são oferecidos para replay. A integração não grava na planilha nem faz novas requisições à API em cada navegador. Veja `docs/melhoria-06-replay-lichess.md`.

## Layout de cada aba de campeonato

**Não mude as cinco colunas originais!** O importador usa o layout real da planilha:

| Coluna | Conteúdo | Exemplo |
|---|---|---|
| A | Jogador das brancas, ou uma linha `Rodada 5` | Humberto |
| B | Pontos das brancas | 1 |
| C | Pontos das pretas | 0 |
| D | Jogador das pretas | Enrico |
| E | Status manual | Em andamento |
| F (nova) | URL completa do jogo no Lichess | `https://lichess.org/abcdef` |
| G (nova) | Data de início | `14/10/2026` |
| H (nova) | Data de encerramento | `28/10/2026` |

Nas linhas de folga (`Bye` em E), D fica vazia e **B define a pontuação concedida** (ex.: `1`, `0,5` ou `0`). B vazia equivale a 0 ponto. A coluna **Bye (pts)** da classificação exibe os pontos recebidos em folgas, não a quantidade de folgas. Uma folga de **1 ponto** aumenta o indicador J de rodadas disputadas; folgas de **0 ou 0,5 ponto** não o aumentam. Em nenhum caso a folga conta como vitória ou partida de pretas para desempates. Não preencher resultado `1–0` antes do encerramento. Para a URL use o endereço completo como texto visível da célula; evite `=HYPERLINK(...; "Clique aqui")`, que pode exportar só o rótulo.

Se alguém registrar pontos e esquecer de trocar E de `Em andamento` para `Finalizado`, o resultado terá prioridade. Se marcar `Finalizado` mas **não** preencher B e C, o site sinalizará `Falta informar o resultado` e não atribuirá pontos.

### Rodada atual e apelidos

Em `data/campeonatos.json`, cada torneio contém `currentRound` (começa em **4** para o atual) e `sheet` (abas `2` e `1`, respectivamente). **Você pode editar `currentRound` manualmente** no JSON ou, preferencialmente, criar a aba opcional `Config` descrita abaixo, que permite alterá-la sem commit. Não calculamos automaticamente pela menor rodada pendente.

A lista `players` contém pares `{ "name": "Humberto", "lichess": "Humberto_M" }`. Os outros nomes vieram da planilha, mas os nicks não estão verificados: preencha `lichess` com os respectivos apelidos confirmados. O site mostra `Nome (Nick)` quando o apelido está preenchido e apenas `Nome` caso contrário. A sincronização preserva essa lista; você pode também criar a aba opcional `Jogadores` descrita abaixo para atualizar os apelidos sem commit.

### Abas opcionais para administrar tudo pelo Sheets

- Aba chamada exatamente **`Config`**: linha A1=`Chave`, B1=`Valor`; linha A2=`rodada_atual`, B2=`4` (depois atualize esse número para 5, 6 etc. quando o organizador avançar a rodada de referência).
- Aba chamada exatamente **`Jogadores`**: A1=`Nome`, B1=`Nick Lichess`; linhas seguintes, por exemplo A2=`Humberto`, B2=`Humberto_M`, com os demais participantes em novas linhas. Os nomes em A devem coincidir exatamente com os confrontos.

O importador lê essas duas abas quando existirem. Se não existirem, continua funcionando com `currentRound` e `players` do arquivo JSON do repositório. Assim, depois da configuração inicial, todo o trabalho de resultados, rodadas e apelidos pode ficar na mesma planilha.

### Últimos confrontos / conquistas

Sem datas reais de encerramento, a página mostra cinco partidas finalizadas por ordem reversa da planilha **com aviso de que não representam necessariamente as cinco mais recentes**. Ao cadastrar H, o site passa a usar exclusivamente partidas com fim conhecido, ordenadas por H; exibe menos de cinco enquanto houver menos de cinco datas.

`O Conquistador` usa vitórias; `Grande Cerco` e `Ataque Relâmpago` usam a diferença em dias corridos G→H; `Escudo Invicto` depende da ordem cronológica das datas H. Não incluímos folgas como partidas efetivas nessas conquistas.

## Como publicar com GitHub Pages (recomendado)

1. Crie um **repositório público** no GitHub (por exemplo, `reinos-do-xadrez`). Na conta GitHub Free, Pages para repositórios públicos é gratuito.
2. Envie todos os arquivos e pastas **como estão**, preservando `.github/workflows/pages.yml`, `index.html`, `css`, `js`, `data` e `scripts`. Mantenha a branch principal chamada `main` (se não for, ajuste o workflow).
3. Nas configurações do repositório, abra **Settings → Pages → Build and deployment → Source** e escolha **GitHub Actions**.
4. Vá em **Actions → Publicar campeonato → Run workflow** (ou faça push na main). A execução gera e publica o site; o endereço será semelhante a `https://SEU_USUARIO.github.io/reinos-do-xadrez/`.
5. Na planilha do Google, confira **Compartilhar → Acesso geral → Qualquer pessoa com o link → Leitor**. Se a consulta CSV abaixo falhar, também use **Arquivo → Compartilhar → Publicar na Web**. A publicação torna as abas publicadas visíveis a quem tiver o link: não publique dados privados.
6. Confira o log da ação **Atualizar resultados a partir da planilha pública**. As duas abas devem aparecer com totais importados (aba `1`: 15 partidas; aba `2`: 45 linhas incluindo 9 folgas). Se aparecerem avisos, o site ainda publica os dados de prévia e informa a ausência de sincronização. Nunca considere uma prévia como resultado ao vivo.
7. O workflow executa automaticamente **uma vez por hora** e também a cada push ou acionamento manual. O GitHub pode atrasar tarefas agendadas e desativar schedules em repositórios públicos inativos; confira o Actions periodicamente.

### Testar o CSV antes da publicação

No navegador, tente este endereço (aba `2`):

`https://docs.google.com/spreadsheets/d/1YlGQwfYdT_J633frIN_wPiW3ExYqjC1gcum2xi1KwGc/gviz/tq?tqx=out:csv&sheet=2&headers=0`

O esperado é receber/exportar uma tabela CSV incluindo as linhas `Rodada 1`, `Rodada 2` etc. Se o Google exigir login, publicar a aba ou habilitar o acesso público de leitura. O arquivo enviado ao ChatGPT **não prova que o endpoint CSV publicado está acessível**, portanto a integração só fica validada após uma execução bem-sucedida no GitHub Actions.

O importador usa `GOOGLE_SHEET_ID` de ambiente quando informado, caso contrário o ID da URL fornecida. As abas são endereçadas pelos nomes `1` e `2` usando `sheet=1` e `sheet=2`.

**Atenção:** se uma execução não conseguir ler uma aba, o workflow manterá a prévia salva no repositório para aquela aba e registrará o aviso no log. Para impedir publicação caso o Google esteja inacessível, altere a etapa para `python3 scripts/sync_google_sheets.py --strict`.

## Testar no computador (Windows ou Ubuntu)

Abra o terminal na pasta do projeto e rode `python -m http.server 8000` (no Ubuntu pode ser `python3 -m http.server 8000`), depois abra `http://localhost:8000`. Abrir `index.html` diretamente com `file://` não funciona porque o navegador bloqueia a leitura de JSON local.

Para testar a lógica, com Node.js instalado, execute `npm test`; para testar a leitura da coluna B no importador, execute `python -m unittest discover -s tests -p "test_*.py"` (ou `python3` no Ubuntu). Para testar o importador localmente, `python3 scripts/sync_google_sheets.py` (necessita acesso à internet e planilha publicada).

## Limites e próximos ajustes

- O site e o GitHub Actions não criam partidas nem modificam a planilha; o Apps Script vinculado pode preencher placares e datas quando autorizado. Todos os jogadores acessam sem senha; nomes e resultados são públicos.
- A Academia tem apenas dois tutoriais: criar partida e aceitar desafio. A opção “Estou no computador” também pode ser usada no Chrome, Firefox ou outro navegador do celular; os botões podem aparecer em lugares diferentes. **Capturas reais do Lichess devem ser adicionadas e verificadas** depois com as versões de aplicativo/navegador efetivamente usadas pelo grupo. O conteúdo não deve fingir ter telas ainda não produzidas.
- Critério de desempate oficial não foi definido. A classificação usa pontos, vitórias e nome apenas como ordenação de exibição; isso não é um regulamento de desempate.
- As datas do Google podem vir formatadas segundo a localidade da planilha. Recomenda-se `dd/mm/aaaa` para G e H.
- Se adicionar/remover linhas em uma edição, confira os IDs derivados de número da linha. Os cálculos em si são feitos pelo conteúdo atual da planilha.
- As abas auxiliares `Config` e `Jogadores` são opcionais; só passam a controlar esses dados depois de criadas e sincronizadas com sucesso.


## Atualizar a planilha manualmente

Para sincronizar os resultados sem esperar a execução automática, no repositório GitHub acesse **Actions → Publicar campeonato → Run workflow**, selecione `main` e confirme. Quando a publicação terminar, atualize a página do site. Não existe botão administrativo no site; a atualização é controlada pelo GitHub Actions.


### Melhoria #3 — Resultados e andamento pelo Lichess

Após sincronizar Google Sheets, validar os nicks e consultar o Lichess, o Actions concilia placares e estado das partidas pelo script `scripts/resolve_lichess_results.py`. **A planilha continua soberana quando contém placar**, e o Bye continua sendo o valor da coluna B. Links com ID, jogadores ou cores divergentes nunca dão pontos. Consulte `docs/melhoria-03-resultados-status-automaticos.md` para critérios de aceitação e testes.


### Melhoria #4 — Datas verificadas no Lichess

O Apps Script da #3 foi ampliado para preencher **G (Data Início)** e **H (Data Fim)** da aba `2`, preservando integralmente as datas que já existirem. Ele só considera o jogo se o ID, os dois jogadores e as cores forem confirmados no Lichess. A data de **G** usa `createdAt` (criação da partida, não necessariamente primeiro lance); **H** usa `lastMoveAt` (último lance, não necessariamente instante de encerramento) e só é gravada para partidas com resultado final verificável. Os valores são exibidos em `dd/MM/yyyy`, no fuso da planilha (atualmente `America/Sao_Paulo`), e auditados em `_AuditoriaDatasLichess`.

O site já calculava duração em dias corridos e apresentava até cinco partidas recentes. Agora, caso G/H ainda estejam vazias, o site pode usar as datas importadas pela API do Lichess **somente após a validação da melhoria #3**. As datas digitadas na planilha sempre prevalecem. Consulte [`docs/melhoria-04-datas-lichess.md`](docs/melhoria-04-datas-lichess.md) para atualizar o Apps Script e executar testes seguros.


### Melhoria #5 — Rating Lichess de correspondência

A sincronização dos perfis via GitHub Actions também importa exclusivamente `perfs.correspondence.rating`, com indicador `?` se provisório. No site, o selo `Corr. 1620`, `Corr. 1620?` ou `Corr. —` aparece ao lado do jogador; é possível abrir os detalhes por toque, clique ou teclado. Esse rating **não é a pontuação do campeonato**. Consulte `docs/melhoria-05-rating-correspondencia.md`.

### Melhoria #7 — Acompanhamento de jogos em andamento

Jogos efetivamente iniciados e validados pelo Lichess mostram **♟ Acompanhar tabuleiro** nas rodadas e na área do jogador. O tabuleiro é um visualizador incorporado, sem comandos para realizar lances no site. Ele pode ter atraso de lances por prevenção a trapaças. O site informa a última consulta à API e marca dados antigos. O link **Abrir no Lichess** continua disponível, inclusive para partidas privadas. Confira `docs/melhoria-07-acompanhar-jogos.md`.


### Melhoria #8 — Aberturas, lances e término

Confrontos exibem abertura pública identificada pelo Lichess, número de lances individuais e pares completos e forma de término, somente com partida verificada. Partidas em andamento podem estar atrasadas; dados ausentes não são inventados. Consulte `docs/melhoria-08-aberturas-e-lances.md`.

### Melhoria #9 — Salão da Glória

Seis honrarias calculadas a partir das partidas oficiais: **Grande Cerco** (dias entre datas), **Batalha Épica** (mais meio-lances), **Ataque Relâmpago** (vitória em menos meio-lances), **Conquistador** (mais vitórias), **Escudo Invicto** (sequência por data de encerramento) e **Mestre das Aberturas** (variedade de códigos ECO, mínimo dois). Critérios, participantes, empates e partidas relacionadas aparecem no site; premiações sujeitas a alterações são sinalizadas como provisórias. A implementação não altera pontos ou a planilha. Consulte `docs/melhoria-09-salao-da-gloria.md`.

### Melhoria #10 — Rivalidades e campeões anteriores
O arquivo histórico apresenta campeões confirmados, empates sem desempate oficial e retrospecto dos duelos em cada edição. Rivalidades entre campeonatos só são agrupadas quando ambos os nicks antigos correspondem a jogadores atuais validados na aba `Jogadores`; nomes parecidos nunca são associados automaticamente. O campeonato atual continua como foco das páginas Início e Tabela. Veja `docs/melhoria-10-rivalidades-historicas.md`.


**Página inicial — Salão da Glória:** a vitrine mostra até cinco honrarias dinâmicas, priorizando duas tradicionais e três regionais com vencedores; escolhe partidas mais recentes por data de término verificada, sem presumir data de concessão. As medalhas regionais mantêm seus mapas e levam à página Glória com todas as 17 honrarias.

### Melhoria #11 — Sugestões de partidas sem vínculo

A seção **Sugestões** identifica possíveis jogos públicos de correspondência para confrontos sem URL na coluna F, verificando nicks, cores, modalidade e datas. O organizador abre e confere o jogo, depois copia a URL para preencher manualmente a coluna F. Nenhum link ou resultado é registrado automaticamente na planilha. A ausência de candidatos pode decorrer de acesso restrito ou da consulta pública limitada do Lichess.

### Melhoria #12 — Ajuda contextual a iniciantes

Na seção **Minha batalha**, um guia explica a cor, o adversário e a situação do confronto. Exibe link para o perfil Lichess **somente quando o nick é validado** e oferece atalhos diretos aos tutoriais **Criar uma partida** e **Aceitar um desafio** em celular ou computador. Não cria partidas, não grava na planilha e não reintroduz os comandos antigos de copiar link ou fazer lance.
