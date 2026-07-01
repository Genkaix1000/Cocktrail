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
  const initialTheme: Theme = "bosko";

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={inter.variable}
      data-theme="bosko"
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var role = 'public';
                  var path = window.location.pathname;
                  if (path.indexOf('/admin') === 0) role = 'admin';
                  else if (path.indexOf('/caja') === 0) role = 'caja';
                  else if (path.indexOf('/barra') === 0) role = 'barra';
                  var key = 'cocktrail_is_dark_' + role;
                  var isDark = localStorage.getItem(key) !== 'false';
                  
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                  
                  document.documentElement.setAttribute('data-theme', 'bosko');
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
            <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full bg-accent opacity-10 blur-[100px]" />
            <div className="absolute bottom-[10%] right-[-10%] w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] rounded-full bg-accent opacity-5 blur-[120px]" />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
