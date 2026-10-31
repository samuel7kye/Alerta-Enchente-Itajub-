import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alerta Enchentes - Itajubá/MG',
  description: 'Painel comunitário de monitoramento e alertas de chuva em Itajubá/MG',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-900">
        {children}
      </body>
    </html>
  );
}