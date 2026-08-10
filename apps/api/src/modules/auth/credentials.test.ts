import { describe, it, expect, vi } from "vitest";
import { authenticate } from "./credentials.js";
import type { UsersRepository, StaffUser } from "../users/users.repository.js";
import { hashPassword } from "../users/users.repository.js";

function makeUsersRepo(overrides?: Partial<UsersRepository>): UsersRepository {
  return {
    list: vi.fn(),
    findById: vi.fn(),
    findByUsername: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updatePassword: vi.fn(),
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
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("authenticate", () => {
  it("autentica un usuario de la DB con password correcta", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(makeDbUser()) });
    const result = await authenticate("cajera1", "secreto123", repo);
    expect(result?.user).toEqual({ username: "cajera1", role: "caja" });
    expect(result?.migrated).toBe(false);
  });

  it("detecta hash legado y marca migrated=true", async () => {
    const { createHash } = await import("node:crypto");
    const legacyHash = createHash("sha256").update("secreto123").digest("hex");
    const repo = makeUsersRepo({
      findByUsername: vi.fn().mockResolvedValue(makeDbUser({ passwordHash: legacyHash })),
    });
    const result = await authenticate("cajera1", "secreto123", repo);
    expect(result?.user).toEqual({ username: "cajera1", role: "caja" });
    expect(result?.migrated).toBe(true);
  });

  it("rechaza un usuario de la DB con password incorrecta", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(makeDbUser()) });
    const result = await authenticate("cajera1", "password-incorrecta", repo);
    expect(result).toBeNull();
  });

  it("rechaza hash legado con password incorrecta", async () => {
    const { createHash } = await import("node:crypto");
    const legacyHash = createHash("sha256").update("secreto123").digest("hex");
    const repo = makeUsersRepo({
      findByUsername: vi.fn().mockResolvedValue(makeDbUser({ passwordHash: legacyHash })),
    });
    const result = await authenticate("cajera1", "wrong", repo);
    expect(result).toBeNull();
  });

  it("cae al fallback de env cuando el usuario no está en la DB (admin/admin)", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(undefined) });
    const result = await authenticate("admin", "admin", repo);
    expect(result?.user).toEqual({ username: "admin", role: "admin" });
    expect(result?.migrated).toBeUndefined();
  });

  it("rechaza un usuario que no existe ni en DB ni en el fallback", async () => {
    const repo = makeUsersRepo({ findByUsername: vi.fn().mockResolvedValue(undefined) });
    const result = await authenticate("no-existe", "cualquiera", repo);
    expect(result).toBeNull();
  });

  it("funciona sin repo (solo fallback de env)", async () => {
    const result = await authenticate("caja", "caja");
    expect(result?.user).toEqual({ username: "caja", role: "caja" });
  });

  it("ya NO acepta la credencial hardcodeada cajavip/cajavip (R5 resuelta)", async () => {
    const result = await authenticate("cajavip", "cajavip");
    expect(result).toBeNull();
  });
});
