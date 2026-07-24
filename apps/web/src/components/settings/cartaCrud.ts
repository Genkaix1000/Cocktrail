import { loadCols, saveCols } from "@/lib/crudCols";

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
  return loadCols(CARTA_COLS_STORAGE_KEY, ALL, CARTA_COLS_REQUIRED, CARTA_COLS_DEFAULT);
}

export function saveCartaCols(cols: CartaColId[]) {
  saveCols(CARTA_COLS_STORAGE_KEY, ALL, CARTA_COLS_REQUIRED, cols);
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
