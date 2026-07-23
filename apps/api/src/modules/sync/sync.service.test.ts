import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncService } from "./sync.service.js";
import type { UsersRepository } from "../users/users.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { TicketsRepository } from "../tickets/tickets.repository.js";
import type { EventsRepository } from "../events/events.repository.js";
import type { CloudSyncRepository } from "./cloud-sync.repository.js";
import { computeTotals } from "@cocktrail/shared";
import type { NightEvent } from "@cocktrail/shared";

const EMPTY_TOTALS = computeTotals([]);

function makeUsersRepo(overrides?: Partial<UsersRepository>): UsersRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeDrinksRepo(overrides?: Partial<DrinksRepository>): DrinksRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    nextId: vi.fn(),
    ...overrides,
  };
}

function makeOrdersRepo(overrides?: Partial<OrdersRepository>): OrdersRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByToken: vi.fn(),
    findActive: vi.fn(),
    listForEvent: vi.fn().mockResolvedValue([]),
    listAll: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  } as unknown as OrdersRepository;
}

function makeTicketsRepo(overrides?: Partial<TicketsRepository>): TicketsRepository {
  return {
    create: vi.fn(),
    findByCode: vi.fn(),
    findByReadable: vi.fn(),
    findByOrderId: vi.fn(),
    listByOrderIds: vi.fn().mockResolvedValue([]),
    list: vi.fn(),
    updateRedemption: vi.fn(),
    ...overrides,
  };
}

function makeEventsRepo(overrides?: Partial<EventsRepository>): EventsRepository {
  return {
    getActive: vi.fn(),
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

function makeCloudSyncRepo(overrides?: Partial<CloudSyncRepository>): CloudSyncRepository {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    pullUsers: vi.fn().mockResolvedValue({ count: 0 }),
    pullDrinks: vi.fn().mockResolvedValue({ count: 0 }),
    pushNightEvent: vi.fn().mockResolvedValue(undefined),
    pushOrders: vi.fn().mockResolvedValue(undefined),
    pushTickets: vi.fn().mockResolvedValue(undefined),
    pullNightEvents: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    pullOrders: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    pullTickets: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    pushAuditLogs: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    pullAuditLogs: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    ...overrides,
  };
}

function makeService(overrides?: {
  usersRepo?: UsersRepository;
  drinksRepo?: DrinksRepository;
  ordersRepo?: OrdersRepository;
  ticketsRepo?: TicketsRepository;
  eventsRepo?: EventsRepository;
  cloudSyncRepo?: CloudSyncRepository;
}) {
  return new SyncService(
    overrides?.usersRepo ?? makeUsersRepo(),
    overrides?.drinksRepo ?? makeDrinksRepo(),
    overrides?.ordersRepo ?? makeOrdersRepo(),
    overrides?.ticketsRepo ?? makeTicketsRepo(),
    overrides?.eventsRepo ?? makeEventsRepo(),
    overrides?.cloudSyncRepo ?? makeCloudSyncRepo(),
  );
}

const CLOSED_EVENT: NightEvent = {
  id: "event-1",
  status: "cerrado",
  startedAt: Date.now(),
  orderCounter: 1,
};

describe("SyncService.pullMasterData", () => {
  it("sin Supabase Cloud configurada, no hace nada (no tira)", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({ isConfigured: vi.fn().mockReturnValue(false) });
    const service = makeService({ cloudSyncRepo });
    await expect(service.pullMasterData()).resolves.toBeUndefined();
    expect(cloudSyncRepo.pullUsers).not.toHaveBeenCalled();
  });

  it("con datos en la nube, los pull*() ya hicieron el upsert local — no dispara el seed", async () => {
    const usersRepo = makeUsersRepo();
    const drinksRepo = makeDrinksRepo();
    const cloudSyncRepo = makeCloudSyncRepo({
      pullUsers: vi.fn().mockResolvedValue({ count: 3 }),
      pullDrinks: vi.fn().mockResolvedValue({ count: 5 }),
    });
    const service = makeService({ usersRepo, drinksRepo, cloudSyncRepo });

    await service.pullMasterData();

    expect(usersRepo.list).not.toHaveBeenCalled();
    expect(drinksRepo.list).not.toHaveBeenCalled();
  });

  it("si la nube no devuelve nada y local está vacío, dispara el seed por defecto", async () => {
    const usersRepo = makeUsersRepo({ list: vi.fn().mockResolvedValue([]) });
    const drinksRepo = makeDrinksRepo({ list: vi.fn().mockResolvedValue([]) });
    const cloudSyncRepo = makeCloudSyncRepo();
    const service = makeService({ usersRepo, drinksRepo, cloudSyncRepo });

    await expect(service.pullMasterData()).resolves.toBeUndefined();
    expect(usersRepo.list).toHaveBeenCalled();
    expect(drinksRepo.list).toHaveBeenCalled();
  });
});

describe("SyncService.ensureLocalMasterDataSeeded", () => {
  it("no rompe si local ya tiene users y drinks (no siembra nada)", async () => {
    const usersRepo = makeUsersRepo({ list: vi.fn().mockResolvedValue([{ id: "u1" }]) });
    const drinksRepo = makeDrinksRepo({ list: vi.fn().mockResolvedValue([{ id: 1 }]) });
    const service = makeService({ usersRepo, drinksRepo });
    await expect(service.ensureLocalMasterDataSeeded()).resolves.toBeUndefined();
  });

  it("no rompe si local está vacío (dispara el seed por defecto)", async () => {
    const usersRepo = makeUsersRepo({ list: vi.fn().mockResolvedValue([]) });
    const drinksRepo = makeDrinksRepo({ list: vi.fn().mockResolvedValue([]) });
    const service = makeService({ usersRepo, drinksRepo });
    await expect(service.ensureLocalMasterDataSeeded()).resolves.toBeUndefined();
  });
});

describe("SyncService.pushEventData", () => {
  it("sin Supabase Cloud configurada, no hace nada y devuelve false", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({ isConfigured: vi.fn().mockReturnValue(false) });
    const service = makeService({ cloudSyncRepo });
    await expect(service.pushEventData("event-1", CLOSED_EVENT, EMPTY_TOTALS)).resolves.toBe(false);
  });

  it("con cloud configurada y sin error, sube el evento vía el repo de cloud y devuelve true", async () => {
    const eventsRepo = makeEventsRepo();
    const cloudSyncRepo = makeCloudSyncRepo();
    const service = makeService({ eventsRepo, cloudSyncRepo });

    const result = await service.pushEventData("event-1", CLOSED_EVENT, EMPTY_TOTALS);

    expect(result).toBe(true);
    expect(cloudSyncRepo.pushNightEvent).toHaveBeenCalledWith(CLOSED_EVENT, EMPTY_TOTALS);
    expect(eventsRepo.updateSyncStatus).toHaveBeenCalledWith("event-1", "pending");
    expect(eventsRepo.updateSyncStatus).toHaveBeenCalledWith("event-1", "synced", expect.any(Number));
  });

  it("si el push a cloud tira, marca failed localmente y devuelve false", async () => {
    const eventsRepo = makeEventsRepo();
    const cloudSyncRepo = makeCloudSyncRepo({
      pushNightEvent: vi.fn().mockRejectedValue(new Error("cloud caída")),
    });
    const service = makeService({ eventsRepo, cloudSyncRepo });

    const result = await service.pushEventData("event-1", CLOSED_EVENT, EMPTY_TOTALS);

    expect(result).toBe(false);
    expect(eventsRepo.updateSyncStatus).toHaveBeenCalledWith("event-1", "failed");
  });

  it("sube tickets solo si hubo orders para el evento", async () => {
    const ordersRepo = makeOrdersRepo({ listForEvent: vi.fn().mockResolvedValue([{ id: "order-1" }]) });
    const ticketsRepo = makeTicketsRepo({ listByOrderIds: vi.fn().mockResolvedValue([{ id: "ticket-1" }]) });
    const cloudSyncRepo = makeCloudSyncRepo();
    const service = makeService({ ordersRepo, ticketsRepo, cloudSyncRepo });

    await service.pushEventData("event-1", CLOSED_EVENT, EMPTY_TOTALS);

    expect(ticketsRepo.listByOrderIds).toHaveBeenCalledWith(["order-1"]);
    expect(cloudSyncRepo.pushTickets).toHaveBeenCalledWith([{ id: "ticket-1" }]);
  });
});

describe("SyncService.syncAllPendingEvents", () => {
  it("tira si no hay Supabase Cloud configurada", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({ isConfigured: vi.fn().mockReturnValue(false) });
    const service = makeService({ cloudSyncRepo });
    await expect(service.syncAllPendingEvents()).rejects.toThrow(/No cloud DB configured/);
  });

  it("sin eventos pendientes, devuelve counts en 0", async () => {
    const eventsRepo = makeEventsRepo({ getPendingSync: vi.fn().mockResolvedValue([]) });
    const service = makeService({ eventsRepo });
    const result = await service.syncAllPendingEvents();
    expect(result).toEqual({ successCount: 0, failedCount: 0 });
  });

  it("con un evento pendiente que sincroniza bien, cuenta 1 success", async () => {
    const eventsRepo = makeEventsRepo({
      getPendingSync: vi.fn().mockResolvedValue([{ ...CLOSED_EVENT, sync_status: "pending" }]),
    });
    const cloudSyncRepo = makeCloudSyncRepo();
    const service = makeService({ eventsRepo, cloudSyncRepo });

    const result = await service.syncAllPendingEvents();

    expect(result).toEqual({ successCount: 1, failedCount: 0 });
  });

  it("si el push falla para un evento, cuenta 1 failed", async () => {
    const eventsRepo = makeEventsRepo({
      getPendingSync: vi.fn().mockResolvedValue([{ ...CLOSED_EVENT, sync_status: "failed" }]),
    });
    const cloudSyncRepo = makeCloudSyncRepo({
      pushNightEvent: vi.fn().mockRejectedValue(new Error("cloud caída")),
    });
    const service = makeService({ eventsRepo, cloudSyncRepo });

    const result = await service.syncAllPendingEvents();

    expect(result).toEqual({ successCount: 0, failedCount: 1 });
  });
});

describe("SyncService.restoreFromCloud", () => {
  it("sin Supabase Cloud configurada, devuelve error claro en las 4 tablas sin intentar nada", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({ isConfigured: vi.fn().mockReturnValue(false) });
    const service = makeService({ cloudSyncRepo });

    const result = await service.restoreFromCloud();

    expect(result.nightEvents.error).toMatch(/no está configurada/);
    expect(result.orders.error).toMatch(/no está configurada/);
    expect(cloudSyncRepo.pullNightEvents).not.toHaveBeenCalled();
  });

  it("éxito total: llama las 4 tablas en orden (night_events primero) y devuelve sus resultados", async () => {
    const callOrder: string[] = [];
    const cloudSyncRepo = makeCloudSyncRepo({
      pullNightEvents: vi.fn().mockImplementation(async () => { callOrder.push("nightEvents"); return { ok: 3, failed: 0 }; }),
      pullOrders: vi.fn().mockImplementation(async () => { callOrder.push("orders"); return { ok: 10, failed: 0 }; }),
      pullTickets: vi.fn().mockImplementation(async () => { callOrder.push("tickets"); return { ok: 10, failed: 0 }; }),
      pullAuditLogs: vi.fn().mockImplementation(async () => { callOrder.push("auditLogs"); return { ok: 5, failed: 0 }; }),
    });
    const service = makeService({ cloudSyncRepo });

    const result = await service.restoreFromCloud();

    expect(callOrder).toEqual(["nightEvents", "orders", "tickets", "auditLogs"]);
    expect(result).toEqual({
      nightEvents: { ok: 3, failed: 0 },
      orders: { ok: 10, failed: 0 },
      tickets: { ok: 10, failed: 0 },
      auditLogs: { ok: 5, failed: 0 },
    });
  });

  it("falla parcial: si night_events falla, igual intenta las demás tablas (sin abortar)", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({
      pullNightEvents: vi.fn().mockResolvedValue({ ok: 0, failed: 3, error: "cloud caída" }),
      pullOrders: vi.fn().mockResolvedValue({ ok: 5, failed: 0 }),
    });
    const service = makeService({ cloudSyncRepo });

    const result = await service.restoreFromCloud();

    expect(result.nightEvents).toEqual({ ok: 0, failed: 3, error: "cloud caída" });
    expect(result.orders).toEqual({ ok: 5, failed: 0 }); // se intentó igual
    expect(cloudSyncRepo.pullOrders).toHaveBeenCalled();
  });

  it("si un pull tira una excepción inesperada, no tumba el resto (defensa en profundidad)", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({
      pullNightEvents: vi.fn().mockRejectedValue(new Error("bug inesperado")),
      pullOrders: vi.fn().mockResolvedValue({ ok: 5, failed: 0 }),
    });
    const service = makeService({ cloudSyncRepo });

    const result = await service.restoreFromCloud();

    expect(result.nightEvents.error).toMatch(/bug inesperado/);
    expect(result.orders).toEqual({ ok: 5, failed: 0 });
  });
});

describe("SyncService.pushAuditLogsIfConfigured", () => {
  it("sin cloud configurada, no llama al repo", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({ isConfigured: vi.fn().mockReturnValue(false) });
    const service = makeService({ cloudSyncRepo });

    await service.pushAuditLogsIfConfigured();

    expect(cloudSyncRepo.pushAuditLogs).not.toHaveBeenCalled();
  });

  it("nunca lanza, incluso si pushAuditLogs tira", async () => {
    const cloudSyncRepo = makeCloudSyncRepo({
      pushAuditLogs: vi.fn().mockRejectedValue(new Error("cloud caída")),
    });
    const service = makeService({ cloudSyncRepo });

    await expect(service.pushAuditLogsIfConfigured()).resolves.toBeUndefined();
  });
});
