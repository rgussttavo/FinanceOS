import type { Cents } from './types';

/* ------------------------------------------------- juros compostos */

export interface InvestmentPoint {
  month: number;
  /** o que você colocou do próprio bolso até aqui */
  contributed: Cents;
  /** o que o dinheiro rendeu */
  earned: Cents;
  total: Cents;
}

export interface InvestmentResult {
  months: number;
  contributed: Cents;
  earned: Cents;
  total: Cents;
  /** o mês em que o rendimento passa a ser maior que o aporte do mês */
  crossoverMonth: number | null;
  series: InvestmentPoint[];
}

/**
 * Projeção de aportes com juros compostos.
 *
 * O rendimento incide sobre o saldo no início do mês e o aporte entra depois —
 * é a ordem conservadora, e a que bate com aplicação feita ao longo do mês.
 *
 * O ponto de virada é a informação que muda comportamento: o mês em que o
 * dinheiro passa a render mais do que você deposita é quando o juro composto
 * deixa de ser teoria.
 */
export function simulateInvestment(
  initial: Cents,
  monthly: Cents,
  monthlyRatePercent: number,
  months: number,
): InvestmentResult {
  const n = Math.max(1, Math.trunc(months));
  const rate = monthlyRatePercent / 100;

  const series: InvestmentPoint[] = [];
  let total = initial;
  let contributed = initial;
  let crossoverMonth: number | null = null;

  for (let m = 1; m <= n; m++) {
    const interest = Math.round(total * rate);
    total += interest + monthly;
    contributed += monthly;

    if (crossoverMonth === null && monthly > 0 && interest > monthly) crossoverMonth = m;

    series.push({ month: m, contributed, earned: total - contributed, total });
  }

  return {
    months: n,
    contributed,
    earned: total - contributed,
    total,
    crossoverMonth,
    series,
  };
}

/* ------------------------------------------------------------------ FIRE */

export interface FireResult {
  /** patrimônio necessário para viver de renda */
  target: Cents;
  /** meses até chegar lá; null quando não chega */
  months: number | null;
  years: number | null;
  /** o quanto já se tem, sobre o alvo */
  progress: number;
  /** renda mensal que o alvo sustenta */
  monthlyIncome: Cents;
  unreachable: boolean;
}

const MAX_FIRE_MONTHS = 1200; // cem anos: além disso não é um plano

/**
 * Quanto falta para viver de renda.
 *
 * O alvo sai da taxa de retirada segura: retirando 4% ao ano, o patrimônio
 * precisa ser vinte e cinco vezes o gasto anual. A taxa é ajustável porque 4%
 * é regra americana — no Brasil, com juro real mais alto, muita gente trabalha
 * com mais.
 *
 * O tempo usa juro REAL, já descontada a inflação. Projetar com juro nominal
 * dá um número animador e falso: em trinta anos a diferença é de anos de vida.
 */
export function simulateFire(
  monthlyExpense: Cents,
  currentWealth: Cents,
  monthlyContribution: Cents,
  realYearlyRatePercent: number,
  withdrawalRatePercent: number,
): FireResult {
  const withdrawal = Math.max(0.1, withdrawalRatePercent) / 100;
  const target = Math.round((monthlyExpense * 12) / withdrawal);

  const monthlyRate = Math.pow(1 + realYearlyRatePercent / 100, 1 / 12) - 1;

  let wealth = currentWealth;
  let months = 0;

  while (wealth < target && months < MAX_FIRE_MONTHS) {
    wealth += Math.round(wealth * monthlyRate) + monthlyContribution;
    months += 1;
    // sem aporte e sem juro o saldo nunca anda; parar evita laço inútil
    if (monthlyContribution <= 0 && monthlyRate <= 0) break;
  }

  const reached = wealth >= target;

  return {
    target,
    months: reached ? months : null,
    years: reached ? Math.round((months / 12) * 10) / 10 : null,
    progress: target > 0 ? Math.min(1, currentWealth / target) : 0,
    monthlyIncome: Math.round((target * withdrawal) / 12),
    unreachable: !reached,
  };
}

/* ---------------------------------------------------------------- câmbio */

export interface ExchangeResult {
  /** quanto se recebe do outro lado */
  converted: number;
  rate: number;
  /** valor com IOF e spread aplicados, para compra de moeda em espécie */
  withTaxes: number | null;
}

/**
 * Conversão entre real e moeda estrangeira.
 *
 * A cotação exibida é a comercial. Quem vai comprar moeda paga mais: entra o
 * IOF e o spread da casa de câmbio, e mostrar os dois lados evita a surpresa
 * de chegar no aeroporto com um número na cabeça e outro na maquininha.
 */
export function convertCurrency(
  amount: number,
  rate: number,
  direction: 'toForeign' | 'toBrl',
  taxes?: { iofPercent: number; spreadPercent: number },
): ExchangeResult {
  if (!rate || !Number.isFinite(rate)) {
    return { converted: 0, rate: 0, withTaxes: null };
  }

  const converted = direction === 'toForeign' ? amount / rate : amount * rate;

  if (!taxes) return { converted, rate, withTaxes: null };

  const loaded = rate * (1 + taxes.spreadPercent / 100) * (1 + taxes.iofPercent / 100);
  const withTaxes = direction === 'toForeign' ? amount / loaded : amount * loaded;

  return { converted, rate, withTaxes };
}
