import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../config/env.js";
import { decryptSecret, encryptSecret } from "../../shared/crypto/aes-gcm.js";
import {
  MP_HANDOFF_INFO,
  MP_TOKEN_INFO,
  SellerTokenDecryptError,
  decryptHandoff,
  decryptTokenForBackfill,
  decryptTokenTolerant,
  encryptToken,
} from "./mp-token-cipher.js";

const CURRENT = "clave-actual-de-cifrado-de-tokens-mp-32chars!!";
const PREVIOUS = "clave-anterior-antes-de-la-rotacion-32chars!!!";
const HANDOFF = "clave-del-buzon-de-traspaso-oauth-32-chars!!!!";

// env es un objeto vivo compartido entre tests del worker: se fuerza el estado
// acá y se restaura al salir (mismo patrón que system.service.test.ts).
let saved: Partial<Record<"MP_TOKEN_SECRET" | "MP_TOKEN_SECRET_PREVIOUS" | "MP_HANDOFF_KEY", string | undefined>>;

beforeEach(() => {
  saved = {
    MP_TOKEN_SECRET: env.MP_TOKEN_SECRET,
    MP_TOKEN_SECRET_PREVIOUS: env.MP_TOKEN_SECRET_PREVIOUS,
    MP_HANDOFF_KEY: env.MP_HANDOFF_KEY,
  };
  env.MP_TOKEN_SECRET = CURRENT;
  env.MP_TOKEN_SECRET_PREVIOUS = undefined;
  env.MP_HANDOFF_KEY = HANDOFF;
});

afterEach(() => {
  env.MP_TOKEN_SECRET = saved.MP_TOKEN_SECRET;
  env.MP_TOKEN_SECRET_PREVIOUS = saved.MP_TOKEN_SECRET_PREVIOUS;
  env.MP_HANDOFF_KEY = saved.MP_HANDOFF_KEY;
});

describe("encryptToken / decryptTokenTolerant", () => {
  it("roundtrip con la clave actual", () => {
    const blob = encryptToken("APP_USR-secreto");
    expect(blob.startsWith("v1.")).toBe(true);
    expect(decryptTokenTolerant(blob, 1, "user-1")).toBe("APP_USR-secreto");
  });

  it("null pasa como null", () => {
    expect(decryptTokenTolerant(null, null, "user-1")).toBeNull();
  });

  it("tolerancia legacy: key_version NULL → texto claro tal cual", () => {
    expect(decryptTokenTolerant("APP_USR-en-claro", null, "user-1")).toBe("APP_USR-en-claro");
  });

  it("tolerancia legacy: sin prefijo v1. → texto claro aunque key_version sea 1", () => {
    expect(decryptTokenTolerant("APP_USR-sin-prefijo", 1, "user-1")).toBe("APP_USR-sin-prefijo");
  });

  it("retry con MP_TOKEN_SECRET_PREVIOUS tras una rotación", () => {
    const blob = encryptSecret("APP_USR-viejo", PREVIOUS, MP_TOKEN_INFO);
    // Sin _PREVIOUS: no abre.
    expect(() => decryptTokenTolerant(blob, 1, "user-1")).toThrow(SellerTokenDecryptError);
    // Con _PREVIOUS: abre.
    env.MP_TOKEN_SECRET_PREVIOUS = PREVIOUS;
    expect(decryptTokenTolerant(blob, 1, "user-1")).toBe("APP_USR-viejo");
  });

  it("si ninguna clave abre, lanza SellerTokenDecryptError con el userId", () => {
    const blob = encryptSecret("x", "clave-perdida-que-ya-nadie-tiene-32chars!!", MP_TOKEN_INFO);
    env.MP_TOKEN_SECRET_PREVIOUS = PREVIOUS;
    try {
      decryptTokenTolerant(blob, 1, "seller-42");
      expect.unreachable("debería haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(SellerTokenDecryptError);
      expect((err as SellerTokenDecryptError).userId).toBe("seller-42");
      expect((err as Error).message).toContain("seller-42");
    }
  });

  it("usa AUTH_SECRET como ikm si MP_TOKEN_SECRET falta", () => {
    env.MP_TOKEN_SECRET = undefined;
    const blob = encryptToken("token-con-auth-secret");
    expect(decryptSecret(blob, env.AUTH_SECRET, MP_TOKEN_INFO)).toBe("token-con-auth-secret");
    expect(decryptTokenTolerant(blob, 1, "u")).toBe("token-con-auth-secret");
  });
});

describe("decryptTokenForBackfill", () => {
  it("reporta la fuente: plain / current / previous", () => {
    expect(decryptTokenForBackfill("en-claro", null, "u")).toEqual({
      plaintext: "en-claro",
      source: "plain",
    });
    expect(decryptTokenForBackfill(encryptToken("actual"), 1, "u")).toEqual({
      plaintext: "actual",
      source: "current",
    });
    env.MP_TOKEN_SECRET_PREVIOUS = PREVIOUS;
    const oldBlob = encryptSecret("rotado", PREVIOUS, MP_TOKEN_INFO);
    expect(decryptTokenForBackfill(oldBlob, 1, "u")).toEqual({
      plaintext: "rotado",
      source: "previous",
    });
  });
});

describe("decryptHandoff", () => {
  const payload = {
    user_id: "1517393956",
    access_token: "APP_USR-nuevo",
    refresh_token: "TG-nuevo",
    expires_at: "2027-01-19T00:00:00.000Z",
  };

  it("descifra y valida el payload del buzón", () => {
    const blob = encryptSecret(JSON.stringify(payload), HANDOFF, MP_HANDOFF_INFO);
    expect(decryptHandoff(blob)).toEqual(payload);
  });

  it("sin MP_HANDOFF_KEY lanza un error accionable", () => {
    env.MP_HANDOFF_KEY = undefined;
    const blob = encryptSecret(JSON.stringify(payload), HANDOFF, MP_HANDOFF_INFO);
    expect(() => decryptHandoff(blob)).toThrow(/MP_HANDOFF_KEY/);
  });

  it("clave desincronizada EF↔backend lanza 'handoff ilegible' (nunca silencioso)", () => {
    const blob = encryptSecret(JSON.stringify(payload), "otra-clave-que-uso-la-edge-function-32ch!!", MP_HANDOFF_INFO);
    expect(() => decryptHandoff(blob)).toThrow(/[Hh]andoff ilegible/);
  });

  it("payload sin campos obligatorios lanza", () => {
    const blob = encryptSecret(JSON.stringify({ user_id: "1" }), HANDOFF, MP_HANDOFF_INFO);
    expect(() => decryptHandoff(blob)).toThrow(/inválido/);
  });
});
