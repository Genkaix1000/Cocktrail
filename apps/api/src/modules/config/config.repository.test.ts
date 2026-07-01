import { describe, it, expect } from "vitest";
import { toSafeConfig, type AppConfig } from "./config.repository.js";

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    theme: "normal",
    brandName: "Cocktrail",
    logoUrl: "",
    customTheme: null,
    mercadoPago: { publicKey: "pub-123", accessToken: "APP_USR-1234567890abcdef", sandbox: true },
    clubId: "club-1",
    clubName: "Bosko Club",
    useLogoUrl: false,
    logoSize: 40,
    textLogoValue: "Cocktrail",
    textLogoSize: 26,
    ...overrides,
  };
}

describe("toSafeConfig", () => {
  it("enmascara el accessToken dejando solo los últimos 4 caracteres visibles", () => {
    const safe = toSafeConfig(makeConfig());
    expect(safe.mercadoPago.accessTokenMasked).toBe("••••••••cdef");
    expect(safe.mercadoPago.accessTokenMasked).not.toContain("APP_USR");
  });

  it("no incluye el accessToken real en ningún campo del resultado", () => {
    const config = makeConfig();
    const safe = toSafeConfig(config);
    expect(JSON.stringify(safe)).not.toContain(config.mercadoPago.accessToken);
  });

  it("con accessToken vacío, deja accessTokenMasked vacío en vez de enmascarar la nada", () => {
    const safe = toSafeConfig(makeConfig({ mercadoPago: { publicKey: "", accessToken: "", sandbox: true } }));
    expect(safe.mercadoPago.accessTokenMasked).toBe("");
  });

  it("preserva el resto de los campos de la config sin modificarlos", () => {
    const config = makeConfig({ brandName: "Otro Boliche", clubId: "club-42" });
    const safe = toSafeConfig(config);
    expect(safe.brandName).toBe("Otro Boliche");
    expect(safe.clubId).toBe("club-42");
    expect(safe.theme).toBe("normal");
  });

  it("preserva publicKey y sandbox de mercadoPago sin enmascarar", () => {
    const safe = toSafeConfig(makeConfig());
    expect(safe.mercadoPago.publicKey).toBe("pub-123");
    expect(safe.mercadoPago.sandbox).toBe(true);
  });
});
