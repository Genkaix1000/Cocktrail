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
 * Colapsado: solo el check; click afuera o Esc cancela.
 */
export function LogoutNavRail({
  collapsed = false,
  confirm,
  onAsk,
  onCancel,
  onConfirm,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    focusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onCancel();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [confirm, onCancel]);

  if (collapsed) {
    return (
      <div
        ref={rootRef}
        className="relative mx-auto w-10 h-10 overflow-hidden rounded-xl bg-transparent"
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
          className={`${slide} justify-center ${
            confirm
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0 pointer-events-none"
          }`}
        >
          <button
            ref={focusRef}
            type="button"
            title="Confirmar"
            aria-label="Confirmar cierre de sesión"
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--danger-base)] text-white cursor-pointer hover:brightness-110 active:scale-95 transition-all"
          >
            <Check size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative w-full h-9 overflow-hidden rounded-xl bg-transparent hover:bg-[var(--bg-surface)]/60 transition-colors duration-[260ms]"
    >
      <button
        type="button"
        aria-expanded={confirm}
        aria-label="Cerrar sesión"
        onClick={onAsk}
        className={`${slide} gap-2.5 pl-4 pr-3 text-left text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent ${
          confirm
            ? "-translate-x-full opacity-0 pointer-events-none"
            : "translate-x-0 opacity-100"
        }`}
      >
        <LogOut size={17} strokeWidth={1.75} className="shrink-0" />
        <span className="text-[13.5px] truncate">Cerrar sesión</span>
      </button>

      <div
        className={`${slide} justify-between gap-2 pl-4 pr-1.5 ${
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
            ref={focusRef}
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
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--danger-base)] text-white cursor-pointer hover:brightness-110 active:scale-95 transition-all"
          >
            <Check size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
