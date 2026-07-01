import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { cleanAppConfig, cleanAuditLogs, signTestSession } from "../setup/db-helpers.js";

describe("GET/POST /api/config (integración)", () => {
  afterEach(async () => {
    await cleanAppConfig();
    await cleanAuditLogs();
  });

  it("sin cookie de sesión, GET /api/config responde 401", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(401);
  });

  it("con sesión de rol caja (no admin), GET /api/config responde 403", async () => {
    const cookie = signTestSession("cajera-test", "caja");
    const res = await request(app).get("/api/config").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("con sesión admin, GET /api/config crea y devuelve la config default con el token enmascarado", async () => {
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app).get("/api/config").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.brandName).toBe("Bosko");
    expect(res.body.mercadoPago).not.toHaveProperty("accessToken");
    expect(res.body.mercadoPago.accessTokenMasked).toBe("");
  });

  it("POST /api/config con rol admin actualiza el brandName y lo persiste", async () => {
    const cookie = signTestSession("admin-test", "admin");
    const post = await request(app)
      .post("/api/config")
      .set("Cookie", cookie)
      .send({ brandName: "Boliche de Prueba" });
    expect(post.status).toBe(200);
    expect(post.body.brandName).toBe("Boliche de Prueba");

    const get = await request(app).get("/api/config").set("Cookie", cookie);
    expect(get.body.brandName).toBe("Boliche de Prueba");
  });

  it("POST /api/config con un mercadoPago.accessToken lo guarda pero solo devuelve la versión enmascarada", async () => {
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app)
      .post("/api/config")
      .set("Cookie", cookie)
      .send({ mercadoPago: { publicKey: "pub-1", accessToken: "APP_USR-secreto1234", sandbox: true } });
    expect(res.status).toBe(200);
    expect(res.body.mercadoPago.accessTokenMasked).toBe("••••••••1234");
    expect(JSON.stringify(res.body)).not.toContain("APP_USR-secreto1234");
  });

  it("POST /api/config con body inválido (theme fuera de enum) responde 400", async () => {
    const cookie = signTestSession("admin-test", "admin");
    const res = await request(app)
      .post("/api/config")
      .set("Cookie", cookie)
      .send({ theme: "no-existe" });
    expect(res.status).toBe(400);
  });
});
