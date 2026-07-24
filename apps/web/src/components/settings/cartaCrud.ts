export type CartaColId =
  | "id"
  | "icon"
  | "name"
  | "price"
  | "status"
  | "tags"
  | "actions";

export const CARTA_COLS_STORAGE_KEY = "crud:carta:cols";

/** Siempre visibles; no aparecen en el ⚙ como apagables. */
export const CARTA_COLS_REQUIRED: CartaColId[] = ["name", "actions"];

export const CARTA_COLS_DEFAULT: CartaColId[] = [
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
  // Nombre crece, pero el sobrante se reparte con precio/estado/tags (no 1.4fr solo en nombre).
  const sizes: Record<CartaColId, string> = {
    id: "52px",
    icon: "44px",
    name: "minmax(112px, 1fr)",
    price: "minmax(80px, 0.32fr)",
    status: "minmax(92px, 0.38fr)",
    tags: "minmax(108px, 0.48fr)",
    actions: "100px",
  };
  return cols.map((c) => sizes[c]).join(" ");
}
