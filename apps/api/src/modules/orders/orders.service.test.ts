import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrdersService, type OrdersServiceDeps } from "./orders.service.js";
import type { OrdersRepository } from "./orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { PaymentVerdict } from "./payment-verification.port.js";
import type { Drink, NightEvent, Order } from "@cocktrail/shared";

function makeOrdersRepo(overrides?: Partial<OrdersRepository>): OrdersRepository {
  return {
    create: vi.fn().mockImplementation(async (order) => order),
    findById: vi.fn(),
    findByToken: vi.fn(),
    findByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    findByMpOrderId: vi.fn().mockResolvedValue(undefined),
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

function makeService(overrides: Partial<OrdersServiceDeps> = {}): OrdersService {
  return new OrdersService({
    ordersRepo: makeOrdersRepo(),
    drinksRepo: makeDrinksRepo({ findById: vi.fn().mockResolvedValue(DRINK) }),
    getActiveEvent: async () => ACTIVE_EVENT,
    incrementOrderCounter: async () => 1,
    emit: vi.fn(),
    ...overrides,
  });
}

const PROOF = { provider: "mercadopago", kind: "point_intent", id: "intent-1" } as const;
const CONFIRMADO: PaymentVerdict = {
  result: "confirmado",
  providerPaymentId: "pay-99",
  amount: 2000,
  proofRecordId: "mp-row-uuid",
};

describe("OrdersService.createOrder", () => {
  it("tira Conflict si no hay evento activo", async () => {
    const service = makeService({ getActiveEvent: async () => null, drinksRepo: makeDrinksRepo() });
    await expect(service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" })).rejects.toThrow(/no se abrió la noche/);
  });

  it("tira BadRequest si no hay items", async () => {
    const service = makeService({ drinksRepo: makeDrinksRepo() });
    await expect(service.createOrder({ items: [], paymentMethod: "efectivo" })).rejects.toThrow(/items/);
  });

  it("tira NotFound si el drink no existe", async () => {
    const service = makeService({ drinksRepo: makeDrinksRepo({ findById: vi.fn().mockResolvedValue(undefined) }) });
    await expect(
      service.createOrder({ items: [{ drinkId: 99, qty: 1 }], paymentMethod: "efectivo" }),
    ).rejects.toThrow(/no existe/);
  });

  it("tira Conflict si el drink no está disponible", async () => {
    const service = makeService({
      drinksRepo: makeDrinksRepo({ findById: vi.fn().mockResolvedValue({ ...DRINK, available: false }) }),
    });
    await expect(
      service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }),
    ).rejects.toThrow(/no está disponible/);
  });

  it("crea el pedido, calcula el total y usa createdBy='Cliente' por default", async () => {
    const service = makeService({ incrementOrderCounter: async () => 3 });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 2 }], paymentMethod: "efectivo" });

    expect(result.total).toBe(4000);
    expect(result.displayNumber).toBe(3);
    expect(result.createdBy).toBe("Cliente");
    expect(result.printed).toBe(false);
  });

  it("no intenta imprimir para pedidos de 'Cliente' aunque haya callback de impresión", async () => {
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ printTicket });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" });

    expect(printTicket).not.toHaveBeenCalled();
    expect(result.printed).toBe(false);
  });

  it("intenta imprimir para pedidos de staff y marca printed=true si tiene éxito", async () => {
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ printTicket });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }, "cajera1");

    expect(printTicket).toHaveBeenCalledTimes(1);
    expect(result.printed).toBe(true);
  });

  it("si la impresión falla (throw), marca printed=false pero no rompe la venta", async () => {
    const printTicket = vi.fn().mockRejectedValue(new Error("sin papel"));
    const service = makeService({ printTicket });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }, "cajera1");

    expect(result.printed).toBe(false);
    expect(result.id).toBeTruthy();
  });
});

describe("OrdersService.createOrder — verificación de pago (cobro-verificado)", () => {
  it("staff + débito sin proof → 422 sin tocar la verificación ni crear Order", async () => {
    const ordersRepo = makeOrdersRepo();
    const verifyPayment = vi.fn();
    const service = makeService({ ordersRepo, verifyPayment });

    await expect(
      service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito" }, "cajera1"),
    ).rejects.toMatchObject({ name: "UnprocessableEntity", code: "PAYMENT_PROOF_REQUIRED" });
    expect(verifyPayment).not.toHaveBeenCalled();
    expect(ordersRepo.create).not.toHaveBeenCalled();
  });

  it("proof rechazada → Conflict PAYMENT_REJECTED, sin Order, sin ticket, sin order.created", async () => {
    const ordersRepo = makeOrdersRepo();
    const emit = vi.fn();
    const printTicket = vi.fn();
    const verifyPayment = vi.fn().mockResolvedValue({
      result: "rechazado",
      reason: "Pago rechazado por Mercado Pago.",
      detail: "cc_rejected_insufficient_amount",
    } satisfies PaymentVerdict);
    const service = makeService({ ordersRepo, emit, printTicket, verifyPayment });

    await expect(
      service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito", payment: PROOF }, "cajera1"),
    ).rejects.toMatchObject({
      name: "Conflict",
      code: "PAYMENT_REJECTED",
      message: expect.stringContaining("cc_rejected_insufficient_amount"),
    });
    expect(ordersRepo.create).not.toHaveBeenCalled();
    expect(printTicket).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("proof indeterminada → Conflict PAYMENT_UNVERIFIED sin Order", async () => {
    const ordersRepo = makeOrdersRepo();
    const verifyPayment = vi.fn().mockResolvedValue({
      result: "indeterminado",
      reason: "Mercado Pago no respondió.",
    } satisfies PaymentVerdict);
    const service = makeService({ ordersRepo, verifyPayment });

    await expect(
      service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito", payment: PROOF }, "cajera1"),
    ).rejects.toMatchObject({ name: "Conflict", code: "PAYMENT_UNVERIFIED" });
    expect(ordersRepo.create).not.toHaveBeenCalled();
  });

  it("proof confirmada → Order 'cobrado' ligada al cobro, ticket impreso y order.created", async () => {
    const ordersRepo = makeOrdersRepo();
    const emit = vi.fn();
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const verifyPayment = vi.fn().mockResolvedValue(CONFIRMADO);
    const service = makeService({ ordersRepo, emit, printTicket, verifyPayment });

    const result = await service.createOrder(
      { items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito", payment: PROOF, idempotencyKey: "attempt-1111-2222-3333" },
      "cajera1",
    );

    expect(verifyPayment).toHaveBeenCalledWith({ proof: PROOF, expectedAmount: 2000, method: "debito" });
    expect(result.paymentStatus).toBe("cobrado");
    expect(result.paymentRef).toBe("pay-99");
    expect(result.paymentRecordId).toBe("mp-row-uuid");
    expect(result.idempotencyKey).toBe("attempt-1111-2222-3333");
    expect(result.printed).toBe(true);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "order.created" }));
  });

  it("el efectivo pasa por el mismo camino: no_aplica → imprime y queda 'cobrado'", async () => {
    const printTicket = vi.fn().mockResolvedValue(undefined);
    const verifyPayment = vi.fn().mockResolvedValue({ result: "no_aplica" } satisfies PaymentVerdict);
    const service = makeService({ printTicket, verifyPayment });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }, "cajera1");

    expect(verifyPayment).toHaveBeenCalledWith({ expectedAmount: 2000, method: "efectivo" });
    expect(result.paymentStatus).toBe("cobrado");
    expect(result.printed).toBe(true);
  });

  it("Cliente (/carta) con método qr sigue andando sin proof y sin paymentStatus", async () => {
    const verifyPayment = vi.fn();
    const service = makeService({ verifyPayment });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "qr" });

    expect(verifyPayment).not.toHaveBeenCalled();
    expect(result.paymentStatus).toBeUndefined();
    expect(result.createdBy).toBe("Cliente");
  });

  it("replay por idempotencyKey: devuelve la Order existente sin crear otra", async () => {
    const existing = makeOrder({ id: "order-previo", idempotencyKey: "attempt-1111-2222-3333" });
    const ordersRepo = makeOrdersRepo({
      findByIdempotencyKey: vi.fn().mockResolvedValue(existing),
    });
    const verifyPayment = vi.fn();
    const service = makeService({ ordersRepo, verifyPayment });

    const result = await service.createOrder(
      { items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito", payment: PROOF, idempotencyKey: "attempt-1111-2222-3333" },
      "cajera1",
    );

    expect(result.id).toBe("order-previo");
    expect(result.printed).toBe(false);
    expect(ordersRepo.create).not.toHaveBeenCalled();
    expect(verifyPayment).not.toHaveBeenCalled();
  });

  it("carrera 23505 con cobro confirmado: devuelve la Order que ya usó ese cobro", async () => {
    const winner = makeOrder({ id: "order-ganadora", paymentRecordId: "mp-row-uuid" });
    const ordersRepo = makeOrdersRepo({
      create: vi.fn().mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" })),
      findByMpOrderId: vi.fn().mockResolvedValue(winner),
    });
    const verifyPayment = vi.fn().mockResolvedValue(CONFIRMADO);
    const service = makeService({ ordersRepo, verifyPayment });

    const result = await service.createOrder(
      { items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito", payment: PROOF },
      "cajera1",
    );

    expect(result.id).toBe("order-ganadora");
    expect(ordersRepo.findByMpOrderId).toHaveBeenCalledWith("mp-row-uuid");
  });

  it("guarda del runner: migraciones del cobro sin aplicar → bloquea débito con mensaje claro", async () => {
    const ordersRepo = makeOrdersRepo();
    const verifyPayment = vi.fn();
    const service = makeService({ ordersRepo, verifyPayment, isPaymentSchemaReady: () => false });

    await expect(
      service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "debito", payment: PROOF }, "cajera1"),
    ).rejects.toMatchObject({ name: "Conflict", code: "PAYMENT_SCHEMA_NOT_READY" });
    expect(ordersRepo.create).not.toHaveBeenCalled();
  });

  it("guarda del runner: el efectivo sigue funcionando (sin payment_status para no romper el INSERT)", async () => {
    const ordersRepo = makeOrdersRepo();
    const service = makeService({ ordersRepo, isPaymentSchemaReady: () => false });

    const result = await service.createOrder({ items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" }, "cajera1");

    expect(result.paymentStatus).toBeUndefined();
    expect(ordersRepo.create).toHaveBeenCalled();
  });
});

describe("OrdersService.updateOrderStatus (máquina de estados)", () => {
  let ordersRepo: OrdersRepository;
  let service: OrdersService;

  beforeEach(() => {
    ordersRepo = makeOrdersRepo();
    service = makeService({ ordersRepo, drinksRepo: makeDrinksRepo() });
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
    service = makeService({ ordersRepo, drinksRepo: makeDrinksRepo() });
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
