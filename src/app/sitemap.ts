import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/** uma página pública só: a vitrine */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `https://${BRAND.domain}/`, changeFrequency: 'monthly', priority: 1 }];
}
