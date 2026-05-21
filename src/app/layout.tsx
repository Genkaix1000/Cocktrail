import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter para toda la UI — pesos 400-700.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cocktrail - Menú Digital",
  description: "Pedí tus tragos favoritos desde tu mesa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={inter.variable}
    >
      <body className="antialiased bg-ink-950 text-ink-50">{children}</body>
    </html>
  );
}
