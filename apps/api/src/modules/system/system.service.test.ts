import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SystemService } from "./system.service.js";
import { env } from "../../config/env.js";
import type { EventsRepository } from "../events/events.repository.js";
import type { MercadoPagoService } from "../mercadopago/mercadopago.service.js";
import type { PrinterService } from "../printer/printer.service.js";
import type { NightEvent } from "@cocktrail/shared";

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
    updateSyncStatus: vi.fn(),
    getPendingSync: vi.fn().mockResolvedValue([]),
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
    getStatus: vi.fn().mockReturnValue({ connected: false, configured: true, message: "Impresora no encontrada o sin permisos" }),
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
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), makeSupabaseClient({}), null);
    expect(await service.checkInternet()).toBe(true);
  });

  it("false si ambos fetch fallan", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("sin red")) as any;
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), makeSupabaseClient({}), null);
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

  it("cloudDb.configured es false si no hay cloudDb inyectada", async () => {
    const localDb = makeSupabaseClient({ users: { data: [{ id: "u1" }], error: null } });
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), localDb, null);

    const status = await service.getStatus();

    expect(status.cloudDb).toEqual({ connected: false, configured: false });
    expect(status.localDb.connected).toBe(true);
  });

  it("sync.pendingEvents cuenta cualquier night_event con sync_status != synced (sin filtrar por status)", async () => {
    const localDb = makeSupabaseClient({
      users: { data: [{ id: "u1" }], error: null },
      night_events: { data: [{ id: "e1" }, { id: "e2" }], error: null },
    });
    const service = new SystemService(makeEventsRepo(), makeMpService(), makePrinterService(), localDb, null);

    const status = await service.getStatus();

    expect(status.sync).toEqual({ synced: false, pendingEvents: 2 });
  });

  it("eventDetails viene de eventsRepo.getActive(), null si no hay noche activa", async () => {
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(null) });
    const localDb = makeSupabaseClient({});
    const service = new SystemService(eventsRepo, makeMpService(), makePrinterService(), localDb, null);

    const status = await service.getStatus();

    expect(status.eventDetails).toBeNull();
  });

  it("eventDetails refleja la noche activa cuando hay una", async () => {
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(ACTIVE_EVENT) });
    const localDb = makeSupabaseClient({});
    const service = new SystemService(eventsRepo, makeMpService(), makePrinterService(), localDb, null);

    const status = await service.getStatus();

    expect(status.eventDetails).toEqual({ id: "event-1", status: "activo", orderCounter: 3 });
  });

  it("posnet no configurado (sin MP_ACCESS_TOKEN/MP_POS_DEVICE_ID) no llama a checkDeviceConnection", async () => {
    // env es un objeto compartido entre archivos de test en el mismo worker — se fuerza
    // el valor acá (no alcanza con lo que traiga .env.test) para que este test sea
    // determinístico sin importar qué otro archivo corrió antes y lo dejó mutado.
    const prevToken = env.MP_ACCESS_TOKEN;
    const prevDevice = env.MP_POS_DEVICE_ID;
    env.MP_ACCESS_TOKEN = "";
    env.MP_POS_DEVICE_ID = "";
    try {
      const mpService = makeMpService();
      const localDb = makeSupabaseClient({});
      const service = new SystemService(makeEventsRepo(), mpService, makePrinterService(), localDb, null);

      const status = await service.getStatus();

      expect(status.posnet.configured).toBe(false);
      expect(mpService.checkDeviceConnection).not.toHaveBeenCalled();
    } finally {
      env.MP_ACCESS_TOKEN = prevToken;
      env.MP_POS_DEVICE_ID = prevDevice;
    }
  });

  it("incluye el estado de la impresora tal cual lo devuelve printerService.getStatus()", async () => {
    const printerService = makePrinterService();
    const localDb = makeSupabaseClient({});
    const service = new SystemService(makeEventsRepo(), makeMpService(), printerService, localDb, null);

    const status = await service.getStatus();

    expect(status.printer).toEqual({ connected: false, configured: true, message: "Impresora no encontrada o sin permisos" });
  });
});
