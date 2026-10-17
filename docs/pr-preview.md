# Pré-visualização de Pull Requests

O workflow de PR roda testes Python e JavaScript, atualiza os dados públicos via Google Sheets e Lichess, e publica uma cópia interativa do site em uma branch temporária pr-preview-N. Não modifica a main nem aciona o GitHub Pages oficial.

## Teste antes do merge

Abra o PR no GitHub, selecione Checks > Validar e pré-visualizar PR, e confira os jobs validar e publicar. O Summary lista os ratings e fornece o link para abrir a cópia interativa.

Para o PR #1, quando publicar estiver concluído:
https://raw.githack.com/leumattiello/SiteDoCampeonato/pr-preview-1/index.html

Teste o selo Corr. no desktop e celular, por clique, toque e teclado. O sinal ? indica rating provisório e — indica indisponível. A pontuação do torneio não usa esse rating.

## Segurança e limitações

- O workflow não recebe LICHESS_API_TOKEN, não escreve no Google Sheets e não altera Settings > Pages.
- A prévia reusa os resultados já disponíveis no Sheets e consulta somente perfis públicos do Lichess. Não reconsulta partidas protegidas.
- Somente PRs do mesmo repositório recebem publicação remota. Forks podem executar testes e baixar o artefato de prévia.
- Uma branch exclusiva pr-preview-N recebe os arquivos já validados. Ao fechar o PR, a limpeza tenta apagar essa branch.
- raw.githack.com é um serviço gratuito de terceiros para prévias; pode apresentar uma tela de confirmação e manter cache de alguns minutos. Não é hospedagem de produção.
- Se uma consulta ao Google Sheets falhar, a publicação da prévia é interrompida, em vez de mostrar dados de exemplo como atuais.
