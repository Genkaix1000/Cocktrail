import { type DomainEvent, subscribe } from "@/server/events";

// Stream SSE: no cachear, no buffer, never static.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream cerrado (cliente desconectado mid-write). Cleanup pasa por el abort listener.
        }
      };

      // Frame inicial — el cliente sabe que la conexión está viva.
      safeEnqueue(`event: connected\ndata: {}\n\n`);

      const unsubscribe = subscribe((event: DomainEvent) => {
        safeEnqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      // Keep-alive: comment frames cada 25s. Algunos proxies/load balancers cortan
      // conexiones idle a 30-60s; un comment es invisible para el EventSource.
      const ping = setInterval(() => safeEnqueue(`: ping\n\n`), 25000);

      // Cleanup cuando el cliente cierra la pestaña / desmonta el EventSource.
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Ya cerrado.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Disable buffering en proxies tipo nginx.
      "X-Accel-Buffering": "no",
    },
  });
}
