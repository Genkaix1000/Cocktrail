import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja, MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import type { CajaDevice, MercadoPagoCajasDevicesRepository } from "./mercadopago-cajas-devices.repository.js";

vi.mock("../../config/env.js", () => ({
  env: { MP_POS_DEVICE_ID: "env-device" },
}));

import { env } from "../../config/env.js";
import {
  PosnetResolverService,
  POSNET_NOT_LINKED_CODE,
  getEnvDeviceUsage,
  isUsingEnvDevice,
  resetEnvDeviceUsageForTests,
} from "./posnet-resolver.service.js";

const CAJA = { id: "caja-1", barId: "bar-uuid-1" } as Caja;
const DEVICE = { id: "dev-row-1", deviceId: "PAX_A910__SMARTPOS1493600985", cajaId: "caja-1", isActive: true } as CajaDevice;

function makeResolver(overrides: {
  caja?: Caja | null;
  activeDevice?: CajaDevice | null;
  assertNotGrave?: (deviceId: string, cajaId: string) => Promise<void>;
} = {}) {
  const cajasRepo = {
    findByBarId: vi.fn(async () => overrides.caja ?? null),
  } as unknown as MercadoPagoCajasRepository;
  const devicesRepo = {
    findActiveByCajaId: vi.fn(async () => overrides.activeDevice ?? null),
  } as unknown as MercadoPagoCajasDevicesRepository;
  const assertNotGrave = vi.fn(overrides.assertNotGrave ?? (async () => {}));
  return {
    resolver: new PosnetResolverService(cajasRepo, devicesRepo, assertNotGrave),
    cajasRepo,
    devicesRepo,
    assertNotGrave,
  };
}

describe("PosnetResolverService.resolveForCharge", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetEnvDeviceUsageForTests();
    env.MP_POS_DEVICE_ID = "env-device";
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("caja con device activo → el device de la caja (source caja), pasando por la guarda grave", async () => {
    const { resolver, assertNotGrave, devicesRepo } = makeResolver({ caja: CAJA, activeDevice: DEVICE });

    const resolved = await resolver.resolveForCharge("bar-uuid-1");

    expect(resolved).toEqual({
      deviceId: "PAX_A910__SMARTPOS1493600985",
      source: "caja",
      cajaId: "caja-1",
    });
    expect(devicesRepo.findActiveByCajaId).toHaveBeenCalledWith("caja-1");
    expect(assertNotGrave).toHaveBeenCalledWith("PAX_A910__SMARTPOS1493600985", "caja-1");
    expect(warnSpy).not.toHaveBeenCalled();
    expect(isUsingEnvDevice()).toBe(false);
  });

  it("caja existente SIN device activo → 409 con el mensaje del criterio A; NUNCA cae a la env", async () => {
    const { resolver } = makeResolver({ caja: CAJA, activeDevice: null });

    await expect(resolver.resolveForCharge("bar-uuid-1")).rejects.toMatchObject({
      name: "Conflict",
      code: POSNET_NOT_LINKED_CODE,
      message: expect.stringContaining("no tiene Posnet vinculado"),
    });
    // La env estaba configurada y aun así no se usó: la configuración explícita manda.
    expect(isUsingEnvDevice()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("el 409 dice CÓMO arreglarlo (vincular desde /admin → Pagos)", async () => {
    const { resolver } = makeResolver({ caja: CAJA, activeDevice: null });

    await expect(resolver.resolveForCharge("bar-uuid-1")).rejects.toMatchObject({
      message: expect.stringContaining("/admin"),
    });
  });

  it("barra sin caja provisionada → env como último recurso, con warn y flag observable", async () => {
    const { resolver, assertNotGrave } = makeResolver({ caja: null });

    const resolved = await resolver.resolveForCharge("bar-uuid-1");

    expect(resolved).toEqual({ deviceId: "env-device", source: "env", cajaId: null });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("bar-uuid-1");
    expect(isUsingEnvDevice()).toBe(true);
    expect(getEnvDeviceUsage().lastReason).toContain("bar-uuid-1");
    // La guarda grave protege el vínculo caja→device; la env no tiene caja que validar.
    expect(assertNotGrave).not.toHaveBeenCalled();
  });

  it("sin barId en el contexto → env como último recurso, con el motivo en el warn", async () => {
    const { resolver, cajasRepo } = makeResolver();

    const resolved = await resolver.resolveForCharge(undefined);

    expect(resolved.source).toBe("env");
    expect(cajasRepo.findByBarId).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("barId");
  });

  it("warn en CADA resolución por env (un log por resolución, no uno por proceso)", async () => {
    const { resolver } = makeResolver();

    await resolver.resolveForCharge(undefined);
    await resolver.resolveForCharge(undefined);

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("sin caja y sin env → el mismo 409", async () => {
    env.MP_POS_DEVICE_ID = "";
    const { resolver } = makeResolver({ caja: null });

    await expect(resolver.resolveForCharge("bar-uuid-1")).rejects.toMatchObject({
      name: "Conflict",
      code: POSNET_NOT_LINKED_CODE,
      message: expect.stringContaining("no tiene Posnet vinculado"),
    });
    expect(isUsingEnvDevice()).toBe(false);
  });

  it("si assertNotGrave lanza (caso grave: la plata iría a otra cuenta), el resolver propaga", async () => {
    const grave = Object.assign(new Error("El Posnet no pertenece a la cuenta del seller activo."), {
      name: "Conflict",
    });
    const { resolver } = makeResolver({
      caja: CAJA,
      activeDevice: DEVICE,
      assertNotGrave: async () => {
        throw grave;
      },
    });

    await expect(resolver.resolveForCharge("bar-uuid-1")).rejects.toBe(grave);
  });
});
