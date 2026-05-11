"use client";

import {
  CheckCircle2,
  Clock,
  CreditCard,
  Hourglass,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { STATUS_META } from "@/lib/orderStatus";
import type { Order } from "@/types/domain";

type Props = { order: Order };

export default function Ticket({ order }: Props) {
  // Inicializa con la hora actual; la diferencia de SSR/CSR se suprime con
  // suppressHydrationWarning más abajo (es un reloj — la siguiente tick reconcilia).
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isReady = order.status === "listo";
  const isDone = order.status === "entregado" || order.status === "cancelado";
  const isPreparing = order.status === "preparando";

  return (
    <main className="min-h-screen bg-[#020617] text-white p-5 flex flex-col">
      <div
        className={`flex-1 max-w-md w-full mx-auto flex flex-col gap-8 pb-10 transition-opacity ${isDone ? "opacity-60" : ""}`}
      >
        <div className="flex items-center gap-3 pl-2 pt-4">
          <Sparkles size={22} className="text-[#38bdf8]" />
          <h1 className="text-2xl font-black tracking-tight leading-none mt-1">
            Tu pedido
          </h1>
        </div>

        <div
          className={`relative overflow-hidden rounded-3xl p-8 shadow-2xl border transition-all ${
            isReady
              ? "bg-[#022c22] border-[#10b981]/40 shadow-[0_0_40px_rgba(16,185,129,0.25)]"
              : "bg-[#0f172a] border-[#1e293b]"
          } ${isDone ? "grayscale" : ""}`}
        >
          <div
            className={`mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-6 w-fit border ${
              isReady
                ? "bg-[#10b981]/20 border-[#10b981]/30 text-[#10b981]"
                : "bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981]"
            }`}
          >
            <CheckCircle2 size={14} />
            <span className="text-[9px] font-black uppercase tracking-wider">
              Pago verificado por Mercado Pago
            </span>
          </div>

          <div className="flex flex-col items-center justify-center mb-6 bg-[#020617]/50 py-3 rounded-2xl border border-white/5">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <Clock size={12} className="text-[#38bdf8]" />
              <span className="text-[9px] uppercase tracking-widest font-bold">
                Reloj de seguridad
              </span>
            </div>
            <div
              className="font-mono text-3xl font-medium text-white tracking-widest leading-none"
              suppressHydrationWarning
            >
              {time.toLocaleTimeString("es-AR", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>

          <div
            className={`relative flex flex-col items-center justify-center rounded-2xl py-6 mb-6 border shadow-inner ${
              isReady
                ? "bg-[#022c22] border-[#10b981]/30"
                : "bg-[#020617] border-[#1e293b]"
            }`}
          >
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-2">
              Tu número de retiro
            </span>
            <span
              className={`text-7xl font-black leading-none tracking-tighter ${isReady ? "text-[#10b981]" : "text-[#38bdf8]"}`}
            >
              #{order.displayNumber}
            </span>

            {order.status === "entregado" && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#020617]/80 backdrop-blur-sm z-10">
                <div className="border-4 border-red-500 text-red-500 transform -rotate-12 px-6 py-2 rounded-xl text-3xl font-black tracking-widest shadow-2xl">
                  ENTREGADO
                </div>
              </div>
            )}
            {order.status === "cancelado" && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#020617]/80 backdrop-blur-sm z-10">
                <div className="border-4 border-red-500 text-red-500 transform -rotate-12 px-6 py-2 rounded-xl text-3xl font-black tracking-widest shadow-2xl">
                  CANCELADO
                </div>
              </div>
            )}
          </div>

          <div
            className={`mb-6 rounded-xl px-4 py-3 text-center text-sm font-bold border ${
              isReady
                ? "bg-[#10b981]/15 border-[#10b981]/30 text-[#34d399]"
                : isPreparing
                  ? "bg-[#38bdf8]/10 border-[#38bdf8]/30 text-[#38bdf8]"
                  : "bg-[#1e293b]/50 border-[#1e293b] text-slate-300"
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              {isReady ? <CheckCircle2 size={16} /> : <Hourglass size={14} />}
              <span>{STATUS_META[order.status].long}</span>
            </div>
          </div>

          <div className="space-y-4 mb-2">
            <div className="flex items-center justify-between text-sm pb-4 border-b border-[#1e293b]/50">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="font-mono text-xs">
                  {new Date(order.createdAt).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <CreditCard size={16} className="text-[#38bdf8]/70" />
                <span className="font-mono font-bold text-white">
                  ${order.total.toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Detalle de los tragos
            </h3>
            {order.items.map((item, i) => (
              <div
                key={`${item.drinkId}-${i}`}
                className="flex justify-between items-center text-sm"
              >
                <span className="text-slate-300 font-medium line-clamp-1 pr-2">
                  <span className="text-[#38bdf8] font-mono font-bold mr-2">
                    {item.qty}x
                  </span>
                  {item.name}
                </span>
                <span className="font-mono text-slate-400 shrink-0">
                  ${item.subtotal.toLocaleString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-2">
          Mostrá esta pantalla al barman cuando tu número se ponga verde.
        </p>
      </div>
    </main>
  );
}
