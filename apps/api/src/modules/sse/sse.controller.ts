import { Router } from "express";
import { subscribe, type DomainEvent } from "../../shared/sse/sse-manager.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";

/** Límite de conexiones SSE concurrentes (todo el server). En un boliche con
 * 2-3 tablets + 1 admin, 20 es holgado; protege contra abuso autenticado. */
const MAX_SSE_CONNECTIONS = 20;
/** Timeout máximo de una conexión SSE (8h ≈ un turno de trabajo). Después de
 * este tiempo el cliente debe reconectarse — EventSource lo hace solo. */
const SSE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

let activeConnections = 0;

export function createSSEController(): Router {
  const router = Router();

  // GET /api/events — SSE stream. Con sesión válida: el stream lleva pedidos,
  // totales y movimientos de la noche; sin auth sería una filtración en vivo de
  // toda la operación. El EventSource del navegador manda la cookie porque va
  // al mismo origen.
  router.get("/", authMiddleware, requireRole("admin", "caja"), (req, res) => {
    if (activeConnections >= MAX_SSE_CONNECTIONS) {
      res.status(503).json({ error: "Demasiadas conexiones SSE activas" });
      return;
    }
    activeConnections++;

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Frame inicial
    res.write(`event: connected\ndata: {}\n\n`);

    const unsubscribe = subscribe((event: DomainEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    // Keep-alive ping cada 25s
    const ping = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 25000);

    // Timeout: cierra la conexión después de SSE_TIMEOUT_MS.
    // EventSource reconecta automáticamente.
    const timeout = setTimeout(() => {
      res.end();
    }, SSE_TIMEOUT_MS);

    // Cleanup cuando el cliente cierra la conexión
    req.on("close", () => {
      clearInterval(ping);
      clearTimeout(timeout);
      unsubscribe();
      activeConnections--;
    });
  });

  return router;
}
