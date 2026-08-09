/**
 * Convierte el payload de un cobro QR (URL de imagen estática legacy, data-URL,
 * o trama EMVCo de mode=dynamic) en un `src` usable por <img>.
 *
 * ponytail: sin lib de QR — el servicio público solo dibuja; el cobro ya está
 * en MP. Si algún día hace falta offline-first, meter un encoder local.
 */
export function qrDisplaySrc(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const value = payload.trim();
  if (!value) return null;
  if (/^(https?:|data:)/i.test(value)) return value;
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`;
}
