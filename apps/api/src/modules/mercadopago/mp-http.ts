/**
 * Timeout por llamada HTTP individual a Mercado Pago (A9). Va sobre cada fetch,
 * NUNCA sobre un loop de polling: la cajera puede tardar lo que quiera, cada
 * request individual no.
 */
export const MP_HTTP_TIMEOUT_MS = 10_000;

/** true si el error viene de AbortSignal.timeout (Node lo reporta como TimeoutError/AbortError). */
export function isFetchTimeout(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
  );
}
