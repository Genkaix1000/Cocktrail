import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

// Inter para toda la UI — pesos 400-700.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bosko — Caja",
  description: "Ventas, cobros y cierre de noche del boliche",
  manifest: "/manifest.webmanifest",
  // Instalada en la tablet abre sin barra del navegador, como una app.
  appleWebApp: {
    capable: true,
    title: "Bosko",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#111315",
  width: "device-width",
  initialScale: 1,
  // La caja se opera con los dedos y a los apurones: sin zoom accidental al
  // tocar dos veces un botón.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tema por defecto. El ThemeProvider se sincroniza vía SSE.

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
        <ThemeProvider>
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
