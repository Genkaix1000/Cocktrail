import { Router } from "express";
import { subscribe, type DomainEvent } from "../../shared/sse/sse-manager.js";

export function createSSEController(): Router {
  const router = Router();

  // GET /api/events — SSE stream
  router.get("/", (req, res) => {
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

    // Cleanup cuando el cliente cierra la conexión
    req.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  return router;
}
