'use client';

import * as React from 'react';
import { Download, Share, SquarePlus, WifiOff, Zap } from 'lucide-react';
import { Button, Sheet, toast } from '@/components/ui';

/**
 * O FinanceOS instalado.
 *
 * Três peças: o service worker, que deixa o app abrir sem internet (os dados
 * já moram no aparelho, faltava só a casca); o aviso de versão nova; e o
 * convite para instalar — o botão nativo onde ele existe, o passo a passo no
 * iPhone, onde não existe.
 */

/* ------------------------------------------------------ convite de instalação */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * O evento de instalação chega uma vez só, às vezes antes de qualquer tela
 * montar. Por isso é guardado aqui, fora do React, desde o carregamento.
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emitInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    emitInstall();
  });
}

const subscribeInstall = (fn: () => void) => {
  installListeners.add(fn);
  return () => {
    installListeners.delete(fn);
  };
};

function isStandalone(): boolean {
  return (
    installedNow ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

type InstallState = 'installed' | 'prompt' | 'ios' | 'manual';

const readInstall = (): InstallState =>
  isStandalone() ? 'installed' : deferred ? 'prompt' : isIos() ? 'ios' : 'manual';

export function useInstallState(): InstallState {
  return React.useSyncExternalStore(subscribeInstall, readInstall, () => 'installed' as const);
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useInstallState();

  async function install() {
    if (!deferred) return;
    const event = deferred;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null;
    emitInstall();
    if (outcome === 'accepted') {
      toast('FinanceOS instalado. Ele já está na sua tela de início.');
      onClose();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Instalar o FinanceOS"
      description="Fica na tela de início como um aplicativo, sem loja e sem ocupar espaço."
      footer={
        state === 'prompt' ? (
          <Button variant="primary" size="lg" className="w-full" onClick={() => void install()}>
            <Download size={17} /> Instalar agora
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={onClose}>
            Entendi
          </Button>
        )
      }
    >
      <ul className="grid gap-3">
        <Benefit icon={<Zap size={16} />} title="Abre em tela cheia">
          Sem barra do navegador, direto no seu mês. Segure o ícone para registrar um gasto ou importar um extrato.
        </Benefit>
        <Benefit icon={<WifiOff size={16} />} title="Funciona sem internet">
          Seus lançamentos já ficam no aparelho. Sem conexão, só as notícias e as cotações esperam.
        </Benefit>
      </ul>

      {state === 'installed' ? (
        <p className="mt-5 rounded-field bg-in-soft px-4 py-3 text-[14px] text-ink">Você já está usando o app instalado.</p>
      ) : state === 'ios' ? (
        <ol className="mt-5 grid gap-2.5 rounded-card border border-line bg-surface-2 p-4 text-[14px] leading-relaxed text-ink">
          <li className="flex items-start gap-3">
            <Step n={1} />
            <span>
              No Safari, toque em <strong className="font-semibold">Compartilhar</strong>{' '}
              <Share size={15} className="inline align-[-2px] text-accent" aria-label="(ícone de compartilhar)" />
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Step n={2} />
            <span>
              Escolha <strong className="font-semibold">Adicionar à Tela de Início</strong>{' '}
              <SquarePlus size={15} className="inline align-[-2px] text-accent" aria-hidden />
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Step n={3} />
            <span>Toque em <strong className="font-semibold">Adicionar</strong>. Pronto.</span>
          </li>
        </ol>
      ) : state === 'manual' ? (
        <p className="mt-5 rounded-card border border-line bg-surface-2 p-4 text-[14px] leading-relaxed text-ink-2">
          No menu do navegador, procure <strong className="font-semibold text-ink">Instalar app</strong> ou{' '}
          <strong className="font-semibold text-ink">Adicionar à tela inicial</strong>. No Chrome e no Edge do computador, o
          botão também aparece na barra de endereço.
        </p>
      ) : null}
    </Sheet>
  );
}

function Benefit({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
        {icon}
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-[13px] leading-relaxed text-ink-3">{children}</span>
      </span>
    </li>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-semibold text-accent-ink" aria-hidden>
      {n}
    </span>
  );
}

/* ----------------------------------------------------------- service worker */

/**
 * Registra o service worker em produção e cuida das versões.
 *
 * Em desenvolvimento ele ficaria no caminho do recarregamento automático, então
 * só existe no build. Quando uma versão nova do worker termina de instalar, a
 * pessoa decide a hora de trocar — recarregar no meio de um lançamento
 * perderia o que ela estava digitando.
 *
 * `warm` recebe as telas carregadas sob demanda: com o worker ativo, baixá-las
 * num momento ocioso deixa o app inteiro disponível sem internet.
 */
export function useServiceWorker(warm?: () => Promise<unknown> | void) {
  const warmRef = React.useRef(warm);
  React.useEffect(() => {
    warmRef.current = warm;
  });

  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    let reloading = false;
    let offered = false;
    let registration: ServiceWorkerRegistration | null = null;

    const offer = (worker: ServiceWorker) => {
      if (offered) return;
      offered = true;
      toast('Uma versão nova do FinanceOS está pronta.', {
        tone: 'info',
        duration: 0,
        action: {
          label: 'Atualizar',
          onClick: () => {
            reloading = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    };

    const onControllerChange = () => {
      if (reloading) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // de volta ao app depois de um tempo: vale conferir se há versão nova
    let lastCheck = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !registration) return;
      if (Date.now() - lastCheck < 30 * 60 * 1000) return;
      lastCheck = Date.now();
      void registration.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const incoming = reg.installing;
          incoming?.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) offer(incoming);
          });
        });
        return navigator.serviceWorker.ready;
      })
      .then((reg) => {
        // o que esta página já baixou antes de o worker assumir entra no cache agora
        const report = () => {
          const origin = window.location.origin;
          const urls = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((u) => u.startsWith(`${origin}/_next/static/`));
          reg.active?.postMessage({ type: 'WARM', urls, page: window.location.pathname });
        };
        report();

        // num momento ocioso, as telas sob demanda; e a lista de novo, que agora inclui
        // o que estava a caminho da primeira vez (o worker pula o que já guardou)
        const later = () => void Promise.resolve(warmRef.current?.()).finally(report);
        // Safari não tem requestIdleCallback
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(later, { timeout: 3000 });
        else setTimeout(later, 2500);
      })
      .catch(() => {
        // sem worker o app segue funcionando; só não abre sem internet
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
