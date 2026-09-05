import { loadCols, saveCols } from "@/lib/crudCols";

export type StaffColId = "user" | "role" | "type" | "created" | "actions";

export const STAFF_COLS_STORAGE_KEY = "crud:staff:cols:v1";

export const STAFF_COLS_REQUIRED: StaffColId[] = ["user", "actions"];

export const STAFF_COLS_DEFAULT: StaffColId[] = [
  "user",
  "role",
  "type",
  "created",
  "actions",
];

export const STAFF_COL_LABELS: Record<StaffColId, string> = {
  user: "Usuario",
  role: "Rol",
  type: "Tipo",
  created: "Alta",
  actions: "Acciones",
};

export const STAFF_COLS_TOGGLEABLE: StaffColId[] = ["role", "type", "created"];

export const SYSTEM_USERNAMES = ["admin", "caja", "superadmin"];

export function isSystemUser(username: string) {
  return SYSTEM_USERNAMES.includes(username.toLowerCase());
}

const ALL: StaffColId[] = ["user", "role", "type", "created", "actions"];

export function loadStaffCols(): StaffColId[] {
  return loadCols(STAFF_COLS_STORAGE_KEY, ALL, STAFF_COLS_REQUIRED, STAFF_COLS_DEFAULT);
}

export function saveStaffCols(cols: StaffColId[]) {
  saveCols(STAFF_COLS_STORAGE_KEY, ALL, STAFF_COLS_REQUIRED, cols);
}

export function staffGridTemplate(cols: StaffColId[]): string {
  const sizes: Record<StaffColId, string> = {
    user: "minmax(160px, 1fr)",
    role: "124px",
    type: "104px",
    created: "112px",
    actions: "104px",
  };
  return cols.map((c) => sizes[c]).join(" ");
}
