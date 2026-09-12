import { loadCols, saveCols } from "@/lib/crudCols";

export type CartaColId =
  | "order"
  | "id"
  | "name"
  | "category"
  | "price"
  | "tags"
  | "actions";

export const CARTA_COLS_STORAGE_KEY = "crud:carta:cols:v4";

/** Siempre visibles; no aparecen en el ⚙ como apagables. */
export const CARTA_COLS_REQUIRED: CartaColId[] = ["order", "name", "actions"];

export const CARTA_COLS_DEFAULT: CartaColId[] = [
  "order",
  "id",
  "name",
  "category",
  "price",
  "tags",
  "actions",
];

export const CARTA_COL_LABELS: Record<CartaColId, string> = {
  order: "Puesto",
  id: "ID",
  name: "Nombre",
  category: "Categoría",
  price: "Precio",
  tags: "Badge",
  actions: "Acciones",
};

/** Columnas que el ⚙ puede prender/apagar. */
export const CARTA_COLS_TOGGLEABLE: CartaColId[] = [
  "id",
  "category",
  "price",
  "tags",
];

const ALL: CartaColId[] = [
  "order",
  "id",
  "name",
  "category",
  "price",
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
  // Solo Nombre absorbe el sobrante.
  const sizes: Record<CartaColId, string> = {
    order: "56px",
    id: "56px",
    name: "minmax(140px, 1fr)",
    category: "140px",
    price: "104px",
    tags: "168px",
    actions: "104px",
  };
  return cols.map((c) => sizes[c] || "100px").join(" ");
}
