"use client";

import { ArrowLeft, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

// NEXT_PUBLIC_* se inlinea al bundle. Es la forma idiomática Next.js de pasar
// config "pública" al cliente. Una IP LAN no es secreto.
const ENV_HOST = process.env.NEXT_PUBLIC_LAN_HOST;

export default function QrPage() {
  // SSR y primer render del cliente: url = "" → ambos renderean el placeholder.
  // Tras montar el cliente, el effect setea la URL real. Cero hydration mismatch.
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    // Preferimos la env var (IP LAN explícita). Fallback a window.location.origin
    // — sirve si abrís /admin/qr desde otra device en la LAN, pero NO si lo
    // abrís desde "localhost".
    const host = ENV_HOST?.trim() || window.location.origin;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${host.replace(/\/$/, "")}/carta`);
  }, []);

  function handlePrint() {
    if (!url) return;
    window.print();
  }

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 print:bg-white print:text-black">
      <header className="px-6 py-4 border-b border-ink-800 flex items-center justify-between print:hidden">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-ink-300 hover:text-ink-50 transition-colors text-xs font-medium uppercase tracking-[0.14em]"
        >
          <ArrowLeft size={16} />
          Volver al admin
        </Link>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 h-10 rounded-lg bg-blue text-ink-950 font-semibold text-xs uppercase tracking-[0.14em] hover:brightness-110 active:scale-95 transition-all"
        >
          <Printer size={16} />
          Imprimir
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-6 sm:p-10 flex flex-col items-center gap-8">
        <div className="flex items-baseline gap-3 print:hidden">
          <BrandLogo />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
            QR para imprimir
          </span>
        </div>

        <div className="hidden print:flex flex-col items-center gap-1 mb-6">
          <h1 className="text-2xl font-black text-black">Cocktrail</h1>
          <p className="text-sm text-black/70">Escaneá para pedir tu trago</p>
        </div>

        <div className="bg-white rounded-[22px] p-8 border-4 border-white shadow-2xl print:shadow-none print:border-black/10">
          {url ? (
            <QRCodeSVG value={url} size={280} level="M" marginSize={2} />
          ) : (
            <div className="w-[280px] h-[280px] flex items-center justify-center text-ink-400">
              Cargando…
            </div>
          )}
        </div>

        <ul className="text-sm text-ink-300 max-w-md space-y-2 print:hidden">
          <li className="flex gap-2">
            <span className="text-blue font-mono shrink-0 tabular">1.</span>
            <span>
              Imprimí esta página en cartel o sticker y pegalo en las mesas,
              la barra, los baños — donde quieras que la gente escanee.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue font-mono shrink-0 tabular">2.</span>
            <span>
              Asegurate que tanto la laptop como el celu del cliente estén en
              la misma red WiFi.
            </span>
          </li>
        </ul>

        <div className="hidden print:block text-center text-black/70 text-sm mt-4">
          <RefreshCw size={14} className="inline mr-1" />
          Tu trago, desde el celu
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 1cm; }
        }
      `}</style>
    </main>
  );
}
