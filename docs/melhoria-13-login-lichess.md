# Melhoria #13 — login Lichess opcional (OAuth2 PKCE)

## Segurança e limites
- OAuth2 Authorization Code com PKCE S256 para cliente público (`client_id=leumattiello.github.io-SiteDoCampeonato`, identificador público, não é segredo).
- Escopo mínimo `challenge:write`, solicitado com consentimento explícito. A funcionalidade #13 **não cria desafios**: isso é responsabilidade da #14.
- O token de acesso só existe na memória JavaScript da aba. Ao recarregar a página, o login termina localmente; será preciso autenticar novamente. Não usar `localStorage`, cookies ou `sessionStorage` para tokens.
- `sessionStorage` guarda apenas o `state`, `code_verifier`, destino e hora da transação, por até dez minutos. Validação de estado e destino exatos; uso único; callback limpa parâmetros da URL antes de chamadas remotas.
- Login é bloqueado em prévias raw.githack.com e hosts desconhecidos. No site GitHub Pages oficial e em localhost, o botão solicita autorização no Lichess. **A prévia da PR permite verificar aparência e acesso anônimo, mas não executar login end-to-end.**
- Logout remove o token da memória e solicita revogação via `DELETE https://lichess.org/api/token`. Se falhar, solicitar revogação manual no painel de apps do Lichess; por segurança, não manter o token local.
- Não há escrita no Google Sheets. A página continua pública e utilizável sem login.
- Dados de conta exibidos: apenas `username`, obtido em `GET /api/account`.

## Homologação
1. Conferir CI e prévia em desktop/celular (sem clicar autenticação em preview).
2. Conferir falhas de state expirado, callback não autorizado, encerramento e revogação via testes.
3. Após merge, testar login real diretamente no endereço de produção `https://leumattiello.github.io/SiteDoCampeonato/`. Conferir prompt de consentimento, nome exibido, botão Sair e funcionamento sem login.
4. Validar CORS/token endpoint em navegador real. Se a política CORS do Lichess impedir a troca em frontend, reavaliar a integração antes de #14; não usar proxy não confiável.
5. **Não habilitar criação de desafios na PR #13**.
