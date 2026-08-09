"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Map,
  MonitorSmartphone,
  PartyPopper,
  Sparkles,
  Users,
  Wine,
  X,
} from "lucide-react";
import { type TourStep, type TourStepIcon } from "./tourSteps";

type Spot = { top: number; left: number; width: number; height: number };

type Props = {
  step: TourStep;
  index: number;
  total: number;
  busy?: boolean;
  visible?: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
};

const PAD = 10;
const MP_BLUE = "#009EE3";

function measure(selector: string | null, forceCenter: boolean): Spot | null {
  if (forceCenter || !selector) return null;
  const nodes = Array.from(document.querySelectorAll(selector));
  const el = nodes.find((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function cardPos(
  spot: Spot | null,
  cardW: number,
  cardH: number,
  preferAwayFromClick?: boolean,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;

  if (!spot) {
    return {
      top: Math.max(margin, (vh - cardH) / 2),
      left: Math.max(margin, (vw - cardW) / 2),
    };
  }

  const gap = 14;
  // Si el paso espera un click, preferir arriba/abajo para no tapar el CTA
  if (preferAwayFromClick) {
    const above = spot.top - gap - cardH;
    if (above >= margin) {
      return {
        top: above,
        left: Math.min(Math.max(margin, spot.left), vw - cardW - margin),
      };
    }
    const below = spot.top + spot.height + gap;
    if (below + cardH <= vh - margin) {
      return {
        top: below,
        left: Math.min(Math.max(margin, spot.left), vw - cardW - margin),
      };
    }
  }

  const right = spot.left + spot.width + gap;
  if (right + cardW <= vw - margin) {
    return {
      top: Math.min(Math.max(margin, spot.top), vh - cardH - margin),
      left: right,
    };
  }

  const left = spot.left - gap - cardW;
  if (left >= margin) {
    return {
      top: Math.min(Math.max(margin, spot.top), vh - cardH - margin),
      left,
    };
  }

  const below = spot.top + spot.height + gap;
  if (below + cardH <= vh - margin) {
    return {
      top: below,
      left: Math.min(Math.max(margin, spot.left), vw - cardW - margin),
    };
  }

  return {
    top: Math.max(margin, spot.top - gap - cardH),
    left: Math.min(Math.max(margin, spot.left), vw - cardW - margin),
  };
}

function StepIcon({ icon, mp }: { icon: TourStepIcon; mp?: boolean }) {
  const wrap = (child: ReactNode, bg: string, color?: string) => (
    <span
      className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden"
      style={{ background: bg, color }}
    >
      {child}
    </span>
  );

  if (icon === "mp") {
    return wrap(
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/mercadopago-icon.webp" alt="" className="w-8 h-8 object-contain" />,
      "rgba(0, 158, 227, 0.12)",
    );
  }

  if (icon === "brand") {
    return wrap(
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/miboliche-mark.svg" alt="" className="w-7 h-7 object-contain tour-miboliche-ink" />,
      "var(--bg-surface)",
    );
  }

  if (icon === "sparkles") {
    return wrap(<Sparkles size={20} strokeWidth={1.9} />, "var(--accent-surface)", "var(--accent-text)");
  }
  if (icon === "wine") {
    return wrap(<Wine size={20} strokeWidth={1.9} />, "color-mix(in srgb, #c45c26 16%, transparent)", "#c45c26");
  }
  if (icon === "users") {
    return wrap(<Users size={20} strokeWidth={1.9} />, "color-mix(in srgb, #5b6abf 16%, transparent)", "#5b6abf");
  }
  if (icon === "monitor") {
    return wrap(
      <MonitorSmartphone size={20} strokeWidth={1.9} />,
      mp ? "rgba(0, 158, 227, 0.15)" : "var(--accent-surface)",
      mp ? MP_BLUE : "var(--accent-text)",
    );
  }
  if (icon === "map") {
    return wrap(<Map size={20} strokeWidth={1.9} />, "var(--bg-surface)", "var(--text-secondary)");
  }
  return wrap(<PartyPopper size={20} strokeWidth={1.9} />, "var(--success-soft)", "var(--success-base)");
}

function StepProgressBar({
  index,
  total,
  accent,
}: {
  index: number;
  total: number;
  accent?: boolean;
}) {
  const activeColor = accent ? MP_BLUE : "var(--accent-primary)";
  return (
    <div className="flex flex-col gap-1.5 w-full" aria-label={`Paso ${index + 1} de ${total}`}>
      <p className="text-[11px] font-medium text-[var(--text-tertiary)]">
        Paso {index + 1} de {total}
      </p>
      <div className="flex items-center gap-1 w-full">
        {Array.from({ length: total }, (_, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full transition-all duration-300"
              style={{
                background: done || active ? activeColor : "var(--border-subtle)",
                opacity: active ? 1 : done ? 0.6 : 1,
                boxShadow: active ? `0 0 0 1px ${activeColor}` : undefined,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function RichBody({ text, mpAccent }: { text: string; mpAccent?: boolean }) {
  if (!mpAccent || !text.includes("Mercado Pago")) {
    return <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{text}</p>;
  }
  const parts = text.split(/(Mercado Pago)/g);
  return (
    <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
      {parts.map((part, i) =>
        part === "Mercado Pago" ? (
          <span
            key={i}
            className="inline-flex items-center gap-1 font-semibold mx-0.5 align-middle"
            style={{ color: MP_BLUE }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mercadopago-icon.webp" alt="" className="w-3.5 h-3.5 object-contain inline-block" />
            Mercado Pago
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export function TourOverlay({
  step,
  index,
  total,
  busy,
  visible = true,
  onNext,
  onPrev,
  onSkip,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const forceCenter =
    !step.selector ||
    (step.id === "nav-overview" && typeof window !== "undefined" && window.innerWidth < 768);

  const remeasure = () => {
    const next = measure(step.selector, forceCenter);
    setSpot(next);
    const card = cardRef.current;
    const cardW = card?.offsetWidth ?? 360;
    const cardH = card?.offsetHeight ?? 260;
    setPos(cardPos(next, cardW, cardH, Boolean(step.advanceOnClick)));
  };

  useLayoutEffect(() => {
    remeasure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, step.selector, forceCenter]);

  // Remeasure when busy ends (DOM may have shifted) without re-animating the card
  useLayoutEffect(() => {
    remeasure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
    const onScrollOrResize = () => remeasure();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, step.selector, forceCenter]);

  const isFirst = index === 0;
  const isLast = index >= total - 1;
  const body =
    step.id === "nav-overview" && forceCenter
      ? "En pantallas chicas abrís el menú con el botón de arriba. Ahí están Dashboard, Historial, Auditoría, Pagos, Carta y Staff."
      : step.body;

  const borderColor = step.mpAccent ? MP_BLUE : "var(--accent-primary)";
  const ctaBg = step.mpAccent ? MP_BLUE : "var(--accent-primary)";
  const ctaHover = step.mpAccent ? "#008BCC" : "var(--accent-primary-hover)";

  return (
    <div
      className="fixed inset-0 z-[10000] pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.15s ease" }}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      {spot ? (
        <div
          className="fixed rounded-2xl pointer-events-none transition-[top,left,width,height] duration-500 ease-out"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: step.mpAccent
              ? `0 0 0 9999px rgba(0, 0, 0, 0.72), 0 0 0 3px ${MP_BLUE}`
              : "0 0 0 9999px rgba(0, 0, 0, 0.72), 0 0 0 2px color-mix(in srgb, var(--accent-primary) 70%, transparent)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/72 pointer-events-none" />
      )}

      <div
        ref={cardRef}
        className="fixed w-[min(400px,calc(100vw-28px))] rounded-2xl bg-[var(--bg-panel)] shadow-card p-5 flex flex-col gap-3.5 animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-300"
        style={{
          top: pos.top,
          left: pos.left,
          border: `1.5px solid ${borderColor}`,
          pointerEvents: visible ? "auto" : "none",
          transition: "top 0.4s ease-out, left 0.4s ease-out, border-color 0.3s ease",
        }}
      >
        {isFirst && step.icon === "brand" && (
          <div className="flex justify-center -mt-1 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/miboliche-horizontal.svg"
              alt="Mi Boliche"
              className="h-9 w-auto max-w-[220px] object-contain tour-miboliche-ink"
            />
          </div>
        )}

        <StepProgressBar index={index} total={total} accent={step.mpAccent} />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <StepIcon icon={step.icon} mp={step.mpAccent} />
            <div className="min-w-0 pt-0.5">
              {busy && (
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                  Moviendo…
                </p>
              )}
              <h2
                className="text-[17px] font-semibold tracking-tight leading-snug"
                style={{ color: step.mpAccent ? MP_BLUE : "var(--text-primary)" }}
              >
                {step.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] cursor-pointer shrink-0"
            aria-label="Cerrar recorrido"
          >
            <X size={16} />
          </button>
        </div>

        <RichBody text={body} mpAccent={step.mpAccent} />

        {step.advanceOnClick && (
          <p className="text-[12px] font-medium rounded-xl px-3 py-2 bg-[var(--accent-surface)] text-[var(--accent-text)]">
            Tocá el botón resaltado, o Continuar y lo tocamos por vos.
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            onClick={onSkip}
            className="text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer px-1"
          >
            Saltar
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={isFirst || busy}
              className="w-9 h-9 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={busy}
              className="h-9 px-4 rounded-full text-white text-[13px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-60 shadow-sm transition-colors"
              style={{ background: ctaBg }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = ctaHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = ctaBg;
              }}
            >
              {isLast
                ? "Listo"
                : step.advanceOnClick
                  ? "Continuar"
                  : isFirst
                    ? "Empezar"
                    : "Siguiente"}
              {!isLast && <ChevronRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
