import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { snapshot } from "@/server/store";

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
  const { activeTheme: initialTheme } = snapshot();

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={inter.variable}
      data-theme={initialTheme === "bosko" ? "bosko" : undefined}
    >
      <body className="antialiased bg-ink-950 text-ink-50">
        <ThemeProvider initialTheme={initialTheme}>
          {/* Ambient Glow for Glassmorphism */}
          <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full bg-blue opacity-10 blur-[100px]" />
            <div className="absolute bottom-[10%] right-[-10%] w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] rounded-full bg-blue opacity-5 blur-[120px]" />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
