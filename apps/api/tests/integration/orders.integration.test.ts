import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../../src/app.js";
import { supabase } from "../../src/shared/supabase.js";
import {
  cleanNightEvents,
  cleanDrinks,
  cleanAuditLogs,
  cleanTestMpOrders,
  createTestMpOrder,
  signTestSession,
  createTestDrink,
} from "../setup/db-helpers.js";

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
    // Si quedó una noche activa de una corrida anterior (o real — riesgo ya
    // documentado en db-helpers.ts), el open devolvería 409.
    await cleanNightEvents();
    const res = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "test-keyword" });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    // Orden importa: las orders (borradas en cascada con la noche) referencian
    // mp_orders con FK NO ACTION.
    await cleanNightEvents();
    await cleanTestMpOrders();
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
      expect(res.body.status).toBe("pendiente");
    });

    it("crea un pedido de staff con la cookie de sesión como createdBy", async () => {
      const drink = await createTestDrink();
      const cajaCookie = signTestSession("cajera-test", "caja");
      const res = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" }, cajaCookie);
      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe("cajera-test");
    });
  });

  describe("invariantes de cobro en DB (M1/M2) y replay", () => {
    async function activeEventId(): Promise<string> {
      const { data, error } = await supabase
        .from("night_events")
        .select("id")
        .eq("status", "activo")
        .single();
      if (error) throw error;
      return data.id;
    }

    function baseOrderRow(eventId: string) {
      return {
        id: randomUUID(),
        event_id: eventId,
        token: randomUUID().slice(0, 8),
        display_number: 9000 + Math.floor(Math.random() * 999),
        items: [],
        total: 1500,
        status: "pendiente",
        created_at: new Date().toISOString(),
      };
    }

    it("el CHECK invariante rechaza una venta 'cobrado' no-efectivo sin mp_order_id", async () => {
      const eventId = await activeEventId();
      const { error } = await supabase.from("orders").insert({
        ...baseOrderRow(eventId),
        payment_method: "debito",
        payment_status: "cobrado",
        mp_order_id: null,
      });
      expect(error).toBeTruthy();
      // 23514 = check_violation (orders_cobrado_requires_mp_order)
      expect(error!.code).toBe("23514");
    });

    it("el CHECK permite 'cobrado' en efectivo sin mp_order_id (escape irreductible)", async () => {
      const eventId = await activeEventId();
      const { error } = await supabase.from("orders").insert({
        ...baseOrderRow(eventId),
        payment_method: "efectivo",
        payment_status: "cobrado",
      });
      expect(error).toBeNull();
    });

    it("uq_orders_mp_order_id: dos ventas no pueden ligarse al mismo cobro (23505)", async () => {
      const eventId = await activeEventId();
      const mp = await createTestMpOrder({ status: "processed", amount: 1500 });

      const first = await supabase.from("orders").insert({
        ...baseOrderRow(eventId),
        payment_method: "debito",
        payment_status: "cobrado",
        mp_order_id: mp.id,
      });
      expect(first.error).toBeNull();

      const second = await supabase.from("orders").insert({
        ...baseOrderRow(eventId),
        payment_method: "debito",
        payment_status: "cobrado",
        mp_order_id: mp.id,
      });
      expect(second.error).toBeTruthy();
      expect(second.error!.code).toBe("23505");
    });

    it("replay por idempotency_key vía API: dos POST iguales devuelven la MISMA Order (201)", async () => {
      const drink = await createTestDrink();
      const cookie = signTestSession("cajera-test", "caja");
      const idempotencyKey = randomUUID();
      const body = { items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo", idempotencyKey };

      const first = await createOrder(body, cookie);
      expect(first.status).toBe(201);

      const second = await createOrder(body, cookie);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);

      const { data } = await supabase.from("orders").select("id").eq("idempotency_key", idempotencyKey);
      expect(data).toHaveLength(1);
    });

    it("uq_orders_idempotency_key también aguanta a nivel DB (23505)", async () => {
      const eventId = await activeEventId();
      const idempotencyKey = `TEST-KEY-${randomUUID()}`;

      const first = await supabase.from("orders").insert({
        ...baseOrderRow(eventId),
        payment_method: "efectivo",
        idempotency_key: idempotencyKey,
      });
      expect(first.error).toBeNull();

      const second = await supabase.from("orders").insert({
        ...baseOrderRow(eventId),
        payment_method: "efectivo",
        idempotency_key: idempotencyKey,
      });
      expect(second.error).toBeTruthy();
      expect(second.error!.code).toBe("23505");
    });

    it("staff + débito sin prueba de pago → 422 con code PAYMENT_PROOF_REQUIRED", async () => {
      const drink = await createTestDrink();
      const cookie = signTestSession("cajera-test", "caja");
      const res = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "debito" }, cookie);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("PAYMENT_PROOF_REQUIRED");
    });
  });

  describe("GET /api/orders* (staff only)", () => {
    it("GET /api/orders sin sesión responde 401", async () => {
      const res = await request(app).get("/api/orders");
      expect(res.status).toBe(401);
    });

    it("GET /api/orders/active con rol caja responde 200", async () => {
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).get("/api/orders/active").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("una cookie con rol 'barman' (retirado) ya no es una sesión válida (401)", async () => {
      // verifySession rechaza el rol antes de siquiera chequear la firma HMAC
      // (ROLES set ya no incluye "barman"), así que alcanza con el formato.
      const { COOKIE_NAME } = await import("../../src/modules/auth/session.js");
      const expiresAt = Date.now() + 60_000;
      const cookie = `${COOKIE_NAME}=barman.barman-test.${expiresAt}.deadbeef`;
      const res = await request(app).get("/api/orders/active").set("Cookie", cookie);
      expect(res.status).toBe(401);
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
    it("avanza un pedido de 'pendiente' a 'entregado'", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "entregado" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("entregado");
    });

    it("rechaza una transición inválida (entregado -> pendiente) con 409", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("cajera-test", "caja");
      await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "entregado" });
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "pendiente" });
      expect(res.status).toBe(409);
    });

    it("un admin puede cancelar", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", adminCookie).send({ status: "cancelado" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cancelado");
    });

    it("una caja puede cancelar aunque no exista en la tabla users (cancelarTickets ya no es un permiso configurable, es fijo por rol)", async () => {
      const drink = await createTestDrink();
      const created = await createOrder({ items: [{ drinkId: drink.id, qty: 1 }], paymentMethod: "efectivo" });
      const cookie = signTestSession("cajera-sin-permiso", "caja");
      const res = await request(app).patch(`/api/orders/${created.body.id}`).set("Cookie", cookie).send({ status: "cancelado" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cancelado");
    });
  });
});
