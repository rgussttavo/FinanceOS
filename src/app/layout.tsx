import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import { THEME_BOOT_SCRIPT } from '@/lib/theme-boot';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const display = Instrument_Serif({
  variable: '--font-display',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

/** [largura, altura, densidade] das telas de iPhone mais comuns */
const SPLASH: [number, number, number][] = [
  [1290, 2796, 3],
  [1179, 2556, 3],
  [1284, 2778, 3],
  [1170, 2532, 3],
  [1125, 2436, 3],
  [1242, 2688, 3],
  [828, 1792, 2],
  [1242, 2208, 3],
  [750, 1334, 2],
];

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} · ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.promise,
  applicationName: BRAND.name,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: 'black',
    // a tela de abertura do app instalado no iPhone, no escuro da marca
    startupImage: SPLASH.map(([w, h, ratio]) => ({
      url: `/splash/${w}x${h}.png`,
      media: `(device-width: ${w / ratio}px) and (device-height: ${h / ratio}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
    })),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${display.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
