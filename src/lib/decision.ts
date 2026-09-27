import { cardUsage, dueDateOf, invoiceMonthOf } from './cards';
import { normalize } from './categories';
import type { CashSnapshot, DayBalance } from './cashflow';
import { addDaysIso, addMonthsToKey, monthKeyOf } from './dates';
import { balancesAt, ledgerAccounts, plannedItems, primaryAccountId, type LedgerInput, type PlannedItem } from './ledger';
import { formatMoney, splitCents } from './money';
import type { MonthSummary } from './occurrences';
import type { Account, Card, Category, Cents, Entry, IsoDate, MonthKey, Settings, Subscription, Transfer } from './types';

/**
 * Dinheiro para decidir.
 *
 * Três números, todos do mesmo livro-caixa do Início e das Contas:
 *
 *   saldo         o que existe agora nas contas
 *   comprometido  o que já tem destino até o próximo recebimento
 *   disponível    o que dá para gastar sem deixar conta descoberta até lá
 *
 * Do disponível sai a margem de segurança, e o que sobra é o "disponível para
 * gastar". Nenhum número aqui é palpite: cada um vem com as parcelas que o
 * formam, para a tela e o assistente mostrarem a conta inteira.
 */

/* ------------------------------------------------ despesas essenciais */

/** o que continua existindo num mês de aperto, pelo nome das categorias padrão */
const ESSENTIAL_NAMES = new Set(['moradia', 'contas de casa', 'mercado', 'transporte', 'saude', 'educacao', 'impostos e taxas']);

/** a categoria é de gasto essencial? A marca da pessoa vale; sem marca, o padrão pelo nome */
export function isEssential(category: Pick<Category, 'kind' | 'name' | 'essential'>): boolean {
  if (category.kind !== 'out') return false;
  if (typeof category.essential === 'boolean') return category.essential;
  return ESSENTIAL_NAMES.has(normalize(category.name));
}

export interface EssentialAverage {
  /** média por mês, em centavos */
  monthly: Cents;
  /** os meses completos que entraram na média, do mais antigo ao mais recente */
  months: MonthKey[];
}

/**
 * A média do gasto essencial nos últimos três meses completos com movimento.
 * O mês corrente fica de fora: pela metade, ele puxaria a média para baixo.
 */
export function essentialAverage(history: MonthSummary[], categories: Category[], today: IsoDate): EssentialAverage | null {
  const current = monthKeyOf(today);
  const ids = new Set(categories.filter((c) => !c.deletedAt && isEssential(c)).map((c) => c.id));
  if (!ids.size) return null;
  const months = history.filter((s) => s.month < current && s.count > 0).slice(-3);
  if (!months.length) return null;
  const total = months.reduce(
    (sum, s) => sum + [...s.byCategory].reduce((t, [id, v]) => (ids.has(id) ? t + v : t), 0),
    0,
  );
  if (total <= 0) return null;
  return { monthly: Math.round(total / months.length), months: months.map((s) => s.month) };
}

/* ------------------------------------------------ margem de segurança */

/** a margem sugerida cobre uma semana do gasto essencial */
export const BUFFER_DAYS = 7;

export interface SafetyBuffer {
  amount: Cents;
  mode: 'auto' | 'manual';
  /** a sugerida; null sem histórico de gasto essencial */
  suggested: Cents | null;
  /** de onde a sugerida saiu */
  basis: EssentialAverage | null;
}

/** uma semana do mês essencial, arredondada a R$ 10: é um colchão, não um lançamento */
export function suggestBuffer(basis: EssentialAverage | null): Cents | null {
  if (!basis) return null;
  return Math.round((basis.monthly * BUFFER_DAYS) / 30 / 1000) * 1000;
}

export function safetyBuffer(
  settings: Pick<Settings, 'safetyBuffer'> | null | undefined,
  history: MonthSummary[],
  categories: Category[],
  today: IsoDate,
): SafetyBuffer {
  const basis = essentialAverage(history, categories, today);
  const suggested = suggestBuffer(basis);
  const pref = settings?.safetyBuffer;
  if (pref?.mode === 'manual') return { amount: Math.max(0, pref.amount), mode: 'manual', suggested, basis };
  return { amount: suggested ?? 0, mode: 'auto', suggested, basis };
}

/* ----------------------------------------------------- os três números */

/**
 * As contas cujo dinheiro conta como disponível: todas, menos poupança e
 * corretora — dinheiro guardado é reserva e investimento, não troco do mês.
 * A principal sempre conta, mesmo sendo poupança: é por ela que passa o que
 * não diz de qual conta é.
 */
export function spendableAccountIds(accounts: Account[]): Set<string> {
  const principal = primaryAccountId(accounts);
  return new Set(
    ledgerAccounts(accounts)
      .filter((a) => a.id === principal || (a.kind !== 'savings' && a.kind !== 'broker'))
      .map((a) => a.id),
  );
}

/** o que já tem destino: a conta, a fatura, a parcela, o que vai para a poupança */
export type Commitment = Pick<PlannedItem, 'id' | 'label' | 'date' | 'amount' | 'overdue' | 'source' | 'internal'>;

export interface MoneyToDecide {
  today: IsoDate;
  /** saldo somado de todas as contas agora: o mesmo da tela Contas */
  total: Cents;
  /** o que está em poupança e corretora (fora a principal): guardado, não entra no disponível */
  guarded: Cents;
  /** saldo agora nas contas de uso: o total menos o guardado */
  balance: Cents;
  /** o que já tem destino até `until`, vencidos inclusos */
  committed: Cents;
  commitments: Commitment[];
  /** o que entra antes do recebimento: entrada atrasada, dinheiro vindo da poupança */
  expectedIn: Cents;
  /** até quando o disponível olha: o dia do próximo recebimento, ou o dia seguinte ao fim do mês */
  until: IsoDate;
  income: Pick<PlannedItem, 'label' | 'date' | 'amount'> | null;
  /** o menor saldo previsto até lá: gastar mais que isso deixa alguma conta descoberta */
  available: Cents;
  /** o dia desse menor saldo; null quando o menor é o de hoje */
  tightest: DayBalance | null;
  buffer: SafetyBuffer;
  /** o disponível menos a margem inteira; negativo quando a margem não cabe */
  free: Cents;
  /**
   * O número que a tela mostra como "disponível para gastar". Com conta
   * descoberta, é a falta (negativo). Sem conta descoberta, nunca é negativo:
   * se o que sobra não completa a margem, o livre para gastar é zero — e a
   * margem fica com o que couber.
   */
  spendable: Cents;
  /** a parte da margem que o disponível consegue guardar */
  reserved: Cents;
  /** depois do recebimento, o menor saldo previsto nos próximos 60 dias */
  later: DayBalance | null;
  /** o saldo previsto das contas de uso, de amanhã até 60 dias (ou o fim do mês) */
  ahead: DayBalance[];
  /** a conta parte de um saldo que a pessoa informou? Sem isso, parte de zero */
  grounded: boolean;
}

const lowestOf = (days: DayBalance[]): DayBalance | null =>
  days.reduce<DayBalance | null>((min, d) => (!min || d.balance < min.balance ? d : min), null);

/**
 * Os três números, para as contas de uso.
 *
 * O saldo de hoje vem do livro-caixa, conta a conta; o previsto, do mesmo
 * previsto do Calendário, só das contas de uso. Transferência para a poupança
 * é saída daqui — o dinheiro sai do que dá para gastar —, e transferência
 * entre duas contas de uso se anula.
 */
export function moneyToDecide(input: LedgerInput, cash: CashSnapshot, buffer: SafetyBuffer): MoneyToDecide {
  const today = input.today;
  const use = spendableAccountIds(input.accounts);
  const rows = balancesAt(input, today).accounts;
  const total = rows.reduce((t, r) => t + r.balance, 0);
  const balance = rows.filter((r) => use.has(r.account.id)).reduce((t, r) => t + r.balance, 0);

  const tomorrow = addDaysIso(today, 1);
  const horizon = addDaysIso(today, 60);
  const end = horizon > cash.monthEnd ? horizon : cash.monthEnd;
  const raw = plannedItems(input, end, tomorrow).filter((p) => use.has(p.accountId));
  // transferência com os dois lados nas contas de uso não muda nada aqui
  const sides = new Map<string, number>();
  for (const p of raw) if (p.source === 'transfer' && p.internal) sides.set(p.refId, (sides.get(p.refId) ?? 0) + 1);
  const items = raw.filter((p) => !(p.source === 'transfer' && p.internal && sides.get(p.refId) === 2));

  const byDay = new Map<IsoDate, { inflow: Cents; outflow: Cents }>();
  for (const p of items) {
    const day = p.overdue ? tomorrow : p.date;
    const slot = byDay.get(day) ?? { inflow: 0, outflow: 0 };
    if (p.kind === 'in') slot.inflow += p.amount;
    else slot.outflow += p.amount;
    byDay.set(day, slot);
  }
  const ahead: DayBalance[] = [];
  let running = balance;
  for (let d = tomorrow; d <= end; d = addDaysIso(d, 1)) {
    const slot = byDay.get(d) ?? { inflow: 0, outflow: 0 };
    running += slot.inflow - slot.outflow;
    ahead.push({ date: d, balance: running, inflow: slot.inflow, outflow: slot.outflow, projected: true });
  }

  const income =
    items
      .filter((p) => p.kind === 'in' && !p.internal && !p.overdue && p.date > today && p.date <= horizon)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] ?? null;
  const until = income ? income.date : addDaysIso(cash.monthEnd, 1);
  const window = ahead.filter((d) => d.date < until);
  const available = Math.min(balance, ...window.map((d) => d.balance));
  const tightest = window.reduce<DayBalance | null>((min, d) => (d.balance < balance && (!min || d.balance < min.balance) ? d : min), null);

  const due = items.filter((p) => p.kind !== 'in' && (p.overdue || p.date < until));
  const expectedIn = items.filter((p) => p.kind === 'in' && p !== income && (p.overdue || p.date < until)).reduce((t, p) => t + p.amount, 0);
  const reserved = available < 0 ? 0 : Math.min(buffer.amount, available);

  return {
    today,
    total,
    guarded: total - balance,
    balance,
    committed: due.reduce((t, p) => t + p.amount, 0),
    commitments: due
      .map(({ id, label, date, amount, overdue, source, internal }) => ({ id, label, date, amount, overdue, source, internal }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount)),
    expectedIn,
    until,
    income: income ? { label: income.label, date: income.date, amount: income.amount } : null,
    available,
    tightest,
    buffer,
    free: available - buffer.amount,
    spendable: available < 0 ? available : available - reserved,
    reserved,
    later: income ? lowestOf(ahead.filter((d) => d.date >= until)) : null,
    ahead,
    grounded: cash.hasOpening,
  };
}

/** uma linha da conta que chega no disponível: o "como cheguei nisso" */
export interface CalcLine {
  op: '' | '+' | '−' | '=';
  label: string;
  amount: Cents;
  detail?: string;
}

/**
 * A conta do disponível, linha a linha, somando de verdade.
 *
 * Entrada atrasada não conta hoje: se a projeção espera por ela e o saldo de
 * hoje é menor que o do fim do intervalo, o disponível é o de hoje — e a conta
 * diz isso, em vez de mostrar uma soma que não fecha.
 */
export function availableLines(d: MoneyToDecide): CalcLine[] {
  const lines: CalcLine[] = [{ op: '', label: 'Saldo nas contas agora', amount: d.total }];
  if (d.guarded !== 0) lines.push({ op: '−', label: 'Guardado em poupança e corretora', amount: d.guarded });
  if (d.expectedIn > 0) lines.push({ op: '+', label: 'Entradas antes do recebimento', amount: d.expectedIn });
  lines.push({
    op: '−',
    label: d.income ? 'Compromissos até o próximo recebimento' : 'Compromissos até o fim do mês',
    amount: d.committed,
    detail: `${d.commitments.length} ${d.commitments.length === 1 ? 'conta' : 'contas'}`,
  });
  const projected = d.balance + d.expectedIn - d.committed;
  if (d.available < 0) {
    // conta descoberta: a margem não entra, a conta termina na falta
    lines.push({ op: '=', label: 'Falta para cobrir as contas até lá', amount: d.available });
    return lines;
  }
  if (projected !== d.available) {
    lines.push({ op: '=', label: 'Saldo previsto antes do recebimento', amount: projected });
    lines.push({
      op: '=',
      label: d.available === d.balance ? 'Disponível: o saldo de hoje, até as entradas caírem' : 'Disponível: o dia mais apertado até lá',
      amount: d.available,
    });
  } else {
    lines.push({ op: '=', label: 'Disponível sem deixar conta descoberta', amount: d.available });
  }
  lines.push({
    op: '−',
    label: 'Margem de segurança',
    amount: d.reserved,
    detail: d.reserved < d.buffer.amount ? `de ${formatMoney(d.buffer.amount)}: o que sobra não completa a margem` : undefined,
  });
  lines.push({ op: '=', label: 'Disponível para gastar', amount: d.spendable });
  return lines;
}

/**
 * A conta de um gasto: o disponível, menos o que o gasto tira antes do
 * recebimento, menos a margem que ainda couber. Fecha linha a linha, como a
 * do disponível; gasto que só pesa depois do recebimento não muda nada aqui.
 */
export function spendLines(d: MoneyToDecide, c: Pick<SpendCheck, 'schedule' | 'card'>): CalcLine[] {
  const base = availableLines(d);
  const hits = c.schedule.filter((s) => s.date < d.until).reduce((t, s) => t + s.amount, 0);
  if (hits === 0) return base;
  // o gasto entra antes da margem: tira as duas últimas linhas e refaz
  const lines = d.available < 0 ? base : base.slice(0, -2);
  lines.push({ op: '−', label: c.card ? 'Este gasto, na fatura' : 'Este gasto, hoje', amount: hits });
  const after = d.available - hits;
  if (after < 0) {
    lines.push({ op: '=', label: 'Falta para cobrir as contas', amount: after });
    return lines;
  }
  const reserved = Math.min(d.buffer.amount, after);
  lines.push({ op: '=', label: 'Sobra depois das contas', amount: after });
  lines.push({
    op: '−',
    label: 'Margem de segurança',
    amount: reserved,
    detail: reserved < d.buffer.amount ? `de ${formatMoney(d.buffer.amount)}: o que sobra não completa a margem` : undefined,
  });
  lines.push({ op: '=', label: 'Sobra para gastar depois', amount: after - reserved });
  return lines;
}

/* ------------------------------------------------------- posso gastar? */

export type SpendMethod = 'account' | 'card';

export interface SpendRequest {
  /** o valor total da compra */
  amount: Cents;
  method: SpendMethod;
  card?: Card | null;
  /** parcelas no cartão; 1 = à vista */
  installments?: number;
}

export interface CardData {
  entries: Entry[];
  subscriptions: Subscription[];
  transfers: Transfer[];
}

export interface SpendCheck {
  amount: Cents;
  method: SpendMethod;
  card: Card | null;
  installments: number;
  /**
   * fits        cabe sem tocar a margem
   * uses-buffer cabe, mas come parte da margem de segurança
   * short       deixa conta descoberta, ou passa do limite do cartão
   */
  verdict: 'fits' | 'uses-buffer' | 'short';
  shortBy: 'cash' | 'later' | 'limit' | null;
  /** quando o dinheiro sai da conta: hoje, ou no vencimento de cada fatura */
  schedule: { date: IsoDate; amount: Cents; invoiceMonth?: MonthKey }[];
  /** parcelas que vencem depois do último dia que o app projeta */
  beyondHorizon: number;
  /** o disponível e o disponível para gastar, depois do gasto */
  availableAfter: Cents;
  freeAfter: Cents;
  /** o dia mais apertado antes do recebimento, já com o gasto */
  tightestAfter: { date: IsoDate; balance: Cents };
  /** depois do recebimento: o menor saldo antes e depois do gasto */
  laterBefore: DayBalance | null;
  laterAfter: { date: IsoDate; balance: Cents } | null;
  limit: { available: Cents; after: Cents } | null;
  /** na conta: o maior gasto que cabe sem tocar a margem nem descobrir o depois */
  maxFree: Cents | null;
}

export function checkSpend(decide: MoneyToDecide, req: SpendRequest, data?: CardData): SpendCheck {
  const card = req.method === 'card' ? (req.card ?? null) : null;
  const installments = card ? Math.max(1, Math.trunc(req.installments ?? 1)) : 1;
  const amount = Math.max(0, Math.round(req.amount));

  let schedule: SpendCheck['schedule'];
  if (card) {
    const first = invoiceMonthOf(card, decide.today);
    schedule = splitCents(amount, installments).map((part, i) => {
      const invoiceMonth = addMonthsToKey(first, i);
      return { date: dueDateOf(card, invoiceMonth), amount: part, invoiceMonth };
    });
  } else {
    schedule = [{ date: decide.today, amount }];
  }

  // quanto do gasto já saiu da conta até um dia
  const cut = (date: IsoDate) => schedule.reduce((t, s) => (s.date <= date ? t + s.amount : t), 0);
  const lastDay = decide.ahead[decide.ahead.length - 1]?.date ?? decide.today;
  const beyondHorizon = schedule.filter((s) => s.date > lastDay).length;

  let tightestAfter = { date: decide.today, balance: decide.balance - cut(decide.today) };
  for (const d of decide.ahead) {
    if (d.date >= decide.until) break;
    const balance = d.balance - cut(d.date);
    if (balance < tightestAfter.balance) tightestAfter = { date: d.date, balance };
  }
  const availableAfter = tightestAfter.balance;

  let laterAfter: SpendCheck['laterAfter'] = null;
  if (decide.income) {
    for (const d of decide.ahead) {
      if (d.date < decide.until) continue;
      const balance = d.balance - cut(d.date);
      if (!laterAfter || balance < laterAfter.balance) laterAfter = { date: d.date, balance };
    }
  }
  const laterBefore = decide.later;

  const limit = card && data
    ? (() => {
        const usage = cardUsage(card, data.entries, data.subscriptions, monthKeyOf(decide.today), decide.today, data.transfers);
        // o limite reserva a compra inteira de uma vez, mesmo parcelada
        return { available: usage.available, after: usage.available - amount };
      })()
    : null;

  const freeAfter = availableAfter - decide.buffer.amount;
  // descobrir o depois só conta quando é este gasto que o faz ficar negativo
  const breaksLater = !!laterAfter && laterAfter.balance < 0 && (laterBefore?.balance ?? 0) >= 0;
  const shortBy: SpendCheck['shortBy'] = availableAfter < 0 ? 'cash' : limit && limit.after < 0 ? 'limit' : breaksLater ? 'later' : null;
  const verdict: SpendCheck['verdict'] = shortBy ? 'short' : freeAfter < 0 ? 'uses-buffer' : 'fits';

  const maxFree = card
    ? null
    : Math.max(0, Math.min(decide.free, laterBefore && laterBefore.balance >= 0 ? laterBefore.balance : decide.free));

  return {
    amount,
    method: card ? 'card' : 'account',
    card,
    installments,
    verdict,
    shortBy,
    schedule,
    beyondHorizon,
    availableAfter,
    freeAfter,
    tightestAfter,
    laterBefore,
    laterAfter,
    limit,
    maxFree,
  };
}
