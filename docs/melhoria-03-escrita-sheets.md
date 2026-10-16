# Funcionalidade #3 — Complemento: registrar resultados na planilha

## Estado inicial e segurança

**O pacote NÃO habilita escrita automaticamente.** A publicação normal, inclusive o agendamento de hora em hora, apenas simula as alterações. O arquivo original `Campeonato de Xadrez` **não é modificado** ao instalar o pacote. Antes de ativar a escrita, faça um backup e teste numa **outra planilha Google**, com ID diferente.

O workflow continua importando os resultados da fonte original e exibindo-os no site como antes. A nova etapa `Simular ou registrar resultados no Google Sheets` roda **depois** da conciliação do Lichess.

Só serão candidatas à escrita linhas da **edição ativa** em que:

- A decisão da funcionalidade #3 é `finished`, com placar verificável `1-0`, `0-1` ou `½-½`;
- A API retornou dados válidos (`ok`/`cache`) e ID, jogadores e cores coincidem com os nicks validados;
- Na produção, a planilha importada não contém placar manual na linha. Exclusivamente no teste com `apply-backup`, também aceita um placar manual **idêntico** ao resultado confirmado pela API, para permitir testar partidas já encerradas;
- Não é uma linha Bye, e nenhum ID de partida ou número de linha está duplicado entre candidatos.

**Antes de cada gravação**, o programa consulta novamente `A:H` da mesma linha na planilha *destino* por meio da API autenticada e confirma **nome das brancas (A), nome das pretas (D), link exato (F), placares B e C vazios e status E elegível**. Resultados, fórmulas ou status administrativos não são substituídos. Um `Finalizado` sem placar será conservado para verificação humana. A gravação altera **somente** `B:C` e `E`, em lote por linha; após isso, relê a linha e verifica os valores. Não altera outras células, links, nomes ou outras abas.

**Limitação:** a Sheets API não oferece comparação-e-gravação condicional nativa equivalente a um CAS; existe pequena janela entre a última leitura e a escrita. Evite editar a mesma linha durante o teste. Alterações inesperadas devem ser investigadas usando o histórico da planilha e o artefato de auditoria do workflow.

## Primeiro teste — simulação (nenhuma credencial necessária)

1. Publicar o pacote no repositório.
2. GitHub → **Actions** → **Publicar campeonato** → **Run workflow**.
3. Selecionar `sheets_write_mode = dry-run` (padrão), sem preencher IDs.
4. Abrir a etapa `Simular ou registrar resultados no Google Sheets` e conferir as propostas de escrita (aba, linha, B, C, E).
5. Examinar o artefato `sheets-write-audit-*` em **Artifacts**. No modo dry-run, ele registra propostas **preliminares**, ainda não validadas por uma leitura remota da planilha destino.

Pode aparecer `candidatas=0` se todas as partidas encerradas já tiverem placar na planilha oficial. Isso é esperado no dry-run e na produção. **Exclusivamente em `apply-backup`**, a rotina permite testar partidas cujo resultado manual oficial coincida com o Lichess: antes do teste, escolha uma dessas partidas **na cópia**, apague os valores de B e C nessa linha (o status `Finalizado` em E pode permanecer), mantendo A, D e F idênticos à original. A rotina deverá restaurar B, C e E na **cópia**. Ela nunca apaga valores para executar testes e nunca permite essa exceção na planilha oficial.

## Credencial (apenas para teste de escrita)

1. Criar um projeto no **Google Cloud Console** e habilitar a **Google Sheets API**.
2. Criar uma **conta de serviço**; anotar o e-mail dela.
3. Compartilhar **somente a cópia de teste** da planilha com esse e-mail, na função **Editor**. Não compartilhar a planilha original antes de validar o teste.
4. Se sua política permitir chaves, gerar a credencial JSON da conta de serviço. No GitHub, em **Settings → Secrets and variables → Actions → New repository secret**, criar `GOOGLE_SERVICE_ACCOUNT_JSON` com o conteúdo **integral** do JSON. Nunca compartilhar ou commitar a chave. Restringir acesso ao repositório e preferir credenciais de curta duração via Workload Identity Federation quando for evoluir a implantação.
5. O script tem escopo OAuth `https://www.googleapis.com/auth/spreadsheets`. O controle prático de quais arquivos pode editar é a permissão da **conta de serviço** no Google Drive. Idealmente, a credencial de teste não deve ter permissão na planilha oficial.

**Atenção à segurança:** o JSON da credencial é um segredo confidencial. Nunca adicioná-lo à planilha, README, JSON público, ZIP, logs ou código. O programa não imprime cabeçalhos de autenticação nem o conteúdo da credencial.

## Teste numa cópia de backup (gravação manual)

1. A cópia deve manter a aba `2`, as linhas, nomes (colunas A e D) e os URLs da coluna F exatamente iguais à planilha original.
2. No GitHub Actions, executar manualmente **Publicar campeonato** com:
   - `sheets_write_mode = apply-backup`
   - `sheets_write_target_id = ID_DA_COPIA`
   - `sheets_write_confirm_target_id = ID_DA_COPIA` (igual, para confirmação explícita).
3. Se a conta de serviço e os dados estiverem corretos, a rotina conferirá cada linha elegível imediatamente antes de gravar.
4. Conferir o log e o artefato de auditoria; abrir a cópia no Google Sheets e verificar B, C e E.

A rotina **recusa** gravar na planilha original com `apply-backup`. Também recusa gravações se a sincronização de entrada não for recente/completa. Uma conta de serviço sem permissão no destino não grava.

## Produção — NÃO habilitar antes de validar

O modo manual `apply-production` requer as três condições simultâneas:

- `sheets_write_mode = apply-production`;
- `sheets_write_target_id` e `sheets_write_confirm_target_id` iguais ao ID original;
- variável de repositório `SHEETS_PRODUCTION_WRITE_ENABLED = true`, além de compartilhar o arquivo original com a conta de serviço.

Para **gravação automática agendada**, há mais uma trava: `SHEETS_AUTO_WRITE_ENABLED = true`. Inicialmente **não crie/habilite essas variáveis**. Só configure após conferir os testes de backup. A rotina agendada continuará apenas simulando enquanto não houver autorização dupla.

## Auditoria e tratamento de falhas

- A cada execução, são registrados eventos JSONL em `.cache/sheets-write-audit.jsonl` (nunca publicado pelo Pages), incluindo fase, aba, linha, jogo, valores prévios e posteriores e motivo de rejeição.
- GitHub Actions publica o log como artefato `sheets-write-audit-*`, retido por 14 dias.
- Erros na gravação **não impedem a publicação do site**: o passo de escrita usa `continue-on-error: true`, e a saída do workflow deve ser conferida.
- Se uma linha estiver com resultado manual preenchido, ela será ignorada; a reconciliação da #3 mantém o placar oficial.

## Executar testes localmente

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/model.test.mjs
```

As novas verificações são isoladas e usam sessões simuladas. **Nenhuma consulta ou gravação real ao Google Sheets é feita pelos testes unitários.**
