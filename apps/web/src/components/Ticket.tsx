"use client";

import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import type { Order } from "@cocktrail/shared";
import { QRCodeSVG } from "qrcode.react";
import { BrandLogo } from "./BrandLogo";

const CODE39_PATTERNS: Record<string, string> = {
  "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
  "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
  "8": "110100101101", "9": "101100101101", "A": "110101001011", "B": "101101001011",
  "C": "110110100101", "D": "101011001011", "E": "110101100101", "F": "101101100101",
  "G": "101010011011", "H": "110101001101", "I": "101101001101", "J": "101011001101",
  "K": "110101010011", "L": "101101010011", "M": "110110101001", "N": "101011010011",
  "O": "110101101001", "P": "101101101001", "Q": "101010110011", "R": "110101011001",
  "S": "101101011001", "T": "101011011001", "U": "110010101011", "V": "100110101011",
  "W": "110011010101", "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
  "-": "100101011011", ".": "110010101101", " ": "100110101101", "*": "100101101101",
  "$": "100100100101", "/": "100100101001", "+": "100101001001", "%": "101001001001"
};

function Code39Barcode({ value }: { value: string }) {
  const normalized = `*${value.toUpperCase()}*`;
  const modules: number[] = [];
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS["*"];
    
    for (let j = 0; j < pattern.length; j++) {
      modules.push(pattern[j] === "1" ? 1 : 0);
    }
    if (i < normalized.length - 1) {
      modules.push(0);
    }
  }

  const moduleWidth = 2.0;
  const height = 48;
  const totalWidth = modules.length * moduleWidth;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${totalWidth} ${height}`} className="select-none my-1">
      {modules.map((m, idx) => (
        m === 1 ? (
          <rect
            key={idx}
            x={idx * moduleWidth}
            y={0}
            width={moduleWidth}
            height={height}
            fill="#000000"
          />
        ) : null
      ))}
    </svg>
  );
}

type Props = { order: Order };

export default function Ticket({ order }: Props) {
  const isDelivered = order.status === "entregado";
  const isCancelled = order.status === "cancelado";
  const isDone = isDelivered || isCancelled;

  const displayTimeStr = new Date(order.createdAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const deliveredTimeStr = order.deliveredAt
    ? new Date(order.deliveredAt).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <main className="min-h-screen bg-transparent flex flex-col relative font-sans text-ink-50 selection:bg-ink-800">
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col pt-6 pb-12 px-4 drop-shadow-2xl justify-start">
        
        {/* Top Back Button */}
        <div className="mb-4">
          <Link
            href="/carta"
            className="w-10 h-10 rounded-full bg-ink-900 border border-ink-800 flex items-center justify-center text-ink-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={20} />
          </Link>
        </div>

        {/* --- TICKET CARD --- */}
        <div className={`relative w-full flex flex-col border border-ink-800 bg-ink-900 rounded-[28px] p-6 shadow-2xl transition-all duration-500 origin-top overflow-hidden ${
          isCancelled ? "scale-95 grayscale opacity-60 rotate-1" :
          isDelivered ? "scale-[0.98] opacity-90 border-emerald-500/30" :
          ""
        }`}>
          {/* Decorative subtle background gradient */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/2 rounded-full filter blur-2xl pointer-events-none -mr-16 -mt-16" />

          {/* Sello ENTREGADO / CANCELADO */}
          {isDelivered && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30 select-none bg-ink-950/20 backdrop-blur-[1px]">
              <div
                className="-rotate-[12deg] border-[3px] border-emerald-500 text-emerald-400 font-black uppercase text-3xl tracking-[0.15em] px-4 py-2 rounded bg-ink-950/90 shadow-2xl"
                style={{
                  boxShadow: "inset 0 0 10px rgba(16,185,129,0.2), 0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                Entregado
              </div>
            </div>
          )}

          {isCancelled && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30 select-none bg-ink-950/20">
              <div
                className="-rotate-[12deg] border-[3px] border-red-500 text-red-500 font-black uppercase text-3xl tracking-[0.15em] px-4 py-2 rounded bg-ink-950/90 shadow-2xl"
                style={{
                  boxShadow: "inset 0 0 10px rgba(239,68,68,0.2), 0 4px 12px rgba(0,0,0,0.5)",
                }}
              >
                Cancelado
              </div>
            </div>
          )}

          {/* Header Info */}
          <div className="flex flex-col items-center gap-1 border-b border-ink-800 pb-4 mb-4 select-none">
            <BrandLogo size="md" />
            <span className="text-[9px] font-black tracking-[0.25em] uppercase text-ink-400">
              TICKET DE PEDIDO
            </span>
          </div>

          {/* Center Badge & Code for Boarding Pass Style */}
          <div className="flex flex-col items-center mb-6">
            <div className="border border-ink-700 bg-ink-950/80 px-6 py-2 rounded-xl text-center">
              <span className="font-serif-italic text-3xl font-black text-white">
                #{order.displayNumber}
              </span>
            </div>
            <span className="text-[11px] text-ink-400 uppercase tracking-widest font-mono mt-2 select-all">
              Código: {order.ticketCode || "—"}
            </span>
          </div>

          {/* QR Code Section (Only shown if active) */}
          {!isDone && order.ticketCode ? (
            <div className="flex flex-col items-center gap-3 pb-1 select-none animate-in fade-in duration-300">
              <div className="bg-white p-4 rounded-[20px] shadow-xl border border-black/10 select-none w-full max-w-[260px] flex flex-col items-center gap-3">
                <QRCodeSVG
                  value={order.ticketCode}
                  size={160}
                  level="H"
                  includeMargin={false}
                  fgColor="#000000"
                  bgColor="#ffffff"
                />
                <div className="w-full border-t border-gray-250 my-1" />
                <div className="w-full flex flex-col items-center">
                  <Code39Barcode value={order.ticketCode || ""} />
                  <span className="font-mono text-[9px] font-bold text-gray-700 uppercase tracking-widest mt-1 select-all">
                    {order.ticketCode}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Ticket Cutout Divider (Visual shape with left/right notches and dashed separator) */}
          <div className="relative my-5 -mx-6 h-[20px] flex items-center justify-between pointer-events-none select-none">
            {/* Left Notch */}
            <div className="w-5 h-5 rounded-full bg-ink-950 border border-ink-800 absolute left-0 -translate-x-1/2 z-10" />
            {/* Right Notch */}
            <div className="w-5 h-5 rounded-full bg-ink-950 border border-ink-800 absolute right-0 translate-x-1/2 z-10" />
            {/* Dashed separator */}
            <div className="w-full border-t border-dashed border-ink-850" />
          </div>

          {/* Detalle Tabulado */}
          <div className="flex flex-col">
            <div className="flex justify-between items-end mb-3 border-b border-ink-800 pb-1.5 font-mono">
              <span className="text-[9px] uppercase tracking-widest font-black text-ink-400">CANT / DESCRIPCIÓN</span>
              <span className="text-[9px] uppercase tracking-widest font-black text-ink-400">IMPORTE</span>
            </div>

            <ul className="flex flex-col gap-3 mb-4">
              {order.items.map((it, i) => (
                <li key={`${it.drinkId}-${i}`} className="flex justify-between items-center text-[16px] text-ink-100">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="font-mono text-emerald-400 font-black text-xl shrink-0">{it.qty}×</span>
                    <span className="text-white font-extrabold tracking-tight uppercase text-[17px] truncate max-w-[210px]">{it.name}</span>
                  </div>
                  <span className="font-mono tabular font-bold text-xs text-ink-400 shrink-0">
                    ${it.subtotal.toLocaleString("es-AR")}
                  </span>
                </li>
              ))}
            </ul>

            {/* Total Row */}
            <div className="flex justify-between items-center pt-3.5 border-t border-dashed border-ink-800">
              <span className="text-xs uppercase tracking-widest font-black text-ink-300">Total abonado</span>
              <span className="font-serif-italic text-2xl font-black tabular text-emerald-400">
                ${order.total.toLocaleString("es-AR")}
              </span>
            </div>

            {/* Timestamps */}
            <div className="mt-3.5 flex flex-col items-center justify-center font-mono text-[11px] text-ink-400 gap-1 border-t border-ink-800/60 pt-3">
              <span>Creado: {displayTimeStr} hs</span>
              {deliveredTimeStr && (
                <span className="text-emerald-400 font-bold">Entregado: {deliveredTimeStr} hs</span>
              )}
            </div>
          </div>

          {/* Footer Note */}
          <div className="mt-5 text-center text-[10px] font-black uppercase tracking-wider text-ink-400 border-t border-ink-800 pt-3 select-none">
            {isDelivered
              ? "✓ ¡Trago entregado! Disfrutá de tu noche"
              : isCancelled
                ? "✗ Pedido cancelado e invalidado"
                : "Presentá este QR en barra para retirar tu pedido"}
          </div>
        </div>

        {/* CTA to return or make another order */}
        {isDone && (
          <Link
            href="/carta"
            className="mt-6 mx-auto flex items-center justify-center gap-2 w-full max-w-xs px-6 py-4 rounded-full bg-ink-800 border border-ink-700 text-ink-50 font-bold text-xs uppercase tracking-[0.2em] hover:bg-ink-700 active:scale-95 transition-all shadow-xl cursor-pointer"
          >
            <Plus size={16} strokeWidth={3} />
            Hacer otro pedido
          </Link>
        )}
      </div>
    </main>
  );
}
