import { createHmac, timingSafeEqual } from "node:crypto";

/** Ventana de frescura del `ts` (anti-replay). Overrideable por env MP_WEBHOOK_TS_TOLERANCE_SECONDS. */
export const DEFAULT_TS_TOLERANCE_SECONDS = 300;

/**
 * MP manda el `ts` en segundos o milisegundos según la variante — normalizar por
 * longitud: hasta 11 dígitos es segundos (un epoch en segundos tiene 10 dígitos
 * hasta el año 2286), 12+ es milisegundos.
 */
function tsToMillis(ts: string): number | null {
  if (!/^\d+$/.test(ts)) return null;
  const value = Number(ts);
  if (!Number.isFinite(value)) return null;
  return ts.length >= 12 ? value : value * 1000;
}

function parseSignaturePart(header: string, key: string): string | undefined {
  for (const part of header.split(",")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === key && rest.length > 0) {
      return rest.join("=");
    }
  }
  return undefined;
}

/** Construye el manifest HMAC según la doc oficial de MP (separador: espacios). */
export function buildWebhookManifest(
  dataId: string | undefined,
  xRequestId: string | undefined,
  ts: string | undefined,
): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId.toLowerCase()}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  if (ts) parts.push(`ts:${ts}`);
  return parts.join(" ");
}

/**
 * Valida el header `x-signature` de Mercado Pago (HMAC-SHA256 hex, timing-safe)
 * y la frescura del `ts` (anti-replay: una firma vieja capturada no sirve).
 */
export function validateWebhookSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string | undefined,
  secret: string,
  toleranceSeconds: number = DEFAULT_TS_TOLERANCE_SECONDS,
): boolean {
  if (!xSignature || !secret) return false;

  const ts = parseSignaturePart(xSignature, "ts");
  const hash = parseSignaturePart(xSignature, "v1");
  if (!ts || !hash) return false;

  const tsMillis = tsToMillis(ts);
  if (tsMillis === null) return false;
  if (Math.abs(Date.now() - tsMillis) > toleranceSeconds * 1000) return false;

  const manifest = buildWebhookManifest(dataId, xRequestId, ts);
  const computed = createHmac("sha256", secret).update(manifest).digest("hex");

  try {
    const computedBuf = Buffer.from(computed, "hex");
    const hashBuf = Buffer.from(hash, "hex");
    if (computedBuf.length !== hashBuf.length) return false;
    return timingSafeEqual(computedBuf, hashBuf);
  } catch {
    return false;
  }
}
