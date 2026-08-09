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
});
