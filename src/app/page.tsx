import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { Landing } from '@/features/landing';

export const metadata: Metadata = {
  title: `${BRAND.name}: ${BRAND.tagline}`,
  description:
    'Importe o extrato do banco e veja o seu mês dia a dia: o que já saiu, o que ainda cai e o dia em que o saldo aperta. Grátis, funciona offline e não pede a senha do seu banco.',
};

export default function Home() {
  return <Landing />;
}
