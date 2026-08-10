import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session.js";

describe("signSession / verifySession", () => {
  it("una cookie recién firmada verifica válida con el mismo username/role", () => {
    const { value } = signSession("admin1", "admin");
    const session = verifySession(value);
    expect(session).toEqual({ role: "admin", username: "admin1", expiresAt: expect.any(Number) });
  });

  it("rechaza undefined", () => {
    expect(verifySession(undefined)).toBeNull();
  });

  it("rechaza un valor con formato inválido (menos de 5 partes)", () => {
    expect(verifySession("admin.admin1")).toBeNull();
  });

  it("rechaza un rol que no existe", () => {
    const { value } = signSession("x", "admin");
    const tampered = value.replace(/^admin\./, "superadmin.");
    expect(verifySession(tampered)).toBeNull();
  });

  it("rechaza una firma manipulada", () => {
    const { value } = signSession("admin1", "admin");
    const parts = value.split(".");
    parts[4] = "0".repeat(parts[4].length);
    expect(verifySession(parts.join("."))).toBeNull();
  });

  it("rechaza un token expirado", () => {
    // 5 partes: role.user.exp.version.sig — exp en el pasado corta antes del HMAC.
    const payload = `admin.admin1.${Date.now() - 1000}.1.firmacualquiera`;
    expect(verifySession(payload)).toBeNull();
  });
});
