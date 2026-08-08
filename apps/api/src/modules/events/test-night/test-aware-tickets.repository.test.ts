import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NightEvent, Order } from "@cocktrail/shared";
import type { Ticket, TicketsRepository } from "../../tickets/tickets.repository.js";
import { TestAwareTicketsRepository } from "./test-aware-tickets.repository.js";
import { TestNightContext } from "./test-night-context.js";
import { TestNightStore } from "./test-night-store.js";

const TEST_NIGHT: NightEvent = {
  id: "night-test",
  status: "activo",
  startedAt: 1_700_000_000_000,
  orderCounter: 0,
  isTest: true,
};

function makeOrder(id: string): Order {
  return {
    id,
    token: `tok-${id}`,
    displayNumber: 1,
    items: [],
    total: 1000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: 1_700_000_001_000,
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "ticket-1",
    orderId: "order-test",
    code: "ABC123-firma",
    createdAt: 1_700_000_002_000,
    ...overrides,
  };
}

function makeInner(): TicketsRepository {
  return {
    create: vi.fn().mockImplementation(async (t: Ticket) => t),
    findByCode: vi.fn().mockResolvedValue(undefined),
    findByReadable: vi.fn().mockResolvedValue(undefined),
    findByOrderId: vi.fn().mockResolvedValue(undefined),
    listByOrderIds: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    updateRedemption: vi.fn().mockResolvedValue(undefined),
  } as unknown as TicketsRepository;
}

describe("TestAwareTicketsRepository", () => {
  let inner: TicketsRepository;
  let context: TestNightContext;
  let store: TestNightStore;
  let repo: TestAwareTicketsRepository;

  beforeEach(() => {
    inner = makeInner();
    context = new TestNightContext();
    store = new TestNightStore();
    repo = new TestAwareTicketsRepository(inner, context, store);
  });

  function abrirNocheDePrueba(): void {
    store.setEvent(TEST_NIGHT);
    context.set(TEST_NIGHT.id);
    store.addOrder(makeOrder("order-test"));
  }

  describe("noche real", () => {
    it("delega todo a Supabase", async () => {
      const ticket = makeTicket({ orderId: "order-real" });
      await repo.create(ticket);
      await repo.findByCode("ABC123-firma");
      await repo.findByReadable("abc123");
      await repo.findByOrderId("order-real");
      await repo.listByOrderIds(["order-real"]);
      await repo.list();
      await repo.updateRedemption("ABC123-firma", "caja", { method: "manual" });

      expect(inner.create).toHaveBeenCalledWith(ticket);
      expect(inner.findByCode).toHaveBeenCalledWith("ABC123-firma");
      expect(inner.findByReadable).toHaveBeenCalledWith("abc123");
      expect(inner.findByOrderId).toHaveBeenCalledWith("order-real");
      expect(inner.listByOrderIds).toHaveBeenCalledWith(["order-real"]);
      expect(inner.list).toHaveBeenCalled();
      expect(inner.updateRedemption).toHaveBeenCalledWith("ABC123-firma", "caja", { method: "manual" });
    });
  });

  describe("noche de prueba", () => {
    beforeEach(async () => {
      abrirNocheDePrueba();
      await repo.create(makeTicket());
    });

    it("el ticket de una orden en memoria no toca Supabase", () => {
      expect(inner.create).not.toHaveBeenCalled();
    });

    it("lo encuentra por code, por prefijo legible y por orderId", async () => {
      expect((await repo.findByCode("ABC123-firma"))?.id).toBe("ticket-1");
      expect((await repo.findByReadable("abc123"))?.id).toBe("ticket-1");
      expect((await repo.findByOrderId("order-test"))?.id).toBe("ticket-1");

      expect(inner.findByCode).not.toHaveBeenCalled();
      expect(inner.findByReadable).not.toHaveBeenCalled();
      expect(inner.findByOrderId).not.toHaveBeenCalled();
    });

    it("el ticket de una orden que no está en memoria se persiste en Supabase", async () => {
      const deOtraNoche = makeTicket({ id: "ticket-2", orderId: "order-real", code: "ZZZ999-firma" });
      await repo.create(deOtraNoche);

      expect(inner.create).toHaveBeenCalledWith(deOtraNoche);
    });

    it("listByOrderIds combina memoria y base, pidiendo a Supabase solo lo que falta", async () => {
      const tickets = await repo.listByOrderIds(["order-test", "order-real"]);

      expect(inner.listByOrderIds).toHaveBeenCalledWith(["order-real"]);
      expect(tickets.map((t) => t.id)).toEqual(["ticket-1"]);
    });

    it("list() SIEMPRE va a Supabase", async () => {
      await repo.list();
      expect(inner.list).toHaveBeenCalled();
    });

    it("updateRedemption canjea en memoria y no vuelve a canjear un ticket ya usado", async () => {
      const canjeado = await repo.updateRedemption("ABC123-firma", "barman", { method: "scan", barCode: "BARRA-01" });

      expect(canjeado?.redeemedBy).toBe("barman");
      expect(canjeado?.redeemMethod).toBe("scan");
      expect(canjeado?.redeemedByBar).toBe("BARRA-01");
      expect(await repo.updateRedemption("ABC123-firma", "otro")).toBeUndefined();
      expect(inner.updateRedemption).not.toHaveBeenCalled();
    });
  });

  describe("contexto pegado", () => {
    it("los tickets de una noche nueva van a Supabase aunque el contexto siga apuntando a la prueba", async () => {
      abrirNocheDePrueba();
      // La noche nueva es real: su orden nunca entró al store.
      const ticket = makeTicket({ id: "ticket-real", orderId: "order-de-la-noche-real" });

      await repo.create(ticket);
      await repo.findByOrderId("order-de-la-noche-real");

      expect(inner.create).toHaveBeenCalledWith(ticket);
      expect(inner.findByOrderId).toHaveBeenCalledWith("order-de-la-noche-real");
    });
  });
});
