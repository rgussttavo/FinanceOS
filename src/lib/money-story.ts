import { buildInvoice, type Invoice, type InvoiceLine } from './cards';
import { addMonthsToKey, monthKeyOf } from './dates';
import type { Occurrence } from './occurrences';
import type { Card, Category, Cents, Entry, IsoDate, MonthKey, Subscription } from './types';

/**
 * Os números por trás das perguntas vagas: "por que meu dinheiro some",
 * "estou gastando demais", "por que a fatura não baixa", "meu salário subiu e
 * continuo sem dinheiro".
 *
 * Só conta, nenhuma frase: quem transforma isto em resposta é
 * `story-answers.ts`. As médias usam meses completos — o mês pela metade
 * puxaria tudo para baixo.
 */

/** um mês qualquer, expandido como as telas o mostram (lançamentos, assinaturas, dívidas) */
export type ExpandMonth = (month: MonthKey) => Occurrence[];

export interface MonthUse {
  month: MonthKey;
  income: Cents;
  /** o que se repete: contas mensais, assinaturas, parcelas de dívida */
  fixed: Cents;
  /** compras parceladas */
  installments: Cents;
  /** o resto dos gastos: o que muda de um mês para o outro */
  variable: Cents;
  /** aportes menos resgates */
  invested: Cents;
  variableByCategory: Map<string, Cents>;
  fixedByLabel: Map<string, Cents>;
}

const add = (map: Map<string, Cents>, key: string, v: Cents) => map.set(key, (map.get(key) ?? 0) + v);

/** para onde foi o dinheiro de um mês, separado pelo quanto dá para mexer */
export function monthUse(occurrences: Occurrence[], entries: Map<string, Entry>, month: MonthKey): MonthUse {
  const use: MonthUse = { month, income: 0, fixed: 0, installments: 0, variable: 0, invested: 0, variableByCategory: new Map(), fixedByLabel: new Map() };
  for (const o of occurrences) {
    if (o.opening) continue;
    if (o.kind === 'in') {
      // estorno no cartão é gasto que voltou, não renda
      if (o.cardId) use.variable -= o.amount;
      else use.income += o.amount;
      continue;
    }
    if (o.kind === 'invest') {
      use.invested += o.withdrawal ? -o.amount : o.amount;
      continue;
    }
    // assinatura e parcela de dívida são compromisso fixo, mesmo numeradas (3 de 12)
    const recurring = !!o.virtual || (entries.get(o.entryId)?.repeat.kind ?? 'once') !== 'once';
    if (o.installment && !o.virtual) {
      use.installments += o.amount;
    } else if (recurring) {
      use.fixed += o.amount;
      add(use.fixedByLabel, o.description, o.amount);
    } else {
      use.variable += o.amount;
      add(use.variableByCategory, o.categoryId ?? 'sem-categoria', o.amount);
    }
  }
  return use;
}

export interface MoneyStory {
  months: MonthKey[];
  income: Cents;
  fixed: Cents;
  installments: Cents;
  variable: Cents;
  invested: Cents;
  /** o que sobra antes de investir: renda − fixos − parcelas − variáveis */
  margin: Cents;
  topVariable: { categoryId: string; amount: Cents }[];
  topFixed: { label: string; amount: Cents }[];
}

const mean = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));

function averageMap(maps: Map<string, Cents>[], top: number): { key: string; amount: Cents }[] {
  const sum = new Map<string, Cents>();
  for (const m of maps) for (const [k, v] of m) add(sum, k, v);
  return [...sum]
    .map(([key, v]) => ({ key, amount: Math.round(v / Math.max(1, maps.length)) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, top);
}

/** os meses completos com movimento, do mais antigo ao mais recente */
function completeUses(expand: ExpandMonth, entries: Entry[], today: IsoDate, count: number, skip = 0): MonthUse[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const current = monthKeyOf(today);
  const out: MonthUse[] = [];
  for (let i = count + skip; i >= 1 + skip; i--) {
    const m = addMonthsToKey(current, -i);
    const use = monthUse(expand(m), byId, m);
    if (use.income || use.fixed || use.installments || use.variable) out.push(use);
  }
  return out;
}

/** a média dos últimos `count` meses completos: renda, fixos, parcelas, variáveis */
export function moneyStory(expand: ExpandMonth, entries: Entry[], today: IsoDate, count = 3): MoneyStory | null {
  const uses = completeUses(expand, entries, today, count);
  if (!uses.length) return null;
  const income = mean(uses.map((u) => u.income));
  const fixed = mean(uses.map((u) => u.fixed));
  const installments = mean(uses.map((u) => u.installments));
  const variable = mean(uses.map((u) => u.variable));
  return {
    months: uses.map((u) => u.month),
    income,
    fixed,
    installments,
    variable,
    invested: mean(uses.map((u) => u.invested)),
    margin: income - fixed - installments - variable,
    topVariable: averageMap(uses.map((u) => u.variableByCategory), 3).map((r) => ({ categoryId: r.key, amount: r.amount })),
    topFixed: averageMap(uses.map((u) => u.fixedByLabel), 3).map((r) => ({ label: r.key, amount: r.amount })),
  };
}

/* ----------------------------------------------- este mês contra a média */

export interface SpendingCompare {
  month: MonthKey;
  /** gastos do mês, com o que ainda está previsto */
  current: Cents;
  /** média dos três meses completos anteriores */
  average: Cents;
  months: MonthKey[];
  /** current / average − 1 */
  change: number;
  income: Cents;
  /** as categorias que mais subiram, e as que mais caíram */
  up: { categoryId: string; diff: Cents }[];
  down: { categoryId: string; diff: Cents }[];
  /** o gasto do mês por categoria, para comparar com o teto do orçamento */
  currentBy: Map<string, Cents>;
}

/** gastos: saídas e parcelas; aporte não é gasto */
function spentByCategory(occurrences: Occurrence[], outCategories: Set<string>): { total: Cents; by: Map<string, Cents> } {
  const by = new Map<string, Cents>();
  let total = 0;
  for (const o of occurrences) {
    if (o.opening || o.kind === 'invest') continue;
    if (o.kind === 'in') {
      if (o.cardId) {
        total -= o.amount;
        add(by, o.categoryId ?? 'sem-categoria', -o.amount);
      }
      continue;
    }
    const key = o.categoryId && outCategories.has(o.categoryId) ? o.categoryId : o.categoryId ?? (o.virtual === 'debt' ? 'dividas' : 'sem-categoria');
    total += o.amount;
    add(by, key, o.amount);
  }
  return { total, by };
}

export function spendingVsAverage(expand: ExpandMonth, categories: Category[], today: IsoDate): SpendingCompare | null {
  const current = monthKeyOf(today);
  const outCats = new Set(categories.filter((c) => c.kind === 'out').map((c) => c.id));
  const now = spentByCategory(expand(current), outCats);
  const past: { month: MonthKey; total: Cents; by: Map<string, Cents>; income: Cents }[] = [];
  for (let i = 3; i >= 1; i--) {
    const m = addMonthsToKey(current, -i);
    const occ = expand(m);
    const s = spentByCategory(occ, outCats);
    const income = occ.filter((o) => o.kind === 'in' && !o.cardId && !o.opening).reduce((t, o) => t + o.amount, 0);
    if (s.total || income) past.push({ month: m, ...s, income });
  }
  if (!past.length) return null;
  const average = mean(past.map((p) => p.total));
  const avgBy = new Map<string, Cents>();
  for (const p of past) for (const [k, v] of p.by) add(avgBy, k, v);
  for (const [k, v] of avgBy) avgBy.set(k, Math.round(v / past.length));
  const keys = new Set([...avgBy.keys(), ...now.by.keys()]);
  const diffs = [...keys].map((k) => ({ categoryId: k, diff: (now.by.get(k) ?? 0) - (avgBy.get(k) ?? 0) }));
  return {
    month: current,
    current: now.total,
    average,
    months: past.map((p) => p.month),
    change: average > 0 ? now.total / average - 1 : 0,
    income: mean(past.map((p) => p.income)),
    up: diffs.filter((d) => d.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 3),
    down: diffs.filter((d) => d.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 3),
    currentBy: now.by,
  };
}

/* ------------------------------------------------------- a fatura alta */

export interface InvoiceStory {
  card: Card;
  next: Invoice;
  /** média das três faturas anteriores com valor */
  average: Cents | null;
  previous: Invoice[];
  /** parcelas de compras feitas antes deste ciclo */
  oldInstallments: Cents;
  subscriptions: Cents;
  /** compras deste ciclo, à vista ou primeira parcela */
  newPurchases: Cents;
  /** até quando as parcelas antigas continuam vindo */
  installmentsUntil: MonthKey | null;
  topNew: InvoiceLine[];
}

const isOld = (l: InvoiceLine) => !l.subscription && !!l.installment && l.installment.index > 1;

export function invoiceStory(card: Card, entries: Entry[], subscriptions: Subscription[], today: IsoDate): InvoiceStory | null {
  const month = monthKeyOf(today);
  const next = [month, addMonthsToKey(month, 1)]
    .map((m) => buildInvoice(card, entries, subscriptions, m, today))
    .find((i) => i.dueOn >= today && i.total > 0);
  if (!next) return null;
  const previous = [3, 2, 1]
    .map((i) => buildInvoice(card, entries, subscriptions, addMonthsToKey(next.month, -i), today))
    .filter((i) => i.total > 0);
  const old = next.lines.filter(isOld);
  const subs = next.lines.filter((l) => l.subscription);
  const fresh = next.lines.filter((l) => !l.subscription && !isOld(l));
  const until = old.reduce<MonthKey | null>((last, l) => {
    const end = addMonthsToKey(next.month, l.installment!.total - l.installment!.index);
    return !last || end > last ? end : last;
  }, null);
  return {
    card,
    next,
    average: previous.length ? mean(previous.map((i) => i.total)) : null,
    previous,
    oldInstallments: old.reduce((t, l) => t + l.amount, 0),
    subscriptions: subs.reduce((t, l) => t + l.amount, 0),
    newPurchases: fresh.reduce((t, l) => t + l.amount, 0),
    installmentsUntil: until,
    topNew: fresh.slice().sort((a, b) => b.amount - a.amount).slice(0, 3),
  };
}

/* ------------------------------------------ a renda subiu, o dinheiro não */

export interface IncomeCreep {
  before: { months: MonthKey[]; income: Cents; spent: Cents };
  after: { months: MonthKey[]; income: Cents; spent: Cents };
  /** as categorias variáveis que mais cresceram entre os dois períodos */
  grew: { categoryId: string; diff: Cents }[];
}

/** os três meses completos mais recentes contra os três anteriores */
export function incomeCreep(expand: ExpandMonth, entries: Entry[], today: IsoDate): IncomeCreep | null {
  const after = completeUses(expand, entries, today, 3);
  const before = completeUses(expand, entries, today, 3, 3);
  // comparar com um período pela metade inventa aumento: só com três meses de cada lado
  if (after.length < 3 || before.length < 3 || before.some((u) => u.income <= 0)) return null;
  const spent = (u: MonthUse) => u.fixed + u.installments + u.variable;
  const avgBefore = averageMap(before.map((u) => u.variableByCategory), 50);
  const avgAfter = averageMap(after.map((u) => u.variableByCategory), 50);
  const beforeBy = new Map(avgBefore.map((r) => [r.key, r.amount]));
  const grew = avgAfter
    .map((r) => ({ categoryId: r.key, diff: r.amount - (beforeBy.get(r.key) ?? 0) }))
    .filter((r) => r.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 3);
  return {
    before: { months: before.map((u) => u.month), income: mean(before.map((u) => u.income)), spent: mean(before.map(spent)) },
    after: { months: after.map((u) => u.month), income: mean(after.map((u) => u.income)), spent: mean(after.map(spent)) },
    grew,
  };
}
