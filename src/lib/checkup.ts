import { balancesAt, type LedgerInput } from './ledger';
import { cardUsage } from './cards';
import type { CashSnapshot } from './cashflow';
import { normalize } from './categories';
import { addDaysIso, formatDayShort, monthKeyOf } from './dates';
import { debtInstallmentIn, debtProgress } from './debts';
import { essentialAverage, type MoneyToDecide } from './decision';
import { diagnose } from './diagnostics';
import { goalPace, goalProgress } from './goals';
import { formatMoney, formatPercent } from './money';
import type { Route } from './nav';
import type { MonthSummary } from './occurrences';
import type { Asset, Category, Cents, Goal, IsoDate, Settings } from './types';
import { investedRealized, wealthHistory } from './wealth';

/**
 * "Como está sua vida financeira?" — o diagnóstico por áreas.
 *
 * Sem nota geral: cada área diz o próprio estado, o número que o sustenta e o
 * motivo, e leva para onde se age. Os critérios são os combinados com o
 * responsável e ficam num lugar só (`LIMITS`), para mudar sem caçar regra.
 *
 * O estado é da situação, nunca da pessoa. "Reserva abaixo da referência",
 * não "você não guarda".
 */

export const LIMITS = {
  /** uso do limite dos cartões */
  cardAttention: 0.3,
  cardAlert: 0.7,
  /** parcelas de dívida sobre a renda média */
  debtAttention: 0.15,
  debtAlert: 0.3,
  /** referência de reserva, em meses de despesas essenciais */
  reserveMonths: 6,
} as const;

export type AreaId = 'fluxo' | 'reserva' | 'dividas' | 'cartoes' | 'metas' | 'patrimonio';
/** info: mostra sem julgar (patrimônio); unknown: falta dado para medir */
export type AreaStatus = 'ok' | 'attention' | 'alert' | 'info' | 'unknown';

export interface Area {
  id: AreaId;
  title: string;
  status: AreaStatus;
  /** o estado em poucas palavras: "saudável", "1,4 mês", "↑ R$ 2.300" */
  label: string;
  /** o porquê, com os números */
  why: string;
  action: { label: string; route: Route } | null;
  /** os números usados, para reconstruir o diagnóstico */
  facts: Record<string, number | string | null>;
}

export interface ConfidenceCheck {
  id: 'saldo' | 'conferido' | 'categorias' | 'renda' | 'conferencia' | 'recente';
  label: string;
  ok: boolean;
  /** quanto este item vale, e quanto dele está cumprido */
  weight: number;
  score: number;
  hint: string;
  route: Route | null;
}

export interface DataConfidence {
  percent: number;
  level: 'alta' | 'média' | 'baixa';
  checks: ConfidenceCheck[];
}

export interface Checkup {
  areas: Area[];
  /** as áreas em alerta e em atenção, na ordem em que vale olhar */
  attention: Area[];
  summary: { tone: 'ok' | 'attention' | 'alert' | 'unknown'; text: string };
  confidence: DataConfidence;
}

export interface CheckupInput {
  ledger: LedgerInput;
  cash: CashSnapshot;
  decide: MoneyToDecide;
  /** resumos mensais terminando no mês corrente; os três anteriores completos entram nas médias */
  history: MonthSummary[];
  categories: Category[];
  goals: Goal[];
  assets: Asset[];
  settings: Pick<Settings, 'reserveMonths' | 'profile'> | null;
}

const money = (v: Cents) => formatMoney(v);
const months1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** estabilidade, proteção, redução de risco, objetivos, patrimônio (§86) */
const LAYER: Record<AreaId, number> = { fluxo: 0, reserva: 1, dividas: 2, cartoes: 3, metas: 4, patrimonio: 5 };
const WEIGHT: Record<AreaStatus, number> = { alert: 0, attention: 1, unknown: 2, ok: 3, info: 4 };

/** os três últimos meses completos com movimento */
function completeMonths(history: MonthSummary[], today: IsoDate): MonthSummary[] {
  const current = monthKeyOf(today);
  return history.filter((s) => s.month < current && s.count > 0).slice(-3);
}

const avg = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

/* ------------------------------------------------------------ as áreas */

function flowArea(input: CheckupInput): Area {
  const { cash, decide } = input;
  const months = completeMonths(input.history, cash.today);
  const result = avg(months.map((s) => s.income - s.expense));
  const income = avg(months.map((s) => s.income));
  const facts = { disponivel: decide.available, resultadoMedio: result, rendaMedia: income, meses: months.length };
  const action = { label: 'Ver o mês dia a dia', route: { view: 'calendario' } as Route };

  const stretch = cash.negative[0];
  if (decide.available < 0 || stretch) {
    const why =
      decide.available < 0
        ? `Até ${decide.income ? `o recebimento de ${formatDayShort(decide.income.date)}` : 'o fim do mês'}, faltam ${money(-decide.available)} para cobrir as contas.`
        : `O saldo previsto fica negativo a partir de ${formatDayShort(stretch.from)}, chegando a ${formatMoney(stretch.lowest, { signed: true })}.`;
    return { id: 'fluxo', title: 'Fluxo de caixa', status: 'alert', label: 'conta descoberta', why, action, facts };
  }
  if (result !== null && result < 0) {
    return {
      id: 'fluxo',
      title: 'Fluxo de caixa',
      status: 'attention',
      label: 'saídas acima das entradas',
      why: `Nos últimos ${months.length} ${plural(months.length, 'mês', 'meses')}, as saídas passaram das entradas em ${money(-result)} por mês, em média. Nenhuma conta fica descoberta agora, mas a diferença sai de algum lugar.`,
      action,
      facts,
    };
  }
  if (result === null) {
    return {
      id: 'fluxo',
      title: 'Fluxo de caixa',
      status: cash.items.length ? 'ok' : 'unknown',
      label: cash.items.length ? 'sem conta descoberta' : 'sem dados',
      why: cash.items.length
        ? 'Nenhuma conta fica descoberta pelo que está lançado. Ainda não há um mês completo para comparar entradas e saídas.'
        : 'Lance o que entra e o que sai para eu acompanhar o fluxo.',
      action,
      facts,
    };
  }
  return {
    id: 'fluxo',
    title: 'Fluxo de caixa',
    status: 'ok',
    label: 'saudável',
    why: `Em média, sobram ${money(result)} por mês${income ? ` (${formatPercent(result / income)} da renda)` : ''}, e nenhuma conta fica descoberta pelo que está lançado.`,
    action,
    facts,
  };
}

function reserveArea(input: CheckupInput): Area {
  const { ledger, categories } = input;
  const today = ledger.today;
  const reserveCats = new Set(categories.filter((c) => c.kind === 'invest' && normalize(c.name).startsWith('reserva')).map((c) => c.id));
  const invested = investedRealized(ledger.entries, today, today, (e) => !!e.categoryId && reserveCats.has(e.categoryId));
  const savings = balancesAt(ledger, today)
    .accounts.filter((r) => r.account.kind === 'savings')
    .reduce((t, r) => t + Math.max(0, r.balance), 0);
  const reserve = Math.max(0, invested) + savings;
  const basis = essentialAverage(input.history, categories, today);
  const ref = input.settings?.reserveMonths ?? LIMITS.reserveMonths;
  const action = { label: 'Ver metas', route: { view: 'metas' } as Route };
  const variable = input.settings?.profile?.answeredAt && (input.settings.profile.income === 'variavel' || input.settings.profile.income === 'mista');
  const where = `Conto como reserva as contas poupança e o que foi aplicado em categorias de reserva.${
    variable ? ' Você informou renda variável: nesse caso, uma referência maior costuma fazer sentido.' : ''
  }`;

  if (!basis) {
    return {
      id: 'reserva',
      title: 'Reserva',
      status: 'unknown',
      label: reserve > 0 ? money(reserve) : 'sem dados',
      why: `${reserve > 0 ? `Você tem ${money(reserve)} guardados como reserva, mas ainda` : 'Ainda'} não há um mês completo de despesas essenciais para medir quantos meses a reserva cobre. ${where}`,
      action,
      facts: { reserva: reserve, aplicado: invested, poupanca: savings, referencia: ref },
    };
  }

  const covered = reserve / basis.monthly;
  const ok = covered >= ref;
  const missing = Math.max(0, ref * basis.monthly - reserve);
  return {
    id: 'reserva',
    title: 'Reserva',
    status: ok ? 'ok' : 'attention',
    label: `${months1(covered)} ${covered < 2 ? 'mês' : 'meses'}`,
    why: `${money(reserve)} cobrem ${months1(covered)} ${covered < 2 ? 'mês' : 'meses'} das suas despesas essenciais (${money(basis.monthly)} por mês). A referência é ${ref} ${plural(ref, 'mês', 'meses')}${ok ? '.' : `: faltam ${money(missing)}.`} ${where}`,
    action,
    facts: { reserva: reserve, aplicado: invested, poupanca: savings, essencialMensal: basis.monthly, meses: Number(covered.toFixed(2)), referencia: ref },
  };
}

function debtArea(input: CheckupInput): Area {
  const { ledger } = input;
  const month = monthKeyOf(ledger.today);
  const open = ledger.debts.filter((d) => !d.deletedAt && !d.settledAt && !debtProgress(d, month).done);
  const action = { label: 'Ver dívidas', route: { view: 'dividas' } as Route };
  if (!open.length) {
    return { id: 'dividas', title: 'Dívidas', status: 'ok', label: 'nenhuma', why: 'Nenhuma dívida em aberto cadastrada.', action, facts: { parcelas: 0 } };
  }
  const monthly = open.reduce((t, d) => t + (debtInstallmentIn(d, month) ? d.installment : 0), 0);
  const outstanding = open.reduce((t, d) => t + debtProgress(d, month).outstanding, 0);
  const income = avg(completeMonths(input.history, ledger.today).map((s) => s.income));
  if (!income) {
    return {
      id: 'dividas',
      title: 'Dívidas',
      status: 'unknown',
      label: `${money(monthly)}/mês`,
      why: `As parcelas somam ${money(monthly)} por mês e o saldo devedor é ${money(outstanding)}. Falta um mês completo de renda para comparar.`,
      action,
      facts: { parcelas: monthly, saldoDevedor: outstanding, rendaMedia: null },
    };
  }
  const ratio = monthly / income;
  const status: AreaStatus = ratio > LIMITS.debtAlert ? 'alert' : ratio > LIMITS.debtAttention ? 'attention' : 'ok';
  return {
    id: 'dividas',
    title: 'Dívidas',
    status,
    label: `${formatPercent(ratio)} da renda`,
    why: `As parcelas somam ${money(monthly)} por mês, ${formatPercent(ratio)} da sua renda média (${money(income)}). O saldo devedor é ${money(outstanding)}.`,
    action,
    facts: { parcelas: monthly, saldoDevedor: outstanding, rendaMedia: income, comprometimento: Number(ratio.toFixed(4)) },
  };
}

function cardArea(input: CheckupInput): Area | null {
  const { ledger } = input;
  const cards = ledger.cards.filter((c) => !c.deletedAt && !c.archived);
  if (!ledger.cardsEnabled || !cards.length) return null;
  const month = monthKeyOf(ledger.today);
  const used = cards.reduce((t, c) => t + cardUsage(c, ledger.entries, ledger.subscriptions, month, ledger.today, ledger.transfers).used, 0);
  const limit = cards.reduce((t, c) => t + Math.max(0, c.limit), 0);
  const action = { label: 'Ver cartões', route: { view: 'cartoes' } as Route };
  if (limit <= 0) {
    return {
      id: 'cartoes',
      title: 'Cartões',
      status: 'unknown',
      label: 'sem limite',
      why: `${money(used)} comprometidos nos cartões. Cadastre o limite para medir quanto dele está em uso.`,
      action,
      facts: { usado: used, limite: 0 },
    };
  }
  const ratio = used / limit;
  const status: AreaStatus = ratio > LIMITS.cardAlert ? 'alert' : ratio > LIMITS.cardAttention ? 'attention' : 'ok';
  return {
    id: 'cartoes',
    title: 'Cartões',
    status,
    label: `${formatPercent(ratio)} do limite`,
    why: `${money(used)} de ${money(limit)} do limite estão comprometidos (${formatPercent(ratio)}), contando as parcelas que ainda vêm.`,
    action,
    facts: { usado: used, limite: limit, uso: Number(ratio.toFixed(4)) },
  };
}

function goalArea(input: CheckupInput): Area {
  const { ledger } = input;
  const month = monthKeyOf(ledger.today);
  const active = input.goals.filter((g) => !g.archivedAt && !g.pausedAt && !g.deletedAt);
  const action = { label: 'Ver metas', route: { view: 'metas' } as Route };
  if (!active.length) {
    return { id: 'metas', title: 'Metas', status: 'info', label: 'nenhuma', why: 'Nenhuma meta ativa.', action, facts: { metas: 0 } };
  }
  const rows = active
    .filter((g) => g.deadline)
    .map((g) => ({ g, p: goalProgress(g, ledger.entries, month, ledger.today), pace: goalPace(g, ledger.entries, month, ledger.today) }))
    .filter((r) => !r.p.reached);
  if (!rows.length) {
    return {
      id: 'metas',
      title: 'Metas',
      status: 'info',
      label: `${active.length} ${plural(active.length, 'ativa', 'ativas')}`,
      why: 'Nenhuma meta com prazo em aberto: sem prazo, não há ritmo a medir.',
      action,
      facts: { metas: active.length },
    };
  }
  const behind = rows.filter((r) => r.p.late || (r.p.perMonth !== null && r.pace.pace < r.p.perMonth));
  if (!behind.length) {
    return {
      id: 'metas',
      title: 'Metas',
      status: 'ok',
      label: 'no ritmo',
      why: `${rows.length} ${plural(rows.length, 'meta com prazo está', 'metas com prazo estão')} no ritmo para chegar a tempo.`,
      action,
      facts: { comPrazo: rows.length, foraDoRitmo: 0 },
    };
  }
  const first = behind[0];
  const detail = first.p.late
    ? `${first.g.name} passou do prazo sem ser batida.`
    : `${first.g.name} pede ${money(first.p.perMonth ?? 0)} por mês até o prazo, e o ritmo dos últimos meses é ${money(first.pace.pace)}.`;
  return {
    id: 'metas',
    title: 'Metas',
    status: 'attention',
    label: `${behind.length} fora do ritmo`,
    why: `${behind.length} de ${rows.length} ${plural(rows.length, 'meta com prazo', 'metas com prazo')} fora do ritmo. ${detail}`,
    action,
    facts: { comPrazo: rows.length, foraDoRitmo: behind.length },
  };
}

function wealthArea(input: CheckupInput): Area {
  const { ledger } = input;
  const hist = wealthHistory({ assets: input.assets, entries: ledger.entries, debts: ledger.debts, today: ledger.today }, 4);
  const now = hist[hist.length - 1]?.net ?? 0;
  const before = hist[0]?.net ?? 0;
  const delta = now - before;
  const action = { label: 'Ver patrimônio', route: { view: 'patrimonio' } as Route };
  if (!hist.some((h) => h.assets !== 0 || h.debts !== 0)) {
    return { id: 'patrimonio', title: 'Patrimônio', status: 'info', label: 'sem dados', why: 'Nenhum investimento, bem ou dívida cadastrado para acompanhar.', action, facts: { liquido: 0 } };
  }
  return {
    id: 'patrimonio',
    title: 'Patrimônio',
    status: 'info',
    label: delta > 0 ? `↑ ${money(delta)}` : delta < 0 ? `↓ ${money(-delta)}` : 'estável',
    why: `Investimentos e bens menos dívidas somam ${formatMoney(now, { signed: now < 0 })}${
      delta === 0 ? ', o mesmo de três meses atrás' : `, ${money(Math.abs(delta))} ${delta > 0 ? 'a mais' : 'a menos'} que há três meses`
    }. O saldo das contas fica fora desta comparação.`,
    action,
    facts: { liquido: now, tresMesesAtras: before, variacao: delta },
  };
}

/* ------------------------------------------------- confiança dos dados */

export function dataConfidence(input: CheckupInput): DataConfidence {
  const { ledger, cash } = input;
  const today = ledger.today;
  const accounts = ledger.accounts.filter((a) => !a.deletedAt && !a.archived);
  const started = accounts.filter((a) => !!a.openingDate || a.openingBalance !== 0 || (a.checkpoints?.length ?? 0) > 0);
  const since = addDaysIso(today, -30);
  const checked = accounts.some((a) => (a.checkpoints ?? []).some((c) => c.date >= since));

  const current = monthKeyOf(today);
  const previous = monthKeyOf(addDaysIso(`${current}-01`, -1));
  const recentEntries = ledger.entries.filter(
    (e) => !e.deletedAt && e.kind !== 'in' && (monthKeyOf(e.date) === current || monthKeyOf(e.date) === previous),
  );
  const categorized = recentEntries.length ? recentEntries.filter((e) => !!e.categoryId).length / recentEntries.length : 1;
  const errors = diagnose(ledger, input.categories).filter((f) => f.severity === 'erro').length;
  const week = addDaysIso(today, -7);
  const fresh =
    ledger.entries.some((e) => !e.deletedAt && e.createdAt.slice(0, 10) >= week) ||
    ledger.transfers.some((t) => !t.deletedAt && t.createdAt.slice(0, 10) >= week);

  const share = accounts.length ? started.length / accounts.length : 0;
  const checks: ConfidenceCheck[] = [
    {
      id: 'saldo',
      label: accounts.length ? `Saldo informado em ${started.length} de ${accounts.length} ${plural(accounts.length, 'conta', 'contas')}` : 'Nenhuma conta cadastrada',
      ok: share === 1,
      weight: 25,
      score: Math.round(25 * share),
      hint: 'Informe quanto cada conta tem hoje: sem isso, o saldo parte de zero.',
      route: { view: 'contas' },
    },
    {
      id: 'conferido',
      label: 'Conferido com o banco nos últimos 30 dias',
      ok: checked,
      weight: 20,
      score: checked ? 20 : 0,
      hint: 'Importe um extrato ou confira o saldo de uma conta.',
      route: { view: 'importar' },
    },
    {
      id: 'categorias',
      label: `${formatPercent(categorized)} dos gastos recentes com categoria`,
      ok: categorized >= 0.9,
      weight: 15,
      score: Math.round(15 * categorized),
      hint: 'Categorize os gastos sem categoria: é deles que saem as médias.',
      route: { view: 'movimentos', param: 'saidas' },
    },
    {
      id: 'renda',
      label: 'Recebimento previsto cadastrado',
      ok: !!cash.nextIncome,
      weight: 15,
      score: cash.nextIncome ? 15 : 0,
      hint: 'Lance o salário ou a renda que você espera: é até ele que o disponível olha.',
      route: { view: 'movimentos', param: 'entradas' },
    },
    {
      id: 'conferencia',
      label: errors ? `${errors} ${plural(errors, 'problema', 'problemas')} na conferência dos dados` : 'Nenhum problema na conferência dos dados',
      ok: errors === 0,
      weight: 15,
      score: errors === 0 ? 15 : 0,
      hint: 'A conferência mostra lançamentos duplicados ou incompletos, sem apagar nada.',
      route: { view: 'contas' },
    },
    {
      id: 'recente',
      label: 'Algo lançado na última semana',
      ok: fresh,
      weight: 10,
      score: fresh ? 10 : 0,
      hint: 'Registre os gastos da semana para as contas continuarem atuais.',
      route: null,
    },
  ];
  const percent = checks.reduce((t, c) => t + c.score, 0);
  return { percent, level: percent >= 85 ? 'alta' : percent >= 60 ? 'média' : 'baixa', checks };
}

/* ------------------------------------------------------------- o todo */

export function buildCheckup(input: CheckupInput): Checkup {
  const areas = [flowArea(input), reserveArea(input), debtArea(input), cardArea(input), goalArea(input), wealthArea(input)].filter(
    (a): a is Area => a !== null,
  );
  const attention = areas
    .filter((a) => a.status === 'alert' || a.status === 'attention')
    .sort((a, b) => WEIGHT[a.status] - WEIGHT[b.status] || LAYER[a.id] - LAYER[b.id]);
  const confidence = dataConfidence(input);

  const names = (list: Area[]) => {
    const t = list.map((a) => a.title.toLowerCase());
    return t.length > 1 ? `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}` : t[0];
  };
  const alerts = attention.filter((a) => a.status === 'alert');
  const flowOk = areas.find((a) => a.id === 'fluxo')?.status === 'ok';
  let summary: Checkup['summary'];
  if (alerts.length) {
    summary = { tone: 'alert', text: `${alerts.length === 1 ? 'Um ponto pede' : `${alerts.length} pontos pedem`} ação agora: ${names(alerts)}.` };
  } else if (attention.length) {
    summary = {
      tone: 'attention',
      text: `${flowOk ? 'O fluxo do mês está sob controle, mas ' : ''}${names(attention)} ${attention.length === 1 ? 'merece' : 'merecem'} atenção.`.replace(/^./, (c) => c.toUpperCase()),
    };
  } else if (areas.find((a) => a.id === 'fluxo')?.status === 'unknown' || areas.every((a) => a.status === 'unknown' || a.status === 'info')) {
    // sem fluxo para ler, "nenhuma dívida" não quer dizer que está tudo bem
    summary = { tone: 'unknown', text: 'Ainda faltam dados para um diagnóstico: comece pelo saldo das contas e pelo que entra e sai.' };
  } else {
    summary = { tone: 'ok', text: 'Tudo dentro do esperado nas áreas que o app consegue medir.' };
  }
  if (confidence.level === 'baixa') summary = { ...summary, text: `${summary.text} Os dados ainda estão incompletos, então este diagnóstico é parcial.` };

  return { areas, attention, summary, confidence };
}
