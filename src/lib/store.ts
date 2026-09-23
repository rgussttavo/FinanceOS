'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { categorize, learnFromCorrection, type LearnedRule } from './categories';
import { db, deleteRecord, dropFile, entriesUpTo, getSyncState, liveRows, putRecord, saveFile } from './db';
import {
  addMonthsToKey,
  clampDayToMonth,
  currentMonthKey,
  monthKeyOf,
  monthKeyParts,
  nowInstant,
  partsToIso,
  todayIso,
} from './dates';
import { occurrencesInMonth, projectMonth, summarizeMonth, type Occurrence } from './occurrences';
import { ensureSpace, uid } from './provision';
import type {
  Account,
  Asset,
  Attachment,
  Budget,
  Card,
  Category,
  Cents,
  Debt,
  Entry,
  FlowKind,
  Folder,
  Goal,
  GoalSource,
  IsoDate,
  MonthKey,
  Repeat,
  Settings,
  Split,
  Subscription,
} from './types';

/* --------------------------------------------------------------- bootstrap */

export interface Bootstrap {
  spaceId: string | null;
  ready: boolean;
  error: string | null;
}

/** abre a base local e garante o espaco antes de qualquer tela pintar dados */
export function useBootstrap(): Bootstrap {
  const [state, setState] = useState<Bootstrap>({ spaceId: null, ready: false, error: null });

  useEffect(() => {
    let alive = true;
    ensureSpace()
      .then((space) => {
        if (alive) setState({ spaceId: space.id, ready: true, error: null });
      })
      .catch((err: unknown) => {
        if (alive) {
          setState({
            spaceId: null,
            ready: true,
            error: err instanceof Error ? err.message : 'Não consegui abrir a base local.',
          });
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/* ------------------------------------------------------------- consultas */

export function useCategories(spaceId: string | null): Category[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Category>('categories', spaceId)).sort((a, b) => a.order - b.order) : []),
      [spaceId],
      [] as Category[],
    ) ?? []
  );
}

export function useAccounts(spaceId: string | null): Account[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Account>('accounts', spaceId)).filter((a) => !a.archived) : []),
      [spaceId],
      [] as Account[],
    ) ?? []
  );
}

export function useCards(spaceId: string | null): Card[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Card>('cards', spaceId)).filter((c) => !c.archived) : []),
      [spaceId],
      [] as Card[],
    ) ?? []
  );
}

export function useSubscriptions(spaceId: string | null): Subscription[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Subscription>('subscriptions', spaceId)).filter((s) => !s.canceledAt) : []),
      [spaceId],
      [] as Subscription[],
    ) ?? []
  );
}

export function useSettings(spaceId: string | null): Settings | null {
  return (
    useLiveQuery(
      async () => (spaceId ? ((await liveRows<Settings>('settings', spaceId))[0] ?? null) : null),
      [spaceId],
      null,
    ) ?? null
  );
}

/**
 * Quantas mutações esperam para subir.
 *
 * Só conta quando existe conta na nuvem: antes do login a fila cresce
 * normalmente (é ela que vai levar tudo no primeiro sync), e avisar "60 por
 * sincronizar" para quem nem criou conta só assusta sem informar nada.
 */
export function usePendingSync(): number {
  return (
    useLiveQuery(async () => {
      const state = await getSyncState();
      if (!state.userId) return 0;
      return db().mutations.count();
    }, [], 0) ?? 0
  );
}

/* ------------------------------------------------------------------- mes */

export interface MonthView {
  month: MonthKey;
  occurrences: Occurrence[];
  summary: ReturnType<typeof summarizeMonth>;
  projection: ReturnType<typeof projectMonth>;
  loading: boolean;
}

/** tudo o que a tela de um mes precisa, derivado das regras de recorrencia */
export function useMonth(spaceId: string | null, month: MonthKey): MonthView {
  const entries = useLiveQuery(
    async () => (spaceId ? entriesUpTo(spaceId, month) : []),
    [spaceId, month],
    undefined,
  );

  return useMemo(() => {
    const today = todayIso();
    const rows = entries ?? [];
    const occurrences = occurrencesInMonth(rows, month, today);
    return {
      month,
      occurrences,
      summary: summarizeMonth(occurrences, month, today),
      projection: projectMonth(occurrences, month, 0, today),
      loading: entries === undefined,
    };
  }, [entries, month]);
}

/**
 * Resumo de vários meses seguidos, terminando no mês informado.
 *
 * Serve ao comparativo de 6 meses e à evolução do investido. Lê os lançamentos
 * uma vez só e reexpande as ocorrências por competência, em vez de uma consulta
 * por mês.
 */
export function useMonthsSummary(
  spaceId: string | null,
  lastMonth: MonthKey,
  count = 6,
): ReturnType<typeof summarizeMonth>[] {
  const entries = useLiveQuery(
    async () => (spaceId ? entriesUpTo(spaceId, lastMonth) : []),
    [spaceId, lastMonth],
    undefined,
  );

  return useMemo(() => {
    const rows = entries ?? [];
    const today = todayIso();
    const months: MonthKey[] = [];
    for (let i = count - 1; i >= 0; i--) months.push(addMonthsToKey(lastMonth, -i));
    return months.map((m) => summarizeMonth(occurrencesInMonth(rows, m, today), m, today));
  }, [entries, lastMonth, count]);
}

export function useMonthCursor(initial: MonthKey = currentMonthKey()) {
  const [month, setMonth] = useState<MonthKey>(initial);
  return { month, setMonth, isCurrent: month === currentMonthKey() };
}

/* -------------------------------------------------------------- acoes */

export interface NewEntryInput {
  spaceId: string;
  kind: FlowKind;
  description: string;
  amount: Cents;
  date?: IsoDate;
  categoryId?: string | null;
  accountId?: string | null;
  cardId?: string | null;
  repeat?: Repeat;
  notes?: string;
  tags?: string[];
}

export async function createEntry(input: NewEntryInput): Promise<Entry> {
  const at = nowInstant();
  const entry: Entry = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    kind: input.kind,
    description: input.description.trim(),
    amount: Math.max(0, Math.round(input.amount)),
    date: input.date ?? todayIso(),
    categoryId: input.categoryId ?? null,
    accountId: input.accountId ?? null,
    cardId: input.cardId ?? null,
    repeat: input.repeat ?? { kind: 'once' },
    settled: {},
    notes: input.notes ?? '',
    tags: input.tags ?? [],
    source: 'manual',
    externalId: null,
    attachmentIds: [],
  };
  return putRecord('entries', entry);
}

export async function updateEntry(entry: Entry, patch: Partial<Entry>): Promise<Entry> {
  return putRecord('entries', { ...entry, ...patch });
}

export async function removeEntry(id: string): Promise<void> {
  await deleteRecord('entries', id);
}

/**
 * Baixa (ou desfaz a baixa de) uma ocorrencia.
 *
 * A marca vive no lancamento, indexada pela chave da ocorrencia — assim uma
 * despesa de 12 parcelas e uma linha so no banco, com 12 marcas possiveis, em
 * vez de 12 linhas.
 */
export async function toggleSettled(entry: Entry, occurrenceKey: string, amount?: Cents): Promise<Entry> {
  const settled = { ...entry.settled };
  if (settled[occurrenceKey]) {
    delete settled[occurrenceKey];
  } else {
    settled[occurrenceKey] = { at: nowInstant(), ...(amount != null ? { amount } : {}) };
  }
  return putRecord('entries', { ...entry, settled });
}

/* ---------------------------------------------------------------- cartoes */

export interface NewCardInput {
  spaceId: string;
  name: string;
  institution: string;
  brand: Card['brand'];
  last4: string;
  color: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
}

export async function createCard(input: NewCardInput): Promise<Card> {
  const at = nowInstant();
  const card: Card = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: input.name.trim(),
    institution: input.institution.trim(),
    brand: input.brand,
    last4: input.last4.replace(/\D/g, '').slice(-4),
    color: input.color,
    limit: Math.max(0, Math.round(input.limit)),
    closingDay: clampDay(input.closingDay),
    dueDay: clampDay(input.dueDay),
    accountId: null,
    archived: false,
  };
  return putRecord('cards', card);
}

export const updateCard = (card: Card, patch: Partial<Card>): Promise<Card> =>
  putRecord('cards', { ...card, ...patch });

export const removeCard = (id: string): Promise<void> => deleteRecord('cards', id);

/** dia fora de 1..31 não existe em cartão nenhum */
const clampDay = (day: number): number => Math.min(31, Math.max(1, Math.trunc(day) || 1));

/**
 * Tudo que a tela de cartões precisa numa consulta só.
 *
 * A fatura depende de lançamentos que começaram meses atrás — uma compra em
 * doze vezes de janeiro ainda pesa em novembro —, então não dá para filtrar
 * por mês no banco: o corte é feito pelo ciclo de cada cartão.
 */
export function useCardsData(spaceId: string | null, month: MonthKey) {
  const cards = useCards(spaceId);
  const subscriptions = useSubscriptions(spaceId);
  const entries =
    useLiveQuery(
      async () => (spaceId ? entriesUpTo(spaceId, month) : []),
      [spaceId, month],
      [] as Entry[],
    ) ?? [];

  return { cards, subscriptions, entries };
}

/* ------------------------------------------------------------ assinaturas */

export interface NewSubscriptionInput {
  spaceId: string;
  name: string;
  domain: string;
  amount: Cents;
  billingDay: number;
  cycle: 'monthly' | 'yearly';
  color: string;
  cardId: string | null;
  accountId: string | null;
  categoryId: string | null;
  startedAt?: IsoDate;
  remindDaysBefore?: number;
}

export async function createSubscription(input: NewSubscriptionInput): Promise<Subscription> {
  const at = nowInstant();
  const sub: Subscription = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: input.name.trim(),
    domain: input.domain,
    amount: Math.max(0, Math.round(input.amount)),
    billingDay: clampDay(input.billingDay),
    cycle: input.cycle,
    categoryId: input.categoryId,
    cardId: input.cardId,
    accountId: input.accountId,
    color: input.color,
    startedAt: input.startedAt ?? todayIso(),
    canceledAt: null,
    remindDaysBefore: input.remindDaysBefore ?? 2,
  };
  return putRecord('subscriptions', sub);
}

export const updateSubscription = (sub: Subscription, patch: Partial<Subscription>): Promise<Subscription> =>
  putRecord('subscriptions', { ...sub, ...patch });

/**
 * Cancelar não é apagar.
 *
 * A assinatura cancelada some das cobranças futuras mas continua nos meses em
 * que realmente pesou — senão o histórico do ano passado muda sozinho toda vez
 * que alguém cancela alguma coisa hoje.
 */
export const cancelSubscription = (sub: Subscription, on: IsoDate = todayIso()): Promise<Subscription> =>
  putRecord('subscriptions', { ...sub, canceledAt: on });

export const removeSubscription = (id: string): Promise<void> => deleteRecord('subscriptions', id);

/** assinaturas ativas e canceladas, para a tela mostrar as duas listas */
export function useAllSubscriptions(spaceId: string | null): Subscription[] {
  return (
    useLiveQuery(
      async () => (spaceId ? liveRows<Subscription>('subscriptions', spaceId) : []),
      [spaceId],
      [] as Subscription[],
    ) ?? []
  );
}

/* ------------------------------------------------------------------ metas */

export function useGoals(spaceId: string | null): Goal[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Goal>('goals', spaceId)).filter((g) => !g.archivedAt) : []),
      [spaceId],
      [] as Goal[],
    ) ?? []
  );
}

export interface NewGoalInput {
  spaceId: string;
  name: string;
  icon: string;
  target: Cents;
  source: GoalSource;
  categoryId: string | null;
  saved: Cents;
  deadline: IsoDate | null;
  color?: string;
}

export async function createGoal(input: NewGoalInput): Promise<Goal> {
  const at = nowInstant();
  const goal: Goal = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: input.name.trim(),
    icon: input.icon,
    target: Math.max(0, Math.round(input.target)),
    source: input.source,
    categoryId: input.source === 'category' ? input.categoryId : null,
    saved: input.source === 'manual' ? Math.max(0, Math.round(input.saved)) : 0,
    deadline: input.deadline,
    color: input.color ?? '#c9a36b',
    archivedAt: null,
  };
  return putRecord('goals', goal);
}

export const updateGoal = (goal: Goal, patch: Partial<Goal>): Promise<Goal> =>
  putRecord('goals', { ...goal, ...patch });

export const removeGoal = (id: string): Promise<void> => deleteRecord('goals', id);

/** guarda mais um tanto numa meta manual */
export const depositIntoGoal = (goal: Goal, amount: Cents): Promise<Goal> =>
  putRecord('goals', { ...goal, saved: Math.max(0, goal.saved + amount) });

/* ---------------------------------------------------------------- dividas */

export function useDebts(spaceId: string | null): Debt[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Debt>('debts', spaceId)).filter((d) => !d.settledAt) : []),
      [spaceId],
      [] as Debt[],
    ) ?? []
  );
}

export interface NewDebtInput {
  spaceId: string;
  name: string;
  kind: Debt['kind'];
  icon: string;
  installment: Cents;
  installments: number;
  startMonth: MonthKey;
  monthlyRate: number;
  inFlow: boolean;
}

export async function createDebt(input: NewDebtInput): Promise<Debt> {
  const at = nowInstant();
  const debt: Debt = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: input.name.trim(),
    kind: input.kind,
    icon: input.icon,
    installment: Math.max(0, Math.round(input.installment)),
    installments: Math.max(1, Math.trunc(input.installments)),
    startMonth: input.startMonth,
    monthlyRate: Math.max(0, input.monthlyRate),
    inFlow: input.inFlow,
    settledAt: null,
  };
  return putRecord('debts', debt);
}

export const updateDebt = (debt: Debt, patch: Partial<Debt>): Promise<Debt> =>
  putRecord('debts', { ...debt, ...patch });

export const removeDebt = (id: string): Promise<void> => deleteRecord('debts', id);

/** todos os lançamentos do espaço até a competência, para metas e dívidas */
export function useEntriesUpTo(spaceId: string | null, month: MonthKey): Entry[] {
  return (
    useLiveQuery(
      async () => (spaceId ? entriesUpTo(spaceId, month) : []),
      [spaceId, month],
      [] as Entry[],
    ) ?? []
  );
}

/* ----------------------------------------------------------------- rateio */

export function useSplits(spaceId: string | null): Split[] {
  return (
    useLiveQuery(
      async () =>
        spaceId
          ? (await liveRows<Split>('splits', spaceId)).sort((a, b) => (a.date < b.date ? 1 : -1))
          : [],
      [spaceId],
      [] as Split[],
    ) ?? []
  );
}

export async function createSplit(spaceId: string, name: string, icon: string): Promise<Split> {
  const at = nowInstant();
  const split: Split = {
    id: uid(),
    spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: name.trim() || 'Novo rateio',
    icon,
    date: todayIso(),
    participants: [{ id: uid(), name: 'Você', me: true }],
    items: [],
    closedAt: null,
  };
  return putRecord('splits', split);
}

export const updateSplit = (split: Split, patch: Partial<Split>): Promise<Split> =>
  putRecord('splits', { ...split, ...patch });

export const removeSplit = (id: string): Promise<void> => deleteRecord('splits', id);

/* -------------------------------------------------------------- orçamento */

export function useBudgets(spaceId: string | null): Budget[] {
  return (
    useLiveQuery(
      async () =>
        spaceId
          ? (await liveRows<Budget>('budgets', spaceId)).sort((a, b) =>
              a.createdAt < b.createdAt ? 1 : -1,
            )
          : [],
      [spaceId],
      [] as Budget[],
    ) ?? []
  );
}

export async function createBudget(spaceId: string, name: string, icon: string): Promise<Budget> {
  const at = nowInstant();
  const budget: Budget = {
    id: uid(),
    spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: name.trim() || 'Novo orçamento',
    icon,
    people: 1,
    items: [],
    bufferPercent: 10,
    notes: '',
  };
  return putRecord('budgets', budget);
}

export const updateBudget = (budget: Budget, patch: Partial<Budget>): Promise<Budget> =>
  putRecord('budgets', { ...budget, ...patch });

export const removeBudget = (id: string): Promise<void> => deleteRecord('budgets', id);

/* ------------------------------------------------------------- patrimônio */

export function useAssets(spaceId: string | null): Asset[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Asset>('assets', spaceId)).sort((a, b) => b.value - a.value) : []),
      [spaceId],
      [] as Asset[],
    ) ?? []
  );
}

export interface NewAssetInput {
  spaceId: string;
  name: string;
  kind: Asset['kind'];
  icon: string;
  value: Cents;
  purchaseValue?: Cents;
  purchasedAt?: IsoDate | null;
  indexedByIpca?: boolean;
  fipe?: Asset['fipe'];
  notes?: string;
}

export async function createAsset(input: NewAssetInput): Promise<Asset> {
  const at = nowInstant();
  const asset: Asset = {
    id: uid(),
    spaceId: input.spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: input.name.trim(),
    kind: input.kind,
    icon: input.icon,
    value: Math.max(0, Math.round(input.value)),
    purchaseValue: Math.max(0, Math.round(input.purchaseValue ?? input.value)),
    purchasedAt: input.purchasedAt ?? null,
    indexedByIpca: input.indexedByIpca ?? false,
    fipe: input.fipe ?? null,
    notes: input.notes ?? '',
  };
  return putRecord('assets', asset);
}

export const updateAsset = (asset: Asset, patch: Partial<Asset>): Promise<Asset> =>
  putRecord('assets', { ...asset, ...patch });

export const removeAsset = (id: string): Promise<void> => deleteRecord('assets', id);

/* ------------------------------------------------------------ comprovantes */

export function useFolders(spaceId: string | null): Folder[] {
  return (
    useLiveQuery(
      async () => (spaceId ? (await liveRows<Folder>('folders', spaceId)).sort((a, b) => a.order - b.order) : []),
      [spaceId],
      [] as Folder[],
    ) ?? []
  );
}

export function useAttachments(spaceId: string | null): Attachment[] {
  return (
    useLiveQuery(
      async () =>
        spaceId
          ? (await liveRows<Attachment>('attachments', spaceId)).sort((a, b) =>
              a.createdAt < b.createdAt ? 1 : -1,
            )
          : [],
      [spaceId],
      [] as Attachment[],
    ) ?? []
  );
}

export async function createFolder(spaceId: string, name: string, icon: string): Promise<Folder> {
  const at = nowInstant();
  const folder: Folder = {
    id: uid(),
    spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: name.trim() || 'Nova pasta',
    icon,
    order: Date.now(),
  };
  return putRecord('folders', folder);
}

export const removeFolder = (id: string): Promise<void> => deleteRecord('folders', id);

/**
 * Guarda um arquivo neste aparelho e registra o comprovante.
 *
 * O binário vai para o IndexedDB e só os metadados entram na fila de sync. O
 * upload para a nuvem entra junto com o backend; até lá, `uploaded` fica falso
 * e a tela diz a verdade sobre onde o arquivo está.
 */
export async function addAttachment(
  spaceId: string,
  file: File,
  folderId: string | null,
  title?: string,
): Promise<Attachment> {
  const at = nowInstant();
  const attachment: Attachment = {
    id: uid(),
    spaceId,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    name: (title?.trim() || file.name || 'comprovante').slice(0, 80),
    mime: file.type || 'application/octet-stream',
    size: file.size,
    storagePath: null,
    folderId,
    uploaded: false,
  };
  await saveFile(attachment.id, file);
  return putRecord('attachments', attachment);
}

export async function removeAttachment(id: string): Promise<void> {
  await dropFile(id);
  await deleteRecord('attachments', id);
}

export const updateAttachment = (a: Attachment, patch: Partial<Attachment>): Promise<Attachment> =>
  putRecord('attachments', { ...a, ...patch });

/* --------------------------------------------------- repetir mês anterior */

/** marca que identifica o saldo trazido do mês passado */
export const CARRY_OVER_TAG = 'saldo-anterior';

/**
 * Copia para a competência os lançamentos avulsos do mês anterior.
 *
 * Só os avulsos: o que já é recorrente aparece sozinho, e copiá-lo criaria o
 * lançamento em dobro. Também pula o que já existe no mês com mesma descrição
 * e valor, para o botão poder ser tocado duas vezes sem duplicar a conta —
 * que é exatamente o que acontece quando alguém não tem certeza se apertou.
 */
export async function repeatPreviousMonth(
  spaceId: string,
  month: MonthKey,
  kind: FlowKind,
): Promise<number> {
  const previous = addMonthsToKey(month, -1);
  const rows = await entriesUpTo(spaceId, month);

  const already = new Set(
    occurrencesInMonth(rows, month, todayIso())
      .filter((o) => o.kind === kind)
      .map((o) => `${o.description.toLowerCase()}|${o.amount}`),
  );

  const source = occurrencesInMonth(rows, previous, todayIso()).filter((o) => o.kind === kind);

  let copied = 0;
  for (const occurrence of source) {
    const entry = rows.find((e) => e.id === occurrence.entryId);
    if (!entry || entry.repeat.kind !== 'once') continue;
    if (already.has(`${occurrence.description.toLowerCase()}|${occurrence.amount}`)) continue;

    const { y, m } = monthKeyParts(month);
    const day = Number(occurrence.date.slice(8));

    await createEntry({
      spaceId,
      kind: entry.kind,
      description: entry.description,
      amount: entry.amount,
      date: partsToIso(y, m, clampDayToMonth(day, y, m)),
      categoryId: entry.categoryId,
      accountId: entry.accountId,
      cardId: entry.cardId,
      repeat: { kind: 'once' },
      tags: entry.tags,
    });
    copied += 1;
  }

  return copied;
}

/**
 * O saldo que sobrou na conta no mês passado, trazido como receita.
 *
 * Vira um lançamento marcado: reescrever o valor substitui o de antes em vez
 * de somar mais um, e apagar é apagar um lançamento comum.
 */
export async function setCarryOver(
  spaceId: string,
  month: MonthKey,
  amount: Cents,
): Promise<Entry | null> {
  const rows = await entriesUpTo(spaceId, month);
  const existing = rows.find(
    (e) => e.tags.includes(CARRY_OVER_TAG) && monthKeyOf(e.date) === month && !e.deletedAt,
  );

  if (amount <= 0) {
    if (existing) await deleteRecord('entries', existing.id);
    return null;
  }

  const { y, m } = monthKeyParts(month);
  const date = partsToIso(y, m, 1);

  if (existing) {
    return putRecord('entries', { ...existing, amount, date });
  }

  return createEntry({
    spaceId,
    kind: 'in',
    description: 'Saldo do mês anterior',
    amount,
    date,
    repeat: { kind: 'once' },
    tags: [CARRY_OVER_TAG],
  });
}

/** quanto já está registrado como saldo trazido para a competência */
export function useCarryOver(spaceId: string | null, month: MonthKey): Cents {
  return (
    useLiveQuery(
      async () => {
        if (!spaceId) return 0;
        const rows = await entriesUpTo(spaceId, month);
        const hit = rows.find(
          (e) => e.tags.includes(CARRY_OVER_TAG) && monthKeyOf(e.date) === month && !e.deletedAt,
        );
        return hit?.amount ?? 0;
      },
      [spaceId, month],
      0,
    ) ?? 0
  );
}

/* ------------------------------------------------------- categorizacao */

async function readLearned(): Promise<LearnedRule[]> {
  return db().learned.toArray();
}

/** sugere a categoria de uma descricao, considerando o que ja foi ensinado */
export async function suggestCategory(
  description: string,
  kind: FlowKind,
  categories: Category[],
) {
  return categorize({ description, kind, categories, learned: await readLearned() });
}

/** a pessoa corrigiu a categoria: vira regra para a proxima vez */
export async function rememberCategory(description: string, categoryId: string): Promise<void> {
  const learned = await readLearned();
  const next = learnFromCorrection(learned, description, categoryId);
  const changed = next.find((r) => r.categoryId === categoryId && description.length > 0);
  if (!changed) return;
  await db().learned.put({ ...changed, id: changed.pattern });
}

/* ------------------------------------------------------------- utilidades */

/** categorias indexadas por id, para a lista nao varrer o array por linha */
export function useCategoryMap(categories: Category[]): Map<string, Category> {
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
}
