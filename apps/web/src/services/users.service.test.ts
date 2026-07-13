import { afterEach, describe, expect, it, vi } from "vitest";
import { usersService, type CreateUserInput, type SafeUser } from "./users.service";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  vi.clearAllMocks();
});

describe("usersService", () => {
  it("list hace GET a /api/users", async () => {
    const expected: SafeUser[] = [];
    mockedApiFetch.mockResolvedValueOnce(expected);

    const result = await usersService.list();

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/users");
    expect(result).toBe(expected);
  });

  it("create hace POST a /api/users con el input", async () => {
    const input: CreateUserInput = {
      username: "nueva",
      password: "1234",
      role: "caja",
    };
    mockedApiFetch.mockResolvedValueOnce({ id: "u1" } as SafeUser);

    await usersService.create(input);

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/users", {
      method: "POST",
      body: input,
    });
  });

  it("delete hace DELETE a /api/users/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    await usersService.delete("u1");

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/users/u1", { method: "DELETE" });
  });

  it("update hace PATCH a /api/users/:id con el partial", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "u1" } as SafeUser);

    await usersService.update("u1", { username: "renombrado" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/api/users/u1", {
      method: "PATCH",
      body: { username: "renombrado" },
    });
  });
});
