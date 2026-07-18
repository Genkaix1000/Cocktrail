import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsResolverService } from "./credentials-resolver.service.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MercadoPagoOAuthService } from "./mercadopago-oauth.service.js";

vi.mock("../../config/env.js", () => ({
  env: { MP_ACCESS_TOKEN: "AT-legacy-env" },
}));

import { env } from "../../config/env.js";

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
    findFirstActive: ReturnType<typeof vi.fn>;
  };
  let refreshTokenIfNeeded: ReturnType<typeof vi.fn>;
  let resolver: CredentialsResolverService;

  beforeEach(() => {
    sellersRepo = {
      findByUserId: vi.fn().mockResolvedValue(null),
      findFirstActive: vi.fn().mockResolvedValue(null),
    };
    refreshTokenIfNeeded = vi.fn().mockImplementation(async (s: Seller) => s.accessToken);

    resolver = new CredentialsResolverService(
      sellersRepo as unknown as MercadoPagoSellersRepository,
      { refreshTokenIfNeeded } as unknown as MercadoPagoOAuthService,
    );
    env.MP_ACCESS_TOKEN = "AT-legacy-env";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1) sellerUserId explícito tiene prioridad máxima", async () => {
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ userId: "seller-explicit", accessToken: "AT-explicit" }));

    const token = await resolver.resolve({ sellerUserId: "seller-explicit" });

    expect(token).toBe("AT-explicit");
    expect(sellersRepo.findByUserId).toHaveBeenCalledWith("seller-explicit");
    expect(sellersRepo.findFirstActive).not.toHaveBeenCalled();
  });

  it("2) seller activo por defecto cuando no hay sellerUserId explícito", async () => {
    sellersRepo.findFirstActive.mockResolvedValue(makeSeller({ accessToken: "AT-active" }));

    const token = await resolver.resolve({});

    expect(token).toBe("AT-active");
    expect(sellersRepo.findFirstActive).toHaveBeenCalledTimes(1);
  });

  it("3) fallback legacy env cuando no hay seller y allowGlobalFallback", async () => {
    const token = await resolver.resolve({ allowGlobalFallback: true });
    expect(token).toBe("AT-legacy-env");
  });

  it("4) lanza error si no hay seller y NO se permite fallback", async () => {
    await expect(resolver.resolve({})).rejects.toThrow(/No hay ninguna cuenta/);
  });

  it("5) lanza error si el seller está expired", async () => {
    sellersRepo.findFirstActive.mockResolvedValue(makeSeller({ status: "expired" }));
    await expect(resolver.resolve({})).rejects.toThrow(/está desconectada/);
    expect(refreshTokenIfNeeded).not.toHaveBeenCalled();
  });

  it("6) lanza error si el seller no tiene refresh_token", async () => {
    sellersRepo.findFirstActive.mockResolvedValue(makeSeller({ refreshToken: null }));
    await expect(resolver.resolve({})).rejects.toThrow(/no tiene refresh_token/);
    expect(refreshTokenIfNeeded).not.toHaveBeenCalled();
  });

  it("7) delega el refresh proactivo en oauthService.refreshTokenIfNeeded", async () => {
    const seller = makeSeller({ accessToken: "AT-stale" });
    sellersRepo.findFirstActive.mockResolvedValue(seller);
    refreshTokenIfNeeded.mockResolvedValue("AT-refreshed");

    const token = await resolver.resolve({});

    expect(token).toBe("AT-refreshed");
    expect(refreshTokenIfNeeded).toHaveBeenCalledWith(seller);
  });
});
