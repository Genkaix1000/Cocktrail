import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Sans para UI/body — Geist con peso 300-700 (lo usamos a través de var).
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

// Mono para precios, horas, contadores tabulares.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

// Serif para títulos y números grandes (Tu pedido, #N).
// Instrument Serif solo trae 400, lo usamos siempre italic via CSS.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
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
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased bg-ink-950 text-ink-50">{children}</body>
    </html>
  );
}
