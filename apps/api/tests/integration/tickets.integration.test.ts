import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import {
  cleanNightEvents,
  cleanDrinks,
  cleanAuditLogs,
  signTestSession,
  createTestDrink,
} from "../setup/db-helpers.js";

// EventsService cachea la noche activa en memoria (no relee la DB en cada request) —
// por eso la noche se abre UNA vez para todo este archivo vía la API real
// (POST /api/events/open), no insertando directo en night_events: un insert directo
// no actualiza el cache en memoria y las siguientes ventas fallarían con 409.
const adminCookie = signTestSession("admin-test", "admin");

async function openNightEvent() {
  const res = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "test-keyword" });
  expect(res.status).toBe(201);
}

// POST /api/orders es staff-only desde el hardening de rutas: va con cookie de
// admin. El renderTicket que dispara una venta de staff solo arma los bytes
// ESC/POS en memoria (la impresión física es por WebUSB en el navegador), así
// que no hay I/O a la impresora que pueda colgar el test.
async function createOrderWithTicket(drinkId: number) {
  const res = await request(app)
    .post("/api/orders")
    .set("Cookie", adminCookie)
    .send({ items: [{ drinkId, qty: 1 }], paymentMethod: "efectivo" });
  expect(res.status).toBe(201);
  return res.body as { id: string; token: string; ticketCode?: string; displayNumber: number };
}

describe("POST /api/tickets/redeem (integración)", () => {
  beforeAll(async () => {
    await openNightEvent();
  });

  afterAll(async () => {
    await cleanNightEvents();
  });

  afterEach(async () => {
    await cleanDrinks();
    await cleanAuditLogs();
  });

  it("sin cookie de sesión responde 401", async () => {
    const res = await request(app).post("/api/tickets/redeem").send({ code: "AAAAAAAA-00000000" });
    expect(res.status).toBe(401);
  });

  it("con rol caja (no admin — el rol barman se retiró, el canje ahora es admin-only) responde 403", async () => {
    const cookie = signTestSession("cajera-test", "caja");
    const res = await request(app).post("/api/tickets/redeem").set("Cookie", cookie).send({ code: "AAAAAAAA-00000000" });
    expect(res.status).toBe(403);
  });

  it("con un código que no existe responde 404", async () => {
    const res = await request(app).post("/api/tickets/redeem").set("Cookie", adminCookie).send({ code: "ZZZZZZZZ-00000000" });
    expect(res.status).toBe(404);
  });

  it("canjea un ticket recién creado: pasa el pedido de 'pendiente' a 'entregado'", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);
    expect(order.ticketCode).toBeTruthy();

    const res = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", adminCookie)
      .send({ code: order.ticketCode, method: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("entregado");
    expect(res.body.order.id).toBe(order.id);
  });

  it("un ticket ya canjeado no se puede volver a canjear (409)", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);

    const first = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", adminCookie)
      .send({ code: order.ticketCode });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", adminCookie)
      .send({ code: order.ticketCode });
    expect(second.status).toBe(409);
  });

  it("dos canjes concurrentes del mismo ticket: exactamente uno gana, el pedido queda 'entregado' una sola vez", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);

    const admin1Cookie = signTestSession("admin1-test", "admin");
    const admin2Cookie = signTestSession("admin2-test", "admin");

    // Promise.all (no secuencial): las dos requests llegan al backend prácticamente
    // al mismo tiempo — es la condición real que reproduce la carrera de
    // docs/specs/deuda-pre-fase-6/atomicidad-canje-ticket.md, no un mock que serialice las llamadas.
    const [res1, res2] = await Promise.all([
      request(app).post("/api/tickets/redeem").set("Cookie", admin1Cookie).send({ code: order.ticketCode }),
      request(app).post("/api/tickets/redeem").set("Cookie", admin2Cookie).send({ code: order.ticketCode }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = res1.status === 200 ? res1 : res2;
    expect(winner.body.order.status).toBe("entregado");

    // El pedido quedó "entregado" una sola vez (consulta por token, staff only).
    const finalOrder = await request(app).get(`/api/orders/by-token/${order.token}`).set("Cookie", adminCookie);
    expect(finalOrder.body.status).toBe("entregado");
  });

  it("resuelve el ticket por el prefijo legible de 8 caracteres", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);
    const readable = order.ticketCode!.split("-")[0];

    const res = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", adminCookie)
      .send({ code: readable });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("entregado");
  });
});
