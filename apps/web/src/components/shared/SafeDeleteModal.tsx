"use client";

import { AlertTriangle, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export const HOLD_CONFIRM_MS = 1100;

type Props = {
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /**
   * @deprecated Ya no se tipea para confirmar. Se acepta por compat con callers viejos.
   */
  expectedText?: string;
  /** Usado solo en el warning default. */
  typeLabel?: string;
  /** Reemplaza el mensaje de advertencia default. */
  warning?: ReactNode;
  /** Texto del botón de hold (default: "Confirmar"). */
  confirmLabel?: string;
  /** Deshabilita el hold (ej. mientras carga el detalle del warning). */
  disabled?: boolean;
};

/**
 * Confirmación destructiva: mantené presionado para confirmar (sin tipeo).
 * Soltar cancela el progreso. Escape / Cancelar cierran.
 */
export default function SafeDeleteModal({
  onClose,
  onConfirm,
  title,
  expectedText,
  typeLabel = "este elemento",
  warning,
  confirmLabel = "Confirmar",
  disabled,
}: Props) {
  const [holding, setHolding] = useState(false);
  const confirmedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHold() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  }

  function startHold() {
    if (confirmedRef.current || disabled) return;
    setHolding(true);
    timerRef.current = setTimeout(() => {
      confirmedRef.current = true;
      timerRef.current = null;
      onConfirm();
      onClose();
    }, HOLD_CONFIRM_MS);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hold-confirm-title"
        className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-[22px] p-6 shadow-2xl animate-in slide-in-from-bottom-10"
      >
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-danger-soft border border-danger-line rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <h2 id="hold-confirm-title" className="font-serif-italic text-[20px] text-ink-50 leading-tight">
                {title}
              </h2>
              <p className="text-[9px] text-ink-500 uppercase tracking-[0.18em] font-medium mt-1">
                Confirmación requerida
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-ink-850 hover:bg-ink-800 rounded-lg text-ink-400 hover:text-ink-200 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 bg-danger-soft/30 border border-danger-line/20 rounded-xl p-3.5 text-xs text-ink-200 leading-relaxed">
          {warning ?? (
            <>
              ¿Estás seguro de que querés realizar esta acción
              {expectedText ? (
                <>
                  {" "}
                  sobre <strong className="text-danger font-semibold">{expectedText}</strong>
                </>
              ) : typeLabel ? (
                <>
                  {" "}
                  con {typeLabel}
                </>
              ) : null}
              ?
            </>
          )}
        </div>

        <p className="text-[11px] text-ink-400 mb-3 text-center">
          Mantené presionado el botón para confirmar
        </p>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 bg-ink-850 border border-ink-750 text-ink-300 font-medium rounded-xl text-xs uppercase tracking-[0.08em] hover:text-white transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            aria-label={`${confirmLabel}. Mantené presionado para confirmar.`}
            disabled={disabled}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture?.(e.pointerId);
              startHold();
            }}
            onPointerUp={clearHold}
            onPointerCancel={clearHold}
            onLostPointerCapture={clearHold}
            onContextMenu={(e) => e.preventDefault()}
            className="relative flex-1 h-12 overflow-hidden rounded-xl text-xs uppercase tracking-[0.08em] font-semibold text-white select-none cursor-pointer touch-none border border-danger-line bg-danger/25 active:scale-[0.99] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-danger origin-left"
              style={{
                width: "100%",
                transform: holding ? "scaleX(1)" : "scaleX(0)",
                transition: holding
                  ? `transform ${HOLD_CONFIRM_MS}ms linear`
                  : "transform 120ms ease-out",
              }}
            />
            <span className="relative z-10">{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
