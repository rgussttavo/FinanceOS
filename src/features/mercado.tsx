'use client';

import * as React from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { Button, Panel, SectionTitle } from '@/components/ui';
import { CambioSheet } from '@/features/simuladores';
import { cn } from '@/lib/cn';
import {
  formatQuote,
  formatRate,
  timeAgo,
  useMarket,
  useNews,
  type NewsItem,
  type Quote,
} from '@/lib/market';

/* --------------------------------------------------------------- notícias */

export function NewsList({
  limit = 3,
  expandable = true,
}: {
  limit?: number;
  expandable?: boolean;
}) {
  const { data, loading, error, stale, reload } = useNews();
  const [expanded, setExpanded] = React.useState(false);

  const items = data?.items ?? [];
  const shown = expanded ? items : items.slice(0, limit);
  const rest = items.length - shown.length;

  if (loading && !items.length) return <SkeletonRows rows={limit} />;

  if (!items.length) {
    return (
      <p className="px-1 py-3 text-[13px] text-ink-3">
        {error
          ? 'Não consegui carregar as notícias agora. Tente de novo mais tarde.'
          : 'Nenhuma notícia disponível.'}
      </p>
    );
  }

  return (
    <div>
      {stale && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-3">
          <RefreshCw size={12} />
          mostrando o que estava guardado
        </p>
      )}

      <ul className="overflow-hidden rounded-card border border-line">
        {shown.map((item, i) => (
          <li key={item.id} className={cn(i > 0 && 'border-t border-line')}>
            <NewsRow item={item} />
          </li>
        ))}
      </ul>

      {expandable && rest > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2.5 h-11 w-full rounded-field bg-surface-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          Mostrar mais ({rest})
        </button>
      )}

      {expandable && expanded && (
        <button
          type="button"
          onClick={reload}
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-field bg-surface-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      )}
    </div>
  );
}

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
    >
      {item.image && (
        // a imagem vem de portal de notícia, domínio que muda por manchete:
        // next/image exigiria liberar host por host, então aqui vale a tag crua
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-14 w-14 shrink-0 rounded-[10px] object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug text-ink">{item.title}</span>
        <span className="mt-1 block text-[12px] text-ink-3">
          {item.source}
          {item.publishedAt ? ` · ${timeAgo(item.publishedAt)}` : ''}
        </span>
      </span>
    </a>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <ul className="grid gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-16 animate-pulse rounded-card bg-surface-2" />
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- mercado */

export function MercadoView() {
  const { data, loading, stale } = useMarket();
  const [cambio, setCambio] = React.useState(false);

  return (
    <div className="grid gap-4 pt-2">
      <section>
        <SectionTitle>Notícias do mercado</SectionTitle>
        <NewsList limit={5} />
      </section>

      <Panel className="p-5">
        <SectionTitle action={<span className="text-[12px] text-ink-3">Banco Central</span>}>
          Indicadores
        </SectionTitle>

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-field bg-surface-2" />
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
            {(data?.indicators ?? []).map((ind) => (
              <div key={ind.id}>
                <dt className="text-[12px] text-ink-3">{ind.label}</dt>
                <dd className="tnum mt-0.5 text-[22px] font-semibold text-ink">
                  {formatRate(ind.value)}
                </dd>
                <p className="text-[11px] text-ink-3">{ind.detail}</p>
              </div>
            ))}
          </dl>
        )}

        {stale && <p className="mt-4 text-[12px] text-ink-3">valores guardados neste aparelho</p>}
      </Panel>

      {data?.real?.length ? (
        <Panel className="p-5">
          <SectionTitle>Ganho real</SectionTitle>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-3">
                <th className="pb-2 text-left font-medium">aplicação</th>
                <th className="pb-2 text-right font-medium">no ano</th>
                <th className="pb-2 text-right font-medium">acima da inflação</th>
              </tr>
            </thead>
            <tbody>
              {data.real.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-2.5 text-ink">{row.label}</td>
                  <td className="tnum py-2.5 text-right text-ink-2">{formatRate(row.nominal)}</td>
                  <td
                    className={cn(
                      'tnum py-2.5 text-right font-semibold',
                      (row.real ?? 0) >= 0 ? 'text-in' : 'text-out',
                    )}
                  >
                    {formatRate(row.real, { signed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            Ganho real é o que sobra depois da inflação, calculado pelo desconto composto — não pela
            subtração das taxas.
          </p>
        </Panel>
      ) : null}

      <QuoteGroup title="Moedas" quotes={data?.currencies ?? []} loading={loading && !data} />

      <Button variant="ghost" className="w-full" onClick={() => setCambio(true)}>
        <ArrowLeftRight size={15} />
        Abrir simulador de câmbio
      </Button>

      <QuoteGroup title="Criptomoedas" quotes={data?.crypto ?? []} loading={loading && !data} />

      {/* seções previstas no contrato da API, ainda sem fonte de dados */}
      {(data?.pending ?? []).map((section) => (
        <PendingPanel key={section.id} label={section.label} reason={section.reason} />
      ))}

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Fontes: séries do Banco Central e cotações públicas de câmbio. Valores meramente
        informativos, sem recomendação de investimento.
      </p>

      <CambioSheet open={cambio} onClose={() => setCambio(false)} />
    </div>
  );
}

/**
 * Seção que existe no produto mas ainda não tem de onde puxar dado.
 *
 * Fica visível e dita em português em vez de sumir da tela: quem usa vê o mapa
 * inteiro e entende que falta a fonte, não que a funcionalidade não existe.
 * Preencher com número inventado seria pior do que deixar vazio.
 */
function PendingPanel({ label, reason }: { label: string; reason: string }) {
  return (
    <Panel className="border-dashed px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            {label}
          </span>
          <span className="mt-1 block text-[13px] text-ink-3">{reason}</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-3">
          sem fonte
        </span>
      </div>
    </Panel>
  );
}

function QuoteGroup({
  title,
  quotes,
  loading,
}: {
  title: string;
  quotes: Quote[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <Panel className="p-5">
        <SectionTitle>{title}</SectionTitle>
        <div className="h-24 animate-pulse rounded-field bg-surface-2" />
      </Panel>
    );
  }

  if (!quotes.length) return null;

  return (
    <Panel className="px-5 py-4">
      <SectionTitle>{title}</SectionTitle>
      <ul className="divide-y divide-line">
        {quotes.map((q) => {
          const up = (q.changePercent ?? 0) >= 0;
          return (
            <li key={q.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[15px] text-ink">{q.label}</span>
                <span className="block text-[12px] text-ink-3">{q.symbol}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tnum block text-[15px] font-semibold text-ink">
                  {formatQuote(q.price)}
                </span>
                <span className={cn('tnum block text-[12px]', up ? 'text-in' : 'text-out')}>
                  {formatRate(q.changePercent, { signed: true })}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
