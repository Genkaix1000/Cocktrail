import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { cleanUsers, cleanAuditLogs, signTestSession, createTestAdmin } from "../setup/db-helpers.js";

const adminCookie = signTestSession("admin-test", "admin");

describe("users (integración)", () => {
  afterEach(async () => {
    await cleanUsers();
    await cleanAuditLogs();
  });

  it("GET /api/users sin sesión responde 401", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("GET /api/users con rol caja (no admin) responde 403", async () => {
    const cookie = signTestSession("cajera-test", "caja");
    const res = await request(app).get("/api/users").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("GET /api/users con admin incluye los usuarios de sistema", async () => {
    const res = await request(app).get("/api/users").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.some((u: any) => u.username === "admin")).toBe(true);
  });

  it("POST crea un usuario real y no expone el passwordHash", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", adminCookie)
      .send({
        username: "nueva-cajera",
        password: "secreto123",
        role: "caja",
      });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("passwordHash");

    const list = await request(app).get("/api/users").set("Cookie", adminCookie);
    expect(list.body.some((u: any) => u.username === "nueva-cajera")).toBe(true);
  });

  it("POST rechaza un nombre reservado (409)", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", adminCookie)
      .send({
        username: "admin",
        password: "cualquiera123",
        role: "admin",
      });
    expect(res.status).toBe(409);
  });

  it("POST rechaza un rol inválido (barman ya no existe)", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", adminCookie)
      .send({ username: "nuevo-barman", password: "cualquiera123", role: "barman" });
    expect(res.status).toBe(400);
  });

  it("PATCH actualiza el rol de un usuario real", async () => {
    const user = await createTestAdmin({ role: "caja" });
    const res = await request(app).patch(`/api/users/${user.id}`).set("Cookie", adminCookie).send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("PATCH rechaza modificar un usuario de sistema", async () => {
    const res = await request(app).patch("/api/users/system-admin").set("Cookie", adminCookie).send({ role: "caja" });
    expect(res.status).toBe(400);
  });

  it("DELETE elimina un usuario real", async () => {
    const user = await createTestAdmin();
    const res = await request(app).delete(`/api/users/${user.id}`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);

    const list = await request(app).get("/api/users").set("Cookie", adminCookie);
    expect(list.body.some((u: any) => u.id === user.id)).toBe(false);
  });

  it("DELETE rechaza eliminar un usuario de sistema", async () => {
    const res = await request(app).delete("/api/users/system-caja").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });
});
