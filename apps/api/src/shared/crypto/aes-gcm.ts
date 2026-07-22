import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Cifrado app-level de secretos (tokens MP) — contrato v1, IDÉNTICO al que
 * implementa la Edge Function `mp-auth-callback` con WebCrypto (Deno):
 *
 *   blob = "v1." + b64url(salt 16B) + "." + b64url(iv 12B) + "." + b64url(ciphertext||tag 16B)
 *   key  = HKDF-SHA256(ikm=utf8(secret), salt, info, 32B)
 *   AES-256-GCM (el tag de 16B va concatenado al final del ciphertext,
 *   como lo devuelve WebCrypto — por eso acá se concatena a mano).
 *
 * Cambiar CUALQUIER unidad de este contrato rompe el traspaso Cloud→local.
 * El test con vector fijo generado con WebCrypto (aes-gcm.test.ts) es la
 * guarda de compatibilidad entre ambos lados.
 */

const VERSION_PREFIX = "v1";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function deriveKey(ikm: string, salt: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(ikm, "utf8"), salt, info, KEY_BYTES));
}

export function encryptSecret(plaintext: string, ikm: string, info: string): string {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(ikm, salt, info);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}.${b64url(salt)}.${b64url(iv)}.${b64url(Buffer.concat([ciphertext, tag]))}`;
}

/** Lanza si el blob está malformado, la clave no corresponde o fue adulterado (GCM). */
export function decryptSecret(blob: string, ikm: string, info: string): string {
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new Error("Blob cifrado inválido: se esperaba el formato v1.<salt>.<iv>.<data>");
  }
  const salt = Buffer.from(parts[1], "base64url");
  const iv = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || data.length < TAG_BYTES) {
    throw new Error("Blob cifrado inválido: tamaños de salt/iv/data fuera del contrato v1");
  }
  const ciphertext = data.subarray(0, data.length - TAG_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  const key = deriveKey(ikm, salt, info);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
