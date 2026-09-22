'use client';

import * as React from 'react';
import { AppHeader } from '@/components/AppHeader';
import { BalanceHero, CategoryBreakdown, MonthNav, ProjectionChart } from '@/components/dashboard';
import { AddButton, NewEntrySheet, OccurrenceList, UpcomingPanel } from '@/components/entries';
import { Panel, SectionTitle } from '@/components/ui';
import { db, putRecord } from '@/lib/db';
import { currentMonthKey, formatMonthLabel } from '@/lib/dates';
import type { Occurrence } from '@/lib/occurrences';
import {
  toggleSettled,
  useBootstrap,
  useCategories,
  useMonth,
  usePendingSync,
  useSettings,
} from '@/lib/store';
import type { MonthKey } from '@/lib/types';

export default function AppPage() {
  const { spaceId, ready, error } = useBootstrap();
  const [month, setMonth] = React.useState<MonthKey>(currentMonthKey());
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [online, setOnline] = React.useState(true);

  const categories = useCategories(spaceId);
  const settings = useSettings(spaceId);
  const pending = usePendingSync();
  const view = useMonth(spaceId, month);

  const hidden = settings?.privateMode ?? false;

  React.useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const togglePrivate = React.useCallback(async () => {
    if (!settings) return;
    await putRecord('settings', { ...settings, privateMode: !settings.privateMode });
  }, [settings]);

  const onToggleOccurrence = React.useCallback(async (o: Occurrence) => {
    const entry = await db().entries.get(o.entryId);
    if (entry) await toggleSettled(entry, o.key);
  }, []);

  if (!ready) {
    return <BootScreen message="Abrindo…" />;
  }

  if (error || !spaceId) {
    return (
      <BootScreen
        message={error ?? 'Não consegui abrir a base local.'}
        detail="O Norte guarda os dados no seu aparelho. Em janela anônima ou com o armazenamento bloqueado, ele não consegue começar."
      />
    );
  }

  return (
    <div className="min-h-dvh">
      <AppHeader
        privateMode={hidden}
        onTogglePrivate={togglePrivate}
        pendingSync={pending}
        online={online}
      />

      <main className="mx-auto max-w-5xl px-4 pb-32 pt-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <MonthNav month={month} onChange={setMonth} />
          <span className="hidden text-[12px] text-ink-3 sm:inline">
            {view.summary.count} {view.summary.count === 1 ? 'lançamento' : 'lançamentos'}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div className="grid gap-4">
            <BalanceHero summary={view.summary} hidden={hidden} />
            <ProjectionChart points={view.projection} hidden={hidden} />

            <Panel className="px-6 py-5">
              <SectionTitle>Lançamentos de {formatMonthLabel(month)}</SectionTitle>
              <OccurrenceList
                occurrences={view.occurrences}
                categories={categories}
                hidden={hidden}
                onToggle={onToggleOccurrence}
              />
            </Panel>
          </div>

          <aside className="grid gap-4">
            <UpcomingPanel occurrences={view.occurrences} hidden={hidden} />
            <CategoryBreakdown summary={view.summary} categories={categories} hidden={hidden} />
          </aside>
        </div>
      </main>

      <AddButton onClick={() => setSheetOpen(true)} />

      <NewEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        spaceId={spaceId}
        categories={categories}
      />
    </div>
  );
}

function BootScreen({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-[38ch]">
        <p className="font-display text-[26px] text-ink">{message}</p>
        {detail ? <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{detail}</p> : null}
      </div>
    </div>
  );
}
