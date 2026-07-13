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

  describe("POST /api/system/sync", () => {
    it("sin sesión responde 401 (hallazgo de seguridad corregido)", async () => {
      const res = await request(app).post("/api/system/sync");
      expect(res.status).toBe(401);
    });

    it("con sesión de staff dispara el sync y responde success", async () => {
      const res = await request(app).post("/api/system/sync").set("Cookie", adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
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

  describe("POST /api/system/restore", () => {
    it("sin sesión responde 401", async () => {
      const res = await request(app).post("/api/system/restore").send({ password: "admin" });
      expect(res.status).toBe(401);
    });

    it("con sesión de rol caja (no admin) responde 403 — blast radius mayor que /sync", async () => {
      const cajaCookie = signTestSession("cajera-test", "caja");
      const res = await request(app).post("/api/system/restore").set("Cookie", cajaCookie).send({ password: "admin" });
      expect(res.status).toBe(403);
    });

    it("con password incorrecta responde 401", async () => {
      const res = await request(app).post("/api/system/restore").set("Cookie", adminCookie).send({ password: "mal" });
      expect(res.status).toBe(401);
    });

    it("con credenciales válidas, devuelve un RestoreResult bien formado (una entrada por tabla, nunca un booleano solo) — no un crash", async () => {
      // Ojo: este entorno SÍ tiene Supabase Cloud real configurada (dotenv v17 hace
      // cascada de .env además de .env.test) — mismo comportamiento que ya tenía el
      // test existente de POST /api/system/sync. No se afirma nada sobre si cada tabla
      // tuvo éxito o no (depende del estado real de la cuenta cloud del usuario en el
      // momento de correr los tests), solo que la forma de la respuesta es la esperada.
      const res = await request(app).post("/api/system/restore").set("Cookie", adminCookie).send({ password: "admin" });
      expect(res.status).toBe(200);
      for (const key of ["nightEvents", "orders", "tickets", "auditLogs"] as const) {
        expect(res.body[key]).toHaveProperty("ok");
        expect(res.body[key]).toHaveProperty("failed");
        expect(typeof res.body[key].ok).toBe("number");
        expect(typeof res.body[key].failed).toBe("number");
      }
    }, 15000);
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
