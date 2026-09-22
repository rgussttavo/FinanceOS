import { addMonthsToKey, monthKeyParts } from './dates';
import type { Cents, Debt, MonthKey } from './types';

/* ------------------------------------------------------------- progresso */

export interface DebtProgress {
  /** parcelas já vencidas até a competência, no máximo o total */
  paid: number;
  remaining: number;
  /** o que ainda falta pagar, em centavos */
  outstanding: Cents;
  /** o que já foi pago */
  settled: Cents;
  total: Cents;
  /** 0 a 1 */
  ratio: number;
  /** competência da última parcela */
  lastMonth: MonthKey;
  done: boolean;
}

export function debtProgress(debt: Debt, month: MonthKey): DebtProgress {
  const count = Math.max(1, Math.trunc(debt.installments));
  const elapsed = monthsBetween(debt.startMonth, month);
  // a parcela do próprio mês já conta como paga: a competência corrente é a
  // que está sendo vivida, e é assim que a fatura e o carnê são lidos
  const paid = Math.min(count, Math.max(0, elapsed + 1));
  const remaining = count - paid;
  const total = debt.installment * count;

  return {
    paid,
    remaining,
    outstanding: debt.installment * remaining,
    settled: debt.installment * paid,
    total,
    ratio: count > 0 ? paid / count : 0,
    lastMonth: addMonthsToKey(debt.startMonth, count - 1),
    done: remaining <= 0,
  };
}

function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = monthKeyParts(from);
  const b = monthKeyParts(to);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/* ------------------------------------------------------ simulador de empréstimo */

export interface LoanResult {
  installment: Cents;
  total: Cents;
  interest: Cents;
  /** custo total em relação ao que foi tomado, em porcentagem */
  costPercent: number;
  /** juros embutidos por parcela, para a curva */
  schedule: { month: number; interest: Cents; amortization: Cents; balance: Cents }[];
}

/**
 * Empréstimo pela Tabela Price: parcelas iguais, juros sobre o saldo devedor.
 *
 * É como banco e financeira calculam praticamente todo crédito no Brasil, e é
 * a conta que revela o que a propaganda esconde — em doze meses a 4% ao mês,
 * o "só" 4% vira quase 30% de custo total.
 */
export function simulateLoan(principal: Cents, monthlyRatePercent: number, months: number): LoanResult {
  const n = Math.max(1, Math.trunc(months));
  const i = monthlyRatePercent / 100;

  const installment =
    i === 0 ? Math.round(principal / n) : Math.round((principal * i) / (1 - Math.pow(1 + i, -n)));

  const schedule: LoanResult['schedule'] = [];
  let balance = principal;
  for (let m = 1; m <= n; m++) {
    const interest = Math.round(balance * i);
    const amortization = Math.min(balance, installment - interest);
    balance = Math.max(0, balance - amortization);
    schedule.push({ month: m, interest, amortization, balance });
  }

  const total = installment * n;
  return {
    installment,
    total,
    interest: total - principal,
    costPercent: principal > 0 ? ((total - principal) / principal) * 100 : 0,
    schedule,
  };
}

/* ------------------------------------------------- simulador do cheque especial */

export interface OverdraftResult {
  days: number;
  /** juros acumulados no período */
  interest: Cents;
  owed: Cents;
  /** a mesma taxa expressa ao ano, para dar a dimensão real */
  yearlyPercent: number;
}

/**
 * Cheque especial: juros compostos por dia útil sobre o valor usado.
 *
 * A taxa é anunciada ao mês, mas corre todo dia. A conta existe para mostrar
 * o tamanho do estrago — a mesma taxa que parece pequena ao mês passa de 100%
 * ao ano com facilidade.
 */
export function simulateOverdraft(
  used: Cents,
  monthlyRatePercent: number,
  days: number,
): OverdraftResult {
  const monthly = monthlyRatePercent / 100;
  const daily = Math.pow(1 + monthly, 1 / 30) - 1;
  const owed = Math.round(used * Math.pow(1 + daily, Math.max(0, days)));

  return {
    days,
    interest: owed - used,
    owed,
    yearlyPercent: (Math.pow(1 + monthly, 12) - 1) * 100,
  };
}

/* -------------------------------------------------- simulador de quitação */

export type PayoffStrategy = 'avalanche' | 'snowball';

export interface PayoffDebtInput {
  id: string;
  name: string;
  balance: Cents;
  monthlyRatePercent: number;
  /** o mínimo que precisa sair todo mês */
  minimum: Cents;
}

export interface PayoffResult {
  strategy: PayoffStrategy;
  /** meses até zerar tudo */
  months: number;
  interestPaid: Cents;
  totalPaid: Cents;
  /** ordem em que cada dívida morre */
  order: { id: string; name: string; month: number }[];
  /** não cabe: o mínimo somado já não paga nem os juros */
  impossible: boolean;
}

const MAX_MONTHS = 600; // cinquenta anos: além disso a dívida não se paga

/**
 * Quanto tempo até zerar, pagando os mínimos e jogando a folga numa dívida só.
 *
 * Avalanche ataca a de juro mais alto — é a que custa menos dinheiro. Bola de
 * neve ataca a menor — é a que dá a primeira vitória mais rápido, e por isso
 * costuma ser a que as pessoas conseguem seguir até o fim. As duas aparecem
 * lado a lado justamente porque a melhor no papel nem sempre é a que se cumpre.
 */
export function simulatePayoff(
  debts: PayoffDebtInput[],
  extraPerMonth: Cents,
  strategy: PayoffStrategy,
): PayoffResult {
  const live = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({ ...d, balance: d.balance }));

  if (!live.length) {
    return { strategy, months: 0, interestPaid: 0, totalPaid: 0, order: [], impossible: false };
  }

  const order: PayoffResult['order'] = [];
  let interestPaid = 0;
  let totalPaid = 0;
  let month = 0;

  while (live.some((d) => d.balance > 0) && month < MAX_MONTHS) {
    month += 1;

    // juros do mês entram antes do pagamento, como no contrato
    for (const debt of live) {
      if (debt.balance <= 0) continue;
      const interest = Math.round(debt.balance * (debt.monthlyRatePercent / 100));
      debt.balance += interest;
      interestPaid += interest;
    }

    // os mínimos saem de todas; a folga vai inteira para a escolhida
    let pot = extraPerMonth;
    for (const debt of live) {
      if (debt.balance <= 0) continue;
      const pay = Math.min(debt.balance, debt.minimum);
      debt.balance -= pay;
      totalPaid += pay;
      if (debt.balance <= 0 && !order.some((o) => o.id === debt.id)) {
        order.push({ id: debt.id, name: debt.name, month });
      }
    }

    const target = pickTarget(live, strategy);
    if (target && pot > 0) {
      const pay = Math.min(target.balance, pot);
      target.balance -= pay;
      totalPaid += pay;
      pot -= pay;
      if (target.balance <= 0 && !order.some((o) => o.id === target.id)) {
        order.push({ id: target.id, name: target.name, month });
      }
    }
  }

  return {
    strategy,
    months: month,
    interestPaid,
    totalPaid,
    order,
    impossible: month >= MAX_MONTHS,
  };
}

function pickTarget<T extends { balance: Cents; monthlyRatePercent: number }>(
  debts: T[],
  strategy: PayoffStrategy,
): T | null {
  const open = debts.filter((d) => d.balance > 0);
  if (!open.length) return null;
  if (strategy === 'avalanche') {
    return open.reduce((a, b) => (b.monthlyRatePercent > a.monthlyRatePercent ? b : a));
  }
  return open.reduce((a, b) => (b.balance < a.balance ? b : a));
}

/* --------------------------------------------------------------- rótulos */

export const DEBT_KINDS: { key: Debt['kind']; label: string; icon: string }[] = [
  { key: 'financing', label: 'Financiamento', icon: '\u{1F697}' },
  { key: 'loan', label: 'Empréstimo', icon: '\u{1F3E6}' },
  { key: 'payroll', label: 'Consignado', icon: '\u{1F4C4}' },
  { key: 'card', label: 'Parcelado no cartão', icon: '\u{1F4B3}' },
  { key: 'other', label: 'Outra', icon: '\u{1F4E6}' },
];
