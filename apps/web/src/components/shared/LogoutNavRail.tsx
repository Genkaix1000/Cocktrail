"use client";

import { useEffect, useRef } from "react";
import { Check, LogOut, X } from "lucide-react";

type Props = {
  collapsed?: boolean;
  confirm: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const slide =
  "absolute inset-0 flex items-center transition-all duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)]";

/**
 * Ítem de nav "Cerrar sesión" con confirmación inline:
 * idle se desliza a la izquierda; entra el panel de confirmación.
 */
export function LogoutNavRail({
  collapsed = false,
  confirm,
  onAsk,
  onCancel,
  onConfirm,
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

  if (collapsed) {
    return (
      <div
        className={`relative mx-auto w-10 h-10 overflow-hidden rounded-xl transition-colors duration-[260ms] ${
          confirm ? "bg-[var(--danger-soft)]" : "bg-transparent"
        }`}
      >
        <button
          type="button"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          aria-expanded={confirm}
          onClick={onAsk}
          className={`${slide} justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent ${
            confirm
              ? "-translate-x-full opacity-0 pointer-events-none"
              : "translate-x-0 opacity-100"
          }`}
        >
          <LogOut size={17} strokeWidth={1.75} />
        </button>

        <div
          className={`${slide} justify-center gap-0.5 px-0.5 ${
            confirm
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0 pointer-events-none"
          }`}
        >
          <button
            ref={cancelRef}
            type="button"
            title="Cancelar"
            aria-label="Cancelar cierre de sesión"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="w-4 h-7 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X size={11} />
          </button>
          <button
            type="button"
            title="Confirmar"
            aria-label="Confirmar cierre de sesión"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="w-4 h-7 rounded-md flex items-center justify-center bg-[var(--danger-base)] text-white cursor-pointer"
          >
            <Check size={11} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative mx-2 h-9 overflow-hidden rounded-xl transition-colors duration-[260ms] ${
        confirm ? "bg-[var(--danger-soft)]" : "bg-transparent hover:bg-[var(--bg-surface)]/60"
      }`}
    >
      <button
        type="button"
        aria-expanded={confirm}
        aria-label="Cerrar sesión"
        onClick={onAsk}
        className={`${slide} gap-2.5 pl-2 pr-3 text-left text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent ${
          confirm
            ? "-translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100"
        }`}
      >
        <LogOut size={17} strokeWidth={1.75} className="shrink-0" />
        <span className="text-[13.5px] truncate">Cerrar sesión</span>
      </button>

      <div
        className={`${slide} justify-between gap-2 pl-3 pr-1.5 ${
          confirm
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-0 pointer-events-none"
        }`}
      >
        <span className="text-[12px] font-semibold text-[var(--danger-base)] truncate">
          ¿Cerrar sesión?
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            ref={cancelRef}
            type="button"
            title="Cancelar"
            aria-label="Cancelar cierre de sesión"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            <X size={12} />
          </button>
          <button
            type="button"
            title="Confirmar"
            aria-label="Confirmar cierre de sesión"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--danger-base)] text-white cursor-pointer"
          >
            <Check size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
