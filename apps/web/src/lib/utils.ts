
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

export const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "14 jul" */
export function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
