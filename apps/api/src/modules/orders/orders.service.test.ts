import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrdersService } from "./orders.service.js";
import type { OrdersRepository } from "./orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { Drink, NightEvent, Order } from "@cocktrail/shared";

function makeOrdersRepo(overrides?: Partial<OrdersRepository>): OrdersRepository {
  return {
    create: vi.fn().mockImplementation(async (order) => order),
    findById: vi.fn(),
    findByToken: vi.fn(),
    findActive: vi.fn(),
    listForEvent: vi.fn(),
    listAll: vi.fn(),
    updateStatus: vi.fn(),
    ...overrides,
  } as unknown as OrdersRepository;
}

function makeDrinksRepo(overrides?: Partial<DrinksRepository>): DrinksRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    nextId: vi.fn(),
    ...overrides,
  };
}

const ACTIVE_EVENT: NightEvent = {
  id: "event-1",
  status: "activo",
  startedAt: Date.now(),
  orderCounter: 0,
};

const DRINK: Drink = {
  id: 1,
  name: "Fernet",
  price: 2000,
  description: "",
  vibe: "",
  flavors: [],
  iconName: "glass-water",
  trending: false,
  available: true,
};

function makeOrder(overrides?: Partial<Order>): Order {
  return {
    id: "order-1",
    token: "tok",
    displayNumber: 1,
    items: [],
    total: 2000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("OrdersService.createOrder", () => {
  it("tira Conflict si no hay evento activo", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo();
    const service = new OrdersService(ordersRepo, drinksRepo, async () => null, async () => 1, vi.fn());
    await expect(service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" })).rejects.toThrow(/no se abrió la noche/);
  });

  it("tira BadRequest si no hay items", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo();
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn());
    await expect(service.createOrder({ items: [], paymentMethod: "efectivo" })).rejects.toThrow(/items/);
  });

  it("tira NotFound si el drink no existe", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo({ findById: vi.fn().mockResolvedValue(undefined) });
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn());
    await expect(
      service.createOrder({ items: [{ drinkId: 99, qty: 1 }], paymentMethod: "efectivo" }),
    ).rejects.toThrow(/no existe/);
  });

  it("tira Conflict si el drink no está disponible", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo({ findById: vi.fn().mockResolvedValue({ ...DRINK, available: false }) });
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn());
    await expect(
      service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }),
    ).rejects.toThrow(/no está disponible/);
  });

  it("crea el pedido, calcula el total y usa createdBy='Cliente' por default", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo({ findById: vi.fn().mockResolvedValue(DRINK) });
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 3, vi.fn());

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 2 }], paymentMethod: "efectivo" });

    expect(result.total).toBe(4000);
    expect(result.displayNumber).toBe(3);
    expect(result.createdBy).toBe("Cliente");
    expect(result.printed).toBe(false);
  });

  it("no intenta imprimir para pedidos de 'Cliente' aunque haya callback de impresión", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo({ findById: vi.fn().mockResolvedValue(DRINK) });
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn(), undefined, undefined, printTicket);

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" });

    expect(printTicket).not.toHaveBeenCalled();
    expect(result.printed).toBe(false);
  });

  it("intenta imprimir para pedidos de staff y marca printed=true si tiene éxito", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo({ findById: vi.fn().mockResolvedValue(DRINK) });
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn(), undefined, undefined, printTicket);

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }, "cajera1");

    expect(printTicket).toHaveBeenCalledTimes(1);
    expect(result.printed).toBe(true);
  });

  it("si la impresión falla (throw), marca printed=false pero no rompe la venta", async () => {
    const ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo({ findById: vi.fn().mockResolvedValue(DRINK) });
    const printTicket = vi.fn().mockRejectedValue(new Error("sin papel"));
    const service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn(), undefined, undefined, printTicket);

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }, "cajera1");

    expect(result.printed).toBe(false);
    expect(result.id).toBeTruthy();
  });
});

describe("OrdersService.updateOrderStatus (máquina de estados)", () => {
  let ordersRepo: OrdersRepository;
  let service: OrdersService;

  beforeEach(() => {
    ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo();
    service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn());
  });

  it("tira NotFound si el pedido no existe", async () => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(undefined);
    await expect(service.updateOrderStatus("no-existe", "entregado")).rejects.toThrow(/no existe/);
  });

  it.each([
    ["pendiente", "entregado"],
    ["pendiente", "cancelado"],
  ] as const)("permite la transición %s -> %s", async (from, to) => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(makeOrder({ status: from }));
    vi.mocked(ordersRepo.updateStatus).mockResolvedValue(makeOrder({ status: to }));
    const result = await service.updateOrderStatus("order-1", to);
    expect(result.status).toBe(to);
  });

  it.each([
    ["entregado", "pendiente"],
    ["cancelado", "entregado"],
    ["entregado", "cancelado"],
  ] as const)("rechaza la transición inválida %s -> %s", async (from, to) => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(makeOrder({ status: from }));
    await expect(service.updateOrderStatus("order-1", to)).rejects.toThrow(/Transición inválida/);
  });

  it("al pasar a 'entregado' registra deliveredBy y deliveredByBar/redeemMethod", async () => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(makeOrder({ status: "pendiente" }));
    vi.mocked(ordersRepo.updateStatus).mockResolvedValue(makeOrder({ status: "entregado" }));

    await service.updateOrderStatus("order-1", "entregado", "barman1", { deliveredByBar: "BARRA-01", redeemMethod: "manual" });

    expect(ordersRepo.updateStatus).toHaveBeenCalledWith(
      "order-1",
      "entregado",
      expect.objectContaining({ deliveredBy: "barman1", deliveredByBar: "BARRA-01", redeemMethod: "manual" }),
      "pendiente",
    );
  });

  it("al cancelar registra cancelledBy con 'desconocido' si no se pasa operator", async () => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(makeOrder({ status: "pendiente" }));
    vi.mocked(ordersRepo.updateStatus).mockResolvedValue(makeOrder({ status: "cancelado" }));

    await service.updateOrderStatus("order-1", "cancelado");

    expect(ordersRepo.updateStatus).toHaveBeenCalledWith(
      "order-1",
      "cancelado",
      expect.objectContaining({ cancelledBy: "desconocido" }),
      "pendiente",
    );
  });

  it("si el UPDATE condicional no matchea (la orden cambió de estado en el medio), tira Conflict con el estado real", async () => {
    vi.mocked(ordersRepo.findById)
      .mockResolvedValueOnce(makeOrder({ status: "pendiente" })) // lectura inicial
      .mockResolvedValueOnce(makeOrder({ status: "cancelado" })); // re-lectura tras perder la carrera
    vi.mocked(ordersRepo.updateStatus).mockResolvedValue(undefined);

    await expect(service.updateOrderStatus("order-1", "entregado", "barman1")).rejects.toThrow(
      /cancelado.*entregado/,
    );
  });
});

describe("OrdersService.markDelivered", () => {
  let ordersRepo: OrdersRepository;
  let service: OrdersService;

  beforeEach(() => {
    ordersRepo = makeOrdersRepo();
    const drinksRepo = makeDrinksRepo();
    service = new OrdersService(ordersRepo, drinksRepo, async () => ACTIVE_EVENT, async () => 1, vi.fn());
  });

  it("tira NotFound si el pedido no existe", async () => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(undefined);
    await expect(service.markDelivered("no-existe", "barman1")).rejects.toThrow(/no existe/);
  });

  it("tira Conflict con el mensaje específico si el pedido no está 'pendiente'", async () => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(makeOrder({ status: "cancelado" }));
    await expect(service.markDelivered("order-1", "barman1")).rejects.toThrow(
      /El pedido está en un estado \(cancelado\) que no se puede entregar\./,
    );
  });

  it("con pedido 'pendiente', delega en updateOrderStatus('entregado') con la metadata recibida", async () => {
    vi.mocked(ordersRepo.findById).mockResolvedValue(makeOrder({ status: "pendiente" }));
    vi.mocked(ordersRepo.updateStatus).mockResolvedValue(makeOrder({ status: "entregado" }));

    const result = await service.markDelivered("order-1", "barman1", { deliveredByBar: "BARRA-01", redeemMethod: "scan" });

    expect(result.status).toBe("entregado");
    expect(ordersRepo.updateStatus).toHaveBeenCalledWith(
      "order-1",
      "entregado",
      expect.objectContaining({ deliveredBy: "barman1", deliveredByBar: "BARRA-01", redeemMethod: "scan" }),
      "pendiente",
    );
  });
});
