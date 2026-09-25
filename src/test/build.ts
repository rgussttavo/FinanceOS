import type { Account, Card, Debt, Entry, Subscription, Transfer } from '@/lib/types';

/**
 * Fábricas de registros para os testes. Cada uma devolve um registro válido
 * com o mínimo preenchido; o teste muda só o que importa para o caso.
 */

let n = 0;
const next = (prefix: string) => `${prefix}-${++n}`;
const AT = '2026-09-01T12:00:00.000Z';
export const SPACE = 'espaco-teste';

const sync = (id: string) => ({ id, spaceId: SPACE, createdAt: AT, updatedAt: AT, deletedAt: null });

export function account(patch: Partial<Account> = {}): Account {
  return {
    ...sync(next('conta')),
    name: 'Conta',
    kind: 'checking',
    institution: '',
    color: '',
    openingBalance: 0,
    openingDate: null,
    archived: false,
    ...patch,
  };
}

export function entry(kind: Entry['kind'], amount: number, date: string, patch: Partial<Entry> = {}): Entry {
  return {
    ...sync(next('lanc')),
    kind,
    description: patch.description ?? `${kind} ${amount}`,
    amount,
    date,
    categoryId: null,
    accountId: null,
    cardId: null,
    repeat: { kind: 'once' },
    settled: {},
    notes: '',
    tags: [],
    source: 'manual',
    externalId: null,
    attachmentIds: [],
    ...patch,
  };
}

/** lançamento que já aconteceu: baixado na competência da data */
export function paid(kind: Entry['kind'], amount: number, date: string, patch: Partial<Entry> = {}): Entry {
  return entry(kind, amount, date, { settled: { [date.slice(0, 7)]: { at: AT } }, ...patch });
}

export function card(patch: Partial<Card> = {}): Card {
  return {
    ...sync(next('cartao')),
    name: 'Cartão',
    institution: 'Nubank',
    brand: 'mastercard',
    last4: '1234',
    color: '',
    limit: 1_000_000,
    closingDay: 25,
    dueDay: 5,
    accountId: null,
    archived: false,
    ...patch,
  };
}

export function transfer(patch: Partial<Transfer> & Pick<Transfer, 'kind' | 'amount' | 'date'>): Transfer {
  return {
    ...sync(next('transf')),
    description: 'Transferência',
    fromAccountId: null,
    toAccountId: null,
    toCardId: null,
    invoiceMonth: null,
    notes: '',
    externalIds: [],
    source: 'manual',
    ...patch,
  };
}

export function subscription(patch: Partial<Subscription> = {}): Subscription {
  return {
    ...sync(next('assin')),
    name: 'Streaming',
    domain: '',
    amount: 5000,
    billingDay: 10,
    cycle: 'monthly',
    categoryId: null,
    cardId: null,
    accountId: null,
    color: '',
    startedAt: '2026-01-01',
    canceledAt: null,
    remindDaysBefore: 0,
    ...patch,
  };
}

export function debt(patch: Partial<Debt> = {}): Debt {
  return {
    ...sync(next('divida')),
    name: 'Empréstimo',
    kind: 'loan',
    icon: '',
    installment: 20000,
    installments: 10,
    startMonth: '2026-06',
    monthlyRate: 0,
    inFlow: true,
    dueDay: 15,
    settledAt: null,
    ...patch,
  };
}
