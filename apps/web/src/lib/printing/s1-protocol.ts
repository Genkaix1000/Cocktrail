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
 * La imagen va en UN SOLO bloque GS v 0 con m=0x00, igual que la app oficial
 * y todas las implementaciones de referencia de esta familia. El modo doble
 * alto (m=0x02) rompe tickets de más de un trago: el firmware espera el doble
 * de bytes de raster y se desincroniza.
 */
/**
 * Chunk BLE por defecto: 64 bytes. Gate físico 2026-08-08: 128 apaga la
 * impresora (buffer overflow corrompe comandos), 96 también falla. 64 es
 * el máximo estable comprobado en la S1 con Lenovo P11. Si en otro
 * dispositivo se trunca, bajar a 20 vía localStorage.
 */
export const DEFAULT_CHUNK_BYTES = 64;
export const MIN_CHUNK_BYTES = 20;
export const MAX_CHUNK_BYTES = 512;

/**
 * Largo mínimo del ticket en puntos (203dpi -> 8 puntos = 1mm; 350 ≈ 44mm).
 * Si lo impreso es más corto se completa con avances de papel (ESC J) para
 * que una venta de 1 trago no salga como mini-ticket imposible de cortar.
 */
const MIN_TICKET_DOTS = 350;

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

/** GS v 0: 1D 76 30 m=0x00 xL xH yL yH. */
function stripeHeader(widthBytes: number, rows: number): number[] {
  return [
    0x1d, 0x76, 0x30, 0x00,
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff,
    rows & 0xff,
    (rows >> 8) & 0xff,
  ];
}

/**
 * Secuencia completa para imprimir un bitmap:
 * ENABLE → wake → densidad → imagen (GS v 0, chunked) → relleno de largo
 * mínimo (ESC J) → feed → stop.
 *
 * `chunkSize` inválido (no entero o fuera de [20, 512]) cae al default.
 */
export function buildS1Sequence(
  bitmap: TicketBitmap,
  opts?: { chunkSize?: number },
): S1Step[] {
  const { widthBytes, height, data } = bitmap;
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

  const packet = new Uint8Array(8 + data.length);
  packet.set(stripeHeader(widthBytes, height), 0);
  packet.set(data, 8);

  for (let i = 0; i < packet.length; i += chunkBytes) {
    const chunk = packet.subarray(i, i + chunkBytes);
    const isLastChunk = i + chunkBytes >= packet.length;
    steps.push({
      bytes: chunk,
      delayAfterMs: isLastChunk ? DELAY_BEFORE_FEED_MS : DELAY_CHUNK_MS,
    });
  }

  for (const step of feedSteps(Math.max(0, MIN_TICKET_DOTS - height))) {
    steps.push(step);
  }

  steps.push({ bytes: new Uint8Array(FEED), delayAfterMs: DELAY_BEFORE_STOP_MS });
  steps.push({ bytes: new Uint8Array(STOP), delayAfterMs: 0 });
  return steps;
}
