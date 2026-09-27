# FinanceOS como planejador financeiro pessoal

Setembro de 2026. O app deixa de ser só controle de gastos e passa a
funcionar como um planejador financeiro pessoal: conhecer, diagnosticar,
planejar, simular, orientar e acompanhar.

## Princípios que não mudam

- **Os números saem do motor, nunca do texto.** `ledger.ts` e `decision.ts`
  calculam; o assistente e as telas só explicam. Nenhuma frase gera número.
- **Tudo roda no aparelho, por regra, sem custo.** Sem IA externa. Se um dia
  houver modelo de linguagem, ele interpreta e resume — a verdade continua
  sendo o motor.
- **Mostrar a conta.** Todo número importante tem o "como cheguei nisso",
  linha a linha, fechando a soma.
- **Não julgar, não mandar.** Resposta em camadas: o veredito, o porquê em
  números, a alternativa. Sem "você deve".
- **Investimentos:** educação e simulação, nunca recomendação de produto.
- **Dado incompleto é dito.** Sem saldo informado, a resposta avisa que parte
  de zero; sem recebimento previsto, diz até quando olhou.

## Fases

| Fase | O quê | Estado |
|---|---|---|
| 1 | Dinheiro para decidir: saldo, comprometido, disponível, margem, "posso gastar R$ X?" | feita |
| 2 | Diagnóstico por áreas (sem nota geral), "o que merece atenção", confiança dos dados | a fazer |
| 3 | Perguntas vagas no assistente ("por que meu dinheiro some"), resposta em camadas | a fazer |
| 4 | Metas como plano vivo: prioridade, conflito, previsão pelo ritmo real, cenários | a fazer |
| 5 | Primeiro acesso com 3 ou 4 perguntas, perfil e objetivos de vida | a fazer |
| 6 | Estratégias em fases, estágios, próxima melhor ação, check-ins | a fazer |
| 7 | Comportamento observado e frases contextuais (poucas) | a fazer |

Decisões do responsável (27/09/2026): começar pela fase 1; a nota "Saúde do
mês" (0 a 100) sai e vira situação por área na fase 2; primeiro acesso com
poucas perguntas, puláveis; margem de segurança sugerida e ajustável.

## Fase 1 — dinheiro para decidir

Código: `src/lib/decision.ts` (números) e `src/lib/decision-answers.ts`
(linguagem). Testes: `decision.test.ts` e `decision-answers.test.ts`, com o
exemplo do documento de produto feito à mão.

### Os três números

```
saldo          o que existe nas contas agora (o mesmo da tela Contas)
comprometido   o que já tem data para sair até o próximo recebimento,
               vencidos inclusos: contas, faturas, assinaturas, dívidas, aportes
disponível     o menor saldo previsto até o próximo recebimento
               (sem recebimento em 60 dias: até o fim do mês)
```

Sem entrada no meio do caminho, `disponível = saldo − comprometido`. Entrada
atrasada que ainda não caiu não conta hoje: se ela é o que sustenta a
projeção, o disponível é o saldo de hoje, e a conta diz isso.

### Margem de segurança

- **Sugerida:** uma semana (7/30) da média mensal das despesas essenciais nos
  últimos três meses completos com movimento, arredondada a R$ 10. O mês
  corrente fica fora da média.
- **Essenciais:** marca da pessoa em Categorias; sem marca, moradia, contas de
  casa, mercado, transporte, saúde, educação e impostos e taxas.
- **Ajustável:** outro valor, zero, ou voltar à sugerida. Sem histórico, a
  sugerida não existe e a margem automática é zero.

### Disponível para gastar

```
disponível ≥ 0:  disponível − a parte da margem que couber   (nunca negativo)
disponível < 0:  a falta, em vermelho — a margem nem entra
```

Se o que sobra não completa a margem, o livre para gastar é zero e a tela diz
quanto sobra "dentro da margem". Negativo só aparece com conta descoberta.

### "Posso gastar R$ X?"

O gasto vira uma agenda de saídas da conta: hoje (Pix, débito) ou no
vencimento de cada fatura (cartão; parcelas pela regra de sempre, sobra de
centavo nas primeiras). Cada dia projetado perde o que já saiu até ele.

| Veredito | Quando |
|---|---|
| Não cabe | algum dia antes do recebimento fica negativo; ou passa do limite do cartão (o limite reserva a compra inteira, mesmo parcelada); ou o gasto faz um dia depois do recebimento ficar negativo |
| Cabe, mas entra na margem | nada fica descoberto, mas sobra menos que a margem |
| Cabe | sobra ao menos a margem |

A alternativa oferecida é quanto cabe sem tocar a margem (na conta, também
sem descobrir o que vem depois do recebimento), ou esperar o recebimento. O
cartão nunca é sugerido como saída para falta de dinheiro.
