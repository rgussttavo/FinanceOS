import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * O FinanceOS instalado abre direto no mês, no escuro da marca, e o ícone
 * pressionado oferece os dois atalhos que mais se repetem: registrar um gasto
 * e trazer o extrato.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.promise,
    lang: BRAND.locale,
    dir: 'ltr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b0b0c',
    theme_color: '#0b0b0c',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Registrar gasto',
        short_name: 'Registrar',
        description: 'Abre o registro rápido',
        url: '/app#novo',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Importar extrato',
        short_name: 'Importar',
        description: 'Traz o extrato do banco',
        url: '/app#/importar',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Calendário do mês',
        short_name: 'Calendário',
        description: 'O saldo dia a dia',
        url: '/app#/calendario',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
