import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { Landing } from '@/features/landing';

export const metadata: Metadata = {
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description:
    'Contas, cartões, metas e investimentos no mesmo lugar. Funciona offline, instala como aplicativo e não pede a senha do seu banco.',
};

export default function Home() {
  return <Landing />;
}
