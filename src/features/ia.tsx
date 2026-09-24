'use client';

import * as React from 'react';
import { ArrowRight, ArrowUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SUGGESTIONS, ask, greeting, type AssistantContext } from '@/lib/assistant';
import { useMarket } from '@/lib/market';
import type { Route } from '@/lib/nav';

interface Message {
  id: string;
  from: 'app' | 'you';
  text: string;
  highlight?: { label: string; value: string };
  list?: { label: string; detail: string; value: string }[];
  basis?: string;
  link?: { label: string; route: Route };
  at: string;
}

const clock = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * A conversa com o assistente.
 *
 * As respostas saem de regras sobre os seus próprios dados — nada é enviado
 * para fora do aparelho, e nenhuma resposta é inventada. Cada resposta diz de
 * onde veio o número e leva para a tela onde ele mora. Quando a pergunta sai
 * do que ele sabe, ele diz que não sabe e lista o que sabe, em vez de chutar
 * um número: num app de dinheiro, um palpite convincente é pior do que um
 * "não sei".
 */
export function IAView({
  name,
  context,
  onGo,
}: {
  name: string;
  context: AssistantContext;
  onGo: (route: Route) => void;
}) {
  const { data: market } = useMarket();

  const [messages, setMessages] = React.useState<Message[]>(() => [
    { id: 'hello', from: 'app', text: greeting(name), at: clock() },
  ]);
  const [draft, setDraft] = React.useState('');
  const endRef = React.useRef<HTMLDivElement>(null);

  const ctx: AssistantContext = React.useMemo(
    () => ({
      ...context,
      market: market
        ? { indicators: market.indicators, currencies: market.currencies, crypto: market.crypto }
        : null,
    }),
    [context, market],
  );

  // a conversa rola para o fim a cada resposta, como qualquer chat
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages]);

  const send = React.useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question) return;

      const answer = ask(question, ctx);
      const at = clock();

      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-q`, from: 'you', text: question, at },
        {
          id: `${Date.now()}-a`,
          from: 'app',
          text: answer.text,
          highlight: answer.highlight,
          list: answer.list,
          basis: answer.basis,
          link: answer.link,
          at,
        },
      ]);
      setDraft('');
    },
    [ctx],
  );

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="flex-1">
        <ul className="grid gap-3 py-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn('flex', m.from === 'you' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-panel px-4 py-3',
                  m.from === 'you'
                    ? 'bg-accent text-accent-ink'
                    : 'border border-line bg-surface text-ink',
                )}
              >
                <p className="whitespace-pre-line text-[14px] leading-relaxed">{m.text}</p>

                {m.highlight && (
                  <div className="mt-3 border-t border-line pt-2.5">
                    <p className="text-[11px] uppercase tracking-wider text-ink-3">
                      {m.highlight.label}
                    </p>
                    <p className="amount mt-0.5 text-[24px] text-ink">{m.highlight.value}</p>
                  </div>
                )}

                {m.list && m.list.length > 0 && (
                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {m.list.map((row, i) => (
                      <li key={`${row.label}-${i}`} className="flex items-baseline gap-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{row.label}</span>
                          {row.detail && (
                            <span className="block truncate text-[11px] text-ink-3">{row.detail}</span>
                          )}
                        </span>
                        <span className="tnum shrink-0 text-[13px] font-semibold text-ink-2">
                          {row.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {m.basis || m.link ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                    {m.basis ? <p className="text-[11px] text-ink-3">Dados usados: {m.basis}</p> : <span />}
                    {m.link ? (
                      <button
                        type="button"
                        onClick={() => onGo(m.link!.route)}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft px-3 text-[12px] font-medium text-accent hover:bg-accent/20"
                      >
                        {m.link.label} <ArrowRight size={12} />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <p
                  className={cn(
                    'mt-1.5 text-right text-[10px] tabular-nums',
                    m.from === 'you' ? 'text-accent-ink/60' : 'text-ink-3',
                  )}
                >
                  {m.at}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>

      <div
        className="sticky bottom-0 -mx-4 bg-canvas px-4 pb-[calc(var(--nav-h)+var(--sa-bottom)+16px)] sm:-mx-6 sm:px-6 lg:pb-6"
      >
        {/* a faixa esmaecida some com a mensagem que chega por baixo, sem
            cortá-la numa linha dura */}
        <div
          aria-hidden
          className="pointer-events-none -mt-6 h-6 bg-gradient-to-t from-canvas to-transparent"
        />

        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="h-8 shrink-0 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2"
        >
          <span className="relative flex-1">
            <Sparkles
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent"
            />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Pergunte sobre seu dinheiro"
              aria-label="Sua pergunta"
              className="h-12 w-full rounded-full border border-line bg-surface pl-9 pr-4 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent"
            />
          </span>
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Enviar pergunta"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition-transform duration-[var(--t-fast)] active:scale-95 disabled:opacity-40"
          >
            <ArrowUp size={20} strokeWidth={2.4} />
          </button>
        </form>

        <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-3">
          Respostas calculadas no seu aparelho, a partir dos seus lançamentos. Nada é enviado para
          fora, e nenhum valor é estimado.
        </p>
      </div>
    </div>
  );
}
