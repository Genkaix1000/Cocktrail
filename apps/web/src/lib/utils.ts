
// HH:mm 24h sin depender de Intl/locale, para evitar hydration mismatch
// (Node ICU vs V8 producen distintos espacios/NBSP en toLocaleTimeString).
export function formatHm(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** $12.500 */
export function formatMoney(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

export function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** UUID v4. `crypto.randomUUID` no existe fuera de secure context (HTTP LAN de caja). */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "14 jul" */
export function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
