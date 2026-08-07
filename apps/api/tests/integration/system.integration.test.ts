import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { signTestSession } from "../setup/db-helpers.js";

const adminCookie = signTestSession("admin", "admin");

describe("system (integración)", () => {
  describe("GET /api/system/logs", () => {
    it("sin sesión responde 401 (hallazgo de seguridad corregido: antes no tenía auth)", async () => {
      const res = await request(app).get("/api/system/logs");
      expect(res.status).toBe(401);
    });

    it("con sesión de staff devuelve los últimos audit logs", async () => {
      const res = await request(app).get("/api/system/logs").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /api/system/health", () => {
    it("sin sesión responde 401", async () => {
      const res = await request(app).get("/api/system/health");
      expect(res.status).toBe(401);
    });

    it("con sesión de staff devuelve el estado de migraciones", async () => {
      const res = await request(app).get("/api/system/health").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(["ok", "degraded"]).toContain(res.body.status);
      expect(res.body.migrations).toBeDefined();
      expect(res.body.migrations.state).toBeDefined();
      expect(typeof res.body.serverStartedAt).toBe("number");
    });
  });

  describe("GET /api/system/status", () => {
    it("sin sesión responde 401 (hallazgo de seguridad corregido)", async () => {
      const res = await request(app).get("/api/system/status");
      expect(res.status).toBe(401);
    });

    it("con sesión de staff devuelve el estado del sistema", async () => {
      const res = await request(app).get("/api/system/status").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("localDb");
      expect(res.body).toHaveProperty("printer");
    }, 10000);
  });

  // /shutdown: SOLO se testean las ramas que retornan ANTES de exec()/process.exit() —
  // enviar credenciales válidas de verdad mataría el proceso del test runner Y bajaría
  // el stack Docker real del dev. No agregar un test de "éxito" acá.
  describe("POST /api/system/shutdown (solo ramas de validación, nunca el camino feliz)", () => {
    it("sin credenciales ni sesión responde 401", async () => {
      const res = await request(app).post("/api/system/shutdown").send({});
      expect(res.status).toBe(401);
    });

    it("con password incorrecta responde 401", async () => {
      const res = await request(app).post("/api/system/shutdown").send({ username: "admin", password: "mal" });
      expect(res.status).toBe(401);
    });
  });
});
