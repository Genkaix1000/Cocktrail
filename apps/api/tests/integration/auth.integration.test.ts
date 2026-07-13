import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { cleanUsers, createTestAdmin, signTestSession } from "../setup/db-helpers.js";

afterEach(async () => {
  await cleanUsers();
});

describe("POST /api/auth/login", () => {
  it("con credenciales de fallback (env) válidas, responde 200 y setea la cookie de sesión", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "admin" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "admin", role: "admin" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/cocktrail_session=/);
  });

  it("con credenciales inválidas responde 400", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "incorrecta" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Credenciales inválidas");
  });

  it("la credencial hardcodeada cajavip/cajavip ya NO funciona (R5 resuelta)", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "cajavip", password: "cajavip" });
    expect(res.status).toBe(400);
  });

  it("autentica un usuario real de la tabla users con su password", async () => {
    const { username, password } = await createTestAdmin({ role: "caja" });
    const res = await request(app).post("/api/auth/login").send({ username, password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username, role: "caja" });
  });
});

describe("POST /api/auth/logout", () => {
  it("responde 200 y limpia la cookie de sesión", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/cocktrail_session=;/);
  });
});

describe("GET /api/auth/me", () => {
  it("sin cookie de sesión devuelve null", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("con sesión admin devuelve permisos completos", async () => {
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
    expect(res.body.permissions.manageUsers).toBe(true);
  });

  it("con sesión de un usuario real, resuelve permisos desde la tabla users", async () => {
    const user = await createTestAdmin({ role: "caja", permissions: { cancelarTickets: true } });
    const cookie = signTestSession(user.username, "caja");
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.permissions.cancelarTickets).toBe(true);
  });

  it("con sesión de rol caja fallback (sin fila en users), aplica los defaults de rol", async () => {
    const cookie = signTestSession("caja-fallback", "caja");
    const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.permissions.closeNight).toBe(false);
    expect(res.body.permissions.historial).toBe(true);
  });
});
