import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reaproveita — Combatendo o Desperdício de Alimentos',
  description:
    'Plataforma que conecta restaurantes, padarias e mercados com pessoas ou instituições para reaproveitar alimentos excedentes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
