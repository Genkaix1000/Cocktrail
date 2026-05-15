import { BadRequest, Conflict, NotFound } from "./errors";

type Handler = () => Promise<Response> | Response;

/**
 * Envoltorio de error → HTTP status para los route handlers.
 * Convierte excepciones tipadas (BadRequest/NotFound/Conflict) y SyntaxError de JSON.parse
 * en respuestas con código HTTP correcto. Cualquier otra cosa cae a 500 con log.
 */
export async function handleErrors(handler: Handler): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof BadRequest) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof NotFound) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof Conflict) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof SyntaxError) {
      return Response.json({ error: "JSON inválido" }, { status: 400 });
    }
    console.error("[api] unexpected error:", err);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
