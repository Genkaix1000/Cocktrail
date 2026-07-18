import { createHmac, timingSafeEqual } from "node:crypto";

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

/** Valida el header `x-signature` de Mercado Pago (HMAC-SHA256 hex, timing-safe). */
export function validateWebhookSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string | undefined,
  secret: string,
): boolean {
  if (!xSignature || !secret) return false;

  const ts = parseSignaturePart(xSignature, "ts");
  const hash = parseSignaturePart(xSignature, "v1");
  if (!ts || !hash) return false;

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
