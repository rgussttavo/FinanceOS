import type { Metadata } from 'next';
import { AppRoot } from '@/features/app-root';

export const metadata: Metadata = {
  title: 'Seu mês',
};

export default function AppPage() {
  return <AppRoot />;
}
