import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * O indicador de rota do modo de desenvolvimento fica no canto inferior e
   * cobre o botão de adicionar lançamento, que mora no mesmo lugar. Erros de
   * compilação e de execução continuam aparecendo normalmente.
   */
  devIndicators: false,

  /**
   * Em desenvolvimento, o Next só entrega os scripts para "localhost". Liberar
   * 127.0.0.1 permite testar o app como visitante novo (outra origem: sem a
   * sessão nem a base local de quem desenvolve). Não vale em produção.
   */
  allowedDevOrigins: ['127.0.0.1'],

  /**
   * Cabeçalhos de segurança, e os do service worker.
   *
   * O worker nunca pode ficar preso num cache do navegador ou da CDN: é ele que
   * decide o que o app mostra sem internet, e uma cópia velha dele serviria
   * versões velhas de tudo.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // em desenvolvimento, a página /dev/telas mostra o app em molduras do tamanho de cada aparelho
          { key: 'X-Frame-Options', value: process.env.NODE_ENV === 'production' ? 'DENY' : 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
