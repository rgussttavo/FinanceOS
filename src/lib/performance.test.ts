import { describe, expect, it } from 'vitest';
import { account, card, entry, paid, subscription } from '@/test/build';
import { cashSnapshot, virtualOccurrences } from './cashflow';
import { diagnose } from './diagnostics';
import { auditAccount, balancesAt, type LedgerInput } from './ledger';
import { occurrencesInMonth, summarizeMonth } from './occurrences';
import type { Entry } from './types';

/**
 * O motor com uma vida inteira de extrato.
 *
 * Os números de tempo são tetos generosos, não metas: servem para pegar a
 * regressão que transforma uma conta linear numa quadrática — que com 50 mil
 * lançamentos é a diferença entre um piscar e o app travado.
 */

function lifetime(n: number): LedgerInput {
  const principal = account({ primary: true, openingBalance: 1_000_000, openingDate: '2020-01-01' });
  const nubank = card({ closingDay: 25, dueDay: 5 });
  const entries: Entry[] = [];
  const start = Date.UTC(2020, 0, 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(start + (i % 2400) * 86_400_000).toISOString().slice(0, 10);
    if (i % 5 === 0) entries.push(entry('out', 1000 + (i % 700), d, { cardId: nubank.id }));
    else if (i % 7 === 0) entries.push(paid('in', 50000 + (i % 900), d));
    else entries.push(paid('out', 500 + (i % 1300), d, { externalId: `csv:acct:${i}` }));
  }
  // um punhado de recorrências e assinaturas, como na vida
  entries.push(paid('in', 600000, '2020-01-05', { repeat: { kind: 'monthly' } }));
  entries.push(entry('out', 30000, '2021-03-10', { cardId: nubank.id, repeat: { kind: 'installments', count: 12, total: 360000 } }));
  return {
    accounts: [principal],
    entries,
    transfers: [],
    cards: [nubank],
    subscriptions: [subscription({ startedAt: '2020-01-01' }), subscription({ startedAt: '2020-06-01', cardId: nubank.id })],
    debts: [],
    cardsEnabled: true,
    today: '2026-09-18',
  };
}

function time<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

describe('desempenho', () => {
  for (const [n, teto] of [
    [1_000, 400],
    [10_000, 1500],
    [50_000, 6000],
  ] as const) {
    it(`${n.toLocaleString('pt-BR')} lançamentos: saldo, retrato do mês, resumo e conferência`, () => {
      const input = lifetime(n);
      const saldo = time(() => balancesAt(input, input.today));
      const retrato = time(() => cashSnapshot(input));
      const resumo = time(() => {
        const month = '2026-09';
        const occ = [...occurrencesInMonth(input.entries, month, input.today), ...virtualOccurrences(input.subscriptions, input.debts, month, input.today, input.entries)];
        return summarizeMonth(occ, month, input.today);
      });
      const extrato = time(() => auditAccount(input, input.accounts[0].id));
      const conferencia = time(() => diagnose(input, []));

      // o retrato e o saldo concordam mesmo com 50 mil linhas
      expect(retrato.value.balanceNow).toBe(saldo.value.total);
      const total = saldo.ms + retrato.ms + resumo.ms + extrato.ms + conferencia.ms;
      console.log(
        `${n} lançamentos → saldo ${saldo.ms.toFixed(0)} ms · retrato ${retrato.ms.toFixed(0)} ms · resumo ${resumo.ms.toFixed(0)} ms · extrato ${extrato.ms.toFixed(0)} ms · conferência ${conferencia.ms.toFixed(0)} ms`,
      );
      expect(total).toBeLessThan(teto);
    }, 60_000);
  }
});
