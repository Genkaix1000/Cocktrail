"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

/**
 * Vista "Imprimir QR" del panel admin — extraída de AdminClient.tsx sin
 * cambios de comportamiento. Resuelve la URL de la carta y su propio
 * estado de QR, sin depender de nada del shell salvo el tema activo.
 */
export default function QrSection({ isBosko }: { isBosko: boolean }) {
  const ENV_HOST = process.env.NEXT_PUBLIC_LAN_HOST;
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    const host = ENV_HOST?.trim() || (typeof window !== "undefined" ? window.location.origin : "");
    setQrUrl(`${host.replace(/\/$/, "")}/carta`);
  }, [ENV_HOST]);

  const handleQrPrint = () => {
    if (!qrUrl) return;
    window.print();
  };

  const accentColorClass = "text-accent";

  return (
    <div className="space-y-6 max-w-xl mx-auto text-center py-6 animate-dashboard-in">
      <div className="flex flex-col gap-1 items-center">
        <h1 className="font-serif-italic text-[30px] text-ink-50">QR para la Carta</h1>
        <p className="text-[12px] text-ink-400">
          Imprimí este código QR para que los clientes escaneen y hagan pedidos desde la mesa.
        </p>
      </div>

      {/* QR Block container */}
      <div className="bg-white rounded-[24px] p-8 max-w-sm mx-auto shadow-2xl border border-white/5 flex flex-col items-center">
        {qrUrl ? (
          <QRCodeSVG value={qrUrl} size={280} level="M" marginSize={2} />
        ) : (
          <div className="w-[280px] h-[280px] flex items-center justify-center text-ink-400">
            Cargando URL…
          </div>
        )}

        {/* Print watermark decoration */}
        <div className="mt-4 text-center text-black/40 text-[10px] font-bold uppercase tracking-wider hidden print:block">
          Escaneá y pedí tu trago
        </div>
      </div>

      {/* Instructions */}
      <ul className="text-left text-[12px] text-ink-300 space-y-2.5 max-w-sm mx-auto pt-2 print:hidden">
        <li className="flex gap-2">
          <span className={`font-mono font-bold ${accentColorClass}`}>1.</span>
          <span>Imprimí esta pantalla o guardala como PDF. Pegá el QR en las mesas, barras y accesos.</span>
        </li>
        <li className="flex gap-2">
          <span className={`font-mono font-bold ${accentColorClass}`}>2.</span>
          <span>Verificá que el router WiFi y el servidor estén en la misma red local (LAN).</span>
        </li>
      </ul>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleQrPrint}
        className={`h-11 px-6 rounded-xl text-ink-950 text-[11px] font-bold uppercase tracking-[0.14em] hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto print:hidden ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
      >
        <Printer size={15} />
        Imprimir QR
      </button>
    </div>
  );
}
