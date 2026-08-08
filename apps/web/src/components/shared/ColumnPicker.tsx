"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

/** Aire mínimo contra los bordes de la ventana. */
const MARGEN = 8;

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
 *
 * La posición se corrige contra la ventana DESPUÉS de medir el menú: el ⚙ de
 * la tabla de auditoría es la última columna, así que anclarlo crudo al borde
 * izquierdo del botón lo dibujaba mitad afuera de la pantalla en tablet.
 */
export default function ColumnPicker<T extends string>({
  cols,
  labels,
  visible,
  onToggle,
}: Props<T>) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Se mide el menú ya renderizado en vez de asumir su tamaño: la altura
  // depende de cuántas columnas tenga cada CRUD.
  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) {
      setPos(null);
      return;
    }
    const menu = menuRef.current.getBoundingClientRect();
    const { innerWidth: vw, innerHeight: vh } = window;

    // Si no entra alineado a la izquierda del botón, se alinea a la derecha
    // (que es lo natural para un control pegado al borde) y recién ahí se
    // clampea, por si tampoco entra así.
    let left = anchor.left;
    if (left + menu.width > vw - MARGEN) left = anchor.right - menu.width;
    left = Math.max(MARGEN, Math.min(left, vw - menu.width - MARGEN));

    // Abajo del botón; si no entra, arriba; si tampoco, pegado al borde.
    let top = anchor.bottom + 4;
    if (top + menu.height > vh - MARGEN) {
      const arriba = anchor.top - menu.height - 4;
      top = arriba >= MARGEN ? arriba : Math.max(MARGEN, vh - menu.height - MARGEN);
    }

    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const close = (e: Event) => {
      if (e.type === "pointerdown" && menuRef.current?.contains(e.target as Node)) return;
      if (e.type === "pointerdown" && btnRef.current?.contains(e.target as Node)) return;
      setAnchor(null);
    };
    // `pointerdown` y no `mousedown`: en la tablet el toque tiene que cerrarlo
    // igual que el click.
    document.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    // Capture: también cierra si scrollea el contenedor de la tabla, no solo
    // la ventana (el menú quedaría flotando lejos del botón).
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Columnas visibles"
        aria-label="Configurar columnas"
        aria-expanded={anchor !== null}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect();
          setAnchor((a) => (a || !r ? null : r));
        }}
        className={`w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
          anchor
            ? "bg-[var(--accent-surface)] text-[var(--accent-text)]"
            : "text-[var(--text-tertiary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-secondary)]"
        }`}
      >
        <Settings2 size={14} />
      </button>

      {anchor && (
        <div
          ref={menuRef}
          style={{
            top: pos?.top ?? anchor.bottom + 4,
            left: pos?.left ?? anchor.left,
            // Se pinta recién con la posición ya corregida: si no, se ve un
            // salto desde el lugar sin clampear.
            visibility: pos ? "visible" : "hidden",
            maxHeight: `calc(100vh - ${MARGEN * 2}px)`,
          }}
          className="fixed z-50 w-44 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-card p-2"
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
