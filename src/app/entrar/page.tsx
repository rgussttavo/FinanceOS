import type { Metadata } from 'next';
import { AuthScreen } from '@/features/auth-screen';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Entre no FinanceOS com o Google ou com e-mail e senha — ou continue sem conta, com tudo guardado no aparelho.',
  alternates: { canonical: '/entrar' },
};

export default function EntrarPage() {
  return <AuthScreen />;
}
