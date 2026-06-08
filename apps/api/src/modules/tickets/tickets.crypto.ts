import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Generates a signed ticket code in the format: READABLE-HMAC
 * - READABLE: 8 alphanumeric characters (omitting easily confused chars)
 * - HMAC: 8 hex characters derived from orderId, readable part, and secret
 */
export function generateTicketCode(orderId: string, secret: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Omit O, 0, I, 1
  let readable = "";
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    readable += chars[randomIndex];
  }

  const hmac = createHmac("sha256", secret);
  hmac.update(`${orderId}:${readable}`);
  const signature = hmac.digest("hex").substring(0, 8);

  return `${readable}-${signature}`;
}

/**
 * Verifies the integrity of a ticket code using timingSafeEqual to prevent timing attacks
 */
export function verifyTicketIntegrity(code: string, orderId: string, secret: string): boolean {
  const parts = code.split("-");
  if (parts.length !== 2) return false;
  const [readable, signature] = parts;
  if (readable.length !== 8 || signature.length !== 8) return false;

  const hmac = createHmac("sha256", secret);
  hmac.update(`${orderId}:${readable}`);
  const expectedSignature = hmac.digest("hex").substring(0, 8);

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
