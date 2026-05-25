"use client";

import { ChevronLeft, Plus, Activity } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatHm } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types/domain";
import { BrandLogo } from "./BrandLogo";

type Props = { order: Order };

export default function Ticket({ order }: Props) {
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isReady = order.status === "listo";
  const isDone = order.status === "entregado" || order.status === "cancelado";
  const isCancelled = order.status === "cancelado";

  const STEPS: { id: OrderStatus; label: string; sub: string }[] = [
    { id: "pagado", label: "Pago Verificado", sub: "Mercado Pago" },
    { id: "preparando", label: "En Preparación", sub: "Barman" },
    { id: "listo", label: "Listo para Retirar", sub: "Barra" },
  ];

  const stepIdx = STEPS.findIndex((s) => s.id === order.status);
  const effectiveIdx = order.status === "entregado" ? STEPS.length : isCancelled ? Math.max(0, stepIdx) : stepIdx;

  const getTicketTheme = () => {
    if (isDone) {
      return {
        topBg: "bg-zinc-900",
        bottomBg: "bg-zinc-200",
        borderColor: "border-zinc-800",
        textColor: "text-zinc-500",
        accentText: "text-zinc-700",
        dotBg: "bg-zinc-500",
        cutoutBg: "bg-ink-950",
      };
    }
    if (order.status === "listo") {
      return {
        topBg: "bg-emerald-950",
        bottomBg: "bg-emerald-50",
        borderColor: "border-emerald-900/50",
        textColor: "text-emerald-500",
        accentText: "text-emerald-700",
        dotBg: "bg-emerald-500",
        cutoutBg: "bg-ink-950",
      };
    }
    if (order.status === "preparando") {
      return {
        topBg: "bg-orange-950",
        bottomBg: "bg-orange-50",
        borderColor: "border-orange-900/50",
        textColor: "text-orange-500",
        accentText: "text-orange-700",
        dotBg: "bg-orange-500",
        cutoutBg: "bg-ink-950",
      };
    }
    return {
      topBg: "bg-sky-950",
      bottomBg: "bg-sky-50",
      borderColor: "border-sky-900/50",
      textColor: "text-sky-500",
      accentText: "text-sky-700",
      dotBg: "bg-sky-500",
      cutoutBg: "bg-ink-950",
    };
  };

  const theme = getTicketTheme();

  return (
    <main className="min-h-screen bg-transparent flex flex-col relative font-sans text-ink-50 selection:bg-ink-800">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col pt-6 pb-12 px-4 drop-shadow-2xl">
        
        {/* Top Back Button */}
        <div className="mb-4">
          <Link
            href="/carta"
            className="w-10 h-10 rounded-full bg-ink-900 border border-ink-800 flex items-center justify-center text-ink-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={20} />
          </Link>
        </div>

        {/* --- TICKET CONTAINER --- */}
        <div className={`relative w-full flex flex-col transition-all duration-1000 ease-in-out origin-top ${isDone ? "scale-95 grayscale opacity-75 rotate-1" : ""}`}>
          
          {/* Top Wrapper */}
          <div className={`${theme.topBg} rounded-t-3xl border ${theme.borderColor} border-b-0 pb-6 transition-colors duration-1000`}>
            {/* Header */}
            <div className="pt-6 pb-0 flex flex-col items-center">
              <h2 className="text-[10px] font-black tracking-[0.3em] uppercase text-white/40 z-10 relative">Ticket de Pedido</h2>
              <div className="-mt-8 -mb-6 relative">
                <BrandLogo className="text-xl [&_.brand-text]:text-2xl [&_.brand-text]:font-black [&_.brand-text]:not-italic [&_.brand-image]:h-[140px] [&_.brand-image]:w-auto" />
              </div>
            </div>

            {/* Big Number Section with Security Pattern */}
            <div className={`relative px-6 py-6 flex flex-col items-center justify-center overflow-hidden border-y ${theme.borderColor} transition-colors duration-1000`}>
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 1px, transparent 8px)" }} />
              
              <div className={`font-serif-italic text-[120px] leading-none tracking-tighter drop-shadow-2xl transition-colors duration-1000 ${theme.textColor}`}>
                #{order.displayNumber}
              </div>

              {/* Real-time Clock Badge */}
              <div className={`mt-6 inline-flex items-center gap-2 bg-black/40 rounded-full px-4 py-2 border ${theme.borderColor} shadow-inner z-10 transition-colors duration-1000`}>
                <Activity size={14} className={`transition-colors duration-1000 ${theme.textColor}`} style={{ animation: "ct-pulse 1.5s ease-in-out infinite" }} />
                <span className={`font-mono text-sm tracking-widest transition-colors duration-1000 ${theme.textColor}`} suppressHydrationWarning>
                  {time.toLocaleTimeString("es-AR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Tracker Horizontal */}
            <div className="px-6 pt-8 pb-2">
              <div className="flex justify-between relative">
                {/* Background Line */}
                <div className="absolute top-2.5 left-[16.66%] right-[16.66%] h-[2px] bg-black/20 -z-10" />
                
                {/* Pathing Line (Animated Fill) */}
                <div 
                  className={`absolute top-2.5 left-[16.66%] h-[2px] transition-all duration-1000 ease-in-out -z-10 ${theme.dotBg}`}
                  style={{ width: `${(Math.min(effectiveIdx, STEPS.length - 1) / (STEPS.length - 1)) * 66.66}%` }} 
                />
                
                {STEPS.map((s, i) => {
                  const isDoneStep = i <= effectiveIdx && !isCancelled;
                  const isActive = i === effectiveIdx && !isDone && !isCancelled;
                  
                  return (
                    <div key={s.id} className="flex flex-col items-center gap-2 flex-1 text-center z-10">
                      <div className={`relative w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-1000 ${isDoneStep ? `border-transparent ${theme.dotBg}` : `bg-black/20 border-white/10`}`}>
                        {isActive && (
                          <span className={`absolute inset-0 rounded-full animate-ping opacity-75 transition-colors duration-1000 ${theme.dotBg}`} />
                        )}
                        {isDoneStep && <div className={`w-2 h-2 rounded-full relative z-10 bg-white`} />}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 transition-colors duration-1000 ${isDoneStep ? "text-white" : "text-white/30"}`}>{s.label}</span>
                        <span className="text-[9px] text-white/20 uppercase tracking-widest">({s.sub})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Middle Row with Cutouts */}
          <div className="relative h-8 flex items-center justify-between w-full">
            {/* Background Layer */}
            <div className={`absolute inset-0 flex flex-col border-x transition-colors duration-1000 ${theme.borderColor}`}>
              <div className={`flex-1 transition-colors duration-1000 ${theme.topBg}`} />
              <div className={`flex-1 transition-colors duration-1000 ${theme.bottomBg}`} />
            </div>

            {/* Foreground Content */}
            <div className="absolute inset-0 flex items-center justify-between z-10">
              {/* Left Cutout */}
              <div className={`w-4 h-8 border border-l-0 rounded-r-full -ml-px transition-colors duration-1000 ${theme.cutoutBg} ${theme.borderColor}`} />
              
              {/* Dashed Line */}
              <div className={`flex-1 border-t-2 border-dashed mx-4 transition-colors duration-1000 ${theme.borderColor}`} />
              
              {/* Right Cutout */}
              <div className={`w-4 h-8 border border-r-0 rounded-l-full -mr-px transition-colors duration-1000 ${theme.cutoutBg} ${theme.borderColor}`} />
            </div>
          </div>

          {/* Bottom Wrapper */}
          <div className={`${theme.bottomBg} rounded-b-3xl border ${theme.borderColor} border-t-0 pt-2 transition-colors duration-1000`}>
            
            {/* Detalle Tabulado */}
            <div className="px-8 py-6">
              <div className={`flex justify-between items-end mb-4 border-b pb-2 transition-colors duration-1000 ${theme.borderColor}`}>
                <span className={`text-[10px] uppercase tracking-widest font-bold transition-colors duration-1000 ${theme.accentText}`}>CANT / DESC</span>
                <span className={`text-[10px] uppercase tracking-widest font-bold transition-colors duration-1000 ${theme.accentText}`}>IMPORTE</span>
              </div>
              
              <ul className="flex flex-col gap-3 mb-6">
                {order.items.map((it, i) => (
                  <li key={`${it.drinkId}-${i}`} className="flex justify-between items-start text-sm">
                    <div className="flex gap-3">
                      <span className={`font-mono font-bold transition-colors duration-1000 ${theme.textColor}`}>{it.qty}</span>
                      <span className={`font-bold transition-colors duration-1000 ${theme.textColor}`}>{it.name}</span>
                    </div>
                    <span className={`font-mono tabular font-semibold transition-colors duration-1000 ${theme.textColor}`}>${it.subtotal.toLocaleString("es-AR")}</span>
                  </li>
                ))}
              </ul>

              <div className={`flex justify-between items-center pt-4 border-t border-dashed transition-colors duration-1000 ${theme.borderColor}`}>
                <span className={`text-xs uppercase tracking-widest font-bold transition-colors duration-1000 ${theme.accentText}`}>Total Pagado</span>
                <span className="font-serif-italic text-2xl font-black tabular text-black/80">${order.total.toLocaleString("es-AR")}</span>
              </div>
            </div>

            {/* Footer Barcode */}
            <div className="px-8 pb-8 flex flex-col items-center">
              <div className="w-full h-14 mb-2 flex justify-between items-stretch opacity-[0.08]" style={{ backgroundImage: "repeating-linear-gradient(to right, #000 0, #000 2px, transparent 2px, transparent 4px, #000 4px, #000 5px, transparent 5px, transparent 8px, #000 8px, #000 12px, transparent 12px, transparent 14px)" }}>
              </div>
              <span className={`font-mono text-[10px] tracking-[0.4em] font-bold mb-4 transition-colors duration-1000 ${theme.accentText}`}>{order.id.toUpperCase()}</span>
              
              <p className={`text-center text-[11px] font-black uppercase tracking-wider px-4 transition-colors duration-1000 ${theme.textColor}`}>
                Mostrá esta pantalla al barman cuando tu número aparezca en verde.
              </p>
            </div>
          </div>

        </div>

        {/* CTA */}
        {isDone && (
          <Link
            href="/carta"
            className="mt-8 mx-auto flex items-center justify-center gap-2 w-full max-w-xs px-6 py-4 rounded-full bg-ink-800 text-ink-50 font-bold text-xs uppercase tracking-[0.2em] hover:bg-ink-700 active:scale-95 transition-all shadow-xl"
          >
            <Plus size={16} strokeWidth={3} />
            Hacer otro pedido
          </Link>
        )}
      </div>
    </main>
  );
}
