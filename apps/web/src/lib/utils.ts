
// HH:mm 24h sin depender de Intl/locale, para evitar hydration mismatch
// (Node ICU vs V8 producen distintos espacios/NBSP en toLocaleTimeString).
export function formatHm(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
