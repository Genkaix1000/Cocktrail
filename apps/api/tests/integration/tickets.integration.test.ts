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

// Se crea sin cookie de sesión (createdBy = "Cliente") a propósito: el ticket se genera
// igual, pero evita que OrdersService dispare printerService.printTicket (solo imprime
// para ventas de staff) — con la impresora física ya desconectada, ese write síncrono a
// /dev/usb/lp* puede quedar colgado y trabar el test.
async function createOrderWithTicket(drinkId: number) {
  const res = await request(app)
    .post("/api/orders")
    .send({ items: [{ drinkId, qty: 1 }], paymentMethod: "efectivo" });
  expect(res.status).toBe(201);
  return res.body as { id: string; ticketCode?: string; displayNumber: number };
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

  it("con rol caja (no admin/barman) responde 403", async () => {
    const cookie = signTestSession("cajera-test", "caja");
    const res = await request(app).post("/api/tickets/redeem").set("Cookie", cookie).send({ code: "AAAAAAAA-00000000" });
    expect(res.status).toBe(403);
  });

  it("con un código que no existe responde 404", async () => {
    const cookie = signTestSession("barman-test", "barman");
    const res = await request(app).post("/api/tickets/redeem").set("Cookie", cookie).send({ code: "ZZZZZZZZ-00000000" });
    expect(res.status).toBe(404);
  });

  it("canjea un ticket recién creado: pasa el pedido de 'pagado' a 'entregado'", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);
    expect(order.ticketCode).toBeTruthy();

    const barmanCookie = signTestSession("barman-test", "barman");
    const res = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", barmanCookie)
      .send({ code: order.ticketCode, method: "manual" });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("entregado");
    expect(res.body.order.id).toBe(order.id);
  });

  it("un ticket ya canjeado no se puede volver a canjear (409)", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);

    const barmanCookie = signTestSession("barman-test", "barman");
    const first = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", barmanCookie)
      .send({ code: order.ticketCode });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", barmanCookie)
      .send({ code: order.ticketCode });
    expect(second.status).toBe(409);
  });

  it("resuelve el ticket por el prefijo legible de 8 caracteres", async () => {
    const drink = await createTestDrink();
    const order = await createOrderWithTicket(drink.id);
    const readable = order.ticketCode!.split("-")[0];

    const barmanCookie = signTestSession("barman-test", "barman");
    const res = await request(app)
      .post("/api/tickets/redeem")
      .set("Cookie", barmanCookie)
      .send({ code: readable });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("entregado");
  });
});
