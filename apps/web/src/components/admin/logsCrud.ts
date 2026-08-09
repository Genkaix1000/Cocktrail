import type { Order, OrderStatus, PaymentMethod } from "@cocktrail/shared";

import { loadCols, saveCols } from "@/lib/crudCols";

export type LogsColId =
  | "time"
  | "ticket"
  | "items"
  | "creator"
  | "method"
  | "total"
  | "token"
  | "actions";

export const LOGS_COLS_STORAGE_KEY = "crud:logs:cols:v1";

/** Siempre visibles; no aparecen en el ⚙ como apagables. */
export const LOGS_COLS_REQUIRED: LogsColId[] = ["ticket", "actions"];

const ALL: LogsColId[] = [
  "time",
  "ticket",
  "items",
  "creator",
  "method",
  "total",
  "token",
  "actions",
];

/** Todo a la vista por default. */
export const LOGS_COLS_DEFAULT: LogsColId[] = [...ALL];

export const LOGS_COL_LABELS: Record<LogsColId, string> = {
  time: "Hora",
  ticket: "Ticket",
  items: "Detalle",
  creator: "Creador",
  method: "Medio de Pago",
  total: "Total",
  token: "Token",
  actions: "Acciones",
};

export const LOGS_COLS_TOGGLEABLE: LogsColId[] = ALL.filter(
  (c) => !LOGS_COLS_REQUIRED.includes(c),
);

export function loadLogsCols(): LogsColId[] {
  return loadCols(LOGS_COLS_STORAGE_KEY, ALL, LOGS_COLS_REQUIRED, LOGS_COLS_DEFAULT);
}

export function saveLogsCols(cols: LogsColId[]) {
  saveCols(LOGS_COLS_STORAGE_KEY, ALL, LOGS_COLS_REQUIRED, cols);
}

export function orderLogsCols(cols: LogsColId[]): LogsColId[] {
  const set = new Set([...cols, ...LOGS_COLS_REQUIRED]);
  return ALL.filter((c) => set.has(c));
}

export function logsGridTemplate(cols: LogsColId[]): string {
  const sizes: Record<LogsColId, string> = {
    time: "96px",
    ticket: "116px",
    items: "minmax(200px, 1fr)",
    creator: "132px",
    method: "124px",
    total: "108px",
    token: "156px",
    actions: "112px",
  };
  return cols.map((c) => sizes[c]).join(" ");
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  debito: "Posnet",
  qr: "QR",
  cortesia: "Cortesía",
  split: "Dividido",
};

export function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_LABELS[method] ?? method;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function itemsLabel(order: Order): string {
  return order.items.map((it) => `${it.qty}x ${it.name}`).join(", ");
}

/** "31/12/2026 - 23:59 hs" */
export function formatDateHour(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())} hs`;
}

/** Un ticket se puede anular mientras no esté cancelado (también si ya se entregó). */
export function isCancelable(order: Order): boolean {
  return order.status !== "cancelado";
}
