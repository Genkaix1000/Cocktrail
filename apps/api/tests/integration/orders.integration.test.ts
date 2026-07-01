import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { cleanNightEvents, cleanDrinks, cleanAuditLogs, signTestSession, createTestDrink } from "../setup/db-helpers.js";

// Ver nota en tickets.integration.test.ts: EventsService cachea la noche activa en
// memoria, así que se abre una única vez vía la API real para todo este archivo.
const adminCookie = signTestSession("admin-test", "admin");

async function createOrder(body: unknown, cookie?: string) {
  const req = request(app).post("/api/orders");
  if (cookie) req.set("Cookie", cookie);
  return req.send(body as object);
}

describe("orders (integración)", () => {
  beforeAll(async () => {
    const res = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "test-keyword" });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    await cleanNightEvents();
  });

  afterEach(async () => {
    await cleanDrinks();
    await cleanAuditLogs();
  });

  describe("POST /api/orders", () => {
    it("rechaza un pedido sin items (400)", async () => {
      const res = await createOrder({ items: [], paymentMethod: "efectivo" });
      expect(res.status).toBe(400);
    });

    it("rechaza un drinkId inexistente (404)", async () => {
      const res = await createOrder({ items: [{ drinkId: 999999, qty: 1 }], paymentMethod: "efectivo" });
      expect(res.status).toBe(404);
    });

    it("crea un pedido público como 'Cliente' cuando no hay cookie de sesión", async () => {
      const drink = await createTestDrink({ price: 1000 });
      const res = await createOrder({ items: [{ drinkId: drink.id, qty: 2 }], paymentMethod: "efectivo" });
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe("Cliente");
      expect(res.body.total).toBe(2000);
      expect(res.body.status).toBe("pagado");
    });

    it("crea un pedido de staff con la cookie de sesión como createdBy", async () => {
      const drink = await createTestDrink();
      const cajaCookie = signTestSession("cajera-test", "caja");
      const res = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" }, cajaCookie);
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe("cajera-test");
    });
  });

  describe("GET /api/orders* (staff only)", () => {
    it("GET /api/orders sin sesión responde 401", async () => {
      const res = await request(app).get("/api/orders");
      expect(res.status).toBe(401);
    });

    it("GET /api/orders/active con rol barman responde 200", async () => {
      const cookie = signTestSession("barman-test", "barman");
      const res = await request(app).get("/api/orders/active").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("GET /api/orders/log con rol caja (no admin) responde 403", async () => {
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).get("/api/orders/log").set("Cookie", cookie);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/orders/by-token/:token (público)", () => {
    it("con un token inexistente responde 404", async () => {
      const res = await request(app).get("/api/orders/by-token/no-existe");
      expect(res.status).toBe(404);
    });

    it("con un token real, devuelve el pedido", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const res = await request(app).get(`/api/orders/by-token/${created.body.token}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });
  });

  describe("PATCH /api/orders/:id", () => {
    it("avanza un pedido de 'pagado' a 'preparando'", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "preparando" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("preparando");
    });

    it("rechaza una transición inválida (pagado -> entregado) con 409", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "entregado" });
      expect(res.status).toBe(409);
    });

    it("un barman puede cancelar (default: barman tiene permiso)", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("barman-test", "barman");
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "cancelado" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cancelado");
    });

    it("una caja sin usuario en la tabla users no tiene permiso de cancelar por default (403)", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("cajera-sin-permiso", "caja");
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "cancelado" });
      expect(res.status).toBe(403);
    });
  });
});
