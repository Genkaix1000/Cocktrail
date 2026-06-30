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

                  if (theme === 'bosko') {
                    document.documentElement.setAttribute('data-theme', 'bosko');
                  } else if (theme === 'custom' && customTheme) {
                    var parsed = JSON.parse(customTheme);
                    document.documentElement.setAttribute('data-theme', 'custom');
                    
                    var bgHexCustom = parsed.backgroundColor;
                    var surfaceHexCustom = parsed.surfaceColor;
                    var accentHexCustom = parsed.accentColor;

                    if (bgHexCustom && surfaceHexCustom && accentHexCustom) {
                      function hexToRgb(hex) {
                        var h = hex.replace('#', '');
                        return [
                          parseInt(h.substring(0, 2), 16),
                          parseInt(h.substring(2, 4), 16),
                          parseInt(h.substring(4, 6), 16)
                        ];
                      }

                      function lerpColor(a, b, t) {
                        var r = Math.round(a[0] + (b[0] - a[0]) * t);
                        var g = Math.round(a[1] + (b[1] - a[1]) * t);
                        var bl = Math.round(a[2] + (b[2] - a[2]) * t);
                        return '#' + 
                          r.toString(16).padStart(2, '0') + 
                          g.toString(16).padStart(2, '0') + 
                          bl.toString(16).padStart(2, '0');
                      }

                      var bgCustom = hexToRgb(bgHexCustom);
                      var surfaceCustom = hexToRgb(surfaceHexCustom);
                      var accentCustom = hexToRgb(accentHexCustom);

                      var bg = isDark ? bgCustom : hexToRgb(lerpColor([255, 255, 255], accentCustom, 0.08));
                      var card = isDark ? surfaceCustom : [255, 255, 255];
                      var text = isDark ? accentCustom : hexToRgb(lerpColor(accentCustom, [0, 0, 0], 0.40));

                      var bgHex = isDark ? bgHexCustom : lerpColor([255, 255, 255], accentCustom, 0.08);
                      var surfaceHex = isDark ? surfaceHexCustom : '#ffffff';
                      var accentHex = isDark ? accentHexCustom : lerpColor(accentCustom, [0, 0, 0], 0.40);

                      var textPrimary = isDark 
                        ? lerpColor([255, 255, 255], text, 0.08)
                        : lerpColor([28, 25, 23], text, 0.05);
                      var textPrimaryRgb = hexToRgb(textPrimary);

                      var borderHex = lerpColor(card, text, 0.20);
                      var border = hexToRgb(borderHex);

                      var el = document.documentElement.style;
                      el.setProperty('--bg-primary', bgHex);
                      el.setProperty('--bg-surface', surfaceHex);
                      el.setProperty('--text-accent', accentHex);
                      el.setProperty('--text-primary', textPrimary);

                      el.setProperty('--ink-950', bgHex);
                      el.setProperty('--ink-925', lerpColor(bg, card, 0.40));
                      el.setProperty('--ink-900', surfaceHex);

                      el.setProperty('--ink-850', lerpColor(card, border, 0.04));
                      el.setProperty('--ink-800', lerpColor(card, border, 0.09));
                      el.setProperty('--ink-750', lerpColor(card, border, 0.15));
                      el.setProperty('--ink-700', lerpColor(card, border, 0.22));

                      el.setProperty('--ink-600', lerpColor(card, textPrimaryRgb, 0.35));
                      el.setProperty('--ink-500', lerpColor(card, textPrimaryRgb, 0.50));
                      el.setProperty('--ink-450', lerpColor(card, textPrimaryRgb, isDark ? 0.60 : 0.58));
                      el.setProperty('--ink-400', lerpColor(card, textPrimaryRgb, isDark ? 0.70 : 0.65));

                      if (isDark) {
                        el.setProperty('--ink-300', lerpColor(textPrimaryRgb, [255, 255, 255], 0.85));
                        el.setProperty('--ink-200', lerpColor(textPrimaryRgb, [255, 255, 255], 0.92));
                        el.setProperty('--ink-100', lerpColor(textPrimaryRgb, [255, 255, 255], 0.97));
                      } else {
                        el.setProperty('--ink-300', lerpColor(card, textPrimaryRgb, 0.80));
                        el.setProperty('--ink-200', lerpColor(card, textPrimaryRgb, 0.90));
                        el.setProperty('--ink-100', lerpColor(card, textPrimaryRgb, 0.96));
                      }
                      el.setProperty('--ink-50', textPrimary);

                      el.setProperty('--primary-base', accentHex);
                      el.setProperty('--primary-soft', accentHex + '1a');
                      el.setProperty('--primary-line', accentHex + '33');
                      el.setProperty('--accent-base', accentHex);
                      el.setProperty('--accent-soft', accentHex + '1a');
                      el.setProperty('--accent-line', accentHex + '33');
                      el.setProperty('--accent-border', accentHex + '59');
                    }
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
            <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] rounded-full bg-accent opacity-10 blur-[100px]" />
            <div className="absolute bottom-[10%] right-[-10%] w-[250px] h-[250px] sm:w-[400px] sm:h-[400px] rounded-full bg-accent opacity-5 blur-[120px]" />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
