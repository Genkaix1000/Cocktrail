"use client";

import { ArrowLeft, Martini, Printer, RefreshCw } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

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
    <main className="min-h-screen bg-[#020617] text-white print:bg-white print:text-black">
      <header className="px-6 py-4 border-b border-white/5 flex items-center justify-between print:hidden">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider"
        >
          <ArrowLeft size={16} />
          Volver al admin
        </Link>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 h-10 rounded-xl bg-[#38bdf8] text-[#020617] font-black text-xs uppercase tracking-wider hover:bg-[#7dd3fc] active:scale-95 transition-all"
        >
          <Printer size={16} />
          Imprimir
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-6 sm:p-10 flex flex-col items-center gap-8">
        <div className="flex items-center gap-3 print:hidden">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-[#38bdf8]/20">
            <Martini size={20} className="text-[#020617] fill-[#020617]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              QR para imprimir
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
              Apunta a la carta del cliente
            </p>
          </div>
        </div>

        <div className="hidden print:flex flex-col items-center gap-1 mb-6">
          <h1 className="text-2xl font-black text-black">Cocktrail</h1>
          <p className="text-sm text-black/70">Escaneá para pedir tu trago</p>
        </div>

        <div className="bg-white rounded-3xl p-8 border-4 border-white shadow-2xl print:shadow-none print:border-black/10">
          {url ? (
            <QRCodeSVG value={url} size={280} level="M" marginSize={2} />
          ) : (
            <div className="w-[280px] h-[280px] flex items-center justify-center text-slate-400">
              Cargando…
            </div>
          )}
        </div>

        <ul className="text-sm text-slate-400 max-w-md space-y-2 print:hidden">
          <li className="flex gap-2">
            <span className="text-[#38bdf8] font-mono shrink-0">1.</span>
            <span>
              Imprimí esta página en cartel o sticker y pegalo en las mesas,
              la barra, los baños — donde quieras que la gente escanee.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-[#38bdf8] font-mono shrink-0">2.</span>
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
