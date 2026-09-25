import { audit, db, deleteRecord, liveRows, putRecord } from './db';
import { nowInstant, todayIso } from './dates';
import { balancesAt, invoiceStatus, primaryAccountId, realizedPostings, type LedgerInput } from './ledger';
import { uid } from './provision';
import type {
  Account,
  AccountKind,
  BalanceCheckpoint,
  Card,
  Cents,
  Debt,
  Entry,
  EntrySource,
  IsoDate,
  MonthKey,
  Settings,
  Subscription,
  Transfer,
} from './types';

/**
 * Tudo o que mexe em conta, transferência, fatura paga e saldo conferido.
 *
 * Cada ação aqui grava pelo mesmo caminho do resto do app (fila de sync) e
 * anota no diário local. O cálculo nunca é feito aqui: quem sabe quanto uma
 * conta tem é o livro-caixa, e as ações perguntam a ele.
 */

/* ------------------------------------------------------------------ leitura */

/** o livro-caixa montado direto da base local, para as ações que precisam do saldo */
export async function loadLedger(spaceId: string, today: IsoDate = todayIso()): Promise<LedgerInput> {
  const [accounts, entries, transfers, cards, subscriptions, debts, settings] = await Promise.all([
    liveRows<Account>('accounts', spaceId),
    liveRows<Entry>('entries', spaceId),
    liveRows<Transfer>('transfers', spaceId),
    liveRows<Card>('cards', spaceId),
    liveRows<Subscription>('subscriptions', spaceId),
    liveRows<Debt>('debts', spaceId),
    liveRows<Settings>('settings', spaceId),
  ]);
  return {
    accounts,
    entries,
    transfers,
    cards,
    subscriptions,
    debts,
    cardsEnabled: settings[0]?.cardsEnabled ?? true,
    today,
  };
}

/* -------------------------------------------------------------------- contas */

/** o id da principal de um espaço: o mesmo em todo aparelho, para dois nunca criarem duas */
export const primaryIdFor = (spaceId: string) => `principal-${spaceId}`;

export interface NewAccountInput {
  spaceId: string;
  name: string;
  kind?: AccountKind;
  institution?: string;
  color?: string;
  /** quanto a conta tem no começo de `openingDate` */
  openingBalance?: Cents;
  openingDate?: IsoDate | null;
}

export async function createAccount(input: NewAccountInput): Promise<Account> {
  const at = nowInstant();
  const existing = await liveRows<Account>('accounts', input.spaceId);
  const account: Account = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: input.name.trim() || 'Conta',
    kind: input.kind ?? 'checking',
    institution: input.institution ?? '',
    color: input.color ?? '',
    openingBalance: Math.round(input.openingBalance ?? 0),
    openingDate: input.openingDate ?? todayIso(),
    // a primeira conta nasce principal; as outras, não
    primary: existing.length === 0,
    checkpoints: [],
    archived: false,
  };
  const saved = await putRecord('accounts', account);
  await audit(input.spaceId, 'account.created', { id: saved.id, name: saved.name, openingBalance: saved.openingBalance, openingDate: saved.openingDate });
  return saved;
}

export async function updateAccount(account: Account, patch: Partial<Account>): Promise<Account> {
  const saved = await putRecord('accounts', { ...account, ...patch });
  await audit(account.spaceId, 'account.updated', { id: account.id, patch });
  return saved;
}

/** torna esta a principal: onde cai o lançamento que não diz de qual conta é */
export async function makePrimary(account: Account): Promise<void> {
  const all = await liveRows<Account>('accounts', account.spaceId);
  for (const a of all) {
    const want = a.id === account.id;
    if (!!a.primary !== want) await putRecord('accounts', { ...a, primary: want });
  }
}

/**
 * Excluir conta só quando ela está vazia.
 *
 * Conta com movimento vira conta arquivada: some das escolhas, mas o dinheiro
 * que passou por ela continua explicado. Apagar levaria junto a metade de
 * cada transferência que ela fez — e deixaria a outra metade órfã.
 */
export async function removeAccount(account: Account): Promise<'deleted' | 'archived'> {
  const ledger = await loadLedger(account.spaceId);
  const moved =
    ledger.entries.some((e) => e.accountId === account.id) ||
    ledger.transfers.some((t) => t.fromAccountId === account.id || t.toAccountId === account.id) ||
    ledger.cards.some((c) => c.accountId === account.id) ||
    ledger.subscriptions.some((s) => s.accountId === account.id);
  if (moved || account.openingBalance !== 0) {
    await updateAccount(account, { archived: true, primary: false });
    return 'archived';
  }
  await deleteRecord('accounts', account.id);
  return 'deleted';
}

/* ------------------------------------------------------------ transferência */

export interface NewTransferInput {
  spaceId: string;
  kind: Transfer['kind'];
  amount: Cents;
  date: IsoDate;
  fromAccountId: string | null;
  toAccountId?: string | null;
  toCardId?: string | null;
  invoiceMonth?: MonthKey | null;
  direction?: 'in' | 'out';
  description?: string;
  notes?: string;
  externalIds?: string[];
  source?: EntrySource;
}

/** valida a transferência antes de gravar: nunca nasce uma pela metade */
function validate(t: Omit<Transfer, keyof import('./types').SyncFields>): void {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('O valor precisa ser maior que zero.');
  if (t.kind === 'account') {
    if (!t.toAccountId) throw new Error('Escolha a conta de destino.');
    if (t.fromAccountId === t.toAccountId) throw new Error('Origem e destino são a mesma conta.');
  }
  if (t.kind === 'card' && !t.toCardId) throw new Error('Escolha o cartão.');
  if (t.kind === 'adjustment' && !t.direction) throw new Error('Diga se o saldo sobe ou desce.');
}

const DEFAULT_LABEL: Record<Transfer['kind'], string> = {
  account: 'Transferência entre contas',
  card: 'Pagamento de fatura',
  adjustment: 'Ajuste de saldo',
};

export async function createTransfer(input: NewTransferInput): Promise<Transfer> {
  const at = nowInstant();
  const body = {
    kind: input.kind,
    date: input.date,
    amount: Math.round(input.amount),
    description: input.description?.trim() || DEFAULT_LABEL[input.kind],
    fromAccountId: input.fromAccountId,
    toAccountId: input.kind === 'account' ? (input.toAccountId ?? null) : null,
    toCardId: input.kind === 'card' ? (input.toCardId ?? null) : null,
    invoiceMonth: input.kind === 'card' ? (input.invoiceMonth ?? null) : null,
    ...(input.kind === 'adjustment' ? { direction: input.direction } : null),
    notes: input.notes ?? '',
    externalIds: input.externalIds ?? [],
    source: input.source ?? 'manual',
  };
  validate(body);
  const transfer: Transfer = { id: uid(), spaceId: input.spaceId, createdAt: at, updatedAt: at, deletedAt: null, ...body };
  const saved = await putRecord('transfers', transfer);
  await audit(input.spaceId, input.kind === 'card' ? 'invoice.paid' : input.kind === 'adjustment' ? 'balance.adjusted' : 'transfer.created', {
    id: saved.id,
    kind: saved.kind,
    amount: saved.amount,
    date: saved.date,
    from: saved.fromAccountId,
    to: saved.toAccountId ?? saved.toCardId,
  });
  return saved;
}

/** editar mexe nos dois lados de uma vez: é um registro só */
export async function updateTransfer(transfer: Transfer, patch: Partial<Transfer>): Promise<Transfer> {
  const next = { ...transfer, ...patch };
  validate(next);
  const saved = await putRecord('transfers', next);
  await audit(transfer.spaceId, 'transfer.updated', { id: transfer.id, patch });
  return saved;
}

export async function removeTransfer(transfer: Transfer): Promise<void> {
  await deleteRecord('transfers', transfer.id);
  await audit(transfer.spaceId, 'transfer.deleted', { id: transfer.id, kind: transfer.kind, amount: transfer.amount, date: transfer.date });
}

/**
 * Paga (ou registra o pagamento de) uma fatura.
 *
 * Sai da conta escolhida — ou da conta de débito do cartão, ou da principal —
 * e quita a fatura daquele mês. Sem valor, paga o que falta dela.
 */
export async function payInvoice(input: {
  spaceId: string;
  card: Card;
  month: MonthKey;
  amount?: Cents;
  date?: IsoDate;
  fromAccountId?: string | null;
}): Promise<Transfer> {
  const ledger = await loadLedger(input.spaceId);
  const status = invoiceStatus(ledger, input.card, input.month);
  const amount = input.amount ?? status.remaining;
  if (amount <= 0) throw new Error('Esta fatura já está paga.');
  return createTransfer({
    spaceId: input.spaceId,
    kind: 'card',
    amount,
    date: input.date ?? todayIso(),
    fromAccountId: input.fromAccountId ?? input.card.accountId ?? primaryAccountId(ledger.accounts),
    toCardId: input.card.id,
    invoiceMonth: input.month,
    description: `Pagamento da fatura ${input.card.name || input.card.institution}`,
  });
}

/* --------------------------------------------------------- saldo conferido */

/**
 * "Hoje eu tenho X nesta conta."
 *
 * Numa conta que ainda não tem ponto de partida, isso É o ponto de partida:
 * vira o saldo inicial, de hoje, e o que aconteceu antes fica fora da conta
 * (já está dentro do X). Numa conta com histórico, vira um ajuste de saldo —
 * visível, com nome, nunca receita nem despesa — pela diferença exata entre o
 * que a pessoa disse e o que o app calcula.
 *
 * O que nunca acontece é mexer em lançamento para o número bater.
 */
export async function setBalance(input: {
  spaceId: string;
  accountId?: string | null;
  balance: Cents;
  date?: IsoDate;
  source?: string;
}): Promise<{ kind: 'opening' | 'adjustment' | 'none'; diff: Cents; account: Account }> {
  const date = input.date ?? todayIso();
  let ledger = await loadLedger(input.spaceId, date);
  let accountId = input.accountId ?? primaryAccountId(ledger.accounts);

  // sem conta cadastrada ainda: a principal nasce aqui, com o id de sempre
  let account = ledger.accounts.find((a) => a.id === accountId);
  if (!account) {
    account = await ensurePrimaryAccount(input.spaceId);
    accountId = account.id;
    ledger = await loadLedger(input.spaceId, date);
  }

  const hasStart =
    !!account.openingDate ||
    account.openingBalance !== 0 ||
    (account.checkpoints?.length ?? 0) > 0 ||
    ledger.transfers.some((t) => t.kind === 'adjustment' && t.fromAccountId === accountId);

  const checkpoint: BalanceCheckpoint = { date, amount: input.balance, source: input.source ?? 'informado', at: nowInstant() };

  if (!hasStart) {
    // o saldo de hoje inclui o que já se realizou hoje: o inicial é o que sobra
    const today = realizedPostings(ledger, date).filter((p) => p.accountId === accountId && p.date === date);
    const opening = input.balance - today.reduce((s, p) => s + p.amount, 0);
    const saved = await updateAccount(account, { openingBalance: opening, openingDate: date, checkpoints: [checkpoint] });
    await audit(input.spaceId, 'balance.adjusted', { account: accountId, as: 'opening', opening, date });
    return { kind: 'opening', diff: 0, account: saved };
  }

  const computed = balancesAt(ledger, date).accounts.find((a) => a.account.id === accountId)?.balance ?? 0;
  const diff = input.balance - computed;
  const saved = await updateAccount(account, { checkpoints: [...(account.checkpoints ?? []), checkpoint] });
  if (diff === 0) return { kind: 'none', diff, account: saved };
  await createTransfer({
    spaceId: input.spaceId,
    kind: 'adjustment',
    amount: Math.abs(diff),
    direction: diff > 0 ? 'in' : 'out',
    date,
    fromAccountId: accountId,
    description: 'Ajuste para bater com o banco',
  });
  return { kind: 'adjustment', diff, account: saved };
}

/**
 * A conta principal do espaço, criada se ainda não existe.
 *
 * O id é derivado do espaço e a data de gravação é a do começo dos tempos:
 * se dois aparelhos criarem a principal antes de se falarem, os dois criam o
 * MESMO registro — e qualquer edição de verdade feita depois ganha dele.
 */
export async function ensurePrimaryAccount(spaceId: string): Promise<Account> {
  const live = await liveRows<Account>('accounts', spaceId);
  const found = live.find((a) => a.primary) ?? live[0];
  if (found) return found;
  const epoch = '2000-01-01T00:00:00.000Z';
  const account: Account = {
    id: primaryIdFor(spaceId),
    spaceId,
    createdAt: epoch,
    updatedAt: epoch,
    deletedAt: null,
    name: 'Conta principal',
    kind: 'checking',
    institution: '',
    color: '',
    openingBalance: 0,
    openingDate: null,
    primary: true,
    checkpoints: [],
    archived: false,
  };
  const d = db();
  await d.transaction('rw', d.accounts, d.mutations, async () => {
    await d.accounts.put(account);
    await d.mutations.add({ table: 'accounts', op: 'put', recordId: account.id, payload: account as unknown as Record<string, unknown>, queuedAt: nowInstant(), attempts: 0, lastError: null });
  });
  return account;
}
