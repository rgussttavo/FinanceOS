'use client';

import * as React from 'react';
import { ArrowRight, Flag } from 'lucide-react';
import { Button, Panel, SectionTitle } from '@/components/ui';
import type { Checkup } from '@/lib/checkup';
import { cn } from '@/lib/cn';
import { putRecord } from '@/lib/db';
import { formatMonthLabel, todayIso } from '@/lib/dates';
import type { Route } from '@/lib/nav';
import { STAGES, reviewText, type MonthReview, type NextAction, type Stage } from '@/lib/strategy';
import type { Category, Settings } from '@/lib/types';
import { ProfileSheet } from './profile';

/**
 * Estratégia e acompanhamento na tela: o próximo passo no topo do Início, o
 * fechamento do mês nos primeiros dias, a revisão do plano a cada três meses
 * e a trilha no diagnóstico. Uma ação por vez, com o motivo e o impacto.
 */

const mask = (text: string, hidden: boolean) => (hidden ? text.replace(/[−-]?R\$\s?[\d.,]+/g, '••••') : text);

async function markCheckin(settings: Settings | null, patch: NonNullable<Settings['checkins']>) {
  if (!settings) return;
  await putRecord('settings', { ...settings, checkins: { ...settings.checkins, ...patch } });
}

/* ------------------------------------------------------- o próximo passo */

export function NextActionCard({ action, hidden, onGo }: { action: NextAction; hidden: boolean; onGo: (route: Route) => void }) {
  return (
    <Panel className="border border-accent/30 p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        <Flag size={13} aria-hidden /> Seu próximo passo
      </p>
      <p className="mt-1.5 text-[16px] font-medium leading-snug text-ink">{action.title}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{mask(action.reason, hidden)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{mask(action.impact, hidden)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => onGo(action.route)}>
          Fazer agora <ArrowRight size={14} />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onGo({ view: 'checkup' })}>
          Ver o plano
        </Button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------- como foi o mês passado */

export function MonthlyCheckin({
  review,
  settings,
  categories,
  hidden,
  onGo,
}: {
  review: MonthReview;
  settings: Settings | null;
  categories: Category[];
  hidden: boolean;
  onGo: (route: Route) => void;
}) {
  const t = reviewText(review, (id) => categories.find((c) => c.id === id)?.name ?? 'Sem categoria');
  return (
    <Panel className="p-5">
      <SectionTitle>Como foi {formatMonthLabel(review.month)}</SectionTitle>
      <p className="text-[15px] leading-relaxed text-ink">{mask(t.headline, hidden)}</p>
      {t.lines.length ? (
        <ul className="mt-2 grid gap-1 text-[14px] leading-relaxed text-ink-2">
          {t.lines.map((l) => (
            <li key={l}>{mask(l, hidden)}</li>
          ))}
        </ul>
      ) : null}
      {t.tone === 'good' ? (
        <p className="mt-2 text-[13px] text-in">O resultado veio do padrão que você manteve.</p>
      ) : t.tone === 'watch' ? (
        <p className="mt-2 text-[13px] text-ink-3">Um mês abaixo do esperado acontece: o que ajuda é ver o que mudou.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="soft" onClick={() => void markCheckin(settings, { monthly: review.month })}>
          Entendi
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onGo({ view: 'checkup' })}>
          Ver o diagnóstico
        </Button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------- o plano ainda faz sentido? */

export function QuarterlyReview({ checkup, stage, settings, onGo }: { checkup: Checkup; stage: Stage | null; settings: Settings | null; onGo: (route: Route) => void }) {
  const [editing, setEditing] = React.useState(false);
  const goals = checkup.areas.find((a) => a.id === 'metas');
  const answeredAt = settings?.profile?.answeredAt;
  return (
    <Panel className="p-5">
      <SectionTitle>Seu plano ainda faz sentido?</SectionTitle>
      <p className="text-[14px] leading-relaxed text-ink-2">
        A cada três meses, vale rever se as metas e o que você contou sobre o seu momento continuam valendo.
      </p>
      <ul className="mt-3 grid gap-1.5 text-[14px] text-ink-2">
        {stage ? <li>{stage.situation}</li> : null}
        {goals ? <li>Metas: {goals.label}.</li> : null}
        <li>{answeredAt ? `Suas respostas sobre o momento são de ${formatMonthLabel(answeredAt.slice(0, 7))}.` : 'Você ainda não contou seu momento financeiro.'}</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="soft" onClick={() => onGo({ view: 'metas' })}>
          Rever metas
        </Button>
        <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
          Rever respostas
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void markCheckin(settings, { quarterly: todayIso() })}>
          Está tudo certo
        </Button>
      </div>
      <ProfileSheet open={editing} onClose={() => setEditing(false)} settings={settings} />
    </Panel>
  );
}

/* ---------------------------------------------------- trilha e passos */

export function TrailPanel({ stage }: { stage: Stage | null }) {
  if (!stage) return null;
  return (
    <Panel className="px-5 py-4">
      <SectionTitle>Sua trilha</SectionTitle>
      <ol aria-label={`Etapa ${stage.index + 1} de ${STAGES.length}: ${stage.label}`} className="grid grid-cols-5 gap-1.5">
        {STAGES.map((s, i) => (
          <li key={s.id} className="grid gap-1.5">
            <span className={cn('h-1.5 rounded-full', i < stage.index ? 'bg-in' : i === stage.index ? 'bg-accent' : 'bg-surface-3')} aria-hidden />
            <span className={cn('truncate text-[11px]', i === stage.index ? 'font-semibold text-ink' : 'text-ink-3')}>{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[14px] leading-relaxed text-ink">{stage.situation}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Para a próxima etapa: {stage.next.replace(/^./, (c) => c.toLowerCase())}</p>
    </Panel>
  );
}

export function ActionsPanel({ actions, hidden, onGo }: { actions: NextAction[]; hidden: boolean; onGo: (route: Route) => void }) {
  if (!actions.length) return null;
  return (
    <Panel className="px-5 py-4">
      <SectionTitle>Próximos passos</SectionTitle>
      <ol className="grid gap-4">
        {actions.slice(0, 3).map((a, i) => (
          <li key={a.id} className="grid gap-1">
            <p className="text-[15px] font-medium text-ink">
              {i + 1}. {a.title}
            </p>
            <p className="text-[14px] leading-relaxed text-ink-2">{mask(a.reason, hidden)}</p>
            <p className="text-[13px] leading-relaxed text-ink-3">{mask(a.impact, hidden)}</p>
            <button type="button" onClick={() => onGo(a.route)} className="flex h-8 items-center gap-1 justify-self-start text-[13px] font-medium text-accent">
              Fazer agora <ArrowRight size={14} />
            </button>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
