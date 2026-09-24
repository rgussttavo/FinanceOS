import type { Metadata } from 'next';
import { AppRoot } from '@/features/app-root';

export const metadata: Metadata = {
  title: 'Demonstração',
  description: 'O FinanceOS preenchido com dados de exemplo, para explorar sem cadastro.',
  robots: { index: false },
};

export default function DemoPage() {
  return <AppRoot demo />;
}
