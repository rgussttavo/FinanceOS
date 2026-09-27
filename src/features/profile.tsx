'use client';

import * as React from 'react';
import { Compass } from 'lucide-react';
import { Button, Chip, Panel, SectionTitle, Sheet, toast } from '@/components/ui';
import type { Checkup } from '@/lib/checkup';
import { putRecord } from '@/lib/db';
import { nowInstant } from '@/lib/dates';
import { DEBTS_OPTIONS, FOCUS_OPTIONS, INCOME_OPTIONS, RESERVE_OPTIONS, SITUATION_OPTIONS, focusNote } from '@/lib/profile';
import type { FinancialProfile, Settings } from '@/lib/types';

/**
 * "Qual é o seu momento?" — cinco perguntas de toque, nenhuma obrigatória.
 *
 * No primeiro acesso elas vêm uma por tela (onboarding.tsx); aqui, juntas, no
 * convite do Início para quem já usa o app e na edição a partir do diagnóstico. As respostas são
 * declaração: o app as usa para começar pelo que importa à pessoa, e diz
 * quando os números contam outra história.
 */

export type ProfileDraft = Pick<FinancialProfile, 'focus' | 'situation' | 'monthEnd' | 'income' | 'debts' | 'reserve'>;

export const emptyDraft = (p?: FinancialProfile | null): ProfileDraft => ({
  focus: p?.focus ?? [],
  situation: p?.situation ?? null,
  // a pergunta antiga não aparece mais, mas a resposta dada continua guardada
  monthEnd: p?.monthEnd ?? null,
  income: p?.income ?? null,
  debts: p?.debts ?? null,
  reserve: p?.reserve ?? null,
});

export const hasAnswer = (d: ProfileDraft) => d.focus.length > 0 || !!d.situation || !!d.income || !!d.debts || !!d.reserve;

/** grava as respostas nas preferências (sincroniza com os outros aparelhos) */
export async function saveProfile(settings: Settings | null, draft: ProfileDraft): Promise<void> {
  if (!settings) return;
  await putRecord('settings', { ...settings, profile: { ...draft, answeredAt: nowInstant(), skippedAt: null } });
}

function Question({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[15px] font-medium text-ink">{legend}</legend>
      {hint ? <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p> : null}
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function ProfileForm({ value, onChange }: { value: ProfileDraft; onChange: (next: ProfileDraft) => void }) {
  const toggleFocus = (f: ProfileDraft['focus'][number]) =>
    onChange({ ...value, focus: value.focus.includes(f) ? value.focus.filter((x) => x !== f) : [...value.focus, f] });
  const pick = <K extends 'situation' | 'income' | 'debts' | 'reserve'>(key: K, v: ProfileDraft[K]) =>
    onChange({ ...value, [key]: value[key] === v ? null : v });

  return (
    <div className="grid gap-6">
      <Question legend="O que você mais quer melhorar?" hint="Pode escolher mais de um; o primeiro vira o foco.">
        {FOCUS_OPTIONS.map((o) => (
          <Chip key={o.value} active={value.focus.includes(o.value)} onClick={() => toggleFocus(o.value)}>
            {value.focus[0] === o.value ? '1º · ' : ''}
            {o.label}
          </Chip>
        ))}
      </Question>
      <Question legend="Como está sua situação financeira hoje?">
        {SITUATION_OPTIONS.map((o) => (
          <Chip key={o.value} active={value.situation === o.value} onClick={() => pick('situation', o.value)}>
            {o.label}
          </Chip>
        ))}
      </Question>
      <Question legend="Você tem dívidas hoje?">
        {DEBTS_OPTIONS.map((o) => (
          <Chip key={o.value} active={value.debts === o.value} onClick={() => pick('debts', o.value)}>
            {o.label}
          </Chip>
        ))}
      </Question>
      <Question legend="Você tem uma reserva para emergências?">
        {RESERVE_OPTIONS.map((o) => (
          <Chip key={o.value} active={value.reserve === o.value} onClick={() => pick('reserve', o.value)}>
            {o.label}
          </Chip>
        ))}
      </Question>
      <Question legend="Sua renda é…">
        {INCOME_OPTIONS.map((o) => (
          <Chip key={o.value} active={value.income === o.value} onClick={() => pick('income', o.value)}>
            {o.label}
          </Chip>
        ))}
      </Question>
    </div>
  );
}

export function ProfileSheet({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: Settings | null }) {
  const [draft, setDraft] = React.useState<ProfileDraft>(() => emptyDraft(settings?.profile));
  const [loaded, setLoaded] = React.useState(false);
  if (open && !loaded) {
    setLoaded(true);
    setDraft(emptyDraft(settings?.profile));
  }
  if (!open && loaded) setLoaded(false);

  async function save() {
    await saveProfile(settings, draft);
    toast('Respostas guardadas. O Início, o diagnóstico e o assistente começam pelo que você escolheu.');
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Seu momento financeiro"
      description="Cinco perguntas de toque. Nenhuma é obrigatória, e dá para mudar quando quiser."
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => void save()} disabled={!hasAnswer(draft)}>
          Guardar respostas
        </Button>
      }
    >
      <ProfileForm value={draft} onChange={setDraft} />
    </Sheet>
  );
}

/** o convite no Início, para quem ainda não respondeu nem dispensou */
export function ProfilePrompt({ settings }: { settings: Settings | null }) {
  const [open, setOpen] = React.useState(false);
  const profile = settings?.profile;
  if (!settings || profile?.answeredAt || profile?.skippedAt) return null;

  async function skip() {
    if (!settings) return;
    await putRecord('settings', {
      ...settings,
      profile: { ...emptyDraft(profile), answeredAt: null, skippedAt: nowInstant() },
    });
  }

  return (
    <Panel className="p-5">
      <div className="flex items-start gap-3">
        <Compass size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">Conte seu momento financeiro</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
            Cinco perguntas rápidas deixam o Início, o diagnóstico e as respostas do assistente mais certos para você.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              Responder
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void skip()}>
              Agora não
            </Button>
          </div>
        </div>
      </div>
      <ProfileSheet open={open} onClose={() => setOpen(false)} settings={settings} />
    </Panel>
  );
}

/** "Seu foco", no diagnóstico: o que a pessoa disse, ligado ao que os números mostram */
export function FocusPanel({ checkup, settings }: { checkup: Checkup; settings: Settings | null }) {
  const [open, setOpen] = React.useState(false);
  const note = focusNote(settings?.profile, checkup);
  return (
    <Panel className="px-5 py-4">
      <SectionTitle
        action={
          <button type="button" onClick={() => setOpen(true)} className="h-8 text-[13px] font-medium text-accent">
            {note ? 'Editar respostas' : 'Responder'}
          </button>
        }
      >
        Seu foco
      </SectionTitle>
      {note ? (
        <div className="grid gap-2">
          <p className="text-[14px] leading-relaxed text-ink-2">{note.text}</p>
          {note.mismatch ? <p className="text-[14px] leading-relaxed text-warn">{note.mismatch}</p> : null}
        </div>
      ) : (
        <p className="text-[14px] leading-relaxed text-ink-2">
          Conte o que você quer melhorar e como está hoje: o diagnóstico passa a começar por aí.
        </p>
      )}
      <ProfileSheet open={open} onClose={() => setOpen(false)} settings={settings} />
    </Panel>
  );
}
