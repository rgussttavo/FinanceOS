'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, CreditCard, Eye, EyeOff, Landmark, PiggyBank, ShieldCheck, Target, Wallet } from 'lucide-react';
import { BrandMark } from '@/components/shell';
import { PuzzlePiece } from '@/components/pieces';
import { Button, Field, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { cloudConfigured, enabledProviders, supabase } from '@/lib/supabase';
import { GoogleMark, explainAuthError, explainRedirectError } from './auth';

/**
 * A porta de entrada: entrar, criar conta, recuperar e trocar a senha.
 *
 * O Google vem primeiro — é o caminho com menos atrito, sem senha nova para
 * lembrar. E-mail e senha ficam logo abaixo, à vista, e "continuar sem conta"
 * fecha a tela: a conta é opcional, porque o app funciona inteiro no
 * aparelho e a conta existe para sincronizar.
 *
 * O visual é o da landing (as mesmas peças, a mesma tipografia), para a
 * pessoa sentir que atravessou uma porta, e não que caiu em outro produto.
 */

export type AuthMode = 'entrar' | 'cadastro' | 'recuperar' | 'nova-senha';

const COPY: Record<AuthMode, { title: string; subtitle: string; submit: string; busy: string }> = {
  entrar: {
    title: 'Seu dinheiro começa a fazer sentido aqui.',
    subtitle: 'Sem complicação. Entre e continue de onde parou.',
    submit: 'Entrar',
    busy: 'Entrando…',
  },
  cadastro: {
    title: 'Comece a organizar sua vida financeira.',
    subtitle: 'Leva menos de um minuto. Depois, a gente entende o seu momento.',
    submit: 'Criar conta',
    busy: 'Criando conta…',
  },
  recuperar: {
    title: 'Recuperar a senha',
    subtitle: 'Digite seu e-mail e enviaremos as instruções.',
    submit: 'Enviar instruções',
    busy: 'Enviando…',
  },
  'nova-senha': {
    title: 'Crie uma nova senha',
    subtitle: 'Use pelo menos 8 caracteres. Depois, é só continuar.',
    submit: 'Salvar nova senha',
    busy: 'Salvando…',
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

interface Errors {
  name?: string;
  email?: string;
  password?: string;
  form?: string;
  /** o erro da conta que não existe oferece criar; o da conta que já existe, entrar */
  offer?: 'cadastro' | 'entrar';
}


export function GoogleButton({ onClick, busy, label = 'Continuar com Google' }: { onClick: () => void; busy: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        // branco com a marca do Google, como a própria marca pede — o botão mais evidente da tela
        'flex h-12 w-full items-center justify-center gap-3 rounded-field border border-line-strong bg-white px-4',
        'text-[15px] font-semibold text-[#1f1f1f] shadow-e1',
        'transition-[box-shadow,transform] duration-[var(--t-fast)] hover:shadow-e2 active:scale-[0.99]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60',
      )}
    >
      <GoogleMark />
      {busy ? 'Abrindo o Google…' : label}
    </button>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <Field label={label} htmlFor={id} error={error ?? null} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Esconder a senha' : 'Mostrar a senha'}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-field text-ink-3 hover:text-ink"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </Field>
  );
}

/** as peças em volta do cartão: a mesma linguagem da landing, só no desktop */
function AuthBackdrop() {
  const pieces = [
    { icon: Wallet, label: 'Saldo', value: 'R$ 4.200', tone: 'accent' as const, pos: 'left-[6%] top-[14%]' },
    { icon: CreditCard, label: 'Fatura', value: '−R$ 980', tone: 'out' as const, pos: 'left-[10%] top-[48%]' },
    { icon: CalendarClock, label: 'Disponível', value: 'R$ 500', tone: 'in' as const, pos: 'left-[4%] bottom-[14%]' },
    { icon: Target, label: 'Meta', value: '62%', tone: 'inv' as const, pos: 'right-[6%] top-[16%]' },
    { icon: PiggyBank, label: 'Reserva', value: '1,4 mês', tone: 'warn' as const, pos: 'right-[9%] top-[50%]' },
    { icon: Landmark, label: 'Patrimônio', value: '↑ R$ 2.300', tone: 'neutral' as const, pos: 'right-[5%] bottom-[12%]' },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
      {pieces.map((p, i) => (
        <PuzzlePiece
          key={p.label}
          icon={p.icon}
          label={p.label}
          value={p.value}
          tone={p.tone}
          className={cn('float absolute w-[180px] opacity-60', p.pos)}
          style={{ animationDelay: `${i * -1.1}s` }}
        />
      ))}
    </div>
  );
}

export function AuthScreen() {
  const router = useRouter();
  /** a entrada terminou: o app assume, sem recarregar a página */
  const openApp = React.useCallback(() => router.replace('/app'), [router]);
  const [mode, setMode] = React.useState<AuthMode>('entrar');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState<'google' | 'form' | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [available, setAvailable] = React.useState(true);
  const recovering = React.useRef(false);

  // o modo e o erro que voltaram na URL (Google cancelado, link vencido); a URL fica limpa depois
  React.useEffect(() => {
    const run = async () => {
      await Promise.resolve();
      if (!cloudConfigured()) {
        setAvailable(false);
        return;
      }
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const asked = query.get('modo');
      if (asked === 'cadastro' || asked === 'recuperar' || asked === 'nova-senha') setMode(asked);
      if (asked === 'nova-senha') recovering.current = true;
      const code = hash.get('error_code') ?? query.get('error_code') ?? query.get('error');
      const description = hash.get('error_description') ?? query.get('error_description');
      if (code || description) {
        setErrors({ form: explainRedirectError(code, description) });
        window.history.replaceState(null, '', window.location.pathname + (asked ? `?modo=${asked}` : ''));
      }
    };
    void run();
  }, []);

  // a sessão que chega (Google, cadastro, recuperação) decide o próximo passo
  React.useEffect(() => {
    const client = supabase();
    if (!client) return;
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering.current = true;
        setMode('nova-senha');
        return;
      }
      if (session && event === 'SIGNED_IN' && !recovering.current) openApp();
    });
    void client.auth.getSession().then(({ data }) => {
      if (data.session && !recovering.current) openApp();
    });
    return () => sub.subscription.unsubscribe();
  }, [openApp]);

  function switchTo(next: AuthMode) {
    setMode(next);
    setErrors({});
    setNotice(null);
    setPassword('');
    window.history.replaceState(null, '', next === 'entrar' ? '/entrar' : `/entrar?modo=${next}`);
  }

  async function withGoogle() {
    const client = supabase();
    if (!client) return;
    setBusy('google');
    setErrors({});
    const providers = await enabledProviders();
    if (providers && !providers.google) {
      console.warn('[auth] o provedor Google está desligado no Supabase');
      setErrors({ form: 'O login com Google ainda não está disponível. Use e-mail e senha.' });
      setBusy(null);
      return;
    }
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      // volta para cá: cancelamento e erro aparecem nesta tela; com sessão, segue para o app
      options: { redirectTo: `${window.location.origin}/entrar`, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      setErrors({ form: explainAuthError(error.message) });
      setBusy(null);
    }
  }

  function validate(): Errors {
    const next: Errors = {};
    if (mode !== 'nova-senha' && !EMAIL.test(email.trim())) next.email = 'Digite um e-mail válido, como nome@email.com.';
    if (mode === 'entrar' && !password) next.password = 'Digite a sua senha.';
    if ((mode === 'cadastro' || mode === 'nova-senha') && password.length < MIN_PASSWORD) next.password = `Use pelo menos ${MIN_PASSWORD} caracteres.`;
    return next;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const client = supabase();
    if (!client) return;
    const found = validate();
    setErrors(found);
    setNotice(null);
    if (Object.keys(found).length) return;
    setBusy('form');
    try {
      if (mode === 'entrar') {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          const message = explainAuthError(error.message);
          setErrors({ form: message, offer: message.startsWith('E-mail ou senha') ? 'cadastro' : undefined });
          return;
        }
        openApp();
      } else if (mode === 'cadastro') {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() || undefined }, emailRedirectTo: `${window.location.origin}/entrar` },
        });
        if (error) {
          const message = explainAuthError(error.message);
          setErrors({ form: message, offer: message.startsWith('Esse e-mail já tem') ? 'entrar' : undefined });
          return;
        }
        if (data.session) openApp();
        else setNotice(`Enviamos um link de confirmação para ${email.trim()}. Abra neste mesmo navegador para entrar.`);
      } else if (mode === 'recuperar') {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/entrar?modo=nova-senha`,
        });
        // a resposta é a mesma exista ou não a conta: a tela não revela quem tem cadastro
        if (error && /network|fetch|rate/i.test(error.message)) setErrors({ form: explainAuthError(error.message) });
        else setNotice('Se existir uma conta com esse e-mail, enviaremos as instruções. Confira também a caixa de spam.');
      } else {
        const { error } = await client.auth.updateUser({ password });
        if (error) {
          setErrors({ form: explainAuthError(error.message) });
          return;
        }
        recovering.current = false;
        setNotice('Senha trocada. Abrindo o app…');
        openApp();
      }
    } catch (err) {
      setErrors({ form: explainAuthError(err instanceof Error ? err.message : '') });
    } finally {
      setBusy(null);
    }
  }

  const copy = COPY[mode];
  const social = mode === 'entrar' || mode === 'cadastro';

  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas">
      <AuthBackdrop />
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-5 pb-[calc(var(--sa-bottom)+24px)] pt-[calc(var(--sa-top)+24px)]">
        <Link href="/" className="mb-7 flex items-center gap-2.5 self-start rounded-field focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          <BrandMark size={30} />
          <span className="font-display text-[20px] text-ink">FinanceOS</span>
        </Link>

        <section
          aria-labelledby="auth-title"
          className="rounded-panel border border-line bg-surface p-6 shadow-e2 motion-safe:animate-[rise-in_var(--t-slow)_var(--ease-out)] sm:p-8"
        >
          {mode === 'recuperar' || mode === 'nova-senha' ? (
            <button type="button" onClick={() => switchTo('entrar')} className="-ml-1 mb-3 flex h-8 items-center gap-1 rounded-field px-1 text-[13px] font-medium text-ink-3 hover:text-ink">
              <ArrowLeft size={15} /> Voltar para entrar
            </button>
          ) : null}
          <h1 id="auth-title" className="font-display text-[30px] leading-[1.1] text-ink sm:text-[32px]">
            {copy.title}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{copy.subtitle}</p>

          {!available ? (
            <p className="mt-6 text-[14px] leading-relaxed text-ink-2">
              A conta não está disponível neste ambiente. Você pode usar o FinanceOS normalmente: os dados ficam guardados neste aparelho.
            </p>
          ) : (
            <>
              {social ? (
                <>
                  <div className="mt-6">
                    <GoogleButton onClick={() => void withGoogle()} busy={busy === 'google'} />
                  </div>
                  <div className="my-5 flex items-center gap-3" aria-hidden>
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[12px] text-ink-3">ou use seu e-mail</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                </>
              ) : (
                <div className="mt-6" />
              )}

              <form noValidate onSubmit={submit} className="grid gap-4">
                {mode === 'cadastro' ? (
                  <Field label="Nome" htmlFor="auth-name" hint="Opcional. Aparece na saudação.">
                    <Input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
                  </Field>
                ) : null}
                {mode !== 'nova-senha' ? (
                  <Field label="E-mail" htmlFor="auth-email" error={errors.email ?? null}>
                    <Input
                      id="auth-email"
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="nome@email.com"
                    />
                  </Field>
                ) : null}
                {mode !== 'recuperar' ? (
                  <PasswordField
                    id="auth-password"
                    label={mode === 'nova-senha' ? 'Nova senha' : 'Senha'}
                    value={password}
                    onChange={setPassword}
                    error={errors.password}
                    hint={mode === 'entrar' ? undefined : `Pelo menos ${MIN_PASSWORD} caracteres.`}
                    autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
                  />
                ) : null}

                <div aria-live="polite" className="empty:hidden">
                  {errors.form ? (
                    <p className="rounded-card border border-out/30 bg-out-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
                      {errors.form}
                      {errors.offer === 'cadastro' ? (
                        <>
                          {' '}
                          <button type="button" onClick={() => switchTo('cadastro')} className="font-semibold text-accent underline-offset-2 hover:underline">
                            Ainda não tem conta? Criar agora
                          </button>
                        </>
                      ) : errors.offer === 'entrar' ? (
                        <>
                          {' '}
                          <button type="button" onClick={() => switchTo('entrar')} className="font-semibold text-accent underline-offset-2 hover:underline">
                            Entrar com esse e-mail
                          </button>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {notice ? <p className="rounded-card border border-in/30 bg-in-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">{notice}</p> : null}
                </div>

                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy !== null}>
                  {busy === 'form' ? copy.busy : copy.submit}
                </Button>
              </form>

              <div className="mt-5 grid gap-2 text-center text-[14px] text-ink-2">
                {mode === 'entrar' ? (
                  <>
                    <button type="button" onClick={() => switchTo('recuperar')} className="justify-self-center rounded-field px-1 text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                      Esqueci minha senha
                    </button>
                    <p>
                      Não tem conta?{' '}
                      <button type="button" onClick={() => switchTo('cadastro')} className="font-semibold text-accent underline-offset-2 hover:underline">
                        Criar conta
                      </button>
                    </p>
                  </>
                ) : mode === 'cadastro' ? (
                  <p>
                    Já tem conta?{' '}
                    <button type="button" onClick={() => switchTo('entrar')} className="font-semibold text-accent underline-offset-2 hover:underline">
                      Entrar
                    </button>
                  </p>
                ) : null}
              </div>
            </>
          )}
        </section>

        <div className="mt-6 grid gap-2 text-center">
          <Link href="/app" className="justify-self-center rounded-field px-2 py-1 text-[14px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
            Continuar sem conta
          </Link>
          <p className="text-center text-[12px] leading-relaxed text-ink-3">
            <ShieldCheck size={13} className="-mt-0.5 mr-1.5 inline text-in" aria-hidden />
            Sem conta, tudo fica neste aparelho. A conta serve para sincronizar entre os seus aparelhos.
          </p>
        </div>
      </main>
    </div>
  );
}
