'use client';

import * as React from 'react';
import { Check, CloudOff, LogOut, RefreshCw } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { Button, Field, Input, Panel, SectionTitle, Sheet } from '@/components/ui';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { getSyncState, pendingCount } from '@/lib/db';
import { adoptLocalSpace, runSync, type SyncReport } from '@/lib/sync';
import { cloudConfigured, supabase } from '@/lib/supabase';

/* ----------------------------------------------------------------- sessão */

/**
 * A sessão da conta, se houver.
 *
 * Sem Supabase configurado, devolve nulo e pronto: o app é local-first e
 * continua inteiro sem nuvem — a tela de conta é que some.
 */
export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = React.useState<Session | null>(null);
  const [ready, setReady] = React.useState(!cloudConfigured());

  React.useEffect(() => {
    const client = supabase();
    if (!client) return;

    let alive = true;

    const run = async () => {
      await Promise.resolve();
      const { data } = await client.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    };
    void run();

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, ready };
}

/* ------------------------------------------------------------------ sync */

/**
 * Mantém o sync rodando enquanto a conta está ligada.
 *
 * Três gatilhos: ao entrar, quando a rede volta, e quando o app volta para a
 * frente. Não há laço de tempo — sincronizar de minuto em minuto gastaria
 * bateria para, quase sempre, não trazer nada.
 */
export function useCloudSync(session: Session | null): {
  report: SyncReport | null;
  pending: number;
  syncing: boolean;
  sync: () => void;
} {
  const [report, setReport] = React.useState<SyncReport | null>(null);
  const [pending, setPending] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const running = React.useRef(false);

  /**
   * Garante o vínculo antes de tentar sincronizar.
   *
   * Nem todo login passa pelo código digitado: Google e link mágico voltam por
   * redirecionamento, e a sessão simplesmente aparece. Amarrar o espaço aqui,
   * olhando o estado em vez do caminho percorrido, faz os três funcionarem —
   * antes, quem entrasse pelo Google ficava autenticado e sem espaço no
   * servidor, e o sync falhava sem dizer por quê.
   */
  const ensureLinked = React.useCallback(async (userId: string) => {
    const state = await getSyncState();
    if (state.userId === userId) return;
    await adoptLocalSpace(userId);
  }, []);

  const sync = React.useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      const client = supabase();
      const user = client ? (await client.auth.getUser()).data.user : null;
      if (user) await ensureLinked(user.id);

      const result = await runSync();
      setReport(result);
      setPending(await pendingCount());
    } catch (err: unknown) {
      setReport({
        phase: 'error',
        pushed: 0,
        pulled: 0,
        error: err instanceof Error ? err.message : 'Falha ao vincular a conta.',
        at: new Date().toISOString(),
      });
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [ensureLinked]);

  React.useEffect(() => {
    if (!session) return;
    let alive = true;

    const kick = () => {
      if (alive) void sync();
    };

    void Promise.resolve().then(kick);

    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };

    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, sync]);

  // a fila cresce a cada gravação da UI; o contador acompanha sem sincronizar
  React.useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      void pendingCount().then(setPending);
    }, 4000);
    return () => clearInterval(id);
  }, [session]);

  return { report, pending, syncing, sync: () => void sync() };
}

/* ------------------------------------------------------------------ erros */

/**
 * O Supabase responde em inglês e em linguagem de servidor.
 *
 * Traduzir importa porque quem lê está tentando entrar na própria conta e não
 * tem como agir sobre "Email logins are disabled". Cada mensagem aqui diz o que
 * fazer, e a original fica no fim quando não reconheço — esconder o motivo real
 * só transformaria um problema resolvível num mistério.
 */
function explainAuthError(raw: string): string {
  const message = raw.toLowerCase();

  if (/email logins are disabled/.test(message)) {
    return 'O login por e-mail está desligado neste projeto. Ligue em Authentication → Providers → Email, no painel do Supabase.';
  }
  if (/signups? not allowed|signup is disabled/.test(message)) {
    return 'Este projeto não está aceitando cadastros novos.';
  }
  if (/provider is not enabled|unsupported provider/.test(message)) {
    return 'Esse jeito de entrar não está ligado no projeto.';
  }
  if (/invalid|expired|otp/.test(message) && /token|code|otp/.test(message)) {
    return 'Código inválido ou já expirado. Peça um novo.';
  }
  if (/rate limit|too many/.test(message)) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  }
  if (/failed to fetch|network|timeout/.test(message)) {
    return 'Não consegui falar com o servidor. Confira a conexão.';
  }

  return raw;
}

/**
 * O erro que o Supabase devolve na própria URL quando o link falha.
 *
 * Ele volta como `#error=access_denied&error_code=otp_expired&...`. Sem ler
 * isso, a pessoa clica no link do e-mail, cai numa tela normal e não faz ideia
 * do que deu errado — foi o que aconteceu na primeira tentativa aqui.
 *
 * A URL é limpa depois de lida: recarregar a página não deve ressuscitar um
 * aviso de um problema que já passou.
 */
export function useAuthRedirectError(): { message: string | null; dismiss: () => void } {
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const run = async () => {
      await Promise.resolve();

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const code = hash.get('error_code') ?? query.get('error_code');
      const description = hash.get('error_description') ?? query.get('error_description');
      if (!code && !description) return;

      setMessage(explainRedirectError(code, description));
      window.history.replaceState(null, '', window.location.pathname);
    };
    void run();
  }, []);

  return { message, dismiss: () => setMessage(null) };
}

function explainRedirectError(code: string | null, description: string | null): string {
  if (code === 'otp_expired' || /expired/i.test(description ?? '')) {
    return 'Esse link já não vale mais. Links de entrada são de uso único e expiram rápido — peça um novo e abra assim que chegar.';
  }
  if (code === 'access_denied') {
    return 'O acesso foi negado. Peça um novo link e abra neste mesmo navegador.';
  }
  return description?.replace(/\+/g, ' ') ?? 'Não consegui completar a entrada.';
}

/* -------------------------------------------------------------- entrada */

type Step = 'email' | 'code';

export function SignInSheet({
  open,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [step, setStep] = React.useState<Step>('email');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showCodeField, setShowCodeField] = React.useState(false);

  async function sendCode() {
    const client = supabase();
    if (!client) return setError('A conta na nuvem não está configurada neste ambiente.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Confira o e-mail.');

    setBusy(true);
    setError(null);
    try {
      const { error: err } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          // o link precisa voltar para /app: é lá que o app roda e consegue
          // trocar o código por sessão. A raiz é só a vitrine, e não tem
          // cliente do Supabase montado para completar a troca.
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });
      if (err) throw new Error(err.message);
      setStep('code');
    } catch (err) {
      setError(explainAuthError(err instanceof Error ? err.message : 'Não consegui enviar o código.'));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const client = supabase();
    if (!client) return;
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setError('O código tem 6 dígitos.');

    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await client.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      });
      if (err) throw new Error(err.message);
      if (data.user) await adoptLocalSpace(data.user.id);
      onSignedIn();
      onClose();
    } catch (err) {
      setError(explainAuthError(err instanceof Error ? err.message : 'Código inválido ou expirado.'));
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    const client = supabase();
    if (!client) return;
    setBusy(true);
    setError(null);
    const { error: err } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (err) {
      setError(explainAuthError(err.message));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Entrar na sua conta"
      footer={
        step === 'email' ? (
          <Button variant="primary" size="lg" className="w-full" onClick={sendCode} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar código por e-mail'}
          </Button>
        ) : (
          <div className="grid gap-2">
            {showCodeField && (
              <Button variant="primary" size="lg" className="w-full" onClick={verify} disabled={busy}>
                {busy ? 'Conferindo…' : 'Entrar com o código'}
              </Button>
            )}
            <Button variant={showCodeField ? 'quiet' : 'ghost'} className="w-full" onClick={sendCode} disabled={busy}>
              {busy ? 'Enviando…' : 'Reenviar e-mail'}
            </Button>
            <Button variant="quiet" className="w-full" onClick={() => setStep('email')}>
              Usar outro e-mail
            </Button>
          </div>
        )
      }
    >
      <div className="grid gap-4">
        <p className="text-[13px] leading-relaxed text-ink-3">
          A conta serve para o {BRAND.name} sincronizar entre os seus aparelhos. Tudo que você já
          lançou aqui vai junto — nada se perde no caminho.
        </p>

        {step === 'email' ? (
          <>
            <Field label="Seu e-mail" htmlFor="auth-email" hint="Enviamos um código de 6 dígitos.">
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="seu@email.com"
              />
            </Field>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[12px] text-ink-3">ou</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            <Button variant="ghost" size="lg" className="w-full" onClick={withGoogle} disabled={busy}>
              <GoogleMark />
              Continuar com Google
            </Button>
          </>
        ) : (
          <div className="grid gap-4">
            <div className="rounded-card border border-accent/30 bg-accent-soft p-4">
              <p className="text-[15px] font-semibold text-ink">Abra o e-mail e clique em entrar</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
                Enviamos para <strong className="font-semibold">{email.trim()}</strong>. Abra{' '}
                <strong className="font-semibold">neste mesmo navegador</strong> — o link só vira
                sessão aqui, onde o pedido começou.
              </p>
            </div>

            {/* o código de 6 dígitos só existe quando o projeto tem SMTP
                próprio e o modelo de e-mail imprime o token; sem isso o
                Supabase manda só o link, e insistir no campo de código
                deixaria a pessoa esperando um número que não vem */}
            {showCodeField ? (
              <Field label="Código de 6 dígitos" htmlFor="auth-code">
                <Input
                  id="auth-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="tnum text-center text-[22px] tracking-[0.4em]"
                  placeholder="000000"
                />
              </Field>
            ) : (
              <button
                type="button"
                onClick={() => setShowCodeField(true)}
                className="text-left text-[13px] text-accent underline-offset-2 hover:underline"
              >
                O e-mail veio com um código de 6 dígitos?
              </button>
            )}
          </div>
        )}

        {error && <p className="text-[13px] text-out">{error}</p>}

        <p className="text-[12px] leading-relaxed text-ink-3">
          Não pedimos senha de banco e não conectamos em conta nenhuma. O que sobe é só o que você
          mesmo lançou.
        </p>
      </div>
    </Sheet>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/* ------------------------------------------------------- bloco da conta */

/** o cartão de conta dentro do perfil */
export function AccountPanel({
  session,
  report,
  pending,
  syncing,
  onSync,
  onSignOut,
  onSignIn,
}: {
  session: Session | null;
  report: SyncReport | null;
  pending: number;
  syncing: boolean;
  onSync: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
}) {
  if (!cloudConfigured()) {
    return (
      <Panel className="px-5 py-4">
        <SectionTitle>Conta</SectionTitle>
        <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-3">
          <CloudOff size={15} className="mt-0.5 shrink-0" />
          Este ambiente não tem a nuvem configurada, então o app roda só neste aparelho. Seus dados
          continuam salvos aqui, e o backup em arquivo funciona normalmente.
        </p>
      </Panel>
    );
  }

  if (!session) {
    return (
      <Panel className="px-5 py-4">
        <SectionTitle>Conta</SectionTitle>
        <p className="text-[13px] leading-relaxed text-ink-3">
          Entrando, o que você lança passa a sincronizar entre os seus aparelhos. Tudo que já está
          aqui sobe junto.
        </p>
        <Button variant="primary" className="mt-3 w-full" onClick={onSignIn}>
          Criar conta ou entrar
        </Button>
      </Panel>
    );
  }

  const state = report?.phase;

  return (
    <Panel className="px-5 py-4">
      <SectionTitle
        action={
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft disabled:opacity-50"
          >
            <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
            {syncing ? 'sincronizando' : 'sincronizar'}
          </button>
        }
      >
        Conta
      </SectionTitle>

      <p className="truncate text-[15px] text-ink">{session.user.email ?? 'Conta conectada'}</p>

      <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
        {state === 'error' ? (
          <span className="text-out">{report?.error}</span>
        ) : state === 'offline' ? (
          <>
            <CloudOff size={12} />
            sem conexão; suas alterações estão guardadas
          </>
        ) : pending > 0 ? (
          <>
            <RefreshCw size={12} />
            {pending} {pending === 1 ? 'alteração' : 'alterações'} esperando para subir
          </>
        ) : (
          <>
            <Check size={12} className="text-in" />
            tudo sincronizado
            {report && report.pulled > 0 ? ` · ${report.pulled} vindas de outro aparelho` : ''}
          </>
        )}
      </p>

      <Button variant="ghost" className="mt-3 w-full" onClick={onSignOut}>
        <LogOut size={15} />
        Sair da conta
      </Button>

      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
        Sair não apaga nada deste aparelho.
      </p>
    </Panel>
  );
}

/** o estado do espaço local, para telas que precisam saber se há conta */
export async function localSpaceId(): Promise<string | null> {
  return (await getSyncState()).spaceId;
}
