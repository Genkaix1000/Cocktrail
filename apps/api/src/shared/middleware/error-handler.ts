import type { Request, Response, NextFunction } from "express";
import {
  BadRequest,
  NotFound,
  Conflict,
  Unauthorized,
  Forbidden,
  UnprocessableEntity,
} from "../errors/http-errors.js";

/**
 * Error handler global de Express. Mapea excepciones tipadas a HTTP status codes.
 * Debe registrarse como ÚLTIMO middleware.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof BadRequest) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof Unauthorized) {
    res.status(401).json({ error: err.message });
    return;
  }
  if (err instanceof Forbidden) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof NotFound) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof UnprocessableEntity) {
    res.status(422).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  if (err instanceof Conflict) {
    res.status(409).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "JSON inválido" });
    return;
  }

  console.error("[api] unexpected error:", err);
  res.status(500).json({ error: "Error interno" });
}
