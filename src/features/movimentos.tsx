'use client';

import * as React from 'react';
import { FileUp, Plus, Search, X } from 'lucide-react';
import { Donut, MonthBars, categorySlices } from '@/components/charts';
import { OccurrenceList } from '@/components/entries';
import type { QuickAddRequest } from '@/components/quick-add';
import { Button, Input, Panel, SectionTitle, Segmented } from '@/components/ui';
import { normalize } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { formatMonthLabel } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { MovFilter, Route } from '@/lib/nav';
import { DespesasView, InvestimentosView, MonthStrip, ReceitasView, type ViewContext } from './views';

/**
 * Movimentos: para onde o dinheiro foi.
 *
 * Junta as três abas antigas (receitas, despesas, investimentos) numa tela só,
 * com um filtro no topo. "Tudo" responde de relance — quanto entrou, quanto
 * saiu, onde foi parar — e as outras três guardam o detalhe que já existia.
 */

const FILTERS: { value: MovFilter; label: string; tone?: 'in' | 'out' | 'inv' }[] = [
  { value: 'tudo', label: 'Tudo' },
  { value: 'entradas', label: 'Entradas', tone: 'in' },
  { value: 'saidas', label: 'Saídas', tone: 'out' },
  { value: 'investimentos', label: 'Investido', tone: 'inv' },
];

export function MovimentosView({
  ctx,
  filter,
  onFilter,
  onQuick,
  onGo,
}: {
  ctx: ViewContext;
  filter: MovFilter;
  onFilter: (f: MovFilter) => void;
  onQuick: (r: QuickAddRequest) => void;
  onGo: (route: Route) => void;
}) {
  return (
    <div className="grid gap-4 pt-1">
      <div className="grid gap-3 lg:flex lg:items-center lg:justify-between">
        <MonthStrip month={ctx.month} onChange={ctx.setMonth} />
        <Segmented label="Mostrar" value={filter} onChange={onFilter} options={FILTERS} className="lg:w-[420px]" />
      </div>

      <div key={filter} className="motion-safe:animate-[rise-in_var(--t-base)_var(--ease-out)]">
        {filter === 'tudo' ? (
          <Overview ctx={ctx} onFilter={onFilter} onQuick={onQuick} onGo={onGo} />
        ) : filter === 'entradas' ? (
          <ReceitasView {...ctx} />
        ) : filter === 'saidas' ? (
          <DespesasView {...ctx} />
        ) : (
          <InvestimentosView {...ctx} />
        )}
      </div>
    </div>
  );
}

function Overview({
  ctx,
  onFilter,
  onQuick,
  onGo,
}: {
  ctx: ViewContext;
  onFilter: (f: MovFilter) => void;
  onQuick: (r: QuickAddRequest) => void;
  onGo: (route: Route) => void;
}) {
  const { summary, hidden } = ctx;
  const [query, setQuery] = React.useState('');
  const slices = React.useMemo(() => categorySlices(summary, ctx.categories), [summary, ctx.categories]);

  // o saldo trazido do mês anterior aparece na linha de resultado, não entre os movimentos
  const movements = React.useMemo(() => ctx.occurrences.filter((o) => !o.opening), [ctx.occurrences]);

  const rows = React.useMemo(() => {
    const q = normalize(query);
    if (q.length < 2) return movements;
    const names = new Map(ctx.categories.map((c) => [c.id, normalize(c.name)]));
    return movements.filter(
      (o) => normalize(o.description).includes(q) || (o.categoryId && names.get(o.categoryId)?.includes(q)),
    );
  }, [movements, ctx.categories, query]);

  const monthName = formatMonthLabel(ctx.month).replace(/ de \d{4}$/, '');
  const tiles: { label: string; value: number; tone: string; filter: MovFilter }[] = [
    { label: 'Entrou', value: summary.income, tone: 'text-in', filter: 'entradas' },
    { label: 'Saiu', value: summary.expense, tone: 'text-out', filter: 'saidas' },
    { label: 'Investido', value: summary.invested, tone: 'text-inv', filter: 'investimentos' },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="grid gap-4">
        <Panel className="p-5">
          <p className="text-[13px] text-ink-3">Resultado de {monthName}</p>
          <p className={cn('amount mt-1 text-[40px]', summary.balance < 0 ? 'text-out' : 'text-ink')}>
            {formatMoney(summary.balance, { hidden, signed: true })}
          </p>
          <p className="mt-1 text-[13px] text-ink-3">
            O que entrou menos o que saiu e o que foi investido — contando compras no cartão no dia da compra.
          </p>
          {summary.opening !== 0 ? (
            <p className="mt-2 text-[13px] text-ink-2">
              O mês começou com{' '}
              <span className={cn('tnum font-semibold', summary.opening < 0 ? 'text-out' : 'text-ink')}>
                {formatMoney(summary.opening, { hidden, signed: summary.opening < 0 })}
              </span>{' '}
              do mês anterior.
            </p>
          ) : null}
          <dl className="mt-4 grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => onFilter(t.filter)}
                className="rounded-field bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
              >
                <dt className="text-[11px] uppercase tracking-wider text-ink-3">{t.label}</dt>
                <dd className={cn('tnum mt-1 text-[13.5px] font-semibold leading-tight sm:text-[15px]', t.tone)}>
                  {formatMoney(t.value, { hidden, compact: true })}
                </dd>
              </button>
            ))}
          </dl>
        </Panel>

        <Panel className="px-5 py-4">
          <SectionTitle action={<span className="tnum text-[12px] text-ink-3">{rows.length}</span>}>
            Todos os movimentos
          </SectionTitle>
          {movements.length > 6 ? (
            <div className="relative mb-2">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nome ou categoria"
                aria-label="Filtrar movimentos"
                className="h-10 pl-9 pr-9 text-[14px]"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Limpar filtro"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-2"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
          <OccurrenceList
            occurrences={rows}
            categories={ctx.categories}
            hidden={hidden}
            onToggle={ctx.onToggleOccurrence}
            onOpen={ctx.onOpenOccurrence}
            groupByDay
            empty={
              query
                ? { title: 'Nada com esse nome', description: `Nenhum movimento de ${monthName} tem "${query}".` }
                : {
                    title: `Nenhum movimento em ${monthName}`,
                    description: 'Registre o que entrou e saiu, ou traga o extrato do banco de uma vez.',
                    action: (
                      <>
                        <Button variant="primary" onClick={() => onQuick({})}>
                          <Plus size={16} /> Registrar
                        </Button>
                        <Button onClick={() => onGo({ view: 'importar' })}>
                          <FileUp size={16} /> Importar extrato
                        </Button>
                      </>
                    ),
                  }
            }
          />
        </Panel>
      </div>

      <div className="grid gap-4">
        {slices.length > 0 ? (
          <Panel className="p-5">
            <SectionTitle>Onde você está gastando</SectionTitle>
            <Donut slices={slices} total={summary.expense + summary.invested} caption="Gastos por categoria" />
          </Panel>
        ) : null}
        <Panel className="p-5">
          <SectionTitle>Como seu dinheiro evoluiu</SectionTitle>
          <MonthBars months={ctx.history} hidden={hidden} />
        </Panel>
      </div>
    </div>
  );
}
