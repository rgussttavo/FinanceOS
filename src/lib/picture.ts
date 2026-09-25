'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { cashSnapshot, virtualOccurrences, type CashSnapshot } from './cashflow';
import type { LedgerInput } from './ledger';
import { entriesUpTo, liveRows } from './db';
import { addMonthsToKey, currentMonthKey, todayIso } from './dates';
import { occurrencesInMonth, projectMonth, summarizeMonth, type DayPoint, type MonthSummary, type Occurrence } from './occurrences';
import type { Account, Asset, Card, Debt, Entry, Goal, MonthKey, Subscription, Transfer } from './types';

/**
 * O retrato financeiro: tudo que as telas de leitura precisam, carregado uma
 * vez e derivado em memória.
 *
 * Antes cada tela abria as próprias consultas, e o Início pintava "nada
 * lançado" por um instante enquanto os dados chegavam. Aqui existe um único
 * `ready`: enquanto ele é falso, as telas mostram esqueleto, nunca vazio.
 */
export interface FinanceBase {
  ready: boolean;
  /** todos os lançamentos até o último mês de interesse */
  entries: Entry[];
  /** assinaturas, ativas e canceladas */
  subscriptions: Subscription[];
  /** cartões não arquivados: os que as telas oferecem */
  cards: Card[];
  /**
   * Todos os cartões não excluídos. O arquivado não aceita compra nova, mas
   * ainda deve o que deve — o livro-caixa precisa dele.
   */
  allCards: Card[];
  /** contas, inclusive arquivadas: o saldo delas continua existindo */
  accounts: Account[];
  /** transferências, pagamentos de fatura e ajustes de saldo */
  transfers: Transfer[];
  /** dívidas, em aberto e quitadas */
  debts: Debt[];
  /** metas não arquivadas */
  goals: Goal[];
  assets: Asset[];
}

export function useFinanceBase(spaceId: string | null, month: MonthKey): FinanceBase {
  // o caixa olha até dois meses à frente; a tela aberta pode estar mais longe
  const current = currentMonthKey();
  const ahead = addMonthsToKey(current, 2);
  const last = month > ahead ? month : ahead;

  const data = useLiveQuery(async () => {
    if (!spaceId) return null;
    const [entries, subscriptions, cards, debts, goals, assets, accounts, transfers] = await Promise.all([
      entriesUpTo(spaceId, last),
      liveRows<Subscription>('subscriptions', spaceId),
      liveRows<Card>('cards', spaceId),
      liveRows<Debt>('debts', spaceId),
      liveRows<Goal>('goals', spaceId),
      liveRows<Asset>('assets', spaceId),
      liveRows<Account>('accounts', spaceId),
      liveRows<Transfer>('transfers', spaceId),
    ]);
    return {
      entries,
      subscriptions,
      cards: cards.filter((c) => !c.archived),
      allCards: cards,
      accounts,
      transfers,
      debts,
      goals: goals.filter((g) => !g.archivedAt),
      assets: assets.sort((a, b) => b.value - a.value),
    };
  }, [spaceId, last]);

  return useMemo(
    () =>
      data
        ? { ready: true, ...data }
        : { ready: false, entries: [], subscriptions: [], cards: [], allCards: [], accounts: [], transfers: [], debts: [], goals: [], assets: [] },
    [data],
  );
}

/* ----------------------------------------------------------------- o mês */

export interface MonthPicture {
  month: MonthKey;
  /** lançamentos do mês mais assinaturas e parcelas de dívida */
  occurrences: Occurrence[];
  summary: MonthSummary;
  projection: DayPoint[];
}

/** ocorrências de um mês na régua da competência, com as linhas virtuais */
export function monthOccurrences(base: FinanceBase, month: MonthKey, today = todayIso()): Occurrence[] {
  return [
    ...occurrencesInMonth(base.entries, month, today),
    ...virtualOccurrences(base.subscriptions, base.debts, month, today, base.entries),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function useMonthPicture(base: FinanceBase, month: MonthKey): MonthPicture {
  return useMemo(() => {
    const today = todayIso();
    const occurrences = monthOccurrences(base, month, today);
    return {
      month,
      occurrences,
      summary: summarizeMonth(occurrences, month, today),
      projection: projectMonth(occurrences, month, 0, today),
    };
  }, [base, month]);
}

/** resumo de `count` meses terminando em `last`, na mesma régua */
export function useHistory(base: FinanceBase, last: MonthKey, count = 6): MonthSummary[] {
  return useMemo(() => {
    const today = todayIso();
    const out: MonthSummary[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const m = addMonthsToKey(last, -i);
      out.push(summarizeMonth(monthOccurrences(base, m, today), m, today));
    }
    return out;
  }, [base, last, count]);
}

/* ---------------------------------------------------------------- o caixa */

/**
 * A entrada do livro-caixa a partir da base carregada. Toda conta de saldo do
 * app passa por aqui, para nenhuma tela montar a sua com um pedaço a menos.
 */
export function ledgerInput(base: FinanceBase, cardsEnabled: boolean, today = todayIso()): LedgerInput {
  return {
    accounts: base.accounts,
    entries: base.entries,
    transfers: base.transfers,
    cards: base.allCards,
    subscriptions: base.subscriptions,
    debts: base.debts,
    cardsEnabled,
    today,
  };
}

export function useCash(base: FinanceBase, cardsEnabled: boolean): CashSnapshot {
  return useMemo(() => cashSnapshot(ledgerInput(base, cardsEnabled)), [base, cardsEnabled]);
}
