"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

const CAJA_APK_HREF = "/miboliche-caja.apk";

/** Lucide no trae marcas: el robot de Android va inline. */
function AndroidGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.53 9.32l1.6-2.77a.44.44 0 10-.76-.44l-1.63 2.81A9.2 9.2 0 0012 7.9c-1.7 0-3.3.4-4.74 1.02L5.63 6.11a.44.44 0 10-.76.44l1.6 2.77A7.1 7.1 0 002.6 15.1h18.8a7.1 7.1 0 00-3.87-5.78zM7.9 12.98a.86.86 0 110-1.72.86.86 0 010 1.72zm8.2 0a.86.86 0 110-1.72.86.86 0 010 1.72z" />
    </svg>
  );
}

const STEPS = [
  "Tocá «Descargar app» y confirmá la instalación.",
  "Si el celular avisa que la descarga es de otro origen, aceptá igual: la app la genera este sistema.",
  "Abrí miBoliche Caja desde el escritorio de la tablet.",
  "Enchufá la impresora y tocá «Permitir» cuando aparezca el aviso.",
];

/**
 * Sección "Sistema" de Configuración en /admin — app de caja para la tablet
 * (WebView + impresión USB nativa).
 */
export default function SistemaSection() {
  // La dirección real del server es el origen desde el que se sirve esta página.
  const [serverAddress, setServerAddress] = useState<string | null>(null);

  useEffect(() => {
    setServerAddress(window.location.origin);
  }, []);

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <div>
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
          Sistema
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
          La app de caja para la tablet
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* App de caja — fondo sobrio, mismo idioma que la night card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white flex flex-col shadow-card"
          style={{
            background: "linear-gradient(160deg, #16321F 0%, #131719 55%, #1A1D21 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='120' height='80' viewBox='0 0 120 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 Q30 10 60 40 T120 40' fill='none' stroke='%2334D399' stroke-width='1.1' opacity='0.3'/%3E%3Cpath d='M0 55 Q30 25 60 55 T120 55' fill='none' stroke='%2334D399' stroke-width='0.9' opacity='0.18'/%3E%3C/svg%3E\")",
              backgroundSize: "100% 100%",
            }}
            aria-hidden
          />

          <div className="relative flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 bg-white/10 shrink-0">
              <AndroidGlyph size={17} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">App de caja</h3>
              <p className="text-[12px] text-white/55">Para la tablet que cobra e imprime</p>
            </div>
          </div>

          <p className="relative text-[13px] text-white/70 leading-relaxed mt-4">
            Se abre a pantalla completa, sin navegador, y usa la impresora enchufada a la tablet.
            Encuentra sola la computadora del local.
          </p>

          <a
            href={CAJA_APK_HREF}
            download="miboliche-caja.apk"
            className="relative mt-4 h-10 w-full rounded-full bg-white text-[#16321F] hover:brightness-95 flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
          >
            <Download size={15} strokeWidth={2} />
            Descargar app
          </a>

          <ol className="relative mt-4 space-y-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-2.5 text-[12px] text-white/70 leading-relaxed">
                <span className="shrink-0 w-[18px] h-[18px] mt-[1px] rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px] font-semibold text-white/80 tabular">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="relative mt-auto pt-4">
            <div className="rounded-xl bg-black/25 border border-white/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Si la app pide la dirección
              </p>
              <p className="text-[14px] font-mono text-white mt-1 break-all select-all">
                {serverAddress ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
