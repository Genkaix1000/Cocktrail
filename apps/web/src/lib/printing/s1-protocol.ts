/**
 * Protocolo propietario de la impresora térmica BLE Lujiang S1, confirmado
 * contra el hardware (2026-08-04 + fix de franjas 2026-08-07).
 *
 * Módulo PURO: los delays son datos (`delayAfterMs`), acá no hay setTimeout.
 * El transporte BLE es quien escribe cada step y espera entre uno y otro.
 */

import type { TicketBitmap } from "./raster";

export const S1_SERVICE = 0xff00;
export const S1_WRITE_CHARACTERISTIC = 0xff02;
export const S1_NAME_PREFIX = "PPS1";

/**
 * CRÍTICO: la imagen va en franjas de ≤240 filas, cada una con su PROPIO
 * header GS v 0 — el firmware solo honra yL: un bloque de 360 filas (yH=1)
 * imprime garbage (confirmado con el aparato el 2026-08-07).
 */
const STRIPE_MAX_ROWS = 240;
/**
 * Chunk BLE por defecto: 20 bytes = payload garantizado con el MTU mínimo
 * BLE (23). Gate físico 2026-08-07: en la tablet de producción los chunks de
 * 512 se truncan EN SILENCIO (MTU chico de Android) → raster incompleto e
 * impresión ilegible. Con 20 imprime perfecto.
 */
export const DEFAULT_CHUNK_BYTES = 20;
export const MIN_CHUNK_BYTES = 20;
export const MAX_CHUNK_BYTES = 512;

/**
 * Largo mínimo del ticket en puntos (203dpi -> 8 puntos = 1mm; 520 ≈ 65mm).
 * Si lo impreso es más corto se completa con avances de papel (ESC J) para
 * que una venta de 1 trago no salga como mini-ticket imposible de cortar.
 */
export const MIN_TICKET_DOTS = 520;

/** ESC J avanza papel sin mandar datos: n puntos por comando, hasta 255. */
function feedSteps(dots: number): S1Step[] {
  const steps: S1Step[] = [];
  let restante = dots;
  while (restante > 0) {
    const n = Math.min(restante, 255);
    steps.push({ bytes: new Uint8Array([0x1b, 0x4a, n]), delayAfterMs: DELAY_MIN_FEED_MS });
    restante -= n;
  }
  return steps;
}

const DELAY_SETUP_MS = 100;
const DELAY_CHUNK_MS = 10;
/** Respiro tras la última escritura de cada franja, para que drene el buffer. */
const DELAY_STRIPE_MS = 80;
/** Antes del feed: el último chunk de imagen lleva 300 en vez de 80. */
const DELAY_BEFORE_FEED_MS = 300;
/** Entre avances ESC J del relleno de largo mínimo. */
const DELAY_MIN_FEED_MS = 60;
const DELAY_BEFORE_STOP_MS = 2000;

const ENABLE = [0x10, 0xff, 0xf1, 0x03];
const WAKE_LENGTH = 12; // 12 bytes 0x00
const DENSITY = [0x10, 0xff, 0x10, 0x00, 0x01];
const FEED = [0x1b, 0x4a, 0x50];
const STOP = [0x10, 0xff, 0xf1, 0x45];

export type S1Step = {
  bytes: Uint8Array;
  delayAfterMs: number;
};

export type S1Mode = "normal" | "doubleHeight";

/** GS v 0: 1D 76 30 m xL xH yL yH — m=0x02 estira 2x vertical (doble alto). */
function stripeHeader(widthBytes: number, rows: number, m: number): number[] {
  return [
    0x1d,
    0x76,
    0x30,
    m,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    rows & 0xff,
    (rows >> 8) & 0xff,
  ];
}

/**
 * Secuencia completa para imprimir un bitmap:
 * ENABLE → wake → densidad → imagen (franjas chunked) → relleno de largo
 * mínimo (ESC J) → feed → stop.
 *
 * `mode` default "doubleHeight" (lo validado en el gate T1): las filas del
 * bitmap ya vienen downsampleadas m=2 (ver downsampleRowPairs) y el firmware
 * las estira 2x — mitad de datos, y el ticket típico entra en UN solo bloque
 * GS v 0 (los cortes entre bloques meten un hueco de papel visible).
 *
 * `chunkSize` inválido (no entero o fuera de [20, 512]) cae al default.
 */
export function buildS1Sequence(
  bitmap: TicketBitmap,
  opts?: { chunkSize?: number; mode?: S1Mode },
): S1Step[] {
  const { widthBytes, height, data } = bitmap;
  const mode: S1Mode = opts?.mode ?? "doubleHeight";
  const requested = opts?.chunkSize;
  const chunkBytes =
    requested !== undefined &&
    Number.isInteger(requested) &&
    requested >= MIN_CHUNK_BYTES &&
    requested <= MAX_CHUNK_BYTES
      ? requested
      : DEFAULT_CHUNK_BYTES;
  const steps: S1Step[] = [
    { bytes: new Uint8Array(ENABLE), delayAfterMs: DELAY_SETUP_MS },
    { bytes: new Uint8Array(WAKE_LENGTH), delayAfterMs: DELAY_SETUP_MS },
    { bytes: new Uint8Array(DENSITY), delayAfterMs: DELAY_SETUP_MS },
  ];

  const m = mode === "doubleHeight" ? 0x02 : 0x00;

  // Cada franja: header propio + sus filas, partido en chunks de ≤chunkBytes.
  // ≤240 filas por bloque (el firmware banca hasta 255 y solo honra yL).
  for (let y0 = 0; y0 < height; y0 += STRIPE_MAX_ROWS) {
    const rows = Math.min(STRIPE_MAX_ROWS, height - y0);
    const body = data.subarray(y0 * widthBytes, (y0 + rows) * widthBytes);
    const packet = new Uint8Array(8 + body.length);
    packet.set(stripeHeader(widthBytes, rows, m), 0);
    packet.set(body, 8);

    const isLastStripe = y0 + rows >= height;
    for (let i = 0; i < packet.length; i += chunkBytes) {
      const chunk = packet.subarray(i, i + chunkBytes);
      const isLastChunk = i + chunkBytes >= packet.length;
      steps.push({
        bytes: chunk,
        delayAfterMs: !isLastChunk
          ? DELAY_CHUNK_MS
          : isLastStripe
            ? DELAY_BEFORE_FEED_MS
            : DELAY_STRIPE_MS,
      });
    }
  }

  // Relleno hasta el largo mínimo, SIEMPRE después de la imagen: probado con el
  // aparato, un ESC J antes del bloque cuelga el firmware y apaga la impresora
  // (el mismo motivo por el que se descartó saltear las filas en blanco). Por
  // eso el ticket no se puede centrar en el papel.
  const printedDots = mode === "doubleHeight" ? height * 2 : height;
  for (const step of feedSteps(Math.max(0, MIN_TICKET_DOTS - printedDots))) {
    steps.push(step);
  }

  steps.push({ bytes: new Uint8Array(FEED), delayAfterMs: DELAY_BEFORE_STOP_MS });
  steps.push({ bytes: new Uint8Array(STOP), delayAfterMs: 0 });
  return steps;
}
