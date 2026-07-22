import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { mpContextMiddleware, _setBarsRepoForTests } from "./mp-context.middleware.js";
import { env } from "../../config/env.js";
import { BadRequest, Forbidden } from "../../shared/errors/http-errors.js";
import type { BarsRepository } from "./bars.repository.js";

const INSTALL_BAR_UUID = "49d338c7-0eed-4280-a8ab-98c7e960355c";

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function fakeBarsRepo(overrides: Partial<BarsRepository> = {}): BarsRepository {
  return {
    findByCode: vi.fn(async (code: string) =>
      code === env.BAR_CODE
        ? { id: INSTALL_BAR_UUID, name: "Barra VIP", code, createdAt: new Date() }
        : null,
    ),
    findById: vi.fn(async () => null),
    listAll: vi.fn(async () => []),
    ...overrides,
  } as unknown as BarsRepository;
}

describe("mpContextMiddleware (A12 mínimo)", () => {
  beforeEach(() => {
    _setBarsRepoForTests(fakeBarsRepo());
  });

  it("sin headers → contexto con la barra default de la instalación", async () => {
    const req = makeReq();
    const next = vi.fn();

    await mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext).toEqual({ barId: env.BAR_CODE });
  });

  it("x-bar-id coincidente con BAR_CODE → pasa", async () => {
    const req = makeReq({ "x-bar-id": env.BAR_CODE });
    const next = vi.fn();

    await mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext?.barId).toBe(env.BAR_CODE);
  });

  it("x-bar-id con el UUID de la barra de la instalación → pasa (es lo que manda la web)", async () => {
    const req = makeReq({ "x-bar-id": INSTALL_BAR_UUID });
    const next = vi.fn();

    await mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext?.barId).toBe(INSTALL_BAR_UUID);
  });

  it("x-bar-id de otra barra (ni code ni UUID conocido) → 403 Forbidden", async () => {
    const req = makeReq({ "x-bar-id": "BARRA-99" });
    const next = vi.fn();

    await mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Forbidden);
    expect((err as Error).message).toContain("BARRA-99");
    expect(req.mpContext).toBeUndefined();
  });

  it("si la DB falla, el UUID no valida (fail-open solo hacia el code)", async () => {
    _setBarsRepoForTests(
      fakeBarsRepo({
        findByCode: vi.fn(async () => {
          throw new Error("db caída");
        }),
      }),
    );
    const uuidReq = makeReq({ "x-bar-id": INSTALL_BAR_UUID });
    const next = vi.fn();

    await mpContextMiddleware(uuidReq, {} as Response, next);

    // Sin DB no se puede confirmar el UUID → se rechaza; el code sigue pasando.
    expect(next.mock.calls[0][0]).toBeInstanceOf(Forbidden);

    const codeReq = makeReq({ "x-bar-id": env.BAR_CODE });
    const next2 = vi.fn();
    await mpContextMiddleware(codeReq, {} as Response, next2);
    expect(next2).toHaveBeenCalledWith();
  });

  it("cachea el lookup de la barra (no consulta la DB en cada request)", async () => {
    const repo = fakeBarsRepo();
    _setBarsRepoForTests(repo);

    for (let i = 0; i < 3; i++) {
      const req = makeReq({ "x-bar-id": INSTALL_BAR_UUID });
      const next = vi.fn();
      await mpContextMiddleware(req, {} as Response, next);
      expect(next).toHaveBeenCalledWith();
    }

    expect(repo.findByCode).toHaveBeenCalledTimes(1);
  });

  it("x-device-id con formato de Posnet → queda en el contexto", async () => {
    const req = makeReq({ "x-device-id": "PAX_A910__SMARTPOS1493600985" });
    const next = vi.fn();

    await mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext?.deviceId).toBe("PAX_A910__SMARTPOS1493600985");
  });

  it.each(["tiene espacios", "raro$%&", "a".repeat(81)])(
    "x-device-id inválido (%s) → 400 BadRequest",
    async (bad) => {
      const req = makeReq({ "x-device-id": bad });
      const next = vi.fn();

      await mpContextMiddleware(req, {} as Response, next);

      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequest);
      expect(req.mpContext).toBeUndefined();
    },
  );
});
