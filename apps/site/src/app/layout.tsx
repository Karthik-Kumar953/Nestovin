import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Manrope } from 'next/font/google';
import '@nestovin/design-tokens/tokens.css';
import './globals.css';

// Self-hosted at build time by next/font (no runtime request to Google).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', weight: ['500', '600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Nestovin', template: '%s · Nestovin' },
  description: 'A Home That Brings People Together',
  icons: { icon: '/nestovin-logo.png' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
