import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./aes-gcm.js";

const SECRET = "un-secreto-de-al-menos-32-caracteres-para-tests";
const INFO = "cocktrail/mp-token/v1";

describe("aes-gcm (contrato v1)", () => {
  it("roundtrip: encrypt → decrypt devuelve el plaintext original", () => {
    const plaintext = "APP_USR-token-súper-secreto-con-ñ-y-emoji-🍸";
    const blob = encryptSecret(plaintext, SECRET, INFO);
    expect(decryptSecret(blob, SECRET, INFO)).toBe(plaintext);
  });

  it("el blob cumple el formato v1.<salt 16B>.<iv 12B>.<ct||tag>", () => {
    const blob = encryptSecret("x", SECRET, INFO);
    const parts = blob.split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    expect(Buffer.from(parts[1], "base64url")).toHaveLength(16);
    expect(Buffer.from(parts[2], "base64url")).toHaveLength(12);
    // plaintext de 1 byte + tag de 16 bytes
    expect(Buffer.from(parts[3], "base64url")).toHaveLength(17);
    // b64url sin padding (compat WebCrypto/Deno)
    expect(blob).not.toContain("=");
  });

  it("dos encrypts del mismo plaintext producen blobs distintos (salt+iv random)", () => {
    expect(encryptSecret("igual", SECRET, INFO)).not.toBe(encryptSecret("igual", SECRET, INFO));
  });

  it("clave equivocada lanza", () => {
    const blob = encryptSecret("dato", SECRET, INFO);
    expect(() => decryptSecret(blob, "otra-clave-igual-de-larga-pero-distinta!!", INFO)).toThrow();
  });

  it("info (dominio HKDF) equivocado lanza — un token no descifra como handoff", () => {
    const blob = encryptSecret("dato", SECRET, INFO);
    expect(() => decryptSecret(blob, SECRET, "cocktrail/mp-handoff/v1")).toThrow();
  });

  it("blob adulterado lanza (GCM detecta el tampering)", () => {
    const blob = encryptSecret("dato-que-nadie-debe-tocar", SECRET, INFO);
    const parts = blob.split(".");
    const data = Buffer.from(parts[3], "base64url");
    data[0] ^= 0xff; // flip de un bit del ciphertext
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${data.toString("base64url")}`;
    expect(() => decryptSecret(tampered, SECRET, INFO)).toThrow();
  });

  it("formato inválido lanza con mensaje claro", () => {
    expect(() => decryptSecret("no-es-un-blob", SECRET, INFO)).toThrow(/v1/);
    expect(() => decryptSecret("v2.a.b.c", SECRET, INFO)).toThrow(/v1/);
  });

  it("VECTOR FIJO WebCrypto→Node: descifra un blob generado con crypto.subtle (lado Deno)", () => {
    // Generado y VERIFICADO con el WebCrypto real de la Edge Function
    // (deriveBits HKDF-SHA256 → AES-GCM, ct||tag concatenado, b64url sin padding).
    // Si este test rompe, se rompió el contrato de cifrado entre EF y backend.
    const secret = "vector-de-test-cocktrail-handoff-0123456789abcdef";
    const info = "cocktrail/mp-handoff/v1";
    const blob =
      "v1.A5Mxd0i5POsywVcwzTsXwQ.dv8AU7rTD_V1HLFe.gbnXkpX7UT0H8GJgYiufFdztyntgGjsn1tnnTDiUpA6vucu2qo-j1IgR0n0W8i3wmmMIkKB1-hvo34F8uFy8DnOR7szvccWDMNd8FqvdXF4rzXvIW4RITRDJ5_twf72j2Cvr4L8EJXKZ26BfOt4glDVDP51JzCoq9Y3Esz0rtYJjmp7-C1AC82ICF3VEfoUBh9jTx6c";

    const plaintext = decryptSecret(blob, secret, info);
    expect(JSON.parse(plaintext)).toEqual({
      user_id: "999999999",
      access_token: "APP_USR-vector-fijo",
      refresh_token: "TG-vector-fijo",
      expires_at: "2027-01-01T00:00:00.000Z",
    });
  });
});
