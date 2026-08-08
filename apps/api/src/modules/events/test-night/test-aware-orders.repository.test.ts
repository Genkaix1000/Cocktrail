import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NightEvent, Order } from "@cocktrail/shared";
import type { OrdersRepository } from "../../orders/orders.repository.js";
import { TestAwareOrdersRepository } from "./test-aware-orders.repository.js";
import { TestNightContext } from "./test-night-context.js";
import { TestNightStore } from "./test-night-store.js";

const TEST_NIGHT: NightEvent = {
  id: "night-test",
  status: "activo",
  startedAt: 1_700_000_000_000,
  orderCounter: 0,
  isTest: true,
};

function makeInner(): OrdersRepository {
  return {
    create: vi.fn().mockImplementation(async (o: Order) => o),
    findById: vi.fn().mockResolvedValue(undefined),
    findByToken: vi.fn().mockResolvedValue(undefined),
    findByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    findByMpOrderId: vi.fn().mockResolvedValue(undefined),
    findActive: vi.fn().mockResolvedValue([]),
    listForEvent: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  } as unknown as OrdersRepository;
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "tok-1",
    displayNumber: 1,
    items: [{ drinkId: 1, name: "Fernet", qty: 1, unitPrice: 1000, subtotal: 1000 }],
    total: 1000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: 1_700_000_001_000,
    idempotencyKey: "idem-1",
    paymentRecordId: "mp-row-1",
    ...overrides,
  };
}

describe("TestAwareOrdersRepository", () => {
  let inner: OrdersRepository;
  let context: TestNightContext;
  let store: TestNightStore;
  let repo: TestAwareOrdersRepository;

  beforeEach(() => {
    inner = makeInner();
    context = new TestNightContext();
    store = new TestNightStore();
    repo = new TestAwareOrdersRepository(inner, context, store);
  });

  function abrirNocheDePrueba(): void {
    store.setEvent(TEST_NIGHT);
    context.set(TEST_NIGHT.id);
  }

  describe("noche real", () => {
    it("delega create/listForEvent/findActive a Supabase", async () => {
      const order = makeOrder();
      await repo.create(order, "night-real");
      await repo.listForEvent("night-real");
      await repo.findActive("night-real");

      expect(inner.create).toHaveBeenCalledWith(order, "night-real");
      expect(inner.listForEvent).toHaveBeenCalledWith("night-real");
      expect(inner.findActive).toHaveBeenCalledWith("night-real");
    });

    it("delega los lookups y el updateStatus a Supabase", async () => {
      await repo.findById("order-1");
      await repo.findByToken("tok-1");
      await repo.findByIdempotencyKey("idem-1");
      await repo.findByMpOrderId("mp-row-1");
      await repo.updateStatus("order-1", "entregado", { deliveredAt: 5 }, "pendiente");

      expect(inner.findById).toHaveBeenCalledWith("order-1");
      expect(inner.findByToken).toHaveBeenCalledWith("tok-1");
      expect(inner.findByIdempotencyKey).toHaveBeenCalledWith("idem-1");
      expect(inner.findByMpOrderId).toHaveBeenCalledWith("mp-row-1");
      expect(inner.updateStatus).toHaveBeenCalledWith("order-1", "entregado", { deliveredAt: 5 }, "pendiente");
    });
  });

  describe("noche de prueba", () => {
    beforeEach(async () => {
      abrirNocheDePrueba();
      await repo.create(makeOrder(), TEST_NIGHT.id);
    });

    it("create guarda en memoria y no toca Supabase", () => {
      expect(inner.create).not.toHaveBeenCalled();
    });

    it("los lookups salen del store sin consultar Supabase", async () => {
      expect((await repo.findById("order-1"))?.total).toBe(1000);
      expect((await repo.findByToken("tok-1"))?.id).toBe("order-1");
      expect((await repo.findByIdempotencyKey("idem-1"))?.id).toBe("order-1");
      expect((await repo.findByMpOrderId("mp-row-1"))?.id).toBe("order-1");

      expect(inner.findById).not.toHaveBeenCalled();
      expect(inner.findByToken).not.toHaveBeenCalled();
      expect(inner.findByIdempotencyKey).not.toHaveBeenCalled();
      expect(inner.findByMpOrderId).not.toHaveBeenCalled();
    });

    it("un lookup que no está en memoria cae a Supabase", async () => {
      await repo.findById("order-de-otra-noche");
      expect(inner.findById).toHaveBeenCalledWith("order-de-otra-noche");
    });

    it("listForEvent devuelve los pedidos en memoria ordenados por createdAt", async () => {
      await repo.create(makeOrder({ id: "order-0", token: "tok-0", createdAt: 1 }), TEST_NIGHT.id);

      const orders = await repo.listForEvent(TEST_NIGHT.id);

      expect(orders.map((o) => o.id)).toEqual(["order-0", "order-1"]);
      expect(inner.listForEvent).not.toHaveBeenCalled();
    });

    it("findActive excluye entregados y cancelados", async () => {
      await repo.create(makeOrder({ id: "order-2", token: "tok-2", status: "entregado" }), TEST_NIGHT.id);
      await repo.create(makeOrder({ id: "order-3", token: "tok-3", status: "cancelado" }), TEST_NIGHT.id);

      expect((await repo.findActive(TEST_NIGHT.id)).map((o) => o.id)).toEqual(["order-1"]);
      expect(inner.findActive).not.toHaveBeenCalled();
    });

    it("listAll SIEMPRE va a Supabase", async () => {
      await repo.listAll();
      expect(inner.listAll).toHaveBeenCalled();
    });

    it("updateStatus aplica los timestamps en memoria", async () => {
      const updated = await repo.updateStatus("order-1", "entregado", { deliveredAt: 99, deliveredBy: "caja" });

      expect(updated?.status).toBe("entregado");
      expect(updated?.deliveredAt).toBe(99);
      expect(updated?.deliveredBy).toBe("caja");
      expect((await repo.findById("order-1"))?.status).toBe("entregado");
      expect(inner.updateStatus).not.toHaveBeenCalled();
    });

    it("updateStatus respeta expectedStatus: no escribe si el estado no matchea", async () => {
      await repo.updateStatus("order-1", "entregado", { deliveredAt: 99 }, "pendiente");

      const perdedor = await repo.updateStatus("order-1", "cancelado", { cancelledAt: 100 }, "pendiente");

      expect(perdedor).toBeUndefined();
      expect((await repo.findById("order-1"))?.status).toBe("entregado");
    });
  });

  describe("contexto pegado", () => {
    it("los pedidos de una noche nueva van a Supabase aunque el contexto siga apuntando a la prueba", async () => {
      abrirNocheDePrueba();

      const order = makeOrder({ id: "order-real", token: "tok-real" });
      await repo.create(order, "night-real-2");
      await repo.listForEvent("night-real-2");
      await repo.findActive("night-real-2");

      expect(inner.create).toHaveBeenCalledWith(order, "night-real-2");
      expect(inner.listForEvent).toHaveBeenCalledWith("night-real-2");
      expect(inner.findActive).toHaveBeenCalledWith("night-real-2");
      expect(store.hasOrder("order-real")).toBe(false);
    });

    it("sin noche en el store no se consulta memoria ni por casualidad", async () => {
      context.set("night-test");

      await repo.findById("order-1");

      expect(inner.findById).toHaveBeenCalledWith("order-1");
    });
  });
});
