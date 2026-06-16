import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import type { Theme } from "@cocktrail/shared";

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
  // Tema por defecto. El ThemeProvider se sincroniza vía SSE.
  const initialTheme: Theme = "normal";

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={inter.variable}
      data-theme={(initialTheme as Theme) === "bosko" ? "bosko" : undefined}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('cocktrail_theme');
                  var customTheme = localStorage.getItem('cocktrail_custom_theme');
                  if (theme === 'bosko') {
                    document.documentElement.setAttribute('data-theme', 'bosko');
                  } else if (theme === 'custom' && customTheme) {
                    var parsed = JSON.parse(customTheme);
                    document.documentElement.setAttribute('data-theme', 'custom');
                    document.documentElement.style.setProperty('--ink-950', parsed.background);
                    document.documentElement.style.setProperty('--ink-900', parsed.cardBg);
                    document.documentElement.style.setProperty('--ink-700', parsed.borders);
                    document.documentElement.style.setProperty('--primary-base', parsed.primary);
                    document.documentElement.style.setProperty('--accent-base', parsed.accent);
                    document.documentElement.style.setProperty('--primary-soft', parsed.primary + '24');
                    document.documentElement.style.setProperty('--primary-line', parsed.primary + '48');
                    document.documentElement.style.setProperty('--accent-soft', parsed.accent + '24');
                    document.documentElement.style.setProperty('--accent-line', parsed.accent + '48');
                    document.documentElement.style.setProperty('--accent-border', parsed.accent + '80');
                  } else {
                    document.documentElement.removeAttribute('data-theme');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
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
