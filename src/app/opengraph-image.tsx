import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/brand';

/**
 * A prévia de quando o link é compartilhado: a marca, a promessa e a conta
 * que o app faz — o saldo que parece folgado e o que sobra de verdade. Gerada
 * no build, com as cores do sistema de design (escuro, latão).
 */

export const alt = `${BRAND.name} — Saiba quanto sobra antes do mês acabar.`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = {
  canvas: '#0b0b0c',
  surface: '#141416',
  surface2: '#1b1b1e',
  line: 'rgba(245, 243, 238, 0.12)',
  ink: '#f5f3ee',
  ink2: '#a5a29a',
  ink3: '#8b877d',
  accent: '#c9a36b',
  accentSoft: 'rgba(201, 163, 107, 0.16)',
  out: '#e8746a',
};

const ROWS = [
  ['Aluguel', '−R$ 1.500,00'],
  ['Cartão', '−R$ 980,00'],
  ['Parcelas', '−R$ 620,00'],
  ['Assinaturas', '−R$ 180,00'],
  ['Contas', '−R$ 420,00'],
] as const;

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: C.canvas, padding: '64px 72px', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 600 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: C.accentSoft,
                border: `1px solid rgba(201,163,107,0.35)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24">
                <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill={C.accent} />
              </svg>
            </div>
            <span style={{ fontSize: 32, fontWeight: 600, color: C.ink }}>{BRAND.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 68, lineHeight: 1.04, color: C.ink, letterSpacing: -1.5 }}>Saiba quanto sobra</span>
            {/* duas palavras lado a lado: o Satori não guarda o espaço entre elementos vizinhos */}
            <span style={{ display: 'flex', gap: 18, fontSize: 68, lineHeight: 1.04, color: C.ink, letterSpacing: -1.5 }}>
              <span style={{ color: C.accent }}>antes</span>
              <span>do mês acabar.</span>
            </span>
            <span style={{ marginTop: 24, fontSize: 26, color: C.ink2 }}>Grátis e sem senha de banco.</span>
          </div>
        </div>

        <div
          style={{
            marginLeft: 'auto',
            alignSelf: 'center',
            width: 400,
            display: 'flex',
            flexDirection: 'column',
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 24,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '22px 26px' }}>
            <span style={{ fontSize: 20, color: C.ink3 }}>Hoje, no banco</span>
            <span style={{ fontSize: 32, color: C.ink }}>R$ 4.200,00</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.line}`, padding: '10px 26px' }}>
            {ROWS.map(([name, value]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 20 }}>
                <span style={{ color: C.ink2 }}>{name}</span>
                <span style={{ color: C.out }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: C.accentSoft, borderTop: `1px solid rgba(201,163,107,0.4)`, padding: '18px 26px' }}>
            <span style={{ fontSize: 19, color: C.ink }}>Quanto realmente está disponível?</span>
            <span style={{ fontSize: 48, color: C.accent, marginTop: 4 }}>R$ 500,00</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
