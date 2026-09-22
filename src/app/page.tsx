import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * Porta de entrada. Enquanto a vitrine definitiva não existe, esta página já
 * cumpre o papel que importa no teste: dizer o que é e levar para dentro em um
 * clique, sem cadastro no caminho.
 */
export default function Home() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <main className="w-full max-w-[36rem] text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3">
          {BRAND.name}
        </p>

        <h1 className="mt-4 font-display text-[40px] leading-[1.08] text-ink sm:text-[54px]">
          {BRAND.tagline}
        </h1>

        <p className="mx-auto mt-5 max-w-[30ch] text-[16px] leading-relaxed text-ink-2">
          {BRAND.promise}
        </p>

        <Link
          href="/app"
          className="mt-9 inline-flex h-12 items-center justify-center rounded-field bg-accent px-7 text-[15px] font-medium text-accent-ink transition-[filter,transform] duration-[var(--t-fast)] hover:brightness-110 active:scale-[0.98]"
        >
          Começar agora
        </Link>

        <p className="mt-4 text-[13px] text-ink-3">
          Sem cadastro, sem cartão. Seus dados ficam no seu aparelho.
        </p>

        <ul className="mx-auto mt-14 grid max-w-[30rem] gap-3 text-left">
          {[
            ['Funciona offline', 'Lance no metrô; sincroniza quando voltar o sinal.'],
            ['A categoria se preenche sozinha', 'E aprende quando você corrige.'],
            ['Você vê o mês antes dele acontecer', 'A curva mostra o dia em que o saldo cruza o zero.'],
          ].map(([title, detail]) => (
            <li key={title} className="rounded-card border border-line bg-surface px-4 py-3">
              <p className="text-[14px] font-medium text-ink">{title}</p>
              <p className="text-[13px] text-ink-3">{detail}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
