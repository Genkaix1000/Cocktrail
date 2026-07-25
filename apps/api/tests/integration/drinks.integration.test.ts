import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { cleanDrinks, cleanAuditLogs, signTestSession, createTestDrink } from "../setup/db-helpers.js";

describe("GET /api/drinks (público)", () => {
  afterEach(async () => {
    await cleanDrinks();
  });

  it("lista los tragos disponibles sin necesitar sesión", async () => {
    await createTestDrink({ id: 501, name: "Gin Tonic" });
    const res = await request(app).get("/api/drinks");
    expect(res.status).toBe(200);
    expect(res.body.some((d: any) => d.name === "Gin Tonic")).toBe(true);
  });

  it("GET /api/drinks/:id devuelve 404 si no existe", async () => {
    const res = await request(app).get("/api/drinks/999999");
    expect(res.status).toBe(404);
  });

  it("GET /api/drinks/:id devuelve 400 con un id no numérico", async () => {
    const res = await request(app).get("/api/drinks/abc");
    expect(res.status).toBe(400);
  });
});

describe("POST/PATCH/DELETE /api/drinks (admin only)", () => {
  afterEach(async () => {
    await cleanDrinks();
    await cleanAuditLogs();
  });

  it("POST sin sesión responde 401", async () => {
    const res = await request(app).post("/api/drinks").send({ name: "x", price: 100 });
    expect(res.status).toBe(401);
  });

  it("POST con rol caja (no admin) responde 403", async () => {
    const cookie = signTestSession("cajera-test", "caja");
    const res = await request(app).post("/api/drinks").set("Cookie", cookie).send({ name: "x", price: 100 });
    expect(res.status).toBe(403);
  });

  it("POST con admin crea el trago y lo persiste", async () => {
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app)
      .post("/api/drinks")
      .set("Cookie", cookie)
      .send({ name: "TragoTest", price: 2800, description: "", vibe: "", flavors: [], iconName: "glass-water", trending: false, promo: false, available: true });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("TragoTest");

    const list = await request(app).get("/api/drinks");
    expect(list.body.some((d: any) => d.id === res.body.id)).toBe(true);
  });

  it("PATCH actualiza el precio de un trago existente", async () => {
    const drink = await createTestDrink();
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app).patch(`/api/drinks/${drink.id}`).set("Cookie", cookie).send({ price: 9999 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(9999);
  });

  it("DELETE elimina un trago existente", async () => {
    const drink = await createTestDrink();
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app).delete(`/api/drinks/${drink.id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);

    const get = await request(app).get(`/api/drinks/${drink.id}`);
    expect(get.status).toBe(404);
  });
});
