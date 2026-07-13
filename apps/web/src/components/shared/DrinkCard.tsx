"use client";

import { Minus, Plus, GlassWater, Beer, Zap, Droplet, Wine, Martini, Citrus, CupSoda, BottleWine } from "lucide-react";
import Image from "next/image";
import { useState, type ComponentType } from "react";

/* ── Icon map (fallback if no image) ──────────────────── */
const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  "glass-water": GlassWater,
  beer: Beer,
  zap: Zap,
  droplet: Droplet,
  wine: Wine,
  martini: Martini,
  citrus: Citrus,
  "cup-soda": CupSoda,
  "bottle-wine": BottleWine,
};

type CardVariant = "promo" | "trending" | "regular";

interface DrinkCardProps {
  name: string;
  price: number;
  vibe?: string;
  icon?: string;
  image?: string;
  variant?: CardVariant;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

interface ActionButtonsProps {
  quantity: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

function ActionButtons({ quantity, onAdd, onRemove }: ActionButtonsProps) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 bg-black/30 backdrop-blur-md p-1.5 rounded-[16px] border border-white/10"
    >
      {quantity > 0 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            aria-label="Quitar del pedido"
            className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center active:scale-95 transition-transform"
          >
            <Minus size={18} strokeWidth={3} />
          </button>
          <span className="text-[15px] font-black text-white w-6 text-center tabular">
            {quantity}
          </span>
        </>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
        aria-label="Agregar al pedido"
        className="w-10 h-10 rounded-xl bg-green text-black flex items-center justify-center active:scale-95 transition-transform hover:brightness-110"
      >
        <Plus size={20} strokeWidth={3} className="font-bold" />
      </button>
    </div>
  );
}

export default function DrinkCard({
  name,
  price,
  vibe,
  icon,
  image,
  variant = "regular",
  quantity = 0,
  onAdd,
  onRemove,
}: DrinkCardProps) {
  const isRegular = variant === "regular";
  const IconComponent = icon ? ICON_MAP[icon] ?? GlassWater : null;
  const [isClicked, setIsClicked] = useState(false);

  const handleActivate = () => {
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 150);
    if (onAdd) onAdd();
  };

  /* ── VARIANTE A: "Nuestra Carta" (Lista) ─────────────── */
  if (isRegular) {
    return (
      <div
        onClick={handleActivate}
        className={`flex items-center justify-between p-3 rounded-2xl border backdrop-blur-md transition-all duration-150 cursor-pointer ${
          isClicked
            ? "scale-[1.03] border-accent bg-accent/15 shadow-[0_0_20px_rgba(109,179,242,0.45)]"
            : quantity > 0
              ? "border-[var(--primary-base)] shadow-[0_0_15px_var(--primary-soft)] bg-[var(--primary-soft)] hover:scale-[1.02] active:scale-[0.98]"
              : "border-white/10 bg-white/5 hover:bg-white/10 hover:scale-[1.02] active:scale-[0.98]"
        }`}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center bg-white/[0.03] border border-white/10 text-white/50 shadow-inner">
            {IconComponent ? (
              <IconComponent size={26} strokeWidth={1.5} />
            ) : (
              <GlassWater size={26} strokeWidth={1.5} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[16px] text-white leading-tight truncate">
              {name}
            </span>
            {vibe && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 truncate">
                {vibe}
              </span>
            )}
            <span className="text-[15px] font-black text-blue tabular mt-1">
              ${price.toLocaleString("es-AR")}
            </span>
          </div>
        </div>
        <ActionButtons quantity={quantity} onAdd={onAdd} onRemove={onRemove} />
      </div>
    );
  }

  /* ── VARIANTE B: "Tendencias / Promos" (Banner) ──────── */
  return (
    <div
      onClick={handleActivate}
      className={`relative flex flex-col rounded-2xl border bg-white/5 overflow-hidden cursor-pointer transition-all duration-150 min-h-[180px] ${
        isClicked
          ? "scale-[1.03] border-accent shadow-[0_0_20px_rgba(109,179,242,0.45)]"
          : quantity > 0
            ? "border-[var(--primary-base)] shadow-[0_0_20px_var(--primary-soft)] hover:scale-[1.02] active:scale-[0.98]"
            : "border-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-[0.98]"
      }`}
    >
      {/* Background Image */}
      {image ? (
        <Image
          src={image}
          alt={name}
          fill
          className="object-cover z-0"
          sizes="(max-width: 768px) 100vw, 33vw"
          priority={false}
        />
      ) : (
        <div className="absolute inset-0 bg-ink-800 z-0 flex items-center justify-center opacity-20">
          {IconComponent && <IconComponent size={64} className="text-white" />}
        </div>
      )}

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none" />

      {/* Content */}
      <div className="relative z-20 flex flex-col flex-1 p-4">
        <div className="mb-auto">
          <span className={`inline-block text-[9px] font-black tracking-[0.2em] uppercase px-2.5 py-1 rounded-full backdrop-blur-md ${
            variant === "promo" ? "text-amber bg-amber-soft border border-amber-line" : "text-blue bg-blue-soft border border-blue-line"
          }`}>
            {variant === "promo" ? "⚡ PROMO" : "▲ TREND"}
          </span>
        </div>

        <div className="flex items-end justify-between mt-auto">
          <div className="flex flex-col min-w-0 pr-4">
            {vibe && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 drop-shadow-md truncate">
                {vibe}
              </span>
            )}
            <span className="font-bold text-[20px] leading-tight text-white mb-1 drop-shadow-md">
              {name}
            </span>
            <span className="text-[18px] font-black tabular text-blue drop-shadow-md">
              ${price.toLocaleString("es-AR")}
            </span>
          </div>

          <div className="shrink-0">
            <ActionButtons quantity={quantity} onAdd={onAdd} onRemove={onRemove} />
          </div>
        </div>
      </div>
    </div>
  );
}
