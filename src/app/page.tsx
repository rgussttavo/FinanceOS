import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { Landing } from '@/features/landing';

const TITLE = `${BRAND.name} · Saiba quanto sobra antes do mês acabar`;
const DESCRIPTION =
  'Não basta saber quanto você tem hoje. O FinanceOS mostra o que já aconteceu, o que ainda vai acontecer e quanto realmente está disponível. Grátis, funciona offline e não pede a senha do seu banco.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: BRAND.name,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

/** o app descrito para os buscadores: gratuito, na web, de finanças */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: BRAND.name,
  url: `https://${BRAND.domain}`,
  description: DESCRIPTION,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  inLanguage: 'pt-BR',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <Landing />
    </>
  );
}
