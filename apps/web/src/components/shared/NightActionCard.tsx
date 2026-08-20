"use client";

import { KeyRound, Power, Moon } from "lucide-react";

type Props = {
  nightOpen: boolean;
  onCloseNight: () => void;
  onOpenNight: () => void;
  onEditKeyword?: () => void;
  subtitle?: string;
  /** Sidebar colapsado: solo icono, sin tapar el nav. */
  compact?: boolean;
};

const VIOLET_WAVE =
  "url(\"data:image/svg+xml,%3Csvg width='120' height='80' viewBox='0 0 120 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 Q30 10 60 40 T120 40' fill='none' stroke='%236d5ef9' stroke-width='1.2' opacity='0.45'/%3E%3Cpath d='M0 55 Q30 25 60 55 T120 55' fill='none' stroke='%23a6a1ff' stroke-width='1' opacity='0.25'/%3E%3C/svg%3E\")";

/**
 * Card CTA de noche (pie del sidebar).
 * Gradiente / ondas = acento de marca (violeta miBoliche).
 */
export function NightActionCard({
  nightOpen,
  onCloseNight,
  onOpenNight,
  onEditKeyword,
  subtitle,
  compact = false,
}: Props) {
  if (compact) {
    return (
      <button
        type="button"
        title={nightOpen ? "Cerrar noche" : "Abrir noche"}
        onClick={nightOpen ? onCloseNight : onOpenNight}
        className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-white flex items-center justify-center cursor-pointer hover:bg-[var(--accent-primary-hover)] transition-colors"
      >
        <Power size={16} strokeWidth={2} />
      </button>
    );
  }

  if (nightOpen) {
    return (
      <div
        data-tour="night-card"
        className="relative overflow-hidden rounded-2xl p-4 text-white"
        style={{
          background:
            "linear-gradient(160deg, #2a2166 0%, #1a1830 55%, #111118 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: VIOLET_WAVE,
            backgroundSize: "100% 100%",
          }}
          aria-hidden
        />
        <Moon size={16} strokeWidth={1.8} className="relative text-white/80 mb-2" />
        <p className="relative text-[14px] font-semibold leading-snug">Noche en curso</p>
        {subtitle ? (
          <p className="relative text-[12px] text-white/55 mt-0.5 truncate">{subtitle}</p>
        ) : (
          <p className="relative text-[12px] text-white/55 mt-0.5">
            Cerrá cuando termine el servicio.
          </p>
        )}
        <button
          type="button"
          data-tour="night-close-btn"
          onClick={onCloseNight}
          className="relative mt-3 w-full h-9 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
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
      </div>
    );
  }

  return (
    <div
      data-tour="night-card"
      className="relative overflow-hidden rounded-2xl p-4 text-white"
      style={{
        background:
          "linear-gradient(160deg, #6d5ef9 0%, #4338ca 50%, #1a1830 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: VIOLET_WAVE,
          backgroundSize: "100% 100%",
        }}
        aria-hidden
      />
      <Moon size={16} strokeWidth={1.8} className="relative text-white/80 mb-2" />
      <p className="relative text-[14px] font-semibold leading-snug">Abrir noche</p>
      <p className="relative text-[12px] text-white/55 mt-0.5 leading-snug">
        Con la palabra clave para empezar a operar.
      </p>
      <button
        type="button"
        data-tour="night-open-btn"
        onClick={onOpenNight}
        className="relative mt-3 w-full h-9 rounded-full bg-white/95 hover:bg-white text-[#2a2166] flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
      >
        <Power size={14} strokeWidth={2} />
        Abrir noche
      </button>
    </div>
  );
}
