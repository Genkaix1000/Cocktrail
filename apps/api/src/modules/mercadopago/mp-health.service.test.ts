import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import type {
  CajaDevice,
  MercadoPagoCajasDevicesRepository,
} from "./mercadopago-cajas-devices.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MpDevicesListing } from "./mercadopago-provisioning.service.js";

vi.mock("../../config/env.js", () => ({
  env: { MP_POS_DEVICE_ID: "env-device" },
}));

import { env } from "../../config/env.js";
import {
  MpHealthService,
  MP_HEALTH_TTL_MS,
  POSNET_WRONG_ACCOUNT_CODE,
  type MpHealth,
} from "./mp-health.service.js";
import {
  PosnetResolverService,
  markUsingEnvDevice,
  resetEnvDeviceUsageForTests,
} from "./posnet-resolver.service.js";
import {
  getMpFallbackStatus,
  markMpFallbackDegraded,
  resetMpFallbackStatusForTests,
} from "./mp-fallback-preflight.js";

const SELLER = { userId: "111", nickname: "BOSKO", status: "active" } as Seller;
const CAJA = { id: "caja-1", barId: "bar-uuid-1", sellerUserId: "111" } as Caja;
const DEVICE = {
  id: "dev-row-1",
  deviceId: "PAX_A910__SMARTPOS1493600985",
  cajaId: "caja-1",
  isActive: true,
} as CajaDevice;

function listingWith(
  devices: Array<{ id: string; operatingMode?: "PDV" | "STANDALONE" | null }>,
): MpDevicesListing {
  return {
    devices: devices.map((d) => ({
      id: d.id,
      model: d.id.split("__")[0] ?? d.id,
      operatingMode: d.operatingMode === undefined ? "PDV" : d.operatingMode,
      storeId: null,
      posId: null,
      registeredLocally: true,
    })),
    token: { source: "seller", userId: "111" },
    sellerUserId: "111",
  };
}

type Overrides = {
  findActive?: () => Promise<Seller | null>;
  barId?: string | null;
  caja?: Caja | null;
  device?: CajaDevice | null;
  listMpDevices?: () => Promise<MpDevicesListing>;
};

function makeService(overrides: Overrides = {}) {
  const sellersRepo = {
    findActive: vi.fn(overrides.findActive ?? (async () => SELLER)),
  } as unknown as MercadoPagoSellersRepository;
  const cajasRepo = {
    findByBarId: vi.fn(async () => (overrides.caja === undefined ? CAJA : overrides.caja)),
  } as unknown as MercadoPagoCajasRepository;
  const devicesRepo = {
    findActiveByCajaId: vi.fn(async () =>
      overrides.device === undefined ? DEVICE : overrides.device,
    ),
  } as unknown as MercadoPagoCajasDevicesRepository;
  const resolveInstallationBarId = vi.fn(async () =>
    overrides.barId === undefined ? "bar-uuid-1" : overrides.barId,
  );
  const listMpDevices = vi.fn(
    overrides.listMpDevices ?? (async () => listingWith([{ id: DEVICE.deviceId }])),
  );
  return {
    service: new MpHealthService(
      sellersRepo,
      cajasRepo,
      devicesRepo,
      resolveInstallationBarId,
      listMpDevices,
    ),
    sellersRepo,
    listMpDevices,
  };
}

function everyRedHasAction(health: MpHealth) {
  for (const check of Object.values(health.checks)) {
    if (check.ok === false) {
      expect(check.action, `rojo sin action: ${check.detail}`).toBeTruthy();
    }
  }
}

beforeEach(() => {
  resetEnvDeviceUsageForTests();
  resetMpFallbackStatusForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MpHealthService.getHealth — chequeo singleSeller (R21)", () => {
  it("verde con exactamente 1 seller activo", async () => {
    const { service } = makeService();
    const health = await service.getHealth();
    expect(health.checks.singleSeller.ok).toBe(true);
    expect(health.checks.singleSeller.detail).toContain("111");
  });

  it("rojo sin ningún seller, con action de vincular por OAuth", async () => {
    const { service } = makeService({ findActive: async () => null });
    const health = await service.getHealth();
    expect(health.checks.singleSeller.ok).toBe(false);
    expect(health.checks.singleSeller.action).toContain("/admin");
    everyRedHasAction(health);
  });

  it("rojo R21 cuando findActive lanza por invariante single-seller roto", async () => {
    const { service } = makeService({
      findActive: async () => {
        throw new Error("Invariante single-seller roto: hay 2 sellers activos (111, 222).");
      },
    });
    const health = await service.getHealth();
    expect(health.checks.singleSeller.ok).toBe(false);
    expect(health.checks.singleSeller.detail).toContain("single-seller");
    expect(health.checks.singleSeller.action).toBeTruthy();
  });

  it("unknown (null) si findActive falla por otra cosa (DB caída) — nunca rojo falso", async () => {
    const { service } = makeService({
      findActive: async () => {
        throw new Error("connection refused");
      },
    });
    const health = await service.getHealth();
    expect(health.checks.singleSeller.ok).toBeNull();
    expect(health.checks.singleSeller.detail).toContain("connection refused");
  });
});

describe("MpHealthService.getHealth — chequeo deviceOwnership", () => {
  it("verde cuando el listado con credenciales activas contiene el device activo de la caja", async () => {
    const { service } = makeService();
    const health = await service.getHealth();
    expect(health.checks.deviceOwnership.ok).toBe(true);
    expect(health.blocking).toBe(false);
  });

  it("ROJO cuando el device activo NO aparece en el listado — con action accionable", async () => {
    const { service } = makeService({
      listMpDevices: async () => listingWith([{ id: "OTRO_DEVICE" }]),
    });
    const health = await service.getHealth();
    expect(health.checks.deviceOwnership.ok).toBe(false);
    expect(health.checks.deviceOwnership.action).toContain("app de MP");
    expect(health.blocking).toBe(true);
    everyRedHasAction(health);
  });

  it("unknown si MP no responde (error de red) — NUNCA rojo falso, NUNCA crash", async () => {
    const { service } = makeService({
      listMpDevices: async () => {
        throw new Error("fetch failed");
      },
    });
    const health = await service.getHealth();
    expect(health.checks.deviceOwnership.ok).toBeNull();
    expect(health.checks.deviceOwnership.detail).toContain("fetch failed");
    expect(health.blocking).toBe(false);
  });

  it("unknown sin caja provisionada, con detail explicativo (y sin fetch a MP)", async () => {
    const { service, listMpDevices } = makeService({ caja: null });
    const health = await service.getHealth();
    expect(health.checks.deviceOwnership.ok).toBeNull();
    expect(health.checks.deviceOwnership.detail).toContain("caja");
    expect(listMpDevices).not.toHaveBeenCalled();
  });

  it("unknown con caja pero sin device activo vinculado", async () => {
    const { service } = makeService({ device: null });
    const health = await service.getHealth();
    expect(health.checks.deviceOwnership.ok).toBeNull();
    expect(health.checks.deviceOwnership.detail).toContain("Posnet activo");
  });
});

describe("MpHealthService.getHealth — chequeo deviceMode (R25)", () => {
  it("verde cuando el modo REAL del listado es PDV", async () => {
    const { service } = makeService();
    const health = await service.getHealth();
    expect(health.checks.deviceMode.ok).toBe(true);
  });

  it("rojo en STANDALONE, con action de ponerlo en PDV — y NO bloquea (solo advierte)", async () => {
    const { service } = makeService({
      listMpDevices: async () =>
        listingWith([{ id: DEVICE.deviceId, operatingMode: "STANDALONE" }]),
    });
    const health = await service.getHealth();
    expect(health.checks.deviceMode.ok).toBe(false);
    expect(health.checks.deviceMode.action).toContain("PDV");
    expect(health.blocking).toBe(false); // STANDALONE falla solo: no es el caso grave
    everyRedHasAction(health);
  });

  it("unknown si MP no informó operating_mode", async () => {
    const { service } = makeService({
      listMpDevices: async () => listingWith([{ id: DEVICE.deviceId, operatingMode: null }]),
    });
    const health = await service.getHealth();
    expect(health.checks.deviceMode.ok).toBeNull();
  });

  it("unknown si el device no aparece en el listado (el modo no se puede leer)", async () => {
    const { service } = makeService({
      listMpDevices: async () => listingWith([{ id: "OTRO_DEVICE" }]),
    });
    const health = await service.getHealth();
    expect(health.checks.deviceMode.ok).toBeNull();
  });
});

describe("MpHealthService.getHealth — chequeo cajaProvisioned (R22 derivado)", () => {
  it("verde cuando caja.sellerUserId === sellerActivo.userId", async () => {
    const { service } = makeService();
    const health = await service.getHealth();
    expect(health.checks.cajaProvisioned.ok).toBe(true);
  });

  it("rojo (caja huérfana) cuando difieren, con action de re-provisionar que avisa del QR", async () => {
    const { service } = makeService({
      caja: { ...CAJA, sellerUserId: "999" } as Caja,
    });
    const health = await service.getHealth();
    expect(health.checks.cajaProvisioned.ok).toBe(false);
    expect(health.checks.cajaProvisioned.detail).toContain("999");
    expect(health.checks.cajaProvisioned.action).toContain("QR");
    expect(health.blocking).toBe(false); // huérfana advierte, no bloquea
    everyRedHasAction(health);
  });

  it("unknown sin caja provisionada", async () => {
    const { service } = makeService({ caja: null });
    const health = await service.getHealth();
    expect(health.checks.cajaProvisioned.ok).toBeNull();
  });

  it("unknown sin seller activo (el problema lo señala singleSeller)", async () => {
    const { service } = makeService({ findActive: async () => null });
    const health = await service.getHealth();
    expect(health.checks.cajaProvisioned.ok).toBeNull();
    expect(health.checks.singleSeller.ok).toBe(false);
  });
});

describe("MpHealthService — cache TTL 30 s + refresh", () => {
  it("dos getHealth dentro del TTL → un solo fetch del listado", async () => {
    vi.useFakeTimers();
    const { service, listMpDevices } = makeService();
    await service.getHealth();
    vi.advanceTimersByTime(MP_HEALTH_TTL_MS - 1_000);
    await service.getHealth();
    expect(listMpDevices).toHaveBeenCalledTimes(1);
  });

  it("pasado el TTL se re-computa", async () => {
    vi.useFakeTimers();
    const { service, listMpDevices } = makeService();
    await service.getHealth();
    vi.advanceTimersByTime(MP_HEALTH_TTL_MS + 1_000);
    await service.getHealth();
    expect(listMpDevices).toHaveBeenCalledTimes(2);
  });

  it("refresh=true fuerza el re-chequeo aunque el cache esté fresco", async () => {
    const { service, listMpDevices } = makeService();
    await service.getHealth();
    await service.getHealth(true);
    expect(listMpDevices).toHaveBeenCalledTimes(2);
  });

  it("el refresh trae el estado nuevo (rojo → verde tras arreglar la cuenta)", async () => {
    let devices = listingWith([{ id: "OTRO_DEVICE" }]);
    const { service } = makeService({ listMpDevices: async () => devices });
    expect((await service.getHealth()).checks.deviceOwnership.ok).toBe(false);
    devices = listingWith([{ id: DEVICE.deviceId }]);
    expect((await service.getHealth(true)).checks.deviceOwnership.ok).toBe(true);
  });
});

describe("MpHealthService — blocking, fallback y usingEnvDevice", () => {
  it("blocking SOLO por deviceOwnership rojo: otros rojos no bloquean", async () => {
    const { service } = makeService({
      findActive: async () => null, // singleSeller rojo
      listMpDevices: async () =>
        listingWith([{ id: DEVICE.deviceId, operatingMode: "STANDALONE" }]), // deviceMode rojo
    });
    const health = await service.getHealth();
    expect(health.checks.singleSeller.ok).toBe(false);
    expect(health.checks.deviceMode.ok).toBe(false);
    expect(health.blocking).toBe(false);
  });

  it("fallback es el pass-through del preflight F1 (getMpFallbackStatus tal cual)", async () => {
    markMpFallbackDegraded("cobro degradado a env en el test");
    const { service } = makeService();
    const health = await service.getHealth();
    expect(health.fallback).toEqual(getMpFallbackStatus());
    expect(health.fallback.lastDegradedReason).toBe("cobro degradado a env en el test");
  });

  it("usingEnvDevice refleja el flag del resolver, incluso si cambió después del cache", async () => {
    const { service } = makeService();
    expect((await service.getHealth()).usingEnvDevice).toBe(false);
    markUsingEnvDevice("cobro por env en el test");
    // Sin re-computar (cache fresco): el flag es un singleton leído en vivo.
    expect((await service.getHealth()).usingEnvDevice).toBe(true);
  });

  it("checkedAt es un ISO string", async () => {
    const { service } = makeService();
    const health = await service.getHealth();
    expect(new Date(health.checkedAt).toISOString()).toBe(health.checkedAt);
  });
});

describe("MpHealthService.assertDeviceNotGrave — la guarda del caso grave (T17)", () => {
  it("device visto en el listado → pasa sin lanzar", async () => {
    const { service } = makeService();
    await expect(
      service.assertDeviceNotGrave(DEVICE.deviceId, "caja-1"),
    ).resolves.toBeUndefined();
  });

  it("caso grave: device ausente del listado → 409 POSNET_WRONG_ACCOUNT y health blocking", async () => {
    const { service } = makeService({
      listMpDevices: async () => listingWith([{ id: "OTRO_DEVICE" }]),
    });
    await expect(service.assertDeviceNotGrave(DEVICE.deviceId, "caja-1")).rejects.toMatchObject({
      name: "Conflict",
      code: POSNET_WRONG_ACCOUNT_CODE,
      message: expect.stringContaining("OTRA cuenta"),
    });
    expect((await service.getHealth()).blocking).toBe(true);
  });

  it("MP inalcanzable → unknown y NO bloquea (decisión del dueño: cero falsos positivos)", async () => {
    const { service } = makeService({
      listMpDevices: async () => {
        throw new Error("ETIMEDOUT");
      },
    });
    await expect(
      service.assertDeviceNotGrave(DEVICE.deviceId, "caja-1"),
    ).resolves.toBeUndefined();
  });

  it("usa el cache de 30 s: la guarda NO paga un fetch a MP por cada cobro", async () => {
    const { service, listMpDevices } = makeService();
    await service.assertDeviceNotGrave(DEVICE.deviceId, "caja-1");
    await service.assertDeviceNotGrave(DEVICE.deviceId, "caja-1");
    await service.assertDeviceNotGrave(DEVICE.deviceId, "caja-1");
    expect(listMpDevices).toHaveBeenCalledTimes(1);
  });

  it("cableada al resolver real: el caso grave corta resolveForCharge con 409 sin tocar MP", async () => {
    env.MP_POS_DEVICE_ID = "env-device";
    const { service } = makeService({
      listMpDevices: async () => listingWith([{ id: "OTRO_DEVICE" }]),
    });
    const cajasRepo = {
      findByBarId: vi.fn(async () => CAJA),
    } as unknown as MercadoPagoCajasRepository;
    const devicesRepo = {
      findActiveByCajaId: vi.fn(async () => DEVICE),
    } as unknown as MercadoPagoCajasDevicesRepository;
    const resolver = new PosnetResolverService(cajasRepo, devicesRepo, (deviceId, cajaId) =>
      service.assertDeviceNotGrave(deviceId, cajaId),
    );

    await expect(resolver.resolveForCharge("bar-uuid-1")).rejects.toMatchObject({
      name: "Conflict",
      code: POSNET_WRONG_ACCOUNT_CODE,
    });
  });

  it("cableada al resolver real: con MP caído el cobro sigue (unknown no bloquea)", async () => {
    const { service } = makeService({
      listMpDevices: async () => {
        throw new Error("fetch failed");
      },
    });
    const cajasRepo = {
      findByBarId: vi.fn(async () => CAJA),
    } as unknown as MercadoPagoCajasRepository;
    const devicesRepo = {
      findActiveByCajaId: vi.fn(async () => DEVICE),
    } as unknown as MercadoPagoCajasDevicesRepository;
    const resolver = new PosnetResolverService(cajasRepo, devicesRepo, (deviceId, cajaId) =>
      service.assertDeviceNotGrave(deviceId, cajaId),
    );

    const resolved = await resolver.resolveForCharge("bar-uuid-1");
    expect(resolved).toEqual({ deviceId: DEVICE.deviceId, source: "caja", cajaId: "caja-1" });
  });
});
