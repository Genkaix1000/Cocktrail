"use client";

import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

type Props<T extends string> = {
  /** Columnas que se pueden prender/apagar (las required no se listan). */
  cols: readonly T[];
  labels: Record<T, string>;
  visible: readonly T[];
  onToggle: (col: T) => void;
};

/**
 * ⚙ de columnas visibles del header de los CRUDs. El menú es `fixed` y se
 * ancla al botón al abrirse: la tabla vive dentro de un scroller horizontal
 * (overflow-x-auto), que recortaría un menú absolute.
 */
export default function ColumnPicker<T extends string>({
  cols,
  labels,
  visible,
  onToggle,
}: Props<T>) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e.type === "mousedown" && menuRef.current?.contains(e.target as Node)) return;
      if (e.type === "mousedown" && btnRef.current?.contains(e.target as Node)) return;
      setPos(null);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    // Capture: también cierra si scrollea el contenedor de la tabla, no solo
    // la ventana (el menú quedaría flotando lejos del botón).
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Columnas visibles"
        aria-label="Configurar columnas"
        aria-expanded={pos !== null}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect();
          setPos((p) => (p || !r ? null : { top: r.bottom + 4, left: r.left }));
        }}
        className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
          pos
            ? "bg-[var(--accent-surface)] text-[var(--accent-text)]"
            : "text-[var(--text-tertiary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <Settings2 size={14} />
      </button>

      {pos && (
        <div
          ref={menuRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-card p-2"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-1.5 pb-1.5">
            Columnas
          </p>
          {cols.map((c) => (
            <label
              key={c}
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-[var(--bg-panel)] cursor-pointer text-[12px] text-[var(--text-primary)]"
            >
              <input
                type="checkbox"
                checked={visible.includes(c)}
                onChange={() => onToggle(c)}
                className="accent-[var(--accent-primary)]"
              />
              {labels[c]}
            </label>
          ))}
        </div>
      )}
    </>
  );
}
