import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Avulte Wear — Sistema comercial', robots: { index: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Aplica o tema antes da primeira pintura: o escolhido pela pessoa ou o do aparelho.
const TEMA_INICIAL = `try{var t=localStorage.getItem('tema');if(t!=='claro'&&t!=='escuro'){t=matchMedia('(prefers-color-scheme: dark)').matches?'escuro':'claro'}document.documentElement.dataset.tema=t}catch(e){document.documentElement.dataset.tema='claro'}`;

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
