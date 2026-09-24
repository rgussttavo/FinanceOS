'use client';

import * as React from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { searchAnswer, type AssistantContext } from '@/lib/assistant';
import { Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { normalize } from '@/lib/categories';
import { formatDayShort } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { Route } from '@/lib/nav';
import {
  useAllSubscriptions,
  useAssets,
  useAttachments,
  useCards,
  useDebts,
  useEntriesUpTo,
  useGoals,
  useSplits,
} from '@/lib/store';
import type { Cents, MonthKey } from '@/lib/types';

export interface SearchHit {
  id: string;
  group: string;
  title: string;
  detail: string;
  amount: Cents | null;
  /** para onde a busca leva ao tocar no resultado */
  route: Route;
}

/**
 * Busca em tudo que a conta tem.
 *
 * O acerto é por texto normalizado — sem acento e sem caixa —, então "cartao"
 * acha "Cartão" e "acucar" acha "Açúcar". A lista vem agrupada por onde a coisa
 * mora, porque saber que o resultado é uma meta e não uma despesa é metade da
 * resposta.
 */
export function useSearch(spaceId: string | null, month: MonthKey, query: string): SearchHit[] {
  const entries = useEntriesUpTo(spaceId, month);
  const subscriptions = useAllSubscriptions(spaceId);
  const cards = useCards(spaceId);
  const goals = useGoals(spaceId);
  const debts = useDebts(spaceId);
  const splits = useSplits(spaceId);
  const assets = useAssets(spaceId);
  const attachments = useAttachments(spaceId);

  return React.useMemo(() => {
    const q = normalize(query);
    if (q.length < 2) return [];

    const hit = (text: string) => normalize(text).includes(q);
    const out: SearchHit[] = [];

    for (const e of entries) {
      if (!hit(e.description) && !e.tags.some(hit)) continue;
      out.push({
        id: `entry:${e.id}`,
        group: e.kind === 'in' ? 'Receitas' : e.kind === 'invest' ? 'Investimentos' : 'Despesas',
        title: e.description,
        detail: formatDayShort(e.date),
        amount: e.amount,
        route: { view: 'movimentos', param: e.kind === 'in' ? 'entradas' : e.kind === 'invest' ? 'investimentos' : 'saidas' },
      });
    }

    for (const s of subscriptions) {
      if (!hit(s.name)) continue;
      out.push({
        id: `sub:${s.id}`,
        group: 'Assinaturas',
        title: s.name,
        detail: s.canceledAt ? 'cancelada' : `dia ${String(s.billingDay).padStart(2, '0')}`,
        amount: s.amount,
        route: { view: 'assinaturas' },
      });
    }

    for (const c of cards) {
      if (!hit(c.name) && !hit(c.institution) && !c.last4.includes(query.trim())) continue;
      out.push({
        id: `card:${c.id}`,
        group: 'Cartões',
        title: c.name || c.institution,
        detail: c.last4 ? `····${c.last4}` : c.institution,
        amount: c.limit || null,
        route: { view: 'cartoes' },
      });
    }

    for (const g of goals) {
      if (!hit(g.name)) continue;
      out.push({ id: `goal:${g.id}`, group: 'Metas', title: g.name, detail: 'meta', amount: g.target, route: { view: 'metas' } });
    }

    for (const d of debts) {
      if (!hit(d.name)) continue;
      out.push({
        id: `debt:${d.id}`,
        group: 'Dívidas',
        title: d.name,
        detail: `${d.installments}x`,
        amount: d.installment,
        route: { view: 'dividas' },
      });
    }

    for (const s of splits) {
      if (!hit(s.name) && !s.items.some((i) => hit(i.description))) continue;
      out.push({
        id: `split:${s.id}`,
        group: 'Rateio',
        title: s.name,
        detail: `${s.participants.length} pessoas`,
        amount: s.items.reduce((sum, i) => sum + i.amount, 0),
        route: { view: 'rateio' },
      });
    }

    for (const a of assets) {
      if (!hit(a.name)) continue;
      out.push({ id: `asset:${a.id}`, group: 'Patrimônio', title: a.name, detail: 'bem', amount: a.value, route: { view: 'patrimonio' } });
    }

    for (const a of attachments) {
      if (!hit(a.name)) continue;
      out.push({
        id: `att:${a.id}`,
        group: 'Comprovantes',
        title: a.name,
        detail: formatDayShort(a.createdAt.slice(0, 10)),
        amount: null,
        route: { view: 'comprovantes' },
      });
    }

    return out.slice(0, 40);
  }, [query, entries, subscriptions, cards, goals, debts, splits, assets, attachments]);
}

/* ------------------------------------------------------------------- tela */

export function BuscaView({
  spaceId,
  month,
  hidden,
  onGo,
  assistant,
}: {
  spaceId: string;
  month: MonthKey;
  hidden: boolean;
  onGo: (route: Route) => void;
  assistant: AssistantContext;
}) {
  const [query, setQuery] = React.useState('');
  const hits = useSearch(spaceId, month, query);
  const deferred = React.useDeferredValue(query);
  const answer = React.useMemo(() => (deferred.trim().length >= 3 ? searchAnswer(deferred, assistant) : null), [deferred, assistant]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const grouped = React.useMemo(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits) {
      const list = map.get(h.group) ?? [];
      list.push(h);
      map.set(h.group, list);
    }
    return [...map.entries()];
  }, [hits]);

  return (
    <div className="grid gap-4 pt-2">
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no FinanceOS…"
          aria-label="Buscar no FinanceOS"
          className="h-12 pl-10 pr-10 text-[16px]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {answer ? (
        <section aria-label="Resposta" className="rounded-panel border border-accent/30 bg-accent-soft p-4">
          <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wider text-accent">
            <Sparkles size={13} aria-hidden /> Resposta
          </p>
          <p className="mt-1.5 text-[15px] leading-snug text-ink">{hidden ? answer.text.replace(/R\$\s?[\d.,]+/g, '••••') : answer.text}</p>
          {answer.list?.length ? (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {answer.list.map((row, i) => (
                <li key={`${row.label}-${i}`} className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{row.label}</span>
                    <span className="block truncate text-[11px] text-ink-3">{row.detail}</span>
                  </span>
                  <span className="tnum shrink-0 text-[13px] font-semibold text-ink-2">{hidden ? '••••' : row.value}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {answer.basis ? <p className="text-[11px] text-ink-3">Dados usados: {answer.basis}</p> : <span />}
            {answer.link ? (
              <button type="button" onClick={() => onGo(answer.link!.route)} className="h-8 text-[12.5px] font-medium text-accent hover:underline">
                {answer.link.label} →
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {query.trim().length < 2 ? (
        <div className="px-1 py-6 text-center">
          <p className="text-[14px] leading-relaxed text-ink-3">
            Procure por lançamento, categoria, assinatura, cartão, meta, dívida, rateio, bem ou comprovante. Com um mês ou uma
            categoria, a busca também responde.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['mercado agosto', 'uber', 'restaurante', 'netflix'].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                className="h-9 rounded-full border border-line px-3.5 text-[13px] text-ink-2 hover:border-accent hover:text-accent"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : !hits.length && !answer ? (
        <p className="px-1 py-8 text-center text-[14px] text-ink-3">
          Nada encontrado para &quot;{query.trim()}&quot;.
        </p>
      ) : (
        <div className="grid gap-4">
          {grouped.map(([group, items]) => (
            <section key={group}>
              <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
                {group}
              </h3>
              <ul className="overflow-hidden rounded-card border border-line bg-surface">
                {items.map((h, i) => (
                  <li key={h.id} className={cn(i > 0 && 'border-t border-line')}>
                    <button
                      type="button"
                      onClick={() => onGo(h.route)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink">{h.title}</span>
                        <span className="block text-[12px] text-ink-3">{h.detail}</span>
                      </span>
                      {h.amount != null && (
                        <span className="tnum shrink-0 text-[14px] font-semibold text-ink-2">
                          {formatMoney(h.amount, { hidden })}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
