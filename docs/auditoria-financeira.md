# Auditoria financeira do FinanceOS

Setembro de 2026. Objetivo: os números precisam bater — entre as telas, com o
extrato do banco, e com o assistente. Este documento registra o que foi achado,
o que foi corrigido, como foi provado e o que ainda não está resolvido.

## Regra de ouro, como ficou

Todo saldo sai de um lugar só: `src/lib/ledger.ts` (o livro-caixa).

```
saldo da conta num dia = saldo inicial (no começo de openingDate)
                       + tudo que se REALIZOU na conta de openingDate em diante
```

- **Realizado** = lançamento baixado, transferência, ajuste de saldo, cobrança
  automática de assinatura/parcela de dívida já vencida, fatura paga.
- **Previsto** entra na projeção, nunca no saldo de hoje. Conta vencida e não
  paga continua na conta (e aparece como vencida). Receita futura não é
  dinheiro de hoje.
- O que aconteceu antes do saldo inicial já está dentro dele e não conta de novo.

Quem lê daqui: Início, Contas, Calendário, Patrimônio, Cartões (limite e
fatura paga), assistente e a conferência dos dados.

### Estratégia de dinheiro e arredondamento

- Todo valor é **inteiro em centavos**, do leitor de extrato ao banco de dados.
  Nenhuma conta em reais com ponto flutuante.
- Arredonda-se **uma vez, na entrada** (texto do extrato ou do formulário →
  centavos). Depois disso, só soma e subtração de inteiros.
- Divisão (parcela, rateio) usa `splitCents`: a sobra de centavos vai, um a um,
  para as primeiras partes. R$ 100 em 3× = 33,34 + 33,33 + 33,33.

### Duas réguas, com nomes diferentes

- **Competência** (Movimentos, relatórios, "gastos do mês"): a compra no cartão
  conta no dia da compra.
- **Caixa** (Início, Calendário, Contas): a compra no cartão sai da conta quando
  a fatura é paga.

Os totais das duas réguas podem diferir no mesmo mês, e as telas dizem qual é
qual ("Sai da conta" × "Saídas do mês"). O saldo de hoje é um só.

## Inventário

| Módulo | Antes | Agora |
|---|---|---|
| Início (saldo, disponível, fim do mês) | ✗ saldo mensal, zerava todo dia 1; contava conta vencida como paga | ✓ livro-caixa |
| Contas | ✗ não existia (tabela sem tela) | ✓ saldo, extrato linha a linha, conferência |
| Transferências | ✗ não existiam | ✓ um registro, dois lados |
| Receitas / Despesas / Investimentos | ⚠ corretos por competência; resgate não existia | ✓ resgate; assinatura real substitui a prevista |
| Cartões e faturas | ⚠ limite usado errado; pagamento não existia | ✓ |
| Parcelas | ✗ R$ 100 em 3× = 99,99 | ✓ fecham no total |
| Assinaturas | ⚠ fatura e despesas divergiam no mês do início/cancelamento | ✓ regra única |
| Dívidas | ⚠ quitar apagava parcelas pagas do passado | ✓ |
| Metas | ⚠ contava aporte futuro como feito | ✓ só realizado |
| Patrimônio | ⚠ caixa mensal; investido com previsto | ✓ livro-caixa |
| Calendário | ✗ todo mês passado começava do zero | ✓ mesma curva do Início |
| Importação de extrato | ✗ ver abaixo | ✓ |
| Sincronização | ✗ ver abaixo | ✓ (+ migração 0005 no servidor) |
| Assistente | ✗ "saldo" era outro número | ✓ mesmo livro-caixa |
| Busca | ✓ lista lançamentos (não soma) | ✓ |
| Orçamento, Rateio, Simuladores | ✓ cálculos isolados, sem saldo | não alterados |
| Autenticação, PWA, backup | ? não auditados nesta fase | — |

## Bugs críticos

### 1. Extrato: sinal trocado com "menos" tipográfico
- **Problema:** `−12,50` (U+2212) virava +12,50 — despesa entrava como receita.
- **Causa:** só o hífen ASCII era reconhecido como sinal.
- **Correção:** todo traço de menos (− – — ﹣ －) é sinal. `statement.ts`
- **Teste:** `statement.test.ts › "−12,50" vira -1250 centavos`.

### 2. Extrato OFX: decimal multiplicado por mil
- **Problema:** `TRNAMT>-1.500` virava R$ 1.500,00 (é R$ 1,50).
- **Causa:** o separador era adivinhado valor a valor.
- **Correção:** OFX segue a norma (ponto decimal); vírgula só se o próprio
  arquivo usar vírgula.
- **Teste:** `statement.test.ts › OFX segue a norma`.

### 3. Extrato OFX: data deslocada pelo fuso
- **Problema:** `20261001020000[0:GMT]` virava 01/10 (é 30/09 às 23h em Brasília).
- **Correção:** hora convertida para Brasília antes de tirar o dia.
- **Teste:** `statement.test.ts › data com fuso`.

### 4. Extrato: transações descartadas em silêncio
- **Problema:** "TOTAL ACADEMIA" e "Saldo devedor cheque especial juros" sumiam.
- **Causa:** filtro de linha de saldo por prefixo ("total", "saldo").
- **Correção:** comparação pela frase inteira.
- **Teste:** `statement.test.ts › não descarta transação…`.

### 5. Importação: o saldo do app não tinha como bater com o do banco
- **Problema:** pagamento de fatura, transferência, resgate e cobrança de
  assinatura eram excluídos do import; o saldo nunca fechava com o extrato.
- **Correção:** cada linha vira o que é (pagamento, transferência, resgate,
  cobrança real). Nenhuma vira receita/despesa por engano. `importer.ts`
- **Teste:** `importer.test.ts` — o extrato do cenário 43 do arquivo ao saldo:
  R$ 3.450,00 = banco.

### 6. Sincronização: registros que nunca chegavam ao outro aparelho
- **Problema:** após um import grande, 300 de 1.100 lançamentos não desciam.
- **Causa:** o pull paginava só pelo carimbo; um lote grava centenas de linhas
  com o mesmo carimbo e a página cortava no meio do grupo.
- **Correção:** cursor (carimbo, id) e margem de 2 minutos. `sync.ts`
- **Teste:** `sync.test.ts › um extrato grande chega inteiro` (dois aparelhos).

### 7. Sincronização: aparelho offline apagava a edição mais nova
- **Problema:** dois aparelhos divergiam para sempre.
- **Causa:** push antes do pull; alteração local na fila sempre vencia.
- **Correção:** pull antes do push; vale a edição mais nova; migração 0005
  impede no servidor que versão velha sobrescreva a nova.
- **Teste:** `sync.test.ts › o aparelho que ficou offline…` (com e sem a 0005).

### 8. Saldo diferente em telas diferentes
- **Problema:** Início, Calendário, Patrimônio e assistente calculavam "saldo"
  cada um do seu jeito (o assistente respondia R$ 582,15 com o Início em
  R$ 421,95).
- **Correção:** livro-caixa único; o assistente ganhou "quanto tenho" e
  "por que fecho no vermelho" sobre ele.
- **Teste:** `consistency.test.ts › Início = Contas = curva = Patrimônio = assistente`.

### 9. Parcelas que não fecham
- **Problema:** R$ 100 em 3× = 99,99; em 6× = 100,02.
- **Correção:** o total vai com a compra; parcelas saem de `splitCents`.
- **Teste:** `ledger.test.ts › parcelas`.

### 10. Limite do cartão
- **Problema:** a compra do mês passado na fatura aberta não segurava limite;
  nada devolvia limite ao pagar.
- **Correção:** dívida do cartão = compras (parcelada inteira) − pagamentos.
- **Teste:** `ledger.test.ts › limite comprometido…`.

### 11. Saldo inicial informado no meio do mês
- **Problema:** saldo R$ 5.000, mas "disponível" e "fim do mês" em R$ 0.
- **Correção:** a curva parte do saldo inicial e ignora o anterior a ele.
- **Teste:** `consistency.test.ts › saldo inicial informado no meio do mês`.
- Achado rodando o primeiro acesso no navegador, não em teste.

## Outras correções

- Assinatura cancelada seguia cobrando na fatura; a do cartão cobrada após o
  fechamento agora vai para a fatura seguinte.
- Quitar dívida apagava do passado as parcelas pagas.
- Investido/metas contavam o aporte programado do mês como feito.
- "Sobrou saldo do mês anterior" entrava como lançamento; agora o saldo corre
  de um mês para o outro sozinho.
- Comprovante: "já está na nuvem" não chegava aos outros aparelhos.
- Conferência de saldo informado à mão quebrava com movimentos lançados depois
  no mesmo dia (o saldo informado é de um instante).

## Mudanças de arquitetura

- `ledger.ts` — livro-caixa (saldo, previsto, fatura, auditoria de conta).
- `transfers` — tabela nova, sincronizada (transferência, pagamento de fatura,
  ajuste). O servidor aceita sem migração (coleção genérica).
- `accounts.ts` — ações: conta, transferência, pagar fatura, "hoje eu tenho X".
- `migrate.ts` — "saldo do mês anterior" → saldo inicial + ajustes, com cópia
  de segurança local antes; ids derivados, idempotente entre aparelhos.
- `diagnostics.ts` — conferência dos dados (só aponta, nunca apaga).
- `statement.ts` — saldos declarados do extrato + integridade do arquivo.
- Diário local de auditoria (`audit`): importação, transferência, ajuste,
  pagamento, migração.

## Testes

119 testes em 8 arquivos (`npm test`):

- `statement.test.ts` — formatos de valor e data, OFX, CSV, XLSX, integridade.
- `sync.test.ts` — dois aparelhos, com e sem a guarda do servidor.
- `ledger.test.ts` — cenários 43 e 62 do documento, transferência, cartão,
  parcelas, assinatura, dívida, conferência.
- `migrate.test.ts` — migração do saldo antigo; "hoje eu tenho X".
- `importer.test.ts` — do arquivo ao saldo, reimport, import parcial,
  transferência com os dois extratos, resgate, assinatura.
- `consistency.test.ts` — o mesmo número em toda tela.
- `diagnostics.test.ts` — cada achado da conferência.
- `performance.test.ts` — 1 mil, 10 mil e 50 mil lançamentos.

## Inconsistências de dados

A conferência roda na tela de Contas sobre a base real de cada aparelho. Não
foi possível rodá-la nos dados reais da conta durante a auditoria (ficam no
aparelho da pessoa); roda sozinha na próxima abertura do app.

## Riscos que continuam

1. **A migração 0005 precisa ser rodada no Supabase.** Sem ela, a corrida
   entre descer e subir (segundos) ainda permite uma versão velha sobrescrever.
   As migrações 0003 e 0004 também, se ainda não foram.
2. "Vale a edição mais nova" usa o relógio de cada aparelho. Relógio muito
   errado decide errado.
3. Sem pagamento registrado, a fatura vencida é tida como paga inteira no
   vencimento — como o app sempre supôs. Quem não paga a fatura inteira precisa
   importar o extrato da conta ou registrar o pagamento.
4. O saldo devedor de dívida conta a parcela do mês como paga desde o dia 1.
5. OFX com várias contas no mesmo arquivo entra todo numa conta só.
6. Extrato em PDF não é lido (é recusado com explicação).
7. Aparelho com a versão antiga aberta, até recarregar, mostra o saldo antigo
   sem o "saldo do mês anterior" (que a migração converte).
8. Auditoria visual completa de todas as telas em todos os tamanhos não foi
   feita nesta fase; foram verificadas no navegador Início, Contas,
   Calendário, Patrimônio, Cartões, Importação, Assistente e o primeiro acesso.
