import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsResolverService } from "./credentials-resolver.service.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MercadoPagoOAuthService } from "./mercadopago-oauth.service.js";
import { SellerTokenDecryptError } from "./mp-token-cipher.js";

vi.mock("../../config/env.js", () => ({
  env: { MP_ACCESS_TOKEN: "AT-legacy-env", AUTH_SECRET: "auth-secret-de-32-caracteres-para-tests!!" },
}));

vi.mock("./mp-fallback-preflight.js", () => ({
  getMpFallbackStatus: vi.fn(),
  markMpFallbackDegraded: vi.fn(),
}));

import { env } from "../../config/env.js";
import { getMpFallbackStatus, markMpFallbackDegraded } from "./mp-fallback-preflight.js";

function makeSeller(overrides: Partial<Seller> = {}): Seller {
  return {
    userId: "seller-1",
    accessToken: "AT-current",
    refreshToken: "RT-1",
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: "active",
    nickname: "BOSKO BAR",
    firstName: null,
    lastName: null,
    email: null,
    linkedAt: null,
    ...overrides,
  };
}

describe("CredentialsResolverService", () => {
  let sellersRepo: {
    findByUserId: ReturnType<typeof vi.fn>;
    findActive: ReturnType<typeof vi.fn>;
    findGhost: ReturnType<typeof vi.fn>;
  };
  let refreshTokenIfNeeded: ReturnType<typeof vi.fn>;
  let resolver: CredentialsResolverService;

  beforeEach(() => {
    // Los vi.fn() del mock de módulo (preflight) conservan historia entre tests
    // — restoreAllMocks no los toca; hay que limpiarlos explícitamente.
    vi.clearAllMocks();
    sellersRepo = {
      findByUserId: vi.fn().mockResolvedValue(null),
      findActive: vi.fn().mockResolvedValue(null),
      findGhost: vi.fn().mockResolvedValue(null),
    };
    refreshTokenIfNeeded = vi.fn().mockImplementation(async (s: Seller) => s.accessToken);

    resolver = new CredentialsResolverService(
      sellersRepo as unknown as MercadoPagoSellersRepository,
      { refreshTokenIfNeeded } as unknown as MercadoPagoOAuthService,
    );
    env.MP_ACCESS_TOKEN = "AT-legacy-env";
    vi.mocked(getMpFallbackStatus).mockReturnValue({
      status: "unknown",
      reason: "Preflight todavía no corrió.",
      checkedAt: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1) sellerUserId explícito tiene prioridad máxima", async () => {
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ userId: "seller-explicit", accessToken: "AT-explicit" }));

    const token = await resolver.resolve({ sellerUserId: "seller-explicit" });

    expect(token).toBe("AT-explicit");
    expect(sellersRepo.findByUserId).toHaveBeenCalledWith("seller-explicit");
    expect(sellersRepo.findActive).not.toHaveBeenCalled();
  });

  it("2) seller activo por defecto cuando no hay sellerUserId explícito", async () => {
    sellersRepo.findActive.mockResolvedValue(makeSeller({ accessToken: "AT-active" }));

    const token = await resolver.resolve({});

    expect(token).toBe("AT-active");
    expect(sellersRepo.findActive).toHaveBeenCalledTimes(1);
  });

  it("3) fallback legacy env cuando no hay seller y allowGlobalFallback", async () => {
    const token = await resolver.resolve({ allowGlobalFallback: true });
    expect(token).toBe("AT-legacy-env");
  });

  it("4) lanza error si no hay seller y NO se permite fallback", async () => {
    await expect(resolver.resolve({})).rejects.toThrow(/No hay ninguna cuenta/);
  });

  it("5) lanza error si el seller está expired", async () => {
    sellersRepo.findActive.mockResolvedValue(makeSeller({ status: "expired" }));
    await expect(resolver.resolve({})).rejects.toThrow(/está desconectada/);
    expect(refreshTokenIfNeeded).not.toHaveBeenCalled();
  });

  it("6) lanza error si el seller no tiene refresh_token", async () => {
    sellersRepo.findActive.mockResolvedValue(makeSeller({ refreshToken: null }));
    await expect(resolver.resolve({})).rejects.toThrow(/no tiene refresh_token/);
    expect(refreshTokenIfNeeded).not.toHaveBeenCalled();
  });

  it("7) delega el refresh proactivo en oauthService.refreshTokenIfNeeded", async () => {
    const seller = makeSeller({ accessToken: "AT-stale" });
    sellersRepo.findActive.mockResolvedValue(seller);
    refreshTokenIfNeeded.mockResolvedValue("AT-refreshed");

    const token = await resolver.resolve({});

    expect(token).toBe("AT-refreshed");
    expect(refreshTokenIfNeeded).toHaveBeenCalledWith(seller);
  });

  // ── F1 — degradación medida cuando el nivel 2 LANZA (no cuando devuelve null) ──

  describe("F1 — nivel 2 lanza", () => {
    const decryptError = () => new SellerTokenDecryptError("seller-1");

    it("F1.e-1) nivel 2 devuelve null → nivel 3 SIN warn ni flag", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const token = await resolver.resolve({ allowGlobalFallback: true });
      expect(token).toBe("AT-legacy-env");
      expect(warnSpy).not.toHaveBeenCalled();
      expect(markMpFallbackDegraded).not.toHaveBeenCalled();
    });

    it("F1.e-2) nivel 2 lanza y el token de la env es de la MISMA cuenta → nivel 3 CON warn + flag", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      sellersRepo.findActive.mockRejectedValue(decryptError());
      vi.mocked(getMpFallbackStatus).mockReturnValue({
        status: "usable",
        tokenUserId: "seller-1",
        deviceSeen: true,
        checkedAt: new Date().toISOString(),
      });

      const token = await resolver.resolve({ allowGlobalFallback: true });

      expect(token).toBe("AT-legacy-env");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("fallback de env"));
      expect(markMpFallbackDegraded).toHaveBeenCalledWith(expect.stringContaining("seller-1"));
    });

    it("F1.e-3) nivel 2 lanza y el token de la env es de OTRA cuenta → NO degrada, error accionable", async () => {
      sellersRepo.findActive.mockRejectedValue(decryptError());
      vi.mocked(getMpFallbackStatus).mockReturnValue({
        status: "usable",
        tokenUserId: "otra-cuenta-999",
        deviceSeen: true,
        checkedAt: new Date().toISOString(),
      });

      await expect(resolver.resolve({ allowGlobalFallback: true })).rejects.toThrow(
        /otra cuenta.*otra-cuenta-999.*seller-1/s,
      );
      expect(markMpFallbackDegraded).not.toHaveBeenCalled();
    });

    it("F1.e-4) nivel 2 lanza y el preflight no determinó la cuenta (unknown) → NO degrada", async () => {
      sellersRepo.findActive.mockRejectedValue(decryptError());
      // getMpFallbackStatus del beforeEach: unknown, sin tokenUserId.

      await expect(resolver.resolve({ allowGlobalFallback: true })).rejects.toThrow(
        /sin verificar/,
      );
      expect(markMpFallbackDegraded).not.toHaveBeenCalled();
    });

    it("F1.e-5) nivel 2 lanza y NO hay MP_ACCESS_TOKEN → error accionable que dice qué falta", async () => {
      env.MP_ACCESS_TOKEN = undefined as unknown as string;
      sellersRepo.findActive.mockRejectedValue(decryptError());

      await expect(resolver.resolve({ allowGlobalFallback: true })).rejects.toThrow(
        /MP_ACCESS_TOKEN/,
      );
    });

    it("F1 extra) sin allowGlobalFallback nunca degrada aunque la cuenta coincida", async () => {
      sellersRepo.findActive.mockRejectedValue(decryptError());
      vi.mocked(getMpFallbackStatus).mockReturnValue({
        status: "usable",
        tokenUserId: "seller-1",
        checkedAt: new Date().toISOString(),
      });

      await expect(resolver.resolve({})).rejects.toThrow(/No se pudo usar/);
      expect(markMpFallbackDegraded).not.toHaveBeenCalled();
    });

    it("F1 clase (4)) stub activo sin refresh_token + misma cuenta → degrada con warn (caso restore/opción b)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      sellersRepo.findActive.mockResolvedValue(makeSeller({ refreshToken: null, accessToken: null }));
      vi.mocked(getMpFallbackStatus).mockReturnValue({
        status: "usable",
        tokenUserId: "seller-1",
        deviceSeen: true,
        checkedAt: new Date().toISOString(),
      });

      const token = await resolver.resolve({ allowGlobalFallback: true });

      expect(token).toBe("AT-legacy-env");
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("refresh_token"));
      expect(markMpFallbackDegraded).toHaveBeenCalled();
    });

    it("F1 clase (4)) con sellerUserId EXPLÍCITO sin refresh_token NO degrada (quiere ese seller)", async () => {
      sellersRepo.findByUserId.mockResolvedValue(makeSeller({ userId: "seller-x", refreshToken: null }));

      await expect(
        resolver.resolve({ sellerUserId: "seller-x", allowGlobalFallback: true }),
      ).rejects.toThrow(/no tiene refresh_token/);
      expect(markMpFallbackDegraded).not.toHaveBeenCalled();
    });

    it("F1 extra) una excepción que no es de descifrado (userId desconocido) no degrada", async () => {
      sellersRepo.findActive.mockRejectedValue(new Error("invariante single-seller roto"));
      vi.mocked(getMpFallbackStatus).mockReturnValue({
        status: "usable",
        tokenUserId: "seller-1",
        checkedAt: new Date().toISOString(),
      });

      await expect(resolver.resolve({ allowGlobalFallback: true })).rejects.toThrow(/desconocido/);
      expect(markMpFallbackDegraded).not.toHaveBeenCalled();
    });
  });

  it("useGhost resuelve el seller ghost y no toca findActive", async () => {
    sellersRepo.findGhost.mockResolvedValue(
      makeSeller({ userId: "ghost-1", accessToken: "AT-ghost", status: "ghost" }),
    );

    const token = await resolver.resolve({ useGhost: true });

    expect(token).toBe("AT-ghost");
    expect(sellersRepo.findGhost).toHaveBeenCalledTimes(1);
    expect(sellersRepo.findActive).not.toHaveBeenCalled();
  });

  it("useGhost sin seller ghost lanza accionable", async () => {
    await expect(resolver.resolve({ useGhost: true })).rejects.toThrow(/ghost vinculada/);
  });
});
