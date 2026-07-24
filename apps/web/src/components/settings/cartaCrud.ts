export type CartaColId =
  | "id"
  | "icon"
  | "name"
  | "price"
  | "status"
  | "tags"
  | "actions";

export const CARTA_COLS_STORAGE_KEY = "crud:carta:cols:v2";

/** Siempre visibles; no aparecen en el ⚙ como apagables. */
export const CARTA_COLS_REQUIRED: CartaColId[] = ["name", "actions"];

export const CARTA_COLS_DEFAULT: CartaColId[] = [
  "id",
  "icon",
  "name",
  "price",
  "status",
  "tags",
  "actions",
];

export const CARTA_COL_LABELS: Record<CartaColId, string> = {
  id: "ID",
  icon: "Ícono",
  name: "Nombre",
  price: "Precio",
  status: "Estado",
  tags: "Etiquetas",
  actions: "Acciones",
};

/** Columnas que el ⚙ puede prender/apagar. */
export const CARTA_COLS_TOGGLEABLE: CartaColId[] = [
  "id",
  "icon",
  "price",
  "status",
  "tags",
];

const ALL: CartaColId[] = [
  "id",
  "icon",
  "name",
  "price",
  "status",
  "tags",
  "actions",
];

export function loadCartaCols(): CartaColId[] {
  if (typeof window === "undefined") return [...CARTA_COLS_DEFAULT];
  try {
    const raw = localStorage.getItem(CARTA_COLS_STORAGE_KEY);
    if (!raw) return [...CARTA_COLS_DEFAULT];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...CARTA_COLS_DEFAULT];
    const set = new Set(
      parsed.filter((c): c is CartaColId => ALL.includes(c as CartaColId)),
    );
    for (const req of CARTA_COLS_REQUIRED) set.add(req);
    const ordered = ALL.filter((c) => set.has(c));
    return ordered.length >= 2 ? ordered : [...CARTA_COLS_DEFAULT];
  } catch {
    return [...CARTA_COLS_DEFAULT];
  }
}

export function saveCartaCols(cols: CartaColId[]) {
  const set = new Set(cols);
  for (const req of CARTA_COLS_REQUIRED) set.add(req);
  localStorage.setItem(
    CARTA_COLS_STORAGE_KEY,
    JSON.stringify(ALL.filter((c) => set.has(c))),
  );
}

export function cartaGridTemplate(cols: CartaColId[]): string {
  // Solo Nombre absorbe el sobrante. Ícono con aire propio (no pegado al nombre).
  const sizes: Record<CartaColId, string> = {
    id: "56px",
    icon: "64px",
    name: "minmax(160px, 1fr)",
    price: "104px",
    status: "116px",
    tags: "168px",
    actions: "104px",
  };
  return cols.map((c) => sizes[c]).join(" ");
}
