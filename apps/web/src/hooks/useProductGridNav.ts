"use client";

import { useEffect, useState } from "react";

type Options = {
  length: number;
  enabled: boolean;
  columns?: number;
};

/**
 * Navegación por teclado del grid de productos de la pantalla de venta de
 * caja: flechas mueven un índice resaltado sobre el grid (izquierda/derecha
 * de a uno, arriba/abajo salta `columns` para moverse de fila), Escape lo
 * limpia. Mismo patrón de guardas que useScannerInput.ts/useCajaShortcuts.ts:
 * listener único en window, ignora inputs de texto. Se desactiva (vuelve a
 * null) cuando `enabled` pasa a false, ej. al abrir el checkout.
 */
export function useProductGridNav({ length, enabled, columns = 1 }: Options) {
  const [rawIndex, setRawIndex] = useState<number | null>(null);
  // Derivado en vez de resetear con un efecto: mientras está deshabilitado
  // (ej. checkout abierto) o sin productos, no hay nada resaltado.
  const highlightedIndex = enabled && length > 0 ? rawIndex : null;

  useEffect(() => {
    if (!enabled || length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isTextInput) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setRawIndex((i) => (i === null ? 0 : Math.min(i + 1, length - 1)));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setRawIndex((i) => (i === null ? 0 : Math.max(i - 1, 0)));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setRawIndex((i) => (i === null ? 0 : Math.min(i + columns, length - 1)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setRawIndex((i) => (i === null ? 0 : Math.max(i - columns, 0)));
      } else if (event.key === "Escape") {
        setRawIndex(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, length, columns]);

  return { highlightedIndex, setHighlightedIndex: setRawIndex };
}
