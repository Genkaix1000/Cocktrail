import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SystemService } from "./system.service.js";
import {
  resetMigrationsStatusForTests,
  setMigrationsStatus,
} from "../../infra/migrations/migrations-status.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import type { EventsRepository } from "../events/events.repository.js";
import type { MercadoPagoService } from "../mercadopago/mercadopago.service.js";
import type { ResolvedPosnet } from "../mercadopago/posnet-resolver.service.js";
import type { PrinterService } from "../printer/printer.service.js";
import type { NightEvent } from "@cocktrail/shared";

const NOT_LINKED = new Conflict(
  "Esta caja no tiene Posnet vinculado. Vinculá uno desde /admin → Pagos.",
  "POSNET_NOT_LINKED",
);

/**
 * T18: el bloque posnet resuelve vía PosnetResolver.peek — el default de los
 * tests es "caja sin Posnet" (el estado de un entorno sin provisionar).
 */
function makeResolvePosnet(result: ResolvedPosnet | Error = NOT_LINKED) {
  return vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
}

type QueryResult = { data: any; error: any };

function makeQueryBuilder(result: QueryResult) {
  const builder: any = {};
  const chainable = ["select", "eq", "neq", "limit"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
  return builder;
}

function makeSupabaseClient(results: Record<string, QueryResult>) {
  return {
    from: (table: string) => makeQueryBuilder(results[table] ?? { data: [], error: null }),
  } as any;
}

function makeEventsRepo(overrides?: Partial<EventsRepository>): EventsRepository {
  return {
    getActive: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    listClosed: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeMpService(overrides?: Partial<MercadoPagoService>): MercadoPagoService {
  return {
    checkDeviceConnection: vi.fn().mockResolvedValue({ connected: false, message: "No configurado" }),
    ...overrides,
  } as unknown as MercadoPagoService;
}

function makePrinterService(): PrinterService {
  return {
    getStatus: vi.fn().mockReturnValue({ configured: true, message: "Impresora no encontrada o sin permisos" }),
  } as unknown as PrinterService;
}

const ACTIVE_EVENT: NightEvent = {
  id: "event-1",
  status: "activo",
  startedAt: Date.now(),
  orderCounter: 3,
};

describe("SystemService.checkInternet", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("true si el primer fetch (1.1.1.1) responde ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), makeSupabaseClient({}), makeResolvePosnet());
    expect(await service.checkInternet()).toBe(true);
  });

  it("false si ambos fetch fallan", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("sin red")) as any;
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), makeSupabaseClient({}), makeResolvePosnet());
    expect(await service.checkInternet()).toBe(false);
  });
});

describe("SystemService.getStatus", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("localDb.connected es true si la base responde", async () => {
    const localDb = makeSupabaseClient({ users: { data: [{ id: "u1" }], error: null } });
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), localDb, makeResolvePosnet());

    const status = await service.getStatus();

    expect(status.localDb.connected).toBe(true);
  });

  it("eventDetails viene de eventsRepo.getActive(), null si no hay noche activa", async () => {
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(null) });
    const localDb = makeSupabaseClient({});
    const service = new SystemService(eventsRepo, makeMpService(), makePrinterService(), localDb, makeResolvePosnet());

    const status = await service.getStatus();

    expect(status.eventDetails).toBeNull();
  });

  it("eventDetails refleja la noche activa cuando hay una", async () => {
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(ACTIVE_EVENT) });
    const localDb = makeSupabaseClient({});
    const service = new SystemService(eventsRepo, makeMpService(), makePrinterService(), localDb, makeResolvePosnet());

    const status = await service.getStatus();

    expect(status.eventDetails).toEqual({ id: "event-1", status: "activo", orderCounter: 3 });
  });

  it("posnet: caja sin Posnet vinculado (409 del resolver) → estado 'no configurado' con el mensaje, sin llamar a checkDeviceConnection", async () => {
    const mpService = makeMpService();
    const service = new SystemService(
      makeEventsRepo(), mpService, makePrinterService(), makeSupabaseClient({}),
      makeResolvePosnet(NOT_LINKED),
    );

    const status = await service.getStatus();

    expect(status.posnet.configured).toBe(false);
    expect(status.posnet.connected).toBe(false);
    expect(status.posnet.deviceId).toBeNull();
    expect(status.posnet.message).toContain("no tiene Posnet vinculado");
    expect(mpService.checkDeviceConnection).not.toHaveBeenCalled();
  });

  it("posnet: device resuelto por la caja → chequea ESE device (misma verdad que el cobro, T18)", async () => {
    const mpService = makeMpService({
      checkDeviceConnection: vi.fn().mockResolvedValue({
        connected: true,
        message: "Posnet conectado",
        device: { model: "PAX_A910", serialNumber: "1493600985", operatingMode: "PDV" },
      }),
    } as Partial<MercadoPagoService>);
    const service = new SystemService(
      makeEventsRepo(), mpService, makePrinterService(), makeSupabaseClient({}),
      makeResolvePosnet({ deviceId: "PAX_A910__SMARTPOS1493600985", source: "caja", cajaId: "caja-1" }),
    );

    const status = await service.getStatus();

    expect(mpService.checkDeviceConnection).toHaveBeenCalledWith("PAX_A910__SMARTPOS1493600985");
    expect(status.posnet).toMatchObject({
      configured: true,
      connected: true,
      paired: true,
      deviceId: "PAX_A910__SMARTPOS1493600985",
      message: "Posnet conectado",
    });
  });

  it("posnet: resuelto por la env (último recurso) → el mensaje lo dice (D2: visible, nunca silencioso)", async () => {
    const service = new SystemService(
      makeEventsRepo(), makeMpService(), makePrinterService(), makeSupabaseClient({}),
      makeResolvePosnet({ deviceId: "env-device", source: "env", cajaId: null }),
    );

    const status = await service.getStatus();

    expect(status.posnet.configured).toBe(true);
    expect(status.posnet.deviceId).toBe("env-device");
    expect(status.posnet.message).toContain("MP_POS_DEVICE_ID");
  });

  it("posnet: si checkDeviceConnection falla, connected=false con el motivo (configured sigue true)", async () => {
    const mpService = makeMpService({
      checkDeviceConnection: vi.fn().mockRejectedValue(new Error("MP no respondió")),
    } as Partial<MercadoPagoService>);
    const service = new SystemService(
      makeEventsRepo(), mpService, makePrinterService(), makeSupabaseClient({}),
      makeResolvePosnet({ deviceId: "device-1", source: "caja", cajaId: "caja-1" }),
    );

    const status = await service.getStatus();

    expect(status.posnet.configured).toBe(true);
    expect(status.posnet.connected).toBe(false);
    expect(status.posnet.message).toContain("MP no respondió");
  });

  it("incluye el estado de la impresora tal cual lo devuelve printerService.getStatus()", async () => {
    const printerService = makePrinterService();
    const localDb = makeSupabaseClient({});
    const service = new SystemService(makeEventsRepo(), makeMpService(), printerService, localDb, makeResolvePosnet());

    const status = await service.getStatus();

    expect(status.printer).toEqual({ configured: true, message: "Impresora no encontrada o sin permisos" });
  });
});

describe("SystemService.getHealth", () => {
  beforeEach(() => {
    resetMigrationsStatusForTests();
  });

  afterEach(() => {
    resetMigrationsStatusForTests();
  });

  function makeService() {
    return new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), makeSupabaseClient({}), makeResolvePosnet());
  }

  it("status ok cuando las migraciones están limpias", () => {
    setMigrationsStatus({
      state: "ok",
      lastRunAt: "2026-07-21T00:00:00.000Z",
      appliedNow: ["20260101000000_a.sql"],
      pending: [],
      failed: null,
      drift: [],
    });

    const health = makeService().getHealth();

    expect(health.status).toBe("ok");
    expect(health.migrations.appliedNow).toEqual(["20260101000000_a.sql"]);
    expect(typeof health.serverStartedAt).toBe("number");
  });

  it("status degraded cuando una migración falló", () => {
    setMigrationsStatus({
      state: "degraded",
      lastRunAt: "2026-07-21T00:00:00.000Z",
      appliedNow: [],
      pending: ["20260102000000_b.sql"],
      failed: { version: "20260101000000_a.sql", error: "syntax error" },
      drift: [],
    });

    const health = makeService().getHealth();

    expect(health.status).toBe("degraded");
    expect(health.migrations.failed?.version).toBe("20260101000000_a.sql");
  });

  it("getStatus también expone las migraciones (mismo singleton)", async () => {
    setMigrationsStatus({
      state: "ok",
      lastRunAt: "2026-07-21T00:00:00.000Z",
      appliedNow: [],
      pending: [],
      failed: null,
      drift: [],
    });

    const status = await makeService().getStatus();

    expect(status.migrations.state).toBe("ok");
  });
});
