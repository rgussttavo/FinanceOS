import type { Answer, AssistantContext } from './assistant';
import { normalize } from './categories';
import { formatDayShort, formatMonthLabel } from './dates';
import { debtProgress } from './debts';
import { goalPace, goalProgress } from './goals';
import { formatMoney, formatPercent } from './money';
import {
  incomeCreep,
  invoiceStory,
  moneyStory,
  spendingVsAverage,
  type ExpandMonth,
  type InvoiceStory,
} from './money-story';
import { occurrencesInMonth } from './occurrences';
import type { Card, Cents, Goal } from './types';

/**
 * As perguntas vagas: "por que meu dinheiro some", "estou gastando demais",
 * "por que minha fatura não baixa", "meu salário subiu e continuo sem
 * dinheiro", "por que minha meta nunca chega", "qual dívida olho primeiro".
 *
 * A pergunta vira diagnóstico, na ordem de sempre: a resposta direta, o
 * porquê em números, o que dá para fazer. Nunca "você gasta demais": o
 * padrão, o número e a alternativa. Os números saem de `money-story.ts`.
 */

const money = (v: Cents) => formatMoney(v, { signed: v < 0 });
const monthsText = (keys: string[]) => {
  const names = keys.map((k) => formatMonthLabel(k));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : (names[0] ?? '');
};
const joinAnd = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}` : (items[0] ?? ''));

function categoryName(ctx: AssistantContext, id: string): string {
  if (id === 'sem-categoria') return 'Sem categoria';
  if (id === 'dividas') return 'Parcelas de dívida';
  return ctx.categories.find((c) => c.id === id)?.name ?? 'Sem categoria';
}

export function expander(ctx: AssistantContext): ExpandMonth {
  return (month) => (month === ctx.month ? ctx.occurrences : ctx.expand ? ctx.expand(month) : occurrencesInMonth(ctx.entries, month, ctx.today));
}

/* ------------------------------------------------------------ os testes */

export const TESTS = {
  dinheiroSome: (raw: string) =>
    /\b(dinheiro|salario|grana|renda)\b.*\b(some|sumiu|evapora|acaba|acabou|nao dura|vai embora)\b/.test(raw) ||
    /\b(nao|nunca) (me )?sobra\b/.test(raw) ||
    /\btodo mes (aperta|fico sem)\b/.test(raw) ||
    /\bsempre (fico )?sem dinheiro\b/.test(raw) ||
    /\bganho (bem|\d+).*\b(nao|nunca)\b.*\b(sobra|tenho)\b/.test(raw) ||
    /\b(para|pra)? ?onde (vai|foi|esta indo|anda indo) (o )?(meu )?dinheiro\b/.test(raw) ||
    /\bsalario (e |eh )?(suficiente|o bastante)\b/.test(raw) ||
    /\bpobre ou\b/.test(raw) ||
    /\bonde (estou|to|eu estou) errando\b/.test(raw),
  suficiente: (raw: string) => /\b(suficiente|o bastante|da conta)\b/.test(raw),
  gastandoDemais: (raw: string) =>
    /\b(estou|to|tou|ando|eu estou) gastando (demais|muito|mais do que devia|acima)\b/.test(raw) ||
    /\bgastando demais\b/.test(raw) ||
    /\bgasto (demais|muito)\b/.test(raw) ||
    /\bexagerando\b/.test(raw),
  faturaAlta: (raw: string) =>
    /\bfatura\b/.test(raw) &&
    (/\b(alta|grande|cara|salgada|so aumenta|aumentou|subiu|tao alta)\b/.test(raw) ||
      /\b(nao|nunca) (baixa|diminui|cai|abaixa)\b/.test(raw) ||
      /\bpor que\b/.test(raw)),
  salarioSubiu: (raw: string) =>
    /\b(salario|renda|ganho)\b.*\b(subiu|aumentou|aumento|melhorou)\b/.test(raw) &&
    /\b(sem dinheiro|nao sobra|nao tenho|continuo|mesmo assim|nada muda|nao muda|nao vejo)\b/.test(raw),
  metaNaoChega: (raw: string) =>
    /\bmetas?\b/.test(raw) && /\b(nunca chega|nao chega|nao anda|nao sai do lugar|demora|atrasad[ao]|nunca bato|nao bato)\b/.test(raw),
  qualDivida: (raw: string) =>
    /\b(qual|que|quais)\b.*\b(divida|dividas|emprestimo|emprestimos|financiamento)\b/.test(raw) &&
    /\b(primeiro|antes|prioridade|priorizar|atacar|olhar|quitar primeiro|pagar primeiro)\b/.test(raw),
};

/* ------------------------------------------------ por que o dinheiro some */

export function answerWhereMoneyGoes(ctx: AssistantContext, raw: string): Answer {
  const s = moneyStory(expander(ctx), ctx.entries, ctx.today);
  if (!s) {
    return { text: 'Ainda não há um mês completo de movimento para eu ver para onde o dinheiro vai. Com um mês lançado, eu separo o que é fixo, o que é parcela e o que é variável.' };
  }
  const spent = s.fixed + s.installments + s.variable;
  const composition = [
    `os gastos fixos (contas que se repetem, assinaturas e dívidas) levaram ${formatMoney(s.fixed)}`,
    s.installments > 0 ? `as compras parceladas ${formatMoney(s.installments)}` : '',
    `os variáveis ${formatMoney(s.variable)}`,
  ].filter(Boolean);
  const list = [
    { label: 'Renda média', detail: '', value: formatMoney(s.income) },
    { label: '− Fixos', detail: s.topFixed.map((f) => f.label).join(', '), value: formatMoney(s.fixed) },
    ...(s.installments > 0 ? [{ label: '− Parcelas', detail: 'compras parceladas', value: formatMoney(s.installments) }] : []),
    { label: '− Variáveis', detail: s.topVariable.map((v) => categoryName(ctx, v.categoryId)).join(', '), value: formatMoney(s.variable) },
    { label: '= Sobra por mês', detail: s.invested > 0 ? `${formatMoney(s.invested)} investidos` : '', value: money(s.margin) },
  ];
  const base = { list, basis: `média de ${monthsText(s.months)}`, link: { label: 'Ver as saídas', route: { view: 'movimentos', param: 'saidas' } } as Answer['link'] };

  if (s.income <= 0) {
    return {
      ...base,
      text: `Nos últimos meses não há renda lançada para comparar: saíram em média ${formatMoney(spent)} por mês, e ${joinAnd(composition)}. Lance o que entra para eu mostrar quanto sobra.`,
    };
  }

  const parts: string[] = [];
  if (TESTS.suficiente(raw)) parts.push(s.margin >= 0 ? 'Pelo que está lançado, cobre as saídas — mas com a folga abaixo.' : 'Pelo que está lançado, hoje não cobre as saídas.');
  else parts.push('Seu dinheiro não some num lugar só.');
  parts.push(`Nos últimos ${s.months.length} ${s.months.length === 1 ? 'mês' : 'meses'}, a renda média foi ${formatMoney(s.income)}; ${joinAnd(composition)}, em média.`);
  if (s.margin >= 0) {
    parts.push(
      `Sobram ${formatMoney(s.margin)} por mês (${formatPercent(s.margin / s.income)} da renda)${s.invested > 0 ? `, e ${formatMoney(Math.min(s.invested, s.margin))} disso foram investidos` : ''}.`,
    );
    if (s.margin < s.income * 0.1) parts.push('É pouca folga para um mês com gasto fora do comum.');
  } else {
    parts.push(`As saídas passam da renda em ${formatMoney(-s.margin)} por mês: a diferença sai do saldo ou do crédito.`);
  }
  // o que mais pesa, e por onde começar
  if (s.variable >= s.fixed && s.topVariable.length) {
    parts.push(`O que mais pesa nos variáveis: ${joinAnd(s.topVariable.map((v) => `${categoryName(ctx, v.categoryId)} (${formatMoney(v.amount)})`))}. São os mais fáceis de ajustar de um mês para o outro.`);
  } else if (s.topFixed.length) {
    parts.push(`O que mais pesa nos fixos: ${joinAnd(s.topFixed.map((f) => `${f.label} (${formatMoney(f.amount)})`))}. Fixo pesa todo mês: rever um deles muda o ano inteiro.`);
  }
  return { ...base, text: parts.join(' '), highlight: { label: 'Sobra média por mês', value: money(s.margin) } };
}

/* ----------------------------------------------- estou gastando demais? */

export function answerSpendingTooMuch(ctx: AssistantContext): Answer {
  const c = spendingVsAverage(expander(ctx), ctx.categories, ctx.today);
  if (!c) return { text: 'Ainda não há meses completos para comparar com o de agora.' };
  const month = formatMonthLabel(c.month);
  const pct = formatPercent(Math.abs(c.change));
  const parts: string[] = [];
  if (c.change > 0.05) {
    parts.push(`Seu gasto de ${month} está ${pct} acima da média dos últimos ${c.months.length} meses: ${formatMoney(c.current)} contra ${formatMoney(c.average)}, contando o que ainda está previsto.`);
    if (c.up.length) parts.push(`O aumento vem principalmente de ${joinAnd(c.up.map((u) => `${categoryName(ctx, u.categoryId)} (+${formatMoney(u.diff)})`))}.`);
  } else if (c.change < -0.05) {
    parts.push(`Não pelo histórico: ${month} está ${pct} abaixo da média dos últimos ${c.months.length} meses, com ${formatMoney(c.current)} contra ${formatMoney(c.average)}.`);
  } else {
    parts.push(`${month[0].toUpperCase()}${month.slice(1)} está em linha com a sua média: ${formatMoney(c.current)} contra ${formatMoney(c.average)} nos últimos ${c.months.length} meses.`);
  }
  if (c.income > 0) {
    parts.push(
      c.current > c.income
        ? `Isso passa da sua renda média (${formatMoney(c.income)}) em ${formatMoney(c.current - c.income)}.`
        : `Fica abaixo da sua renda média (${formatMoney(c.income)}), com ${formatMoney(c.income - c.current)} de folga.`,
    );
  }
  const over = ctx.categories
    .filter((cat) => cat.kind === 'out' && cat.budget > 0 && (c.currentBy.get(cat.id) ?? 0) > cat.budget)
    .map((cat) => `${cat.name} (${formatMoney((c.currentBy.get(cat.id) ?? 0) - cat.budget)} acima do teto)`);
  if (over.length) parts.push(`Passou do orçamento em ${joinAnd(over)}.`);

  return {
    text: parts.join(' '),
    highlight: { label: 'Contra a sua média', value: `${c.change >= 0 ? '+' : '−'}${pct}` },
    list: [...c.up, ...c.down].map((d) => ({
      label: categoryName(ctx, d.categoryId),
      detail: d.diff > 0 ? 'acima da média' : 'abaixo da média',
      value: formatMoney(d.diff, { signed: true }),
    })),
    basis: `${month}, com o previsto, contra a média de ${monthsText(c.months)}`,
    link: { label: 'Ver as saídas', route: { view: 'movimentos', param: 'saidas' } },
  };
}

/* -------------------------------------------- por que a fatura está alta */

function pickCard(ctx: AssistantContext, raw: string): Card[] {
  const named = ctx.cards.filter((c) =>
    [c.name, c.institution].some((t) =>
      normalize(t)
        .split(' ')
        .some((w) => w.length >= 3 && w !== 'cartao' && new RegExp(`\\b${w}\\b`).test(raw)),
    ),
  );
  return named.length ? named : ctx.cards;
}

export function answerHighInvoice(ctx: AssistantContext, raw: string): Answer {
  const stories = pickCard(ctx, raw)
    .map((card) => invoiceStory(card, ctx.entries, ctx.subscriptions, ctx.today))
    .filter((s): s is InvoiceStory => s !== null)
    .sort((a, b) => b.next.total - a.next.total);
  const s = stories[0];
  if (!s) return { text: 'Não há fatura a vencer nos cartões cadastrados.', link: { label: 'Ver cartões', route: { view: 'cartoes' } } };
  const name = s.card.name || s.card.institution;
  const parts: string[] = [];
  const vsAvg =
    s.average && s.average > 0
      ? `, ${formatPercent(Math.abs(s.next.total / s.average - 1))} ${s.next.total >= s.average ? 'acima' : 'abaixo'} da média das anteriores (${formatMoney(s.average)})`
      : '';
  parts.push(`A próxima fatura do ${name}, que vence ${formatDayShort(s.next.dueOn)}, está em ${formatMoney(s.next.total)}${vsAvg}.`);
  const pieces = [
    s.oldInstallments > 0 ? `${formatMoney(s.oldInstallments)} são parcelas de compras antigas${s.installmentsUntil ? ` (vêm até a fatura de ${formatMonthLabel(s.installmentsUntil)})` : ''}` : '',
    s.subscriptions > 0 ? `${formatMoney(s.subscriptions)} assinaturas` : '',
    s.newPurchases > 0 ? `${formatMoney(s.newPurchases)} compras deste ciclo` : '',
  ].filter(Boolean);
  if (pieces.length) parts.push(`Dela, ${joinAnd(pieces)}.`);
  if (s.oldInstallments >= s.next.total * 0.4) {
    parts.push('As parcelas antigas são o que segura a fatura alta: mesmo sem compra nova, elas continuam vindo até acabar.');
  }
  if (s.topNew.length) parts.push(`As maiores compras deste ciclo: ${joinAnd(s.topNew.map((l) => `${l.description} (${formatMoney(l.amount)})`))}.`);
  return {
    text: parts.join(' '),
    highlight: { label: `Fatura do ${name}`, value: formatMoney(s.next.total) },
    list: [
      { label: 'Parcelas antigas', detail: s.installmentsUntil ? `até ${formatMonthLabel(s.installmentsUntil)}` : '', value: formatMoney(s.oldInstallments) },
      { label: 'Assinaturas', detail: '', value: formatMoney(s.subscriptions) },
      { label: 'Compras deste ciclo', detail: '', value: formatMoney(s.newPurchases) },
      { label: '= Total', detail: `vence ${formatDayShort(s.next.dueOn)}`, value: formatMoney(s.next.total) },
    ],
    basis: s.previous.length ? `média de ${s.previous.length} ${s.previous.length === 1 ? 'fatura anterior' : 'faturas anteriores'}` : 'sem faturas anteriores para comparar',
    link: { label: 'Ver o cartão', route: { view: 'cartoes' } },
  };
}

/* ------------------------------------- a renda subiu e o dinheiro não */

export function answerIncomeRose(ctx: AssistantContext): Answer {
  const c = incomeCreep(expander(ctx), ctx.entries, ctx.today);
  if (!c) return { text: 'Preciso de seis meses de movimento para comparar o antes e o depois do aumento.' };
  const dIncome = c.after.income - c.before.income;
  const dSpent = c.after.spent - c.before.spent;
  const parts: string[] = [];
  if (dIncome <= 0) {
    parts.push(`Pelo que está lançado, a renda média não subiu: foi de ${formatMoney(c.before.income)} (${monthsText(c.before.months)}) para ${formatMoney(c.after.income)} (${monthsText(c.after.months)}).`);
    parts.push('Se o aumento é recente, ele ainda não apareceu nos meses completos, ou não foi lançado.');
  } else {
    parts.push(
      `A renda média subiu ${formatMoney(dIncome)}, de ${formatMoney(c.before.income)} para ${formatMoney(c.after.income)}, e os gastos ${dSpent >= 0 ? `subiram ${formatMoney(dSpent)}` : `caíram ${formatMoney(-dSpent)}`} no mesmo período.`,
    );
    parts.push(
      dSpent >= dIncome * 0.8
        ? 'O aumento foi quase todo absorvido pelos gastos: é comum o padrão de vida acompanhar a renda sem ninguém decidir isso.'
        : `Sobram ${formatMoney(dIncome - dSpent)} a mais por mês do que antes.`,
    );
    if (c.grew.length) parts.push(`O que mais cresceu: ${joinAnd(c.grew.map((g) => `${categoryName(ctx, g.categoryId)} (+${formatMoney(g.diff)})`))}.`);
  }
  return {
    text: parts.join(' '),
    list: [
      { label: 'Renda média', detail: `${formatMoney(c.before.income)} → ${formatMoney(c.after.income)}`, value: formatMoney(dIncome, { signed: true }) },
      { label: 'Gastos médios', detail: `${formatMoney(c.before.spent)} → ${formatMoney(c.after.spent)}`, value: formatMoney(dSpent, { signed: true }) },
    ],
    basis: `${monthsText(c.after.months)} contra ${monthsText(c.before.months)}`,
    link: { label: 'Ver as saídas', route: { view: 'movimentos', param: 'saidas' } },
  };
}

/* ---------------------------------------- por que a meta nunca chega */

export function answerGoalLag(ctx: AssistantContext, goal: Goal | null): Answer {
  if (!goal) return { text: 'Você não tem meta ativa. Crie uma e eu acompanho o ritmo dela.', link: { label: 'Ver metas', route: { view: 'metas' } } };
  const p = goalProgress(goal, ctx.entries, ctx.month, ctx.today);
  if (p.reached) return { text: `${goal.name} já foi batida.` };
  const pace = goalPace(goal, ctx.entries, ctx.month, ctx.today);
  const link = { label: 'Ver metas', route: { view: 'metas' } } as Answer['link'];
  const projected = pace.projected ? formatMonthLabel(pace.projected) : null;
  const parts: string[] = [];
  if (!goal.deadline || p.perMonth === null) {
    parts.push(`${goal.name}: faltam ${formatMoney(p.missing)}. Nos últimos meses entraram ${formatMoney(pace.pace)} por mês${projected ? `; nesse ritmo, chega em ${projected}` : ', e sem aporte ela não anda'}.`);
    parts.push('Sem prazo, não há atraso — mas um prazo ajuda a saber quanto guardar por mês.');
  } else if (p.late) {
    parts.push(`O prazo de ${goal.name} passou com ${formatMoney(p.missing)} faltando.${projected ? ` No ritmo atual (${formatMoney(pace.pace)} por mês), chega em ${projected}.` : ''} Dá para definir um prazo novo e recalcular o aporte.`);
  } else if (pace.pace >= p.perMonth) {
    parts.push(`${goal.name} está no ritmo: pede ${formatMoney(p.perMonth)} por mês até ${formatMonthLabel(goal.deadline.slice(0, 7))}, e entraram ${formatMoney(pace.pace)} por mês nos últimos meses.`);
  } else {
    parts.push(`${goal.name} pede ${formatMoney(p.perMonth)} por mês para chegar até ${formatMonthLabel(goal.deadline.slice(0, 7))}, e o ritmo dos últimos meses foi ${formatMoney(pace.pace)}.`);
    parts.push(projected ? `Nesse ritmo, chega em ${projected}.` : 'Sem aporte recente, ela não anda.');
    parts.push(`Dá para aumentar o aporte em ${formatMoney(p.perMonth - pace.pace)} por mês, estender o prazo${projected ? ` para ${projected}` : ''}, reduzir o valor da meta — ou combinar os três.`);
  }
  return {
    text: parts.join(' '),
    highlight: { label: goal.name, value: `${formatMoney(p.current)} de ${formatMoney(p.target)}` },
    basis: `aportes dos últimos ${pace.history.slice(-3).length} meses`,
    link,
  };
}

/* ------------------------------------------- qual dívida olhar primeiro */

export function answerWhichDebt(ctx: AssistantContext): Answer {
  const open = ctx.debts
    .filter((d) => !d.deletedAt && !d.settledAt)
    .map((d) => ({ d, p: debtProgress(d, ctx.month) }))
    .filter((r) => !r.p.done);
  const link = { label: 'Ver dívidas', route: { view: 'dividas' } } as Answer['link'];
  if (!open.length) return { text: 'Nenhuma dívida em aberto cadastrada.', link };
  const list = open.map(({ d, p }) => ({
    label: d.name,
    detail: `${d.monthlyRate > 0 ? `${d.monthlyRate.toLocaleString('pt-BR')}% ao mês · ` : ''}${p.remaining} ${p.remaining === 1 ? 'parcela' : 'parcelas'} de ${formatMoney(d.installment)}`,
    value: formatMoney(p.outstanding),
  }));
  if (open.length === 1) {
    return { text: `Há uma só em aberto: ${open[0].d.name}, com ${formatMoney(open[0].p.outstanding)} a pagar. Antecipar parcelas dela reduz os juros que ainda viriam.`, list, link };
  }
  const byRate = open.slice().sort((a, b) => b.d.monthlyRate - a.d.monthlyRate);
  const bySize = open.slice().sort((a, b) => a.p.outstanding - b.p.outstanding);
  const parts = ['Depende do que você quer primeiro.'];
  if (byRate[0].d.monthlyRate > 0) {
    parts.push(`Pelo juro, seria ${byRate[0].d.name} (${byRate[0].d.monthlyRate.toLocaleString('pt-BR')}% ao mês): é onde cada real antecipado economiza mais.`);
  } else {
    parts.push('Os juros não estão cadastrados; com eles, dá para ver qual custa mais.');
  }
  parts.push(`Pelo saldo, seria ${bySize[0].d.name} (${formatMoney(bySize[0].p.outstanding)}): acaba antes e libera ${formatMoney(bySize[0].d.installment)} por mês mais cedo.`);
  if (byRate[0].d.monthlyRate > 0 && byRate[0].d.id === bySize[0].d.id) parts.push('Aqui os dois critérios apontam para a mesma.');
  return { text: parts.join(' '), list, basis: `${open.length} dívidas em aberto`, link };
}
