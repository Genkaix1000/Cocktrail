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

export const SYSTEM_USERNAMES = ["admin", "caja"];

export function isSystemUser(username: string) {
  return SYSTEM_USERNAMES.includes(username.toLowerCase());
}

const ALL: StaffColId[] = ["user", "role", "type", "created", "actions"];

export function loadStaffCols(): StaffColId[] {
  if (typeof window === "undefined") return [...STAFF_COLS_DEFAULT];
  try {
    const raw = localStorage.getItem(STAFF_COLS_STORAGE_KEY);
    if (!raw) return [...STAFF_COLS_DEFAULT];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...STAFF_COLS_DEFAULT];
    const set = new Set(parsed.filter((c): c is StaffColId => ALL.includes(c as StaffColId)));
    for (const req of STAFF_COLS_REQUIRED) set.add(req);
    const ordered = ALL.filter((c) => set.has(c));
    return ordered.length >= 2 ? ordered : [...STAFF_COLS_DEFAULT];
  } catch {
    return [...STAFF_COLS_DEFAULT];
  }
}

export function saveStaffCols(cols: StaffColId[]) {
  const set = new Set(cols);
  for (const req of STAFF_COLS_REQUIRED) set.add(req);
  localStorage.setItem(STAFF_COLS_STORAGE_KEY, JSON.stringify(ALL.filter((c) => set.has(c))));
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
