import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * Conferência de telas, só em desenvolvimento.
 *
 * Mostra uma rota do app em molduras com a largura real de cada aparelho
 * (as media queries valem de verdade dentro da moldura). Em produção, não
 * existe: devolve 404, e o cabeçalho X-Frame-Options volta a DENY.
 *
 * Uso: /dev/telas?p=/entrar&t=390x844,768x1024
 */

export const metadata: Metadata = { title: 'Telas (dev)', robots: { index: false, follow: false } };

const DEFAULT_SIZES = ['390x844', '375x667', '768x1024'];

export default async function DevTelas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  const path = params.p && params.p.startsWith('/') ? params.p : '/';
  const sizes = (params.t ?? DEFAULT_SIZES.join(','))
    .split(',')
    .map((s) => s.split('x').map(Number))
    .filter(([w, h]) => w > 0 && h > 0);
  const scale = Number(params.s ?? '0.62');

  return (
    <main style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: 24, alignItems: 'flex-start', background: '#1a1a1d', minHeight: '100vh' }}>
      {sizes.map(([w, h]) => (
        <figure key={`${w}x${h}`} style={{ margin: 0 }}>
          <figcaption style={{ color: '#aaa', font: '12px system-ui', marginBottom: 6 }}>
            {w}×{h} · {path}
          </figcaption>
          <div style={{ width: w * scale, height: h * scale, overflow: 'hidden', borderRadius: 12, border: '1px solid #333' }}>
            <iframe
              title={`${path} em ${w}×${h}`}
              src={path}
              width={w}
              height={h}
              style={{ border: 0, transform: `scale(${scale})`, transformOrigin: '0 0' }}
            />
          </div>
        </figure>
      ))}
    </main>
  );
}
