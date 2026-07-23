"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Plus,
  Clock,
  Ticket as TicketIcon,
  Receipt,
  Check,
  CheckCircle2,
  XCircle
} from "lucide-react";
import Link from "next/link";
import type { Drink, Order, OrderItem } from "@cocktrail/shared";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { STATUS_META } from "@/lib/orderStatus";
import { drinksService } from "@/services/drinks.service";
import { GlassWater, Beer, Zap, Droplet, DropletOff, Wine, Martini, Citrus, CupSoda, BottleWine } from "lucide-react";
import type { ComponentType } from "react";

const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "glass-water": GlassWater,
  beer: Beer,
  zap: Zap,
  droplet: Droplet,
  "droplet-off": DropletOff,
  wine: Wine,
  martini: Martini,
  citrus: Citrus,
  "cup-soda": CupSoda,
  "bottle-wine": BottleWine,
};

function TicketItemRow({ item, drink, accentColor, showPrice = false }: {
  item: OrderItem;
  drink?: Drink;
  accentColor: string;
  showPrice?: boolean;
}) {
  const iconName = drink?.iconName || "glass-water";
  const IconComponent = ICON_MAP[iconName] || GlassWater;

  if (showPrice) {
    return (
      <li className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0 w-6 h-6 flex items-center justify-center text-neutral-700 bg-neutral-100 rounded-md">
            <IconComponent size={14} />
          </div>
          <span className="font-sans text-sm font-black text-black tabular-nums shrink-0">
            x{item.qty}
          </span>
          <span className="text-[13px] font-bold uppercase tracking-tight truncate leading-tight text-black flex-1">
            {item.name}
          </span>
        </div>
        <span className="font-mono text-sm font-black shrink-0" style={{ color: accentColor }}>
          ${item.subtotal.toLocaleString("es-AR")}
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-0.5">
      <div className="shrink-0 w-6 h-6 flex items-center justify-center text-neutral-700 bg-neutral-100 rounded-md">
        <IconComponent size={14} />
      </div>
      <div
        className="shrink-0 px-1.5 h-7 flex items-center justify-center rounded-md font-mono font-black text-xs"
        style={{
          color: accentColor,
          backgroundColor: `${accentColor}18`,
          border: `1px solid ${accentColor}30`,
        }}
      >
        x{item.qty}
      </div>
      <span
        className="text-[15px] font-black uppercase tracking-tight truncate leading-tight flex-1"
        style={{ color: accentColor }}
      >
        {item.name}
      </span>
    </li>
  );
}

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
  const quietZone = 4;
  const height = 56;
  const barcodeWidth = modules.length * moduleWidth;
  const totalWidth = barcodeWidth + quietZone * 2;

  let pathData = "";
  for (let idx = 0; idx < modules.length; idx++) {
    if (modules[idx] === 1) {
      const x = quietZone + idx * moduleWidth;
      pathData += `M${x},0 h${moduleWidth} v${height} h-${moduleWidth} Z `;
    }
  }

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${totalWidth} ${height}`}
      className="mx-auto select-none fill-black animate-fade-in"
      aria-hidden
    >
      <path d={pathData} />
    </svg>
  );
}

function TicketPerforation() {
  return (
    <div className="relative h-5 flex items-center -mx-1 select-none" aria-hidden>
      <div className="absolute left-0 w-4 h-4 rounded-full bg-ink-950 -translate-x-1/2" />
      <div className="absolute right-0 w-4 h-4 rounded-full bg-ink-950 translate-x-1/2" />
      <div className="w-full flex items-center gap-[3px] px-2">
        {Array.from({ length: 28 }).map((_, i) => (
          <div
            key={i}
            className={`h-px flex-1 ${i % 3 === 0 ? "bg-transparent" : "bg-neutral-300"}`}
          />
        ))}
      </div>
    </div>
  );
}

function statusFooterLabel(status: Order["status"]): string {
  return (STATUS_META[status]?.short ?? status).toUpperCase();
}

function statusFooterColor(status: Order["status"], accentColor: string): string {
  if (status === "pendiente" || status === "entregado") return accentColor;
  if (status === "cancelado") return "#b91c1c";
  return "#1a1a1a";
}

function getStatusIcon(status: Order["status"]) {
  const size = 12;
  switch (status) {
    case "pendiente":
      return <CheckCircle2 size={size} />;
    case "entregado":
      return <Check size={size} />;
    case "cancelado":
      return <XCircle size={size} />;
    default:
      return null;
  }
}

type Props = { order: Order };

export default function Ticket({ order }: Props) {
  const [drinks, setDrinks] = useState<Drink[]>([]);

  const isDelivered = order.status === "entregado";
  const isCancelled = order.status === "cancelado";
  const isDone = isDelivered || isCancelled;

  const displayTimeStr = new Date(order.createdAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  useEffect(() => {
    drinksService.list()
      .then(setDrinks)
      .catch(() => {});
  }, []);

  const accentColor = "#1a5c3a";

  return (
    <main className="min-h-screen bg-ink-950 flex flex-col relative font-sans text-ink-50 selection:bg-ink-800">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col pt-4 pb-8 px-4 justify-start">
        <div className="flex items-center justify-between mb-4 select-none">
          <Link
            href="/carta"
            className="w-10 h-10 rounded-full bg-ink-900 border border-ink-800 flex items-center justify-center text-ink-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={20} />
          </Link>
          <BrandLogo size="md" />
          <div className="w-10 h-10" />
        </div>

        <div
          className={`relative w-full flex flex-col transition-all duration-500 origin-top ${
            isCancelled ? "scale-95 grayscale opacity-60 rotate-1" : isDelivered ? "scale-[0.98] opacity-90" : ""
          }`}
        >
          <div className="relative bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-neutral-200 z-10">
            {isDelivered && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30 select-none bg-white/30 backdrop-blur-[1px] rounded-2xl">
                <div
                  className="-rotate-[12deg] border-[3px] font-black uppercase text-3xl tracking-[0.15em] px-4 py-2 rounded bg-white/95 shadow-lg animate-in zoom-in-50 duration-300"
                  style={{ borderColor: accentColor, color: accentColor }}
                >
                  Entregado
                </div>
              </div>
            )}

            {isCancelled && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30 select-none bg-white/30 rounded-2xl">
                <div className="-rotate-[12deg] border-[3px] border-danger text-danger font-black uppercase text-3xl tracking-[0.15em] px-4 py-2 rounded bg-white/95 shadow-lg">
                  Cancelado
                </div>
              </div>
            )}

            {/* 1. TOP — Identifier (barcode) */}
            <section className="px-5 pt-5 pb-3 flex flex-col items-center bg-white rounded-t-2xl">
              {order.ticketCode ? (
                <div className="flex flex-col items-center w-full">
                  <Code39Barcode value={order.ticketCode} />
                  <span className="font-sans text-[11px] font-semibold text-neutral-800 tracking-[0.12em] mt-2 select-all uppercase">
                    {order.ticketCode}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-neutral-400 font-sans italic py-4">Generando código…</span>
              )}
            </section>

            <TicketPerforation />

            {/* 2. MIDDLE — Ticket body */}
            <section className="px-5 py-4 bg-white">
              <div className="flex items-center justify-center gap-1.5 mb-3.5 text-neutral-950">
                <Receipt size={14} className="shrink-0 text-neutral-955" />
                <h2 className="text-center text-[11px] font-black tracking-[0.18em] uppercase leading-none">
                  Ticket de Control
                </h2>
              </div>

              <ul className="flex flex-col gap-2.5 max-h-[180px] overflow-y-auto no-scrollbar">
                {order.items.map((it, i) => (
                  <TicketItemRow
                    key={`${it.drinkId}-${i}`}
                    item={it}
                    drink={drinks.find(d => d.id === it.drinkId)}
                    accentColor={accentColor}
                  />
                ))}
              </ul>
            </section>

            <TicketPerforation />

            {/* 3. BOTTOM — Ticket number & status */}
            <section className="px-5 pt-4 pb-0 bg-white">
              <div className="flex flex-col items-center mb-4">
                <div className="flex items-center justify-center gap-1.5 text-neutral-950 mb-1.5">
                  <TicketIcon size={12} className="shrink-0 text-neutral-955" />
                  <span className="text-[11px] font-black tracking-[0.18em] uppercase leading-none">
                    Número de Ticket
                  </span>
                </div>
                <span
                  className="font-sans text-[42px] font-black leading-none tracking-tight"
                  style={{ color: accentColor }}
                >
                  #{order.displayNumber}
                </span>
              </div>

              <div className="flex justify-between items-center border-t border-neutral-300 py-2.5 px-5 bg-neutral-50/80 -mx-5 rounded-b-2xl">
                <div className="flex items-center gap-1.5 text-neutral-800 font-mono text-[13px] font-bold">
                  <Clock size={13} className="text-neutral-500" />
                  <span>{displayTimeStr} hs</span>
                </div>
                <span
                  className="text-[11px] font-black uppercase tracking-wider leading-none flex items-center gap-1.5 px-2 py-1 rounded"
                  style={{
                    color: statusFooterColor(order.status, accentColor),
                    backgroundColor: `${statusFooterColor(order.status, accentColor)}10`,
                    border: `1px solid ${statusFooterColor(order.status, accentColor)}25`,
                  }}
                >
                  {getStatusIcon(order.status)}
                  {statusFooterLabel(order.status)}
                </span>
              </div>
            </section>
          </div>
        </div>

        {/* --- CUSTOMER RECEIPT PANEL (White receipt aesthetic) --- */}
        <div className="mt-4 relative bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] text-neutral-850 border border-neutral-200 z-10">
          <div className="px-5 pt-4 pb-3 bg-white rounded-t-2xl">
            <div className="flex items-center justify-center gap-1.5 mb-3.5 text-neutral-950">
              <Receipt size={14} className="shrink-0 text-neutral-955" />
              <h3 className="text-[11px] font-black tracking-[0.18em] uppercase leading-none">
                Recibo de Pago
              </h3>
            </div>
            <ul className="space-y-2.5">
              {order.items.map((it, i) => (
                <TicketItemRow
                  key={i}
                  item={it}
                  drink={drinks.find(d => d.id === it.drinkId)}
                  accentColor={accentColor}
                  showPrice
                />
              ))}
            </ul>
          </div>

          <TicketPerforation />

          <div className="px-5 pt-3 pb-3.5 bg-neutral-50/80 border-t border-neutral-200 rounded-b-2xl">
            <div className="flex justify-between items-center font-bold text-neutral-800 text-[11px] uppercase tracking-wider">
              <span className="text-neutral-500">Total Abonado</span>
              <span
                className="font-sans text-lg font-black tabular-nums"
                style={{ color: accentColor }}
              >
                ${order.total.toLocaleString("es-AR")}
              </span>
            </div>
          </div>
        </div>

        {isDone && (
          <Link
            href="/carta"
            className="mt-5 mx-auto flex items-center justify-center gap-2 w-full max-w-xs px-5 py-3 bg-blue text-ink-950 font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl cursor-pointer"
          >
            <Plus size={15} strokeWidth={3} />
            Hacer otro pedido
          </Link>
        )}
      </div>
    </main>
  );
}


