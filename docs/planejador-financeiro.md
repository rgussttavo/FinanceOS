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
| 2 | Diagnóstico por áreas (sem nota geral), "o que merece atenção", confiança dos dados | feita |
| 3 | Perguntas vagas no assistente ("por que meu dinheiro some"), resposta em camadas | feita |
| 4 | Metas como plano vivo: prioridade, conflito, previsão pelo ritmo real, cenários | feita |
| 5 | Primeiro acesso com 3 ou 4 perguntas, perfil e objetivos de vida | feita |
| 6 | Estratégias em fases, estágios, próxima melhor ação, check-ins | a fazer |
| 7 | Comportamento observado e frases contextuais (poucas) | a fazer |

Decisões do responsável (27/09/2026): começar pela fase 1; a nota "Saúde do
mês" (0 a 100) sai e vira situação por área na fase 2; primeiro acesso com
poucas perguntas, puláveis; margem de segurança sugerida e ajustável;
poupança e corretora ficam fora do disponível (são reserva e investimento);
critérios da fase 2 abaixo.

## Fase 1 — dinheiro para decidir

Código: `src/lib/decision.ts` (números) e `src/lib/decision-answers.ts`
(linguagem). Testes: `decision.test.ts` e `decision-answers.test.ts`, com o
exemplo do documento de produto feito à mão.

### Os três números

```
saldo          o que existe nas contas agora (o mesmo da tela Contas)
guardado       o que está em poupança e corretora: reserva e investimento
comprometido   o que já tem data para sair até o próximo recebimento,
               vencidos inclusos: contas, faturas, assinaturas, dívidas,
               aportes, o que vai para a poupança
disponível     o menor saldo previsto das contas de uso até o próximo
               recebimento (sem recebimento em 60 dias: até o fim do mês)
```

As contas de uso são todas menos poupança e corretora; a conta principal
sempre é de uso, mesmo sendo poupança. Transferência para a poupança é saída
do que dá para gastar; trazer de volta é entrada; transferência entre duas
contas de uso se anula.

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

## Fase 2 — diagnóstico por áreas

Código: `src/lib/checkup.ts` (motor, critérios em `LIMITS`) e
`src/features/checkup.tsx` (tela "Sua vida financeira" e o resumo do Início,
no lugar da antiga nota de 0 a 100). Testes: `checkup.test.ts`.

| Área | Saudável | Atenção | Alerta |
|---|---|---|---|
| Fluxo de caixa | nada descoberto e resultado médio ≥ 0 | resultado médio (entradas − saídas, 3 meses completos) negativo | conta descoberta prevista, ou saldo negativo no mês |
| Reserva | cobre a referência | abaixo da referência | — |
| Dívidas | parcelas ≤ 15% da renda média | até 30% | acima de 30% |
| Cartões | uso ≤ 30% do limite | até 70% | acima de 70% |
| Metas | todas com prazo no ritmo | alguma fora do ritmo ou vencida | — |
| Patrimônio | só informa a variação de 3 meses, sem julgar | | |

- **Reserva:** contas poupança mais o aplicado em categorias de investimento
  cujo nome começa com "reserva", dividido pela média das despesas
  essenciais. Referência de 6 meses, ajustável na própria tela (3, 6, 9, 12).
- **Ordem da atenção:** alerta antes de atenção; dentro de cada um,
  estabilidade (fluxo) → proteção (reserva) → risco (dívidas, cartões) →
  objetivos (metas).
- **Confiança dos dados:** saldo informado em todas as contas (25), conferido
  com o banco nos últimos 30 dias (20), gastos recentes com categoria (15),
  recebimento previsto cadastrado (15), nenhum erro na conferência dos dados
  (15), algo lançado na última semana (10). Alta a partir de 85%, média a
  partir de 60%. Cada item em falta diz como resolver.
- **Sem dados, sem veredito:** sem fluxo para ler, o resumo diz que faltam
  dados — "nenhuma dívida" não vira "está tudo bem".

## Fase 3 — perguntas vagas

Código: `src/lib/money-story.ts` (números) e `src/lib/story-answers.ts`
(linguagem e o reconhecimento de cada pergunta). Testes:
`story-answers.test.ts`.

| Pergunta | O que o app calcula |
|---|---|
| "Por que meu dinheiro some?", "não sobra", "meu salário é suficiente?" | renda média dos 3 meses completos contra fixos (contas que se repetem, assinaturas, parcelas de dívida), compras parceladas e variáveis; a sobra e o que mais pesa |
| "Estou gastando demais?" | o mês atual, com o previsto, contra a média dos 3 anteriores; as categorias que mais subiram; a renda média; os tetos de orçamento passados |
| "Por que minha fatura está alta / não baixa?" | a próxima fatura contra a média das 3 anteriores; quanto é parcela antiga (e até quando vem), assinatura e compra deste ciclo |
| "Meu salário subiu e continuo sem dinheiro" | renda e gastos dos 3 meses mais recentes contra os 3 anteriores; o que cresceu. Só com 3 meses completos de cada lado |
| "Por que minha meta nunca chega?" | o aporte que o prazo pede contra o ritmo real; quando chega no ritmo atual; as saídas (aporte, prazo, valor) |
| "Qual dívida olho primeiro?" | os dois critérios lado a lado — maior juro e menor saldo — sem escolher pela pessoa |

A resposta segue sempre a mesma ordem: a resposta direta, o porquê em
números, o que dá para fazer. A conta vai na lista de detalhes.

## Fase 4 — metas como plano vivo

Código: `src/lib/goal-plan.ts` (divisão da sobra e cenários),
`src/lib/plan-answers.ts` (assistente) e o painel "Plano das metas" em
`src/features/metas.tsx`. Testes: `goal-plan.test.ts` e
`plan-answers.test.ts`.

- **Cada meta** ganha prioridade (alta, média, baixa; ausente = média) e
  prazo fixo ou flexível (ausente = flexível). O cartão continua mostrando o
  ritmo real e quando chega nele.
- **Capacidade:** a sobra média dos 3 meses completos (renda − fixos −
  parcelas − variáveis), a mesma de "por que meu dinheiro some".
- **Conflito:** as metas com prazo pedem, somadas, mais do que a sobra. A
  tela diz quanto falta por mês para todas chegarem no prazo.
- **Divisão da sobra**, igual nos três cenários: prioridade alta, média,
  baixa; na mesma prioridade, prazo fixo antes do flexível; empatadas dividem
  na proporção do que pedem; metas sem prazo ficam com o resto, peso 3, 2, 1.

| Cenário | Quanto entra na divisão |
|---|---|
| Conservador | 70% da sobra média; 30% fica de folga |
| Equilibrado | toda a sobra média |
| Acelerado | toda a sobra e mais 10% dos gastos variáveis, se cortados |

- **Nada muda sozinho.** Os cenários mostram o novo prazo de cada meta; a
  pessoa ajusta aportes, prazos ou prioridades.
- **Assistente:** "Quero X até tal data, consigo?" compara o que o objetivo
  pede por mês com o que sobra depois das metas atuais (dinheiro não é
  contado duas vezes) e dá as saídas — custo, prazo, sobra, prioridade. "Se
  eu economizar R$ X por mês" mostra a sobra nova e quanto cada meta
  adianta. Comprar algo com prazo no futuro é tratado como objetivo, não como
  gasto de hoje.

## Fase 5 — o momento da pessoa

Código: `src/lib/profile.ts` (regras) e `src/features/profile.tsx`
(formulário, convite e "Seu foco"). Testes: `profile.test.ts`.

- **Quatro perguntas de toque**, todas opcionais: o que quer melhorar (várias;
  a primeira vira o foco), como está a situação hoje, se o dinheiro chega ao
  fim do mês, se a renda é fixa ou variável.
- **Onde aparecem:** no primeiro acesso, como passo 2 de 4 ("Qual é o seu
  momento?"); para quem já usa o app, um convite no Início, que some ao
  responder ou ao tocar em "Agora não" — o app não volta a perguntar. As
  respostas se editam em "Sua vida financeira" › Seu foco.
- **Declarado, não medido.** O app diz "você informou que…". Quando a
  declaração e os números discordam (situação "tranquila" com o fluxo em
  alerta; "endividado" sem dívida cadastrada), diz isso com calma e sugere o
  que pode estar faltando, sem corrigir a pessoa.
- **Onde pesa:** "Seu foco" no diagnóstico liga o que a pessoa quer à área
  que mede isso; quem quer investir vê antes a reserva e as dívidas; as
  sugestões do assistente começam pelas do foco; renda variável lembra que
  uma referência maior de reserva costuma fazer sentido.
