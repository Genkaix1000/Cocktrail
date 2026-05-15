"use client";

import {
  Beer,
  Droplet,
  GlassWater,
  Minus,
  Plus,
  Wine,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";

/* ── Icon map ─────────────────────────────────────────── */
const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "glass-water": GlassWater,
  beer: Beer,
  zap: Zap,
  droplet: Droplet,
  wine: Wine,
};

/* ── Types ────────────────────────────────────────────── */
type CardVariant = "promo" | "trending" | "regular";

interface DrinkCardProps {
  name: string;
  price: number;
  vibe?: string;
  icon?: string;
  variant?: CardVariant;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

/* ── Border color per variant ─────────────────────────── */
const BORDER_CLASS: Record<CardVariant, string> = {
  promo: "border-amber-border/60 ring-1 ring-amber-500/10",
  trending: "border-purple-border/60 ring-1 ring-purple-500/10",
  regular: "border-white/10",
};

export default function DrinkCard({
  name,
  price,
  vibe,
  icon,
  variant = "regular",
  quantity = 0,
  onAdd,
  onRemove,
}: DrinkCardProps) {
  const isRegular = variant === "regular";
  const IconComponent = icon ? ICON_MAP[icon] ?? GlassWater : null;

  const handleActivate = () => {
    if (onAdd) onAdd();
  };

  /* ── Vertical Action Buttons ────────────────────────── */
  const ActionButtons = () => (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5"
    >
      {quantity > 0 ? (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
            className="w-10 h-10 rounded-lg bg-blue text-ink-950 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Plus size={18} strokeWidth={3} />
          </button>
          <span className="text-[14px] font-black text-ink-50 w-full text-center tabular py-0.5">
            {quantity}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            className="w-10 h-10 rounded-lg bg-white/10 text-ink-50 flex items-center justify-center active:scale-90 transition-transform"
          >
            <Minus size={18} strokeWidth={3} />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
          className="w-10 h-10 rounded-lg bg-white/10 text-ink-100 flex items-center justify-center active:scale-90 transition-transform"
        >
          <Plus size={20} strokeWidth={3} />
        </button>
      )}
    </div>
  );

  /* ── Layout Horizontal (Carta Regular) ───────────────────── */
  if (isRegular) {
    return (
      <div
        onClick={handleActivate}
        className={`flex items-center justify-between p-3 pl-4 rounded-[22px] border bg-white/5 backdrop-blur-md transition-all active:bg-white/5 ${BORDER_CLASS.regular}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            {IconComponent && <IconComponent size={20} className="text-ink-400" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[16px] text-ink-50 leading-tight truncate">
              {name}
            </span>
            <span className="text-[14px] font-black text-blue tabular mt-0.5">
              ${price.toLocaleString("es-AR")}
            </span>
          </div>
        </div>
        <ActionButtons />
      </div>
    );
  }

  /* ── Layout Vertical (Promo / Trending) ─────────────── */
  return (
    <div
      onClick={handleActivate}
      className={`relative flex flex-row gap-4 p-4 pr-3 rounded-[24px] border cursor-pointer bg-white/5 backdrop-blur-md transition-all min-h-[140px] ${BORDER_CLASS[variant]}`}
    >
      <div className="flex flex-col flex-1">
        <div className="mb-2">
          <span className={`text-[9px] font-black tracking-[0.2em] uppercase px-2 py-0.5 rounded-full ${
            variant === "promo" ? "text-amber bg-amber-500/10" : "text-purple bg-purple-500/10"
          }`}>
            {variant === "promo" ? "⚡ PROMO" : "▲ TREND"}
          </span>
        </div>
        
        <div className="flex items-start gap-2.5 flex-1">
          {IconComponent && <IconComponent size={20} className="text-ink-400 mt-1 shrink-0" />}
          <span className="font-bold text-[18px] leading-[1.2] text-ink-50">
            {name}
          </span>
        </div>

        <div className="mt-auto">
          <span className={`text-[17px] font-black tabular ${
            variant === "promo" ? "text-amber" : "text-purple"
          }`}>
            ${price.toLocaleString("es-AR")}
          </span>
        </div>
      </div>

      <div className="flex items-center">
        <ActionButtons />
      </div>
    </div>
  );
}
