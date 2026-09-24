'use client';

import * as React from 'react';
import { Drawer, TabBar, TopBar } from '@/components/shell';
import { NewEntrySheet } from '@/components/entries';
import { Panel } from '@/components/ui';
import { AssinaturasView } from '@/features/assinaturas';
import {
  AccountPanel,
  SignInSheet,
  useAuthRedirectError,
  useCloudSync,
  useSession,
} from '@/features/auth';
import { BuscaView } from '@/features/busca';
import { CartoesView } from '@/features/cartoes';
import { ComprovantesView } from '@/features/comprovantes';
import { DividasView } from '@/features/dividas';
import { IAView } from '@/features/ia';
import { ImportarView } from '@/features/importar';
import { MetasView } from '@/features/metas';
import { MercadoView } from '@/features/mercado';
import { OrcamentoView } from '@/features/orcamento';
import { PatrimonioView } from '@/features/patrimonio';
import { PerfilView } from '@/features/perfil';
import { RateioView } from '@/features/rateio';
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
import { detachCloud } from '@/lib/sync';
import { currentMonthKey } from '@/lib/dates';
import { ADD_KIND_BY_TAB, TOOLS, isTab, type TabId, type ToolId, type ViewId } from '@/lib/nav';
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

/**
 * O tema vive no atributo do <html>, escrito antes do primeiro paint pelo
 * script do layout. O React lê de lá em vez de guardar uma cópia — uma fonte
 * da verdade só, sem piscar na hidratação.
 */
const themeListeners = new Set<() => void>();
const readIsLight = () => document.documentElement.getAttribute('data-theme') === 'light';
const subscribeTheme = (fn: () => void) => {
  themeListeners.add(fn);
  return () => {
    themeListeners.delete(fn);
  };
};

/** ferramentas que já têm tela própria; o resto ainda cai no aviso de obra */
const BUILT = new Set<ViewId>(['news', 'importar', 'cartoes', 'assinaturas', 'metas', 'dividas', 'rateio', 'orcamento', 'comprovantes', 'patrimonio', 'busca', 'perfil', 'ia']);

export default function AppPage() {
  const { spaceId, ready, error } = useBootstrap();
  const [view, setView] = React.useState<ViewId>('inicio');
  const [lastTab, setLastTab] = React.useState<TabId>('inicio');
  const [month, setMonth] = React.useState<MonthKey>(currentMonthKey());
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [signInOpen, setSignInOpen] = React.useState(false);

  const { session } = useSession();
  const cloud = useCloudSync(session);
  const authError = useAuthRedirectError();

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

  const isLight = React.useSyncExternalStore(subscribeTheme, readIsLight, () => false);

  const toggleTheme = React.useCallback(() => {
    const root = document.documentElement;
    const wasLight = root.getAttribute('data-theme') === 'light';
    try {
      if (wasLight) {
        root.removeAttribute('data-theme');
        localStorage.removeItem(THEME_KEY);
      } else {
        root.setAttribute('data-theme', 'light');
        localStorage.setItem(THEME_KEY, 'light');
      }
    } catch {
      // armazenamento bloqueado: o tema vale só nesta sessão
      if (wasLight) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
    }
    for (const notify of themeListeners) notify();
  }, []);

  /** ferramentas desligadas somem do menu e das telas */
  const hiddenTools = React.useMemo(() => {
    const off: ToolId[] = [];
    if (settings && !settings.cardsEnabled) off.push('cartoes');
    if (settings && !settings.newsEnabled) off.push('news');
    return off;
  }, [settings]);

  /** o nome do perfil, quando preenchido; senão o app trata por "você" */
  const displayName = settings?.displayName.trim() || 'você';

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
    spaceId,
    month,
    setMonth,
    summary: monthView.summary,
    occurrences: monthView.occurrences,
    projection: monthView.projection,
    categories,
    hidden,
    newsEnabled: settings?.newsEnabled ?? true,
    cardsEnabled: settings?.cardsEnabled ?? true,
    toggleHidden,
    onToggleOccurrence,
    history,
    onImport: () => go('importar'),
  };

  return (
    <div className="min-h-dvh">
      <TopBar
        view={view}
        name={displayName}
        onOpenMenu={() => setDrawerOpen(true)}
        onOpenProfile={() => go('perfil')}
        onOpenIA={() => go('ia')}
        onOpenSearch={() => go('busca')}
        onBack={() => go(lastTab)}
      />

      <main
        className="col pt-1"
        style={{ paddingBottom: 'calc(var(--tabbar-h) + var(--sa-bottom) + 64px)' }}
      >
        {authError.message && (
          <div className="mb-3 mt-2 rounded-card border border-out/30 bg-out-soft px-4 py-3">
            <p className="text-[13px] leading-relaxed text-ink">{authError.message}</p>
            <button
              type="button"
              onClick={() => {
                authError.dismiss();
                setSignInOpen(true);
              }}
              className="mt-2 text-[13px] font-medium text-accent underline-offset-2 hover:underline"
            >
              Pedir um novo link
            </button>
          </div>
        )}

        {isTab(view) && <MonthStrip month={month} onChange={setMonth} />}

        <div key={view} className="motion-safe:animate-[rise-in_var(--t-base)_var(--ease-out)]">
          {view === 'inicio' && <InicioView {...ctx} />}
          {view === 'receitas' && <ReceitasView {...ctx} />}
          {view === 'despesas' && <DespesasView {...ctx} />}
          {view === 'investimentos' && <InvestimentosView {...ctx} />}
          {view === 'news' && <MercadoView />}
          {view === 'importar' && (
            <ImportarView
              spaceId={spaceId}
              categories={categories}
              hidden={hidden}
              onOpenMonth={(m) => {
                setMonth(m);
                go('inicio');
              }}
            />
          )}
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
          {view === 'rateio' && <RateioView spaceId={spaceId} hidden={hidden} />}
          {view === 'orcamento' && <OrcamentoView spaceId={spaceId} hidden={hidden} />}
          {view === 'comprovantes' && <ComprovantesView spaceId={spaceId} />}
          {view === 'patrimonio' && (
            <PatrimonioView spaceId={spaceId} month={month} hidden={hidden} />
          )}
          {view === 'ia' && (
            <IAView
              name={displayName}
              month={month}
              summary={monthView.summary}
              occurrences={monthView.occurrences}
              projection={monthView.projection}
              history={history}
              categories={categories}
              spaceId={spaceId}
            />
          )}
          {view === 'busca' && (
            <BuscaView spaceId={spaceId} month={month} hidden={hidden} onGo={go} />
          )}
          {view === 'perfil' && (
            <PerfilView
              settings={settings}
              onToggleTheme={toggleTheme}
              isLight={isLight}
              account={
                <AccountPanel
                  session={session}
                  report={cloud.report}
                  pending={cloud.pending}
                  syncing={cloud.syncing}
                  onSync={cloud.sync}
                  onSignIn={() => setSignInOpen(true)}
                  onSignOut={async () => {
                    await detachCloud();
                    location.reload();
                  }}
                />
              }
            />
          )}
          {!isTab(view) && !BUILT.has(view) && <ToolScreen view={view} />}
        </div>
      </main>

      <TabBar view={view} onChange={go} onAdd={() => setSheetOpen(true)} />

      <Drawer
        open={drawerOpen}
        view={view}
        name={displayName}
        hiddenTools={hiddenTools}
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

      <SignInSheet
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        onSignedIn={cloud.sync}
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
