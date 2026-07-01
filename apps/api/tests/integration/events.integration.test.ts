import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { cleanNightEvents, signTestSession } from "../setup/db-helpers.js";

const adminCookie = signTestSession("admin", "admin");

async function closeActiveEventIfAny() {
  await request(app).post("/api/event/close").set("Cookie", adminCookie).send({ password: "admin" });
}

describe("events (integración)", () => {
  afterEach(async () => {
    await closeActiveEventIfAny();
    await cleanNightEvents();
  });

  describe("POST /api/events/open", () => {
    it("sin sesión responde 401", async () => {
      const res = await request(app).post("/api/events/open").send({ keyword: "clave" });
      expect(res.status).toBe(401);
    });

    it("con rol caja (no admin) responde 403", async () => {
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).post("/api/events/open").set("Cookie", cookie).send({ keyword: "clave" });
      expect(res.status).toBe(403);
    });

    it("sin keyword responde 400", async () => {
      const res = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({});
      expect(res.status).toBe(400);
    });

    it("con admin y keyword abre la noche", async () => {
      const res = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "test-clave" });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("activo");
      expect(res.body.keyword).toBe("test-clave");
    });

    it("rechaza abrir una segunda noche mientras hay una activa (409)", async () => {
      const first = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "clave1" });
      expect(first.status).toBe(201);
      const second = await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "clave2" });
      expect(second.status).toBe(409);
    });
  });

  describe("PATCH /api/events/current/keyword", () => {
    it("sin noche activa responde 409", async () => {
      const res = await request(app).patch("/api/events/current/keyword").set("Cookie", adminCookie).send({ keyword: "nueva" });
      expect(res.status).toBe(409);
    });

    it("con noche activa, corrige la keyword", async () => {
      await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "vieja" });
      const res = await request(app).patch("/api/events/current/keyword").set("Cookie", adminCookie).send({ keyword: "corregida" });
      expect(res.status).toBe(200);
      expect(res.body.keyword).toBe("corregida");
    });
  });

  describe("POST /api/event/close", () => {
    it("sin password responde 400", async () => {
      await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "clave" });
      const res = await request(app).post("/api/event/close").set("Cookie", adminCookie).send({});
      expect(res.status).toBe(400);
    });

    it("con password incorrecta responde 400", async () => {
      await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "clave" });
      const res = await request(app).post("/api/event/close").set("Cookie", adminCookie).send({ password: "mal" });
      expect(res.status).toBe(400);
    });

    it("una caja sin permiso closeNight responde 403", async () => {
      await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "clave" });
      const cookie = signTestSession("cajera-sin-permiso", "caja");
      const res = await request(app).post("/api/event/close").set("Cookie", cookie).send({ password: "caja" });
      expect(res.status).toBe(403);
    });

    it("con password correcta, cierra la noche y devuelve el resumen", async () => {
      await request(app).post("/api/events/open").set("Cookie", adminCookie).send({ keyword: "clave" });
      const res = await request(app).post("/api/event/close").set("Cookie", adminCookie).send({ password: "admin" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("cerrado");
      expect(res.body.closedBy).toBe("admin");
    });
  });

  describe("GET /api/theme y POST /api/theme", () => {
    it("GET /api/theme es público", async () => {
      const res = await request(app).get("/api/theme");
      expect(res.status).toBe(200);
      expect(res.body.theme).toBeTruthy();
    });

    it("POST /api/theme sin sesión responde 401", async () => {
      const res = await request(app).post("/api/theme").send({ theme: "bosko" });
      expect(res.status).toBe(401);
    });

    it("POST /api/theme con admin cambia el tema", async () => {
      const res = await request(app).post("/api/theme").set("Cookie", adminCookie).send({ theme: "bosko" });
      expect(res.status).toBe(200);
      expect(res.body.theme).toBe("bosko");

      const get = await request(app).get("/api/theme");
      expect(get.body.theme).toBe("bosko");

      // deja el tema como estaba para no afectar otros tests del archivo
      await request(app).post("/api/theme").set("Cookie", adminCookie).send({ theme: "normal" });
    });
  });

  describe("GET /api/state", () => {
    it("sin sesión responde 401", async () => {
      const res = await request(app).get("/api/state");
      expect(res.status).toBe(401);
    });

    it("con admin devuelve el snapshot completo", async () => {
      const res = await request(app).get("/api/state").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("event");
      expect(res.body).toHaveProperty("totals");
    });
  });

  describe("GET /api/events/history", () => {
    it("con rol caja (no admin) responde 403", async () => {
      const cookie = signTestSession("cajera-test", "caja");
      const res = await request(app).get("/api/events/history").set("Cookie", cookie);
      expect(res.status).toBe(403);
    });

    it("con admin devuelve una lista (puede estar vacía)", async () => {
      const res = await request(app).get("/api/events/history").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
