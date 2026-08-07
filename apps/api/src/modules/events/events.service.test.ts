import { describe, it, expect, vi } from "vitest";
import { EventsService } from "./events.service.js";
import type { EventsRepository } from "./events.repository.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { NightEvent, Order } from "@cocktrail/shared";

function makeEventsRepo(overrides?: Partial<EventsRepository>): EventsRepository {
  return {
    getActive: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (e) => e),
    update: vi.fn().mockImplementation(async (id, partial) => ({ id, status: "activo", startedAt: Date.now(), orderCounter: 0, ...partial })),
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

function makeService(overrides?: {
  eventsRepo?: EventsRepository;
  ordersRepo?: OrdersRepository;
}) {
  const eventsRepo = overrides?.eventsRepo ?? makeEventsRepo();
  const ordersRepo = overrides?.ordersRepo ?? makeOrdersRepo();
  const drinksRepo = makeDrinksRepo();
  return new EventsService(eventsRepo, ordersRepo, drinksRepo, vi.fn());
}

/** Pedido cobrado en efectivo por $1000, para simular una noche con ventas. */
function makePaidOrder(): Order {
  return {
    id: "order-1",
    token: "tok-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet", qty: 1, unitPrice: 1000, subtotal: 1000 }],
    total: 1000,
    paymentMethod: "efectivo",
    status: "entregado",
    createdAt: Date.now(),
  };
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

  it("closeEvent con total $0 elimina la noche", async () => {
    const eventsRepo = makeEventsRepo();
    // Sin pedidos → totals.total === 0 → la noche se elimina en vez de archivarse
    const service = makeService({ eventsRepo });
    await service.initialize();
    const event = await service.openEvent("clave");

    const summary = await service.closeEvent("admin1");

    // El summary se devuelve igual que siempre, para que la UI no cambie
    expect(summary.status).toBe("cerrado");
    expect(summary.totals.total).toBe(0);
    expect(eventsRepo.delete).toHaveBeenCalledWith(event.id);
    expect(await service.getCurrentEvent()).toBeNull();
  });

  it("closeEvent con total > 0 no borra la noche", async () => {
    const eventsRepo = makeEventsRepo();
    const ordersRepo = makeOrdersRepo({
      listForEvent: vi.fn().mockResolvedValue([makePaidOrder()]),
    });
    const service = makeService({ eventsRepo, ordersRepo });
    await service.initialize();
    await service.openEvent("clave");

    const summary = await service.closeEvent("admin1");

    expect(summary.totals.total).toBe(1000);
    expect(eventsRepo.delete).not.toHaveBeenCalled();
    expect(await service.getCurrentEvent()).toBeNull();
  });
});

describe("EventsService.incrementOrderCounter", () => {
  it("tira Conflict si no hay evento activo", async () => {
    const service = makeService();
    await service.initialize();
    await expect(service.incrementOrderCounter()).rejects.toThrow(/no se abrió la noche/);
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
  // Antes este test verificaba que listClosedEvents BORRABA las noches en $0.
  // Ese borrado era un efecto colateral destructivo en un camino de lectura y
  // peleaba con el restore desde Cloud (las noches vacías volvían a bajar en
  // cada restore y se borraban de nuevo, en loop). Ahora el filtrado es solo
  // de presentación: no se devuelven, pero no se tocan en la base.
  it("filtra las noches en $0 pero NO las borra de la base", async () => {
    const closedZero: NightEvent = { id: "e-zero", status: "cerrado", startedAt: Date.now(), orderCounter: 0 };
    const eventsRepo = makeEventsRepo({ listClosed: vi.fn().mockResolvedValue([closedZero]) });
    const service = makeService({ eventsRepo });
    await service.initialize();

    const result = await service.listClosedEvents();

    expect(result).toHaveLength(0);
    expect(eventsRepo.delete).not.toHaveBeenCalled();
  });

  it("devuelve las noches cerradas con ventas", async () => {
    const closedWithSales: NightEvent = { id: "e-ok", status: "cerrado", startedAt: Date.now(), orderCounter: 1 };
    const eventsRepo = makeEventsRepo({ listClosed: vi.fn().mockResolvedValue([closedWithSales]) });
    const ordersRepo = makeOrdersRepo({
      listForEvent: vi.fn().mockResolvedValue([makePaidOrder()]),
    });
    const service = makeService({ eventsRepo, ordersRepo });
    await service.initialize();

    const result = await service.listClosedEvents();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e-ok");
    expect(result[0].totals.total).toBe(1000);
    expect(eventsRepo.delete).not.toHaveBeenCalled();
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
