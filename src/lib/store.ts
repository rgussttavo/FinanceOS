'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { categorize, learnFromCorrection, type LearnedRule } from './categories';
import { db, deleteRecord, entriesUpTo, getSyncState, liveRows, putRecord } from './db';
import { currentMonthKey, nowInstant, todayIso } from './dates';
import { occurrencesInMonth, projectMonth, summarizeMonth, type Occurrence } from './occurrences';
import { ensureSpace, uid } from './provision';
import type {
  Account,
  Card,
  Category,
  Cents,
  Entry,
  FlowKind,
  IsoDate,
  MonthKey,
  Repeat,
  Settings,
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
