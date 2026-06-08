import { rateLimit } from "express-rate-limit";

const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

// General: 10000 req / 15 min en dev, 600 req / 15 min en prod por IP
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intentá de nuevo en unos minutos." },
});

// Login: Captcha handles brute force, keep limiter generous
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de login." },
});

// Creación de pedidos: 15 / min por IP (anti-spam)
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos creados. Intentá de nuevo en un minuto." },
});

// Canje de tickets: 45 scans / min por IP (anti-replay rápido)
export const ticketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados escaneos de tickets. Intentá de nuevo en un minuto." },
});

