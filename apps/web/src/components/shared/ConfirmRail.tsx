"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Check, X } from "lucide-react";

type Props = {
  confirm: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** Pregunta corta en el panel de confirmación. */
  message: string;
  /** Contenido idle (icono / label). El rail es el botón que llama onAsk. */
  children: ReactNode;
  className?: string;
  askLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

const slide =
  "absolute inset-0 flex items-center transition-all duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]";

/**
 * Confirmación inline tipo logout: idle sale a la izquierda, entra el panel
 * danger desde la derecha. Escape cancela.
 */
export function ConfirmRail({
  confirm,
  onAsk,
  onCancel,
  onConfirm,
  message,
  children,
  className = "",
  askLabel = "Eliminar",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, onCancel]);

  return (
    <div className={`relative h-full min-h-7 overflow-hidden rounded-lg ${className}`}>
      <button
        type="button"
        title={askLabel}
        aria-label={askLabel}
        aria-expanded={confirm}
        onClick={(e) => {
          e.stopPropagation();
          onAsk();
        }}
        className={`${slide} justify-center cursor-pointer bg-transparent ${
          confirm
            ? "-translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100"
        }`}
      >
        {children}
      </button>

      <div
        className={`${slide} justify-between gap-2 px-2 ${
          confirm
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-0 pointer-events-none"
        }`}
      >
        <span className="text-[13px] font-semibold text-[var(--danger-base)] whitespace-nowrap shrink-0">
          {message}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            ref={cancelRef}
            type="button"
            title={cancelLabel}
            aria-label={cancelLabel}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            title={confirmLabel}
            aria-label={confirmLabel}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--danger-base)] text-white cursor-pointer"
          >
            <Check size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
