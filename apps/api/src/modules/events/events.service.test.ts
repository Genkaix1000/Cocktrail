import { describe, it, expect, vi } from "vitest";
import { EventsService } from "./events.service.js";
import type { EventsRepository } from "./events.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { CashSalesRepository } from "../cash-sales/cash-sales.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { NightEvent } from "@cocktrail/shared";

function makeEventsRepo(overrides?: Partial<EventsRepository>): EventsRepository {
  return {
    getActive: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (e) => e),
    update: vi.fn().mockImplementation(async (_id, partial) => ({ id: "event-1", status: "activo", startedAt: Date.now(), orderCounter: 0, ...partial })),
    findById: vi.fn(),
    listClosed: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    ...overrides,
  } as unknown as EventsRepository;
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

function makeCashSalesRepo(overrides?: Partial<CashSalesRepository>): CashSalesRepository {
  return {
    add: vi.fn(),
    listForEvent: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as CashSalesRepository;
}

function makeDrinksRepo(): DrinksRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    nextId: vi.fn(),
  };
}

function makeService(overrides?: { eventsRepo?: EventsRepository }) {
  const eventsRepo = overrides?.eventsRepo ?? makeEventsRepo();
  const ordersRepo = makeOrdersRepo();
  const cashSalesRepo = makeCashSalesRepo();
  const drinksRepo = makeDrinksRepo();
  return new EventsService(eventsRepo, ordersRepo, cashSalesRepo, drinksRepo);
}

describe("EventsService.initialize", () => {
  it("sin evento activo en DB, arranca sin noche activa (no auto-crea)", async () => {
    const service = makeService();
    await service.initialize();
    expect(await service.getCurrentEvent()).toBeNull();
  });

  it("con un evento activo del mismo día, lo conserva", async () => {
    const today: NightEvent = { id: "e1", status: "activo", startedAt: Date.now(), orderCounter: 0 };
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(today) });
    const service = makeService({ eventsRepo });
    await service.initialize();
    expect(await service.getCurrentEvent()).toEqual(today);
  });

  it("con un evento activo de un día calendario anterior, lo auto-cierra y arranca sin noche activa", async () => {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    const stale: NightEvent = { id: "e-stale", status: "activo", startedAt: yesterday, orderCounter: 0 };
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(stale) });
    const service = makeService({ eventsRepo });
    await service.initialize();
    expect(await service.getCurrentEvent()).toBeNull();
    expect(eventsRepo.update).toHaveBeenCalledWith("e-stale", expect.objectContaining({ status: "cerrado", closedBy: "sistema" }));
  });
});

describe("EventsService.openEvent / setKeyword / closeEvent", () => {
  it("openEvent tira BadRequest si la keyword está vacía", async () => {
    const service = makeService();
    await service.initialize();
    await expect(service.openEvent("   ")).rejects.toThrow(/palabra clave/i);
  });

  it("openEvent tira Conflict si ya hay una noche activa", async () => {
    const active: NightEvent = { id: "e1", status: "activo", startedAt: Date.now(), orderCounter: 0 };
    const eventsRepo = makeEventsRepo({ getActive: vi.fn().mockResolvedValue(active) });
    const service = makeService({ eventsRepo });
    await service.initialize();
    await expect(service.openEvent("clave")).rejects.toThrow(/Ya hay una noche activa/);
  });

  it("openEvent crea la noche con la keyword provista", async () => {
    const service = makeService();
    await service.initialize();
    const event = await service.openEvent("  clave-secreta  ");
    expect(event.keyword).toBe("clave-secreta");
    expect(event.status).toBe("activo");
    expect(await service.getCurrentEvent()).toEqual(event);
  });

  it("setKeyword tira Conflict si no hay noche activa", async () => {
    const service = makeService();
    await service.initialize();
    await expect(service.setKeyword("nueva")).rejects.toThrow(/no hay ninguna noche activa/i);
  });

  it("closeEvent tira Conflict si no hay noche activa", async () => {
    const service = makeService();
    await service.initialize();
    await expect(service.closeEvent("admin1")).rejects.toThrow(/no hay ninguna noche activa/i);
  });

  it("closeEvent cierra la noche activa y deja el servicio sin evento", async () => {
    const service = makeService();
    await service.initialize();
    await service.openEvent("clave");
    const summary = await service.closeEvent("admin1");
    expect(summary.status).toBe("cerrado");
    expect(summary.closedBy).toBe("admin1");
    expect(await service.getCurrentEvent()).toBeNull();
  });
});

describe("EventsService.incrementOrderCounter", () => {
  it("tira Conflict si no hay evento activo", async () => {
    const service = makeService();
    await service.initialize();
    await expect(service.incrementOrderCounter()).rejects.toThrow(/evento activo/);
  });

  it("incrementa el contador secuencialmente", async () => {
    const service = makeService();
    await service.initialize();
    await service.openEvent("clave");
    expect(await service.incrementOrderCounter()).toBe(1);
    expect(await service.incrementOrderCounter()).toBe(2);
  });
});

describe("EventsService.listClosedEvents", () => {
  it("auto-elimina (vía el repositorio) las noches cerradas con total $0 y no las devuelve", async () => {
    const closedZero: NightEvent = { id: "e-zero", status: "cerrado", startedAt: Date.now(), orderCounter: 0 };
    const eventsRepo = makeEventsRepo({ listClosed: vi.fn().mockResolvedValue([closedZero]) });
    const service = makeService({ eventsRepo });
    await service.initialize();

    const result = await service.listClosedEvents();

    expect(result).toHaveLength(0);
    expect(eventsRepo.delete).toHaveBeenCalledWith("e-zero");
  });
});

describe("EventsService.syncActiveTheme", () => {
  it("actualiza el tema en memoria sin llamar al repo ni bloquear", async () => {
    const service = makeService();
    await service.initialize();
    service.syncActiveTheme("bosko");
    expect(await service.getTheme()).toBe("bosko");
  });
});
