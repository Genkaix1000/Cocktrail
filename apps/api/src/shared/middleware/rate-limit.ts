import { rateLimit, ipKeyGenerator } from "express-rate-limit";

function limiter(windowMs: number, max: number, message: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    // CF+Render: req.ip con trust proxy:1 ve el hop de Render, no el cliente.
    // CF-Connecting-IP es la IP real; fallback a req.ip (LAN/dev).
    keyGenerator: (req) => {
      const cf = req.headers["cf-connecting-ip"];
      const ip = (typeof cf === "string" && cf) || req.ip || "unknown";
      return ipKeyGenerator(ip);
    },
  });
}

const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export const generalLimiter = limiter(15 * 60 * 1000, isDev ? 10000 : 600, "Demasiadas solicitudes. Intentá de nuevo en unos minutos.");
// Expuesto a internet, 1000 intentos por ventana permitían probar ~96.000
// contraseñas por día desde una sola IP. Con dos usuarios reales, 20 alcanza
// de sobra para tolerar errores de tipeo.
export const loginLimiter = limiter(15 * 60 * 1000, isDev ? 1000 : 20, "Demasiados intentos de login.");
export const orderLimiter = limiter(60 * 1000, isDev ? 1000 : 15, "Demasiados pedidos creados. Intentá de nuevo en un minuto.");
export const ticketLimiter = limiter(60 * 1000, isDev ? 1000 : 45, "Demasiados escaneos de tickets. Intentá de nuevo en un minuto.");
