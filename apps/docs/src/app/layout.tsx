import { Inter } from 'next/font/google';
import './globals.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
