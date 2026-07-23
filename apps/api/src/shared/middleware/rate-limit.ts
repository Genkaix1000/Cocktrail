import { rateLimit } from "express-rate-limit";

function limiter(windowMs: number, max: number, message: string) {
  return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: message } });
}

const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export const generalLimiter = limiter(15 * 60 * 1000, isDev ? 10000 : 600, "Demasiadas solicitudes. Intentá de nuevo en unos minutos.");
export const loginLimiter = limiter(15 * 60 * 1000, 1000, "Demasiados intentos de login.");
export const orderLimiter = limiter(60 * 1000, isDev ? 1000 : 15, "Demasiados pedidos creados. Intentá de nuevo en un minuto.");
export const ticketLimiter = limiter(60 * 1000, isDev ? 1000 : 45, "Demasiados escaneos de tickets. Intentá de nuevo en un minuto.");
export const systemStatusLimiter = limiter(60 * 1000, 10, "Demasiadas comprobaciones de estado. Esperá un minuto.");
