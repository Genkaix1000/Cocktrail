import { env } from "../../config/env.js";
import { decryptSecret, encryptSecret } from "../../shared/crypto/aes-gcm.js";

/** Cifrado de los tokens del seller (`cocktrail/mp-token/v1`). */
export const MP_TOKEN_INFO = "cocktrail/mp-token/v1";

/** key_version que escribe este código. NULL en DB = texto claro legacy. */
export const MP_TOKEN_KEY_VERSION = 1;

/**
 * Error tipado: hay un blob cifrado pero ninguna clave lo abre
 * (MP_TOKEN_SECRET rotada sin _PREVIOUS, backfill a medias — riesgo D3).
 * `userId` permite al resolver aplicar la guarda de cuenta (F1.b).
 */
export class SellerTokenDecryptError extends Error {
  constructor(readonly userId: string) {
    super(
      `No se pudo descifrar el token de Mercado Pago del seller ${userId}. ` +
        "Probable rotación de MP_TOKEN_SECRET sin MP_TOKEN_SECRET_PREVIOUS. " +
        "Salida: restaurar el secret anterior o re-vincular desde /admin?tab=pagos.",
    );
    this.name = "SellerTokenDecryptError";
  }
}

function tokenSecret(): string {
  return env.MP_TOKEN_SECRET ?? env.AUTH_SECRET;
}

export function encryptToken(plaintext: string): string {
  return encryptSecret(plaintext, tokenSecret(), MP_TOKEN_INFO);
}

/**
 * Descifra tolerante al período de backfill:
 * - `null` → `null`.
 * - sin prefijo `v1.` (o `key_version` NULL) → texto claro legacy, se devuelve tal cual.
 * - blob v1 → secret actual; si falla y hay MP_TOKEN_SECRET_PREVIOUS, retry;
 *   si nada abre → SellerTokenDecryptError con el userId.
 */
export function decryptTokenTolerant(
  value: string | null,
  keyVersion: number | null,
  userId: string,
): string | null {
  if (value === null) return null;
  if (keyVersion === null || !value.startsWith("v1.")) return value;
  try {
    return decryptSecret(value, tokenSecret(), MP_TOKEN_INFO);
  } catch {
    if (env.MP_TOKEN_SECRET_PREVIOUS) {
      try {
        return decryptSecret(value, env.MP_TOKEN_SECRET_PREVIOUS, MP_TOKEN_INFO);
      } catch {
        // cae al error tipado de abajo
      }
    }
    throw new SellerTokenDecryptError(userId);
  }
}

/**
 * Como decryptTokenTolerant pero reportando QUÉ clave abrió el blob —
 * lo usa el backfill del boot para re-cifrar lo que quedó con _PREVIOUS.
 */
export function decryptTokenForBackfill(
  value: string | null,
  keyVersion: number | null,
  userId: string,
): { plaintext: string | null; source: "null" | "plain" | "current" | "previous" } {
  if (value === null) return { plaintext: null, source: "null" };
  if (keyVersion === null || !value.startsWith("v1.")) return { plaintext: value, source: "plain" };
  try {
    return { plaintext: decryptSecret(value, tokenSecret(), MP_TOKEN_INFO), source: "current" };
  } catch {
    if (env.MP_TOKEN_SECRET_PREVIOUS) {
      try {
        return {
          plaintext: decryptSecret(value, env.MP_TOKEN_SECRET_PREVIOUS, MP_TOKEN_INFO),
          source: "previous",
        };
      } catch {
        // cae al error tipado de abajo
      }
    }
    throw new SellerTokenDecryptError(userId);
  }
}
