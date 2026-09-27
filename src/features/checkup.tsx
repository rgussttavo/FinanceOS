'use client';

import * as React from 'react';
import { ArrowRight, Check, CircleAlert, CircleDashed, Info, TriangleAlert } from 'lucide-react';
import { Meter, Panel, SectionTitle, Select, toast } from '@/components/ui';
import type { Area, AreaStatus, Checkup } from '@/lib/checkup';
import { LIMITS } from '@/lib/checkup';
import { cn } from '@/lib/cn';
import { putRecord } from '@/lib/db';
import type { Route } from '@/lib/nav';
import type { Settings } from '@/lib/types';
import { FocusPanel } from './profile';
import { ActionsPanel, TrailPanel } from './strategy';
import type { StrategyView } from '@/lib/strategy';

/**
 * "Como está sua vida financeira?"
 *
 * Primeiro o momento em uma frase, depois o que merece atenção — na ordem em
 * que vale olhar —, depois cada área com o número e o motivo, e por fim o
 * quanto dá para confiar nos dados. Nenhuma nota geral: a pessoa não é um
 * número, e a situação de cada área pede uma ação diferente.
 */

const STATUS: Record<AreaStatus, { icon: typeof Check; tone: string; word: string }> = {
  ok: { icon: Check, tone: 'text-in', word: 'saudável' },
  attention: { icon: TriangleAlert, tone: 'text-warn', word: 'atenção' },
  alert: { icon: CircleAlert, tone: 'text-out', word: 'alerta' },
  info: { icon: Info, tone: 'text-ink-3', word: 'informação' },
  unknown: { icon: CircleDashed, tone: 'text-ink-3', word: 'sem dados' },
};

export function StatusIcon({ status, size = 16 }: { status: AreaStatus; size?: number }) {
  const s = STATUS[status];
  return <s.icon size={size} className={cn('shrink-0', s.tone)} aria-label={s.word} />;
}

/** valores escondidos no modo privado, sem perder a frase */
const mask = (text: string, hidden: boolean) => (hidden ? text.replace(/[−-]?R\$\s?[\d.,]+/g, '••••') : text);

/* ------------------------------------------------------ o resumo do Início */

export function AreasSummary({ checkup, hidden, onGo }: { checkup: Checkup; hidden: boolean; onGo: (route: Route) => void }) {
  const { confidence } = checkup;
  return (
    <Panel className="p-5">
      <SectionTitle
        action={
          <button type="button" onClick={() => onGo({ view: 'checkup' })} className="flex h-8 items-center gap-1 text-[13px] font-medium text-accent">
            Ver diagnóstico <ArrowRight size={14} />
          </button>
        }
      >
        Sua vida financeira
      </SectionTitle>
      <p className="mb-3 text-[14px] leading-relaxed text-ink-2">{checkup.summary.text}</p>
      <ul className="grid gap-2">
        {checkup.areas.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="flex min-w-0 items-center gap-2 text-ink">
              <StatusIcon status={a.status} />
              <span className="truncate">{a.title}</span>
            </span>
            <span className={cn('shrink-0 text-right text-[13px]', a.status === 'alert' ? 'text-out' : a.status === 'attention' ? 'text-warn' : 'text-ink-2')}>
              {mask(a.label, hidden)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-2.5 text-[12px] text-ink-3">
        Dados com confiança {confidence.level} · {confidence.percent}%
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------- a tela inteira */

export function CheckupView({
  checkup,
  strategy,
  settings,
  hidden,
  onGo,
}: {
  checkup: Checkup;
  strategy: StrategyView;
  settings: Settings | null;
  hidden: boolean;
  onGo: (route: Route) => void;
}) {
  const { summary, attention, areas, confidence } = checkup;
  const tone = summary.tone === 'alert' ? 'border-out/40' : summary.tone === 'attention' ? 'border-warn/40' : 'border-line';

  return (
    <div className="grid gap-4 pt-2 lg:max-w-[720px]">
      <Panel className={cn('border p-5', tone)}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Seu momento financeiro</p>
        <p className="mt-2 text-[17px] leading-snug text-ink">{summary.text}</p>
      </Panel>

      <FocusPanel checkup={checkup} settings={settings} />
      <TrailPanel stage={strategy.stage} />
      <ActionsPanel actions={strategy.actions} hidden={hidden} onGo={onGo} />

      {attention.length ? (
        <Panel className="px-5 py-4">
          <SectionTitle>O que merece sua atenção</SectionTitle>
          <ol className="grid gap-4">
            {attention.map((a, i) => (
              <li key={a.id} className="grid gap-1.5">
                <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
                  <StatusIcon status={a.status} />
                  <span>
                    {i + 1}. {a.title}
                  </span>
                  <span className="text-[13px] font-normal text-ink-3">· {mask(a.label, hidden)}</span>
                </p>
                <p className="text-[14px] leading-relaxed text-ink-2">{mask(a.why, hidden)}</p>
                {a.action ? <ActionLink action={a.action} onGo={onGo} /> : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}

      <Panel className="px-5 py-4">
        <SectionTitle>Por área</SectionTitle>
        <ul className="divide-y divide-line">
          {areas.map((a) => (
            <AreaRow key={a.id} area={a} hidden={hidden} settings={settings} onGo={onGo} />
          ))}
        </ul>
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle>Confiança dos dados</SectionTitle>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-medium text-ink">Confiança {confidence.level}</p>
          <p className="tnum text-[15px] font-semibold text-ink-2">{confidence.percent}%</p>
        </div>
        <Meter
          value={confidence.percent / 100}
          tone={confidence.level === 'alta' ? 'in' : confidence.level === 'média' ? 'warn' : 'out'}
          label="Confiança dos dados"
          valueText={`${confidence.percent} por cento, confiança ${confidence.level}`}
          className="mt-2"
        />
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Quanto mais completos os dados, mais o diagnóstico acerta. O que falta abaixo não é erro seu: é o que ainda não foi
          informado ao app.
        </p>
        <ul className="mt-3 grid gap-3">
          {confidence.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 text-[14px]">
              {c.ok ? <Check size={16} className="mt-0.5 shrink-0 text-in" aria-label="ok" /> : <CircleDashed size={16} className="mt-0.5 shrink-0 text-ink-3" aria-label="falta" />}
              <span className="min-w-0 flex-1">
                <span className={c.ok ? 'text-ink-2' : 'text-ink'}>{c.label}</span>
                {!c.ok ? <span className="block text-[12px] leading-relaxed text-ink-3">{c.hint}</span> : null}
                {!c.ok && c.route ? <ActionLink action={{ label: 'Resolver', route: c.route }} onGo={onGo} /> : null}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function ActionLink({ action, onGo }: { action: { label: string; route: Route }; onGo: (route: Route) => void }) {
  return (
    <button type="button" onClick={() => onGo(action.route)} className="flex h-8 items-center gap-1 justify-self-start text-left text-[13px] font-medium text-accent">
      {action.label} <ArrowRight size={14} />
    </button>
  );
}

function AreaRow({ area, hidden, settings, onGo }: { area: Area; hidden: boolean; settings: Settings | null; onGo: (route: Route) => void }) {
  const [open, setOpen] = React.useState(false);
  const reference = settings?.reserveMonths ?? LIMITS.reserveMonths;

  async function setReference(months: number) {
    if (!settings) return;
    await putRecord('settings', { ...settings, reserveMonths: months });
    toast(`Referência da reserva: ${months} meses.`);
  }

  return (
    <li className="py-1">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between gap-3 text-left">
        <span className="flex min-w-0 items-center gap-2.5 text-[15px] text-ink">
          <StatusIcon status={area.status} />
          <span className="truncate">{area.title}</span>
        </span>
        <span className={cn('shrink-0 text-right text-[13px]', area.status === 'alert' ? 'text-out' : area.status === 'attention' ? 'text-warn' : 'text-ink-2')}>
          {mask(area.label, hidden)}
        </span>
      </button>
      {open ? (
        <div className="grid gap-2 pb-3 pl-[26px]">
          <p className="text-[14px] leading-relaxed text-ink-2">{mask(area.why, hidden)}</p>
          {area.id === 'reserva' ? (
            <label className="flex items-center gap-2 text-[13px] text-ink-3">
              Referência
              <Select
                value={String(reference)}
                onChange={(e) => void setReference(Number(e.target.value))}
                className="h-9 w-auto min-w-0 py-0 text-[13px]"
                aria-label="Referência da reserva em meses"
              >
                {[3, 6, 9, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} meses
                  </option>
                ))}
              </Select>
              de despesas essenciais
            </label>
          ) : null}
          {area.action ? <ActionLink action={area.action} onGo={onGo} /> : null}
        </div>
      ) : null}
    </li>
  );
}
