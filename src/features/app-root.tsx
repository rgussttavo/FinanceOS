'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Cloud, CloudOff, Eye, EyeOff, FlaskConical } from 'lucide-react';
import { EntrySheet } from '@/components/entry-sheet';
import { QuickAddSheet, type QuickAddRequest } from '@/components/quick-add';
import { BottomNav, Fab, PageHeader, Sidebar, TopBar, greetingFor, navigate, useRoute } from '@/components/shell';
import { ConfirmHost, IconButton, SkeletonList, Toaster, toast } from '@/components/ui';
import { AccountPanel, SignInSheet, useAuthRedirectError, useCloudSync, useSession } from '@/features/auth';
import { BRAND } from '@/lib/brand';
import type { FlowItem } from '@/lib/cashflow';
import { DEMO_DB, db, putRecord, selectDatabase } from '@/lib/db';
import { currentMonthKey } from '@/lib/dates';
import type { MovFilter, SubId, ViewId } from '@/lib/nav';
import type { Occurrence } from '@/lib/occurrences';
import { useCash, useFinanceBase, useHistory, useMonthPicture } from '@/lib/picture';
import { toggleSettled, useBootstrap, useCategories, useSettings } from '@/lib/store';
import { detachCloud } from '@/lib/sync';
import type { MonthKey } from '@/lib/types';
import { AssinaturasView } from './assinaturas';
import { CalendarioView } from './calendario';
import { CartoesView } from './cartoes';
import { CategoriasView } from './categorias';
import { DividasView } from './dividas';
import { MaisView, PlanejamentoView } from './hubs';
import { InicioView } from './inicio';
import { MetasView } from './metas';
import { MovimentosView } from './movimentos';
import { PatrimonioView } from './patrimonio';
import { PerfilView } from './perfil';
import type { ViewContext } from './views';

/* telas de uso eventual descem só quando abertas */
const ViewLoading = () => (
  <div className="pt-4">
    <SkeletonList rows={5} />
  </div>
);
const IAView = dynamic(() => import('./ia').then((m) => m.IAView), { loading: ViewLoading });
const RateioView = dynamic(() => import('./rateio').then((m) => m.RateioView), { loading: ViewLoading });
const OrcamentoView = dynamic(() => import('./orcamento').then((m) => m.OrcamentoView), { loading: ViewLoading });
const ComprovantesView = dynamic(() => import('./comprovantes').then((m) => m.ComprovantesView), { loading: ViewLoading });
const MercadoView = dynamic(() => import('./mercado').then((m) => m.MercadoView), { loading: ViewLoading });
const ImportarView = dynamic(() => import('./importar').then((m) => m.ImportarView), { loading: ViewLoading });
const BuscaView = dynamic(() => import('./busca').then((m) => m.BuscaView), { loading: ViewLoading });
const SimuladoresView = dynamic(() => import('./hubs').then((m) => m.SimuladoresView), { loading: ViewLoading });

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

export function applyTheme(choice: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  const light = choice === 'light' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  if (light) root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  try {
    if (choice === 'dark') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // armazenamento bloqueado: o tema vale só nesta sessão
  }
  for (const notify of themeListeners) notify();
}

/**
 * O app inteiro depois do login — ou sem login nenhum.
 *
 * `demo` troca a base local por uma de exemplo, desliga a nuvem e põe o aviso
 * de demonstração no topo. Todo o resto é o mesmo app, para o exemplo mostrar
 * exatamente o que a pessoa vai ter.
 */
export function AppRoot({ demo = false }: { demo?: boolean }) {
  // a base certa é escolhida antes de qualquer leitura, na primeira renderização
  React.useState(() => {
    selectDatabase(demo ? DEMO_DB : 'norte');
    return null;
  });

  const { spaceId, ready, error } = useBootstrap(demo);
  const { route, go, back } = useRoute();
  const [month, setMonth] = React.useState<MonthKey>(currentMonthKey());
  const [quick, setQuick] = React.useState<QuickAddRequest | null>(null);
  const [openOccurrence, setOpenOccurrence] = React.useState<Occurrence | null>(null);
  const [signInOpen, setSignInOpen] = React.useState(false);

  const { session: realSession } = useSession();
  const session = demo ? null : realSession;
  const cloud = useCloudSync(session);
  const authError = useAuthRedirectError();

  const categories = useCategories(spaceId);
  const settings = useSettings(spaceId);
  const base = useFinanceBase(spaceId, month);
  const picture = useMonthPicture(base, month);
  const history = useHistory(base, month, 6);
  const current = currentMonthKey();
  const todayPicture = useMonthPicture(base, current);
  const todayHistory = useHistory(base, current, 4);
  const cardsEnabled = settings?.cardsEnabled ?? true;
  const cash = useCash(base, cardsEnabled);

  const hidden = settings?.privateMode ?? false;
  const displayName = settings?.displayName.trim() || 'você';

  const toggleHidden = React.useCallback(async () => {
    if (!settings) return;
    await putRecord('settings', { ...settings, privateMode: !settings.privateMode });
  }, [settings]);

  const isLight = React.useSyncExternalStore(subscribeTheme, readIsLight, () => false);
  const toggleTheme = React.useCallback(() => applyTheme(isLight ? 'dark' : 'light'), [isLight]);

  const openQuick = React.useCallback((request: QuickAddRequest = {}) => setQuick(request), []);

  const onToggleOccurrence = React.useCallback(
    async (o: Occurrence) => {
      if (o.virtual) {
        go(o.virtual === 'subscription' ? 'assinaturas' : 'dividas');
        return;
      }
      const entry = await db().entries.get(o.entryId);
      if (!entry) return;
      const wasSettled = Boolean(entry.settled[o.key]);
      await toggleSettled(entry, o.key);
      toast(wasSettled ? 'Baixa desfeita.' : `${o.description} marcado como ${o.kind === 'in' ? 'recebido' : 'pago'}.`, {
        action: { label: 'Desfazer', onClick: () => void putRecord('entries', entry) },
      });
    },
    [go],
  );

  const onOpenOccurrence = React.useCallback(
    (o: Occurrence) => {
      if (o.virtual) go(o.virtual === 'subscription' ? 'assinaturas' : 'dividas');
      else setOpenOccurrence(o);
    },
    [go],
  );

  const onOpenFlow = React.useCallback(
    (item: FlowItem) => {
      if (item.source === 'invoice') return go('cartoes');
      if (item.source === 'subscription') return go('assinaturas');
      if (item.source === 'debt') return go('dividas');
      setOpenOccurrence({
        entryId: item.entryId!,
        key: item.occurrenceKey!,
        date: item.date,
        kind: item.kind,
        description: item.label,
        amount: item.amount,
        categoryId: item.categoryId,
        accountId: null,
        cardId: item.cardId ?? null,
        settlement: item.settled ? { at: item.date } : null,
        installment: item.installment ?? null,
        overdue: item.overdue,
      });
    },
    [go],
  );

  // atalho do sistema e do ícone instalado: /app#novo abre o registro rápido
  React.useEffect(() => {
    if (!ready || window.location.hash !== '#novo') return;
    navigate({ view: 'inicio' }, { replace: true });
    const id = requestAnimationFrame(() => setQuick({}));
    return () => cancelAnimationFrame(id);
  }, [ready]);

  // "novo" na URL é um pedido de uma vez: a tela abre a folha e o endereço volta ao normal
  React.useEffect(() => {
    if (route.param === 'novo') navigate({ view: route.view }, { replace: true });
  }, [route]);

  // teclado: "/" busca, "n" registra — fora de campos de texto
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        go('busca');
      } else if (e.key === 'n') {
        e.preventDefault();
        setQuick({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const hiddenViews = React.useMemo(() => {
    const off: SubId[] = [];
    if (settings && !settings.cardsEnabled) off.push('cartoes');
    if (settings && !settings.newsEnabled) off.push('news');
    return off;
  }, [settings]);

  if (!ready) return <BootScreen message={demo ? 'Montando o exemplo…' : 'Abrindo…'} />;

  if (error || !spaceId) {
    return (
      <BootScreen
        message="Não consegui abrir a base local"
        detail={`O ${BRAND.name} guarda os dados no seu aparelho. Em janela anônima, ou com o armazenamento do navegador bloqueado, ele não tem onde começar.`}
      />
    );
  }

  const view: ViewId = hiddenViews.includes(route.view as SubId) ? 'inicio' : route.view;
  const startNew = route.param === 'novo';

  const ctx: ViewContext = {
    spaceId,
    month,
    setMonth,
    summary: picture.summary,
    occurrences: picture.occurrences,
    categories,
    hidden,
    cardsEnabled,
    toggleHidden,
    onToggleOccurrence,
    onOpenOccurrence,
    history,
  };

  const syncFooter = demo ? (
    <span className="flex items-center gap-1.5 text-accent">
      <FlaskConical size={13} /> Demonstração
    </span>
  ) : session ? (
    <span className="flex items-center gap-1.5">
      <Cloud size={13} /> {cloud.syncing ? 'Sincronizando…' : cloud.pending ? `${cloud.pending} para subir` : 'Sincronizado'}
    </span>
  ) : (
    <button type="button" onClick={() => setSignInOpen(true)} className="flex items-center gap-1.5 text-left hover:text-ink">
      <CloudOff size={13} /> Só neste aparelho · entrar
    </button>
  );

  let content: React.ReactNode;
  switch (view) {
    case 'inicio':
      content = (
        <InicioView
          spaceId={spaceId}
          base={base}
          cash={cash}
          picture={todayPicture}
          history={todayHistory}
          categories={categories}
          settings={settings}
          hidden={hidden}
          name={displayName}
          onGo={go}
          onQuick={openQuick}
          onOpenFlow={onOpenFlow}
        />
      );
      break;
    case 'movimentos':
      content = (
        <MovimentosView
          ctx={ctx}
          filter={(['tudo', 'entradas', 'saidas', 'investimentos'].includes(route.param ?? '') ? route.param : 'tudo') as MovFilter}
          onFilter={(f) => navigate({ view: 'movimentos', param: f === 'tudo' ? undefined : f }, { replace: true })}
          onQuick={openQuick}
          onGo={go}
        />
      );
      break;
    case 'planejamento':
      content = <PlanejamentoView spaceId={spaceId} base={base} cash={cash} hidden={hidden} cardsEnabled={cardsEnabled} onGo={go} />;
      break;
    case 'patrimonio':
      content = (
        <PatrimonioView spaceId={spaceId} base={base} cashNow={cash.balanceNow} hidden={hidden} cardsEnabled={cardsEnabled} onGo={go} />
      );
      break;
    case 'mais':
      content = <MaisView hiddenViews={hiddenViews} onGo={go} />;
      break;
    case 'calendario':
      content = (
        <CalendarioView base={base} cash={cash} categories={categories} hidden={hidden} cardsEnabled={cardsEnabled} onOpenFlow={onOpenFlow} />
      );
      break;
    case 'cartoes':
      content = <CartoesView spaceId={spaceId} base={base} categories={categories} hidden={hidden} startNew={startNew} />;
      break;
    case 'assinaturas':
      content = <AssinaturasView spaceId={spaceId} base={base} categories={categories} hidden={hidden} startNew={startNew} />;
      break;
    case 'metas':
      content = <MetasView spaceId={spaceId} base={base} categories={categories} hidden={hidden} startNew={startNew} onQuick={openQuick} />;
      break;
    case 'dividas':
      content = <DividasView spaceId={spaceId} base={base} hidden={hidden} startNew={startNew} />;
      break;
    case 'orcamento':
      content = <OrcamentoView spaceId={spaceId} hidden={hidden} />;
      break;
    case 'rateio':
      content = <RateioView spaceId={spaceId} hidden={hidden} />;
      break;
    case 'comprovantes':
      content = <ComprovantesView spaceId={spaceId} />;
      break;
    case 'news':
      content = <MercadoView />;
      break;
    case 'importar':
      content = (
        <ImportarView
          spaceId={spaceId}
          categories={categories}
          hidden={hidden}
          onOpenMonth={(m) => {
            setMonth(m);
            go({ view: 'movimentos' });
          }}
        />
      );
      break;
    case 'simuladores':
      content = <SimuladoresView base={base} month={current} />;
      break;
    case 'busca':
      content = <BuscaView spaceId={spaceId} month={month} hidden={hidden} onGo={go} />;
      break;
    case 'ia':
      content = (
        <IAView
          name={displayName}
          month={current}
          summary={todayPicture.summary}
          occurrences={todayPicture.occurrences}
          projection={todayPicture.projection}
          history={todayHistory}
          categories={categories}
          spaceId={spaceId}
        />
      );
      break;
    case 'categorias':
      content = <CategoriasView spaceId={spaceId} categories={categories} />;
      break;
    case 'ajustes':
      content = (
        <PerfilView
          settings={settings}
          onToggleTheme={toggleTheme}
          isLight={isLight}
          demo={demo}
          onGo={go}
          account={
            demo ? null : (
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
            )
          }
        />
      );
      break;
    default:
      content = null;
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-field focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Pular para o conteúdo
      </a>

      <Sidebar view={view} hiddenViews={hiddenViews} onGo={go} onAdd={() => openQuick()} onToggleTheme={toggleTheme} footer={syncFooter} />

      <div className="lg:pl-[var(--sidebar-w)]">
        {demo ? <DemoBanner /> : null}
        <TopBar
          view={view}
          hidden={hidden}
          onToggleHidden={() => void toggleHidden()}
          onBack={back}
          onGo={go}
          greeting={`${greetingFor()}, ${displayName}`}
        />

        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-[720px] px-4 pb-[calc(var(--nav-h)+var(--sa-bottom)+104px)] outline-none sm:px-6 lg:max-w-[1180px] lg:px-10 lg:pb-16"
        >
          {authError.message ? (
            <div className="mb-3 mt-3 rounded-card border border-out/30 bg-out-soft px-4 py-3">
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
          ) : null}

          {view !== 'inicio' ? (
            <PageHeader
              view={view}
              onBack={back}
              actions={
                <IconButton label={hidden ? 'Mostrar valores' : 'Esconder valores'} onClick={() => void toggleHidden()} active={hidden}>
                  {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
                </IconButton>
              }
            />
          ) : null}

          <div key={view} className="motion-safe:animate-[rise-in_var(--t-base)_var(--ease-out)]">
            {content}
          </div>
        </main>
      </div>

      <BottomNav view={view} onGo={(r) => go(r)} />
      {/* telas com barra de ação própria no pé não levam o botão flutuante por cima */}
      {view === 'importar' || view === 'ia' || view === 'busca' ? null : <Fab onClick={() => openQuick()} />}

      <QuickAddSheet
        open={quick !== null}
        request={quick}
        onClose={() => setQuick(null)}
        spaceId={spaceId}
        categories={categories}
        cards={base.cards}
        goals={base.goals}
        entries={base.entries}
        cardsEnabled={cardsEnabled}
        onGo={go}
      />
      <EntrySheet occurrence={openOccurrence} onClose={() => setOpenOccurrence(null)} categories={categories} cards={base.cards} hidden={hidden} />
      {demo ? null : <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={cloud.sync} />}
      <Toaster />
      <ConfirmHost />
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="border-b border-accent/25 bg-accent-soft">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-[13px] sm:px-6 lg:px-10">
        <p className="flex items-center gap-2 text-ink">
          <FlaskConical size={15} className="text-accent" aria-hidden />
          Você está vendo um exemplo com dados fictícios. Ele recomeça do zero sempre que você entra.
        </p>
        <Link href="/app" className="font-semibold text-accent hover:underline">
          Começar com meus dados →
        </Link>
      </div>
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
