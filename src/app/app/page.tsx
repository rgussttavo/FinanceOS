'use client';

import * as React from 'react';
import { Drawer, TabBar, TopBar } from '@/components/shell';
import { NewEntrySheet } from '@/components/entries';
import { Panel } from '@/components/ui';
import { AssinaturasView } from '@/features/assinaturas';
import { CartoesView } from '@/features/cartoes';
import { DividasView } from '@/features/dividas';
import { MetasView } from '@/features/metas';
import { MercadoView } from '@/features/mercado';
import {
  DespesasView,
  InicioView,
  InvestimentosView,
  MonthStrip,
  ReceitasView,
  type ViewContext,
} from '@/features/views';
import { BRAND } from '@/lib/brand';
import { db, putRecord } from '@/lib/db';
import { currentMonthKey } from '@/lib/dates';
import { ADD_KIND_BY_TAB, TOOLS, isTab, type TabId, type ViewId } from '@/lib/nav';
import type { Occurrence } from '@/lib/occurrences';
import {
  toggleSettled,
  useBootstrap,
  useCategories,
  useMonth,
  useMonthsSummary,
  useSettings,
} from '@/lib/store';
import type { MonthKey } from '@/lib/types';

const THEME_KEY = 'norte-theme';

/** ferramentas que já têm tela própria; o resto ainda cai no aviso de obra */
const BUILT = new Set<ViewId>(['news', 'cartoes', 'assinaturas', 'metas', 'dividas']);

export default function AppPage() {
  const { spaceId, ready, error } = useBootstrap();
  const [view, setView] = React.useState<ViewId>('inicio');
  const [lastTab, setLastTab] = React.useState<TabId>('inicio');
  const [month, setMonth] = React.useState<MonthKey>(currentMonthKey());
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const categories = useCategories(spaceId);
  const settings = useSettings(spaceId);
  const monthView = useMonth(spaceId, month);
  const history = useMonthsSummary(spaceId, month, 6);

  const hidden = settings?.privateMode ?? false;

  const toggleHidden = React.useCallback(async () => {
    if (!settings) return;
    await putRecord('settings', { ...settings, privateMode: !settings.privateMode });
  }, [settings]);

  const onToggleOccurrence = React.useCallback(async (o: Occurrence) => {
    const entry = await db().entries.get(o.entryId);
    if (entry) await toggleSettled(entry, o.key);
  }, []);

  const go = React.useCallback((next: ViewId) => {
    setView(next);
    if (isTab(next)) setLastTab(next);
    window.scrollTo({ top: 0 });
  }, []);

  const toggleTheme = React.useCallback(() => {
    const root = document.documentElement;
    const isLight = root.getAttribute('data-theme') === 'light';
    try {
      if (isLight) {
        root.removeAttribute('data-theme');
        localStorage.removeItem(THEME_KEY);
      } else {
        root.setAttribute('data-theme', 'light');
        localStorage.setItem(THEME_KEY, 'light');
      }
    } catch {
      // armazenamento bloqueado: o tema vale só nesta sessão
      if (isLight) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
    }
  }, []);

  if (!ready) return <BootScreen message="Abrindo…" />;

  if (error || !spaceId) {
    return (
      <BootScreen
        message="Não consegui abrir a base local"
        detail={`O ${BRAND.name} guarda os dados no seu aparelho. Em janela anônima, ou com o armazenamento do navegador bloqueado, ele não tem onde começar.`}
      />
    );
  }

  const ctx: ViewContext = {
    month,
    setMonth,
    summary: monthView.summary,
    occurrences: monthView.occurrences,
    projection: monthView.projection,
    categories,
    hidden,
    toggleHidden,
    onToggleOccurrence,
    history,
  };

  return (
    <div className="min-h-dvh">
      <TopBar
        view={view}
        name="você"
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenProfile={() => go('perfil')}
        onOpenIA={() => go('ia')}
        onOpenSearch={() => go('ia')}
        onBack={() => go(lastTab)}
      />

      <main
        className="col pt-1"
        style={{ paddingBottom: 'calc(var(--tabbar-h) + var(--sa-bottom) + 64px)' }}
      >
        {isTab(view) && <MonthStrip month={month} onChange={setMonth} />}

        <div key={view} className="motion-safe:animate-[rise-in_var(--t-base)_var(--ease-out)]">
          {view === 'inicio' && <InicioView {...ctx} />}
          {view === 'receitas' && <ReceitasView {...ctx} />}
          {view === 'despesas' && <DespesasView {...ctx} />}
          {view === 'investimentos' && <InvestimentosView {...ctx} />}
          {view === 'news' && <MercadoView />}
          {view === 'cartoes' && (
            <CartoesView spaceId={spaceId} month={month} categories={categories} hidden={hidden} />
          )}
          {view === 'assinaturas' && (
            <AssinaturasView spaceId={spaceId} month={month} categories={categories} hidden={hidden} />
          )}
          {view === 'metas' && (
            <MetasView spaceId={spaceId} month={month} categories={categories} hidden={hidden} />
          )}
          {view === 'dividas' && <DividasView spaceId={spaceId} month={month} hidden={hidden} />}
          {!isTab(view) && !BUILT.has(view) && <ToolScreen view={view} />}
        </div>
      </main>

      <TabBar view={view} onChange={go} onAdd={() => setSheetOpen(true)} />

      <Drawer
        open={drawerOpen}
        view={view}
        name="você"
        onClose={() => setDrawerOpen(false)}
        onGo={go}
        onOpenProfile={() => {
          go('perfil');
          setDrawerOpen(false);
        }}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => {
          go('perfil');
          setDrawerOpen(false);
        }}
      />

      <NewEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        spaceId={spaceId}
        categories={categories}
        defaultKind={ADD_KIND_BY_TAB[isTab(view) ? view : lastTab]}
      />
    </div>
  );
}

/**
 * Telas das ferramentas ainda não construídas.
 *
 * Deixar o item navegável e dizer o que virá é mais honesto do que escondê-lo
 * do menu: a pessoa vê o mapa inteiro do produto e sabe onde está.
 */
function ToolScreen({ view }: { view: ViewId }) {
  const tool = TOOLS.find((t) => t.id === view);

  return (
    <Panel className="mt-3 px-6 py-10 text-center">
      <p className="font-display text-[24px] text-ink">{tool?.title ?? 'Em construção'}</p>
      <p className="mx-auto mt-2 max-w-[32ch] text-[14px] leading-relaxed text-ink-3">
        {tool?.description ?? 'Esta tela entra nas próximas etapas.'}
      </p>
      <p className="mt-5 inline-flex rounded-full bg-surface-2 px-3 py-1.5 text-[12px] text-ink-3">
        em construção
      </p>
    </Panel>
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
