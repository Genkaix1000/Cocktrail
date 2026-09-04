"use client";

import type { ReactNode } from "react";
import { KeyRound, Power } from "lucide-react";

type Props = {
  nightOpen: boolean;
  onCloseNight: () => void;
  onOpenNight: () => void;
  onEditKeyword?: () => void;
  subtitle?: string;
};

const NIGHT_CARD_BG_OPEN =
  "linear-gradient(165deg, #6D5EF9 0%, #4839C7 28%, #1D1A38 62%, #07070A 100%)";
const NIGHT_CARD_BG_CLOSED =
  "linear-gradient(165deg, #4839C7 0%, #2B2566 38%, #14141E 72%, #07070A 100%)";

function NightCardShell({
  bg,
  children,
}: {
  bg: string;
  children: ReactNode;
}) {
  return (
    <div
      data-tour="night-card"
      className="relative overflow-hidden rounded-2xl p-4 text-white"
      style={{ background: bg }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-8 -right-6 h-28 w-28 rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(162,154,255,0.45) 0%, transparent 70%)" }}
        aria-hidden
      />
      {children}
    </div>
  );
}

/**
 * Card CTA de noche (pie del sidebar). Widget flotante con margen —
 * docs/design/design.md §4.10.
 */
export function NightActionCard({
  nightOpen,
  onCloseNight,
  onOpenNight,
  onEditKeyword,
  subtitle,
}: Props) {
  if (nightOpen) {
    return (
      <NightCardShell bg={NIGHT_CARD_BG_OPEN}>
        <p className="relative text-[14px] font-semibold leading-snug">Noche en curso</p>
        {subtitle ? (
          <p className="relative text-[12px] text-white/55 mt-0.5 truncate">{subtitle}</p>
        ) : (
          <p className="relative text-[12px] text-white/55 mt-0.5">Cerrá cuando termine el servicio.</p>
        )}
        <button
          type="button"
          data-tour="night-close-btn"
          onClick={onCloseNight}
          className="relative mt-3 w-full h-9 rounded-full bg-white text-[#2B2566] hover:bg-white/90 flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
        >
          <Power size={14} strokeWidth={2} />
          Cerrar noche
        </button>
        {onEditKeyword && (
          <button
            type="button"
            onClick={onEditKeyword}
            className="relative mt-2 w-full h-8 rounded-full text-white/70 hover:text-white flex items-center justify-center gap-1.5 text-[12px] font-medium transition-colors cursor-pointer"
          >
            <KeyRound size={12} strokeWidth={1.8} />
            Clave de la noche
          </button>
        )}
      </NightCardShell>
    );
  }

  return (
    <NightCardShell bg={NIGHT_CARD_BG_CLOSED}>
      <p className="relative text-[14px] font-semibold leading-snug">Abrir noche</p>
      <p className="relative text-[12px] text-white/55 mt-0.5 leading-snug">
        Con la palabra clave para empezar a operar.
      </p>
      <button
        type="button"
        data-tour="night-open-btn"
        onClick={onOpenNight}
        className="relative mt-3 w-full h-9 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
      >
        <Power size={14} strokeWidth={2} />
        Abrir noche
      </button>
    </NightCardShell>
  );
}
