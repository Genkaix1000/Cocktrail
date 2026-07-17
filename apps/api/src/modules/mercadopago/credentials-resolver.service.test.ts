import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialsResolverService } from "./credentials-resolver.service.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MercadoPagoCajasRepository, Caja } from "./mercadopago-cajas.repository.js";
import type { MercadoPagoCajasDevicesRepository, CajaDevice } from "./mercadopago-cajas-devices.repository.js";
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

function makeCaja(overrides: Partial<Caja> = {}): Caja {
  return {
    id: "caja-1",
    barId: "bar-1",
    storeId: "store-1",
    externalPosId: "COCKTRAIL-BAR-01",
    posIdMp: "pos-1",
    qrImage: null,
    qrTemplate: null,
    sellerUserId: "seller-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDevice(overrides: Partial<CajaDevice> = {}): CajaDevice {
  return {
    id: "dev-1",
    cajaId: "caja-1",
    deviceId: "PAX_A910__X",
    deviceUsername: null,
    operatingMode: "PDV",
    caja: makeCaja(),
    ...overrides,
  };
}

describe("CredentialsResolverService", () => {
  let sellersRepo: {
    findByUserId: ReturnType<typeof vi.fn>;
    findFirstActive: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let cajasRepo: {
    findByBarId: ReturnType<typeof vi.fn>;
    findBySellerUserId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let devicesRepo: {
    findByDeviceId: ReturnType<typeof vi.fn>;
    findByCajaId: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let refreshTokenIfNeeded: ReturnType<typeof vi.fn>;
  let resolver: CredentialsResolverService;

  beforeEach(() => {
    sellersRepo = {
      findByUserId: vi.fn().mockResolvedValue(null),
      findFirstActive: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      update: vi.fn(),
    };
    cajasRepo = {
      findByBarId: vi.fn().mockResolvedValue(null),
      findBySellerUserId: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    };
    devicesRepo = {
      findByDeviceId: vi.fn().mockResolvedValue(null),
      findByCajaId: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    };
    // refreshTokenIfNeeded devuelve el access_token vigente por defecto.
    refreshTokenIfNeeded = vi.fn().mockImplementation(async (s: Seller) => s.accessToken);

    resolver = new CredentialsResolverService(
      sellersRepo as unknown as MercadoPagoSellersRepository,
      cajasRepo as unknown as MercadoPagoCajasRepository,
      devicesRepo as unknown as MercadoPagoCajasDevicesRepository,
      { refreshTokenIfNeeded } as unknown as MercadoPagoOAuthService,
    );
    env.MP_ACCESS_TOKEN = "AT-legacy-env";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("1) sellerUserId explícito tiene prioridad máxima (no consulta device/barra)", async () => {
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ userId: "seller-explicit", accessToken: "AT-explicit" }));

    const token = await resolver.resolve({ sellerUserId: "seller-explicit", deviceId: "PAX_A910__X", barId: "bar-1" });

    expect(token).toBe("AT-explicit");
    expect(sellersRepo.findByUserId).toHaveBeenCalledWith("seller-explicit");
    expect(devicesRepo.findByDeviceId).not.toHaveBeenCalled();
    expect(cajasRepo.findByBarId).not.toHaveBeenCalled();
  });

  it("2) resuelve por device → caja.sellerUserId → seller", async () => {
    devicesRepo.findByDeviceId.mockResolvedValue(makeDevice({ caja: makeCaja({ sellerUserId: "seller-dev" }) }));
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ userId: "seller-dev", accessToken: "AT-dev" }));

    const token = await resolver.resolve({ deviceId: "PAX_A910__X" });

    expect(token).toBe("AT-dev");
    expect(devicesRepo.findByDeviceId).toHaveBeenCalledWith("PAX_A910__X");
    expect(sellersRepo.findByUserId).toHaveBeenCalledWith("seller-dev");
  });

  it("3) resuelve por barra → caja.sellerUserId → seller", async () => {
    cajasRepo.findByBarId.mockResolvedValue(makeCaja({ sellerUserId: "seller-bar" }));
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ userId: "seller-bar", accessToken: "AT-bar" }));

    const token = await resolver.resolve({ barId: "bar-1" });

    expect(token).toBe("AT-bar");
    expect(cajasRepo.findByBarId).toHaveBeenCalledWith("bar-1");
    expect(sellersRepo.findByUserId).toHaveBeenCalledWith("seller-bar");
  });

  it("4) fallback global (findFirstActive) cuando allowGlobalFallback y no hay match por device/barra", async () => {
    sellersRepo.findFirstActive.mockResolvedValue(makeSeller({ accessToken: "AT-global" }));

    const token = await resolver.resolve({ deviceId: "PAX_desconocido", allowGlobalFallback: true });

    expect(token).toBe("AT-global");
    expect(sellersRepo.findFirstActive).toHaveBeenCalledTimes(1);
  });

  it("5) fallback legacy env cuando no hay seller y allowGlobalFallback", async () => {
    const token = await resolver.resolve({ allowGlobalFallback: true });
    expect(token).toBe("AT-legacy-env");
  });

  it("lanza MP_NO_SELLER si no hay seller y NO se permite fallback global", async () => {
    await expect(resolver.resolve({ deviceId: "PAX_x" })).rejects.toMatchObject({ code: "MP_NO_SELLER" });
  });

  it("no usa el env legacy si allowGlobalFallback es false", async () => {
    await expect(resolver.resolve({})).rejects.toMatchObject({ code: "MP_NO_SELLER" });
    expect(sellersRepo.findFirstActive).not.toHaveBeenCalled();
  });

  it("lanza MP_SELLER_DISCONNECTED si el seller resuelto está expired", async () => {
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ status: "expired" }));
    await expect(resolver.resolve({ sellerUserId: "seller-1" })).rejects.toMatchObject({ code: "MP_SELLER_DISCONNECTED" });
    expect(refreshTokenIfNeeded).not.toHaveBeenCalled();
  });

  it("lanza MP_SELLER_NO_REFRESH si el seller no tiene refresh_token", async () => {
    sellersRepo.findByUserId.mockResolvedValue(makeSeller({ refreshToken: null }));
    await expect(resolver.resolve({ sellerUserId: "seller-1" })).rejects.toMatchObject({ code: "MP_SELLER_NO_REFRESH" });
    expect(refreshTokenIfNeeded).not.toHaveBeenCalled();
  });

  it("delega el refresh proactivo en oauthService.refreshTokenIfNeeded", async () => {
    const seller = makeSeller({ accessToken: "AT-stale" });
    sellersRepo.findByUserId.mockResolvedValue(seller);
    refreshTokenIfNeeded.mockResolvedValue("AT-refreshed");

    const token = await resolver.resolve({ sellerUserId: "seller-1" });

    expect(token).toBe("AT-refreshed");
    expect(refreshTokenIfNeeded).toHaveBeenCalledWith(seller);
  });
});
