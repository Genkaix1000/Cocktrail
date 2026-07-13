import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsersService } from "./users.service.js";
import type { UsersRepository, StaffUser } from "./users.repository.js";

function makeRepo(overrides?: Partial<UsersRepository>): UsersRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
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
    passwordHash: "hash",
    role: "caja",
    createdAt: Date.now(),
    ...overrides,
  };
}

describe("UsersService.listUsers", () => {
  it("incluye los 2 usuarios de sistema (admin/caja)", async () => {
    const service = new UsersService(makeRepo());
    const users = await service.listUsers();
    const usernames = users.map((u) => u.username);
    expect(usernames).toEqual(expect.arrayContaining(["admin", "caja"]));
  });

  it("filtra usuarios de la DB cuyo username choca con uno de sistema (evita duplicados)", async () => {
    const repo = makeRepo({ list: vi.fn().mockResolvedValue([{ id: "db-1", username: "admin", role: "admin", createdAt: 1 }]) });
    const service = new UsersService(repo);
    const users = await service.listUsers();
    expect(users.filter((u) => u.username === "admin")).toHaveLength(1);
  });

  it("incluye usuarios reales de la DB que no chocan con nombres de sistema", async () => {
    const repo = makeRepo({ list: vi.fn().mockResolvedValue([{ id: "db-1", username: "cajera1", role: "caja", createdAt: 1 }]) });
    const service = new UsersService(repo);
    const users = await service.listUsers();
    expect(users.some((u) => u.username === "cajera1")).toBe(true);
  });
});

describe("UsersService.createUser", () => {
  let repo: UsersRepository;
  let service: UsersService;

  beforeEach(() => {
    repo = makeRepo({ findByUsername: vi.fn().mockResolvedValue(undefined) });
    service = new UsersService(repo);
  });

  it("rechaza un nombre reservado (admin/caja)", async () => {
    await expect(
      service.createUser({ username: "admin", password: "x", role: "caja" }),
    ).rejects.toThrow(/reservado/);
  });

  it("rechaza username vacío", async () => {
    await expect(
      service.createUser({ username: "  ", password: "x", role: "caja" }),
    ).rejects.toThrow(/requerido/);
  });

  it("rechaza si ya existe un usuario con ese nombre", async () => {
    vi.mocked(repo.findByUsername).mockResolvedValue(makeDbUser());
    await expect(
      service.createUser({ username: "cajera1", password: "x", role: "caja" }),
    ).rejects.toThrow(/Ya existe/);
  });

  it("crea el usuario y nunca devuelve el passwordHash", async () => {
    vi.mocked(repo.create).mockImplementation(async (u) => u);
    const user = await service.createUser({ username: "nuevo", password: "secreto", role: "caja" });
    expect(user).not.toHaveProperty("passwordHash");
    expect(user.username).toBe("nuevo");
  });
});

describe("UsersService.updateUser", () => {
  it("rechaza modificar un usuario de sistema (id system-*)", async () => {
    const service = new UsersService(makeRepo());
    await expect(service.updateUser("system-admin", { role: "caja" })).rejects.toThrow(/sistema/);
  });

  it("tira NotFound si el usuario no existe", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(undefined) });
    const service = new UsersService(repo);
    await expect(service.updateUser("no-existe", { role: "caja" })).rejects.toThrow(/no encontrado/);
  });

  it("rechaza renombrar a un nombre reservado", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeDbUser()) });
    const service = new UsersService(repo);
    await expect(service.updateUser("user-1", { username: "admin" })).rejects.toThrow(/reservado/);
  });

  it("actualiza el rol", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeDbUser()), update: vi.fn().mockImplementation(async (u) => u) });
    const service = new UsersService(repo);
    const updated = await service.updateUser("user-1", { role: "admin" });
    expect(updated.role).toBe("admin");
  });
});

describe("UsersService.deleteUser", () => {
  it("rechaza eliminar un usuario de sistema", async () => {
    const service = new UsersService(makeRepo());
    await expect(service.deleteUser("system-caja")).rejects.toThrow(/sistema/);
  });

  it("tira NotFound si el usuario no existe", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(undefined) });
    const service = new UsersService(repo);
    await expect(service.deleteUser("no-existe")).rejects.toThrow(/no encontrado/);
  });

  it("elimina un usuario real de la DB", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeDbUser()) });
    const service = new UsersService(repo);
    await service.deleteUser("user-1");
    expect(repo.delete).toHaveBeenCalledWith("user-1");
  });
});
