import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/**
 * A vitrine é para ser achada. O app, a entrada e o exemplo ficam fora da
 * busca pela meta "noindex" de cada página — e por isso não são bloqueados
 * aqui: bloqueado, o buscador nem lê o "noindex". Bloqueio mesmo só para o
 * que não é página: as ferramentas de desenvolvimento e a API.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dev/', '/api/'] },
    sitemap: `https://${BRAND.domain}/sitemap.xml`,
  };
}
