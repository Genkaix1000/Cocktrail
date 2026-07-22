import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { mpContextMiddleware } from "./mp-context.middleware.js";
import { env } from "../../config/env.js";
import { BadRequest, Forbidden } from "../../shared/errors/http-errors.js";

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe("mpContextMiddleware (A12 mínimo)", () => {
  it("sin headers → contexto con la barra default de la instalación", () => {
    const req = makeReq();
    const next = vi.fn();

    mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext).toEqual({ barId: env.BAR_CODE });
  });

  it("x-bar-id coincidente con BAR_CODE → pasa", () => {
    const req = makeReq({ "x-bar-id": env.BAR_CODE });
    const next = vi.fn();

    mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext?.barId).toBe(env.BAR_CODE);
  });

  it("x-bar-id de otra barra → 403 Forbidden (el header no es autoritativo)", () => {
    const req = makeReq({ "x-bar-id": "BARRA-99" });
    const next = vi.fn();

    mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Forbidden);
    expect((err as Error).message).toContain("BARRA-99");
    expect(req.mpContext).toBeUndefined();
  });

  it("x-device-id con formato de Posnet → queda en el contexto", () => {
    const req = makeReq({ "x-device-id": "PAX_A910__SMARTPOS1493600985" });
    const next = vi.fn();

    mpContextMiddleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.mpContext?.deviceId).toBe("PAX_A910__SMARTPOS1493600985");
  });

  it.each(["tiene espacios", "raro$%&", "a".repeat(81)])(
    "x-device-id inválido (%s) → 400 BadRequest",
    (bad) => {
      const req = makeReq({ "x-device-id": bad });
      const next = vi.fn();

      mpContextMiddleware(req, {} as Response, next);

      expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequest);
      expect(req.mpContext).toBeUndefined();
    },
  );
});
