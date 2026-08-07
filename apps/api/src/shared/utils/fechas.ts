/**
 * Único lugar del backend que sabe en qué huso opera el boliche.
 *
 * El servidor corre en la nube (Render) con reloj en UTC, así que sin huso
 * explícito una venta de las 16:27 de Argentina sale con las 19:27. No se
 * confía en la variable de entorno `TZ`: puede faltar en otro hosting o en la
 * máquina de alguien, y el bug vuelve silencioso.
 */
export const HUSO_ARGENTINA = "America/Argentina/Buenos_Aires";

const LOCALE = "es-AR";

/** "vie, 07/08/2026" — encabezado de la noche en el ticket impreso. */
export function formatearFecha(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(LOCALE, {
    timeZone: HUSO_ARGENTINA,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "07/08/2026 16:27" — fecha + hora en 24h. */
export function formatearFechaHora(epochMs: number): string {
  return new Date(epochMs).toLocaleString(LOCALE, {
    timeZone: HUSO_ARGENTINA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // sin esto puede salir "07:27" para las 19:27
  });
}

/** "16:27" o "16:27:05" — solo la hora, siempre en 24h. */
export function formatearHora(epochMs: number, opciones?: { conSegundos?: boolean }): string {
  return new Date(epochMs).toLocaleTimeString(LOCALE, {
    timeZone: HUSO_ARGENTINA,
    hour: "2-digit",
    minute: "2-digit",
    ...(opciones?.conSegundos ? { second: "2-digit" as const } : {}),
    hour12: false,
  });
}

/**
 * Clave estable del día calendario argentino ("2026-08-07"), para comparar o
 * agrupar por jornada. `toISOString().slice(0,10)` NO sirve: da el día en UTC,
 * así que todo lo que pasa después de las 21:00 de Argentina cae en el día
 * siguiente.
 */
export function claveDiaArgentina(epochMs: number = Date.now()): string {
  // en-CA da directamente aaaa-mm-dd, ordenable y sin ambigüedad.
  return new Date(epochMs).toLocaleDateString("en-CA", { timeZone: HUSO_ARGENTINA });
}
