"use client";

import { useEffect, useState } from "react";

const XL_QUERY = "(min-width: 1280px)";
const TWOXL_QUERY = "(min-width: 1536px)";

function computeColumns() {
  if (typeof window === "undefined") return 3;
  if (window.matchMedia(TWOXL_QUERY).matches) return 5;
  if (window.matchMedia(XL_QUERY).matches) return 4;
  return 3;
}

/**
 * Cantidad de columnas del grid desktop de productos en /caja — mismos
 * breakpoints que las clases Tailwind del grid (`grid-cols-3 xl:grid-cols-4
 * 2xl:grid-cols-5`). Usado por useProductGridNav para que las flechas
 * arriba/abajo salten de fila en vez de moverse de a uno.
 */
export function useGridColumns() {
  const [columns, setColumns] = useState(computeColumns);

  useEffect(() => {
    const mql2xl = window.matchMedia(TWOXL_QUERY);
    const mqlXl = window.matchMedia(XL_QUERY);
    const update = () => setColumns(computeColumns());

    mql2xl.addEventListener("change", update);
    mqlXl.addEventListener("change", update);
    return () => {
      mql2xl.removeEventListener("change", update);
      mqlXl.removeEventListener("change", update);
    };
  }, []);

  return columns;
}
