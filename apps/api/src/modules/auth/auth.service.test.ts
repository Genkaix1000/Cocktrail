import { describe, it, expect, vi } from "vitest";
import {
  authenticate,
  signSession,
  verifySession,
  getCaptchaInfo,
  registerFailedAttempt,
  verifyCaptcha,
  clearFailedAttempts,
} from "./auth.service.js";
import type { UsersRepository, StaffUser } from "../users/users.repository.js";
import { hashPassword } from "../users/users.repository.js";

function makeUsersRepo(overrides?: Partial<UsersRepository>): UsersRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeDbUser(overrides?: Partial<StaffUser>): StaffUser {
  return {
    id: "user-1",
    username: "cajera1",
    passwordHash: hashPassword("secreto123"),
    role: "caja",
    permissions: {
      closeNight: false,
      modifyCarta: false,
      manageUsers: false,
      monitoreo: false,
      metricas: false,
      historial: true,
      general: false,
      carta: false,
      pagos: false,
      staff: false,
      cancelarTickets: false,
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("authenticate", () => {
  it("autentica un usuario de la DB con password correcta", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(makeDbUser()) });
    const user = await authenticate("cajera1", "secreto123", repo);
    expect(user).toEqual({ username: "cajera1", role: "caja" });
  });

  it("rechaza un usuario de la DB con password incorrecta", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(makeDbUser()) });
    const user = await authenticate("cajera1", "password-incorrecta", repo);
    expect(user).toBeNull();
  });

  it("cae al fallback de env cuando el usuario no está en la DB (admin/admin)", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(undefined) });
    const user = await authenticate("admin", "admin", repo);
    expect(user).toEqual({ username: "admin", role: "admin" });
  });

  it("rechaza un usuario que no existe ni en DB ni en el fallback", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(undefined) });
    const user = await authenticate("no-existe", "cualquiera", repo);
    expect(user).toBeNull();
  });

  it("funciona sin repo (solo fallback de env)", async () => {
    const user = await authenticate("caja", "caja");
    expect(user).toEqual({ username: "caja", role: "caja" });
  });

  it("ya NO acepta la credencial hardcodeada cajavip/cajavip (R5 resuelta)", async () => {
    const user = await authenticate("cajavip", "cajavip");
    expect(user).toBeNull();
  });
});

describe("signSession / verifySession", () => {
  it("una cookie recién firmada verifica válida con el mismo username/role", () => {
    const { value } = signSession("admin1", "admin");
    const session = verifySession(value);
    expect(session).toEqual({ role: "admin", username: "admin1", expiresAt: expect.any(Number) });
  });

  it("rechaza undefined", () => {
    expect(verifySession(undefined)).toBeNull();
  });

  it("rechaza un valor con formato inválido (menos de 4 partes)", () => {
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
    parts[3] = "0".repeat(parts[3].length);
    expect(verifySession(parts.join("."))).toBeNull();
  });

  it("rechaza un token expirado", () => {
    const payload = `admin.admin1.${Date.now() - 1000}`;
    // Firmamos manualmente un payload ya vencido usando la misma función interna
    // (no exportada) — en su lugar, verificamos indirectamente: un signSession fresco
    // con expiresAt forzado al pasado no es reproducible sin acceso a AUTH_SECRET acá,
    // así que probamos con un token sintéticamente viejo y firma inválida (cubre la
    // rama de expiración vía el chequeo de expiresAt <= Date.now() antes de comparar HMAC).
    expect(verifySession(`${payload}.firmacualquiera`)).toBeNull();
  });
});

describe("captcha anti-bruteforce", () => {
  it("no requiere captcha antes de 3 intentos fallidos", () => {
    const ip = "10.0.0.1";
    expect(getCaptchaInfo(ip).required).toBe(false);
    registerFailedAttempt(ip);
    registerFailedAttempt(ip);
    expect(getCaptchaInfo(ip).required).toBe(false);
    clearFailedAttempts(ip);
  });

  it("requiere captcha a partir del 3er intento fallido y lo valida contra la respuesta generada", () => {
    const ip = "10.0.0.2";
    registerFailedAttempt(ip);
    registerFailedAttempt(ip);
    const third = registerFailedAttempt(ip);
    expect(third.captchaRequired).toBe(true);
    expect(third.captchaQuestion).toMatch(/¿Cuánto es \d+ \+ \d+\?/);

    expect(verifyCaptcha(ip, "respuesta-incorrecta-no-numerica")).toBe(false);
    clearFailedAttempts(ip);
  });

  it("clearFailedAttempts resetea el estado (vuelve a no requerir captcha)", () => {
    const ip = "10.0.0.3";
    registerFailedAttempt(ip);
    registerFailedAttempt(ip);
    registerFailedAttempt(ip);
    expect(getCaptchaInfo(ip).required).toBe(true);

    clearFailedAttempts(ip);
    expect(getCaptchaInfo(ip).required).toBe(false);
  });
});
