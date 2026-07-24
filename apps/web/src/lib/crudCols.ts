/**
 * Config de columnas compartida por los CRUDs (carta, staff, auditoría):
 * persistencia del ⚙ en localStorage y ancho mínimo de la grilla.
 */

export function loadCols<T extends string>(
  key: string,
  all: readonly T[],
  required: readonly T[],
  fallback: readonly T[],
): T[] {
  if (typeof window === "undefined") return [...fallback];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!Array.isArray(parsed)) return [...fallback];
    const set = new Set(parsed.filter((c): c is T => all.includes(c as T)));
    for (const req of required) set.add(req);
    const ordered = all.filter((c) => set.has(c));
    return ordered.length >= 2 ? ordered : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function saveCols<T extends string>(
  key: string,
  all: readonly T[],
  required: readonly T[],
  cols: readonly T[],
): void {
  const set = new Set(cols);
  for (const req of required) set.add(req);
  localStorage.setItem(key, JSON.stringify(all.filter((c) => set.has(c))));
}

/**
 * Ancho mínimo de un grid-template-columns, para que el wrapper con
 * overflow-x-auto scrollee (y las filas pinten completas) cuando la pantalla
 * es más angosta que la tabla. Asume un solo valor en px por columna:
 * `104px` o `minmax(160px, 1fr)`.
 */
export function gridMinWidth(template: string, gapPx = 12): number {
  const mins = [...template.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
  return mins.reduce((a, b) => a + b, 0) + gapPx * Math.max(0, mins.length - 1);
}
