import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@cocktrail/shared";
import { env } from "../../config/env.js";

export const COOKIE_NAME = "cocktrail_session";

const TTL_MS = 12 * 60 * 60 * 1000; // 12h

export type SignedCookie = {
  value: string;
  maxAgeSeconds: number;
};

let currentSessionVersion = 1;

export function setSessionVersion(v: number): void {
  currentSessionVersion = v;
}

export function getSessionVersion(): number {
  return currentSessionVersion;
}

export function signSession(username: string, role: Role): SignedCookie {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${role}.${username}.${expiresAt}.${currentSessionVersion}`;
  const sig = createHmac("sha256", env.AUTH_SECRET)
    .update(payload)
    .digest("hex");
  return {
    value: `${payload}.${sig}`,
    maxAgeSeconds: Math.floor(TTL_MS / 1000),
  };
}

export type Session = {
  role: Role;
  username: string;
  expiresAt: number;
};

const ROLES = new Set<Role>(["admin", "caja"]);

export function verifySession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 5) return null;
  const [role, username, expRaw, verRaw, sig] = parts;
  if (!ROLES.has(role as Role)) return null;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const version = Number(verRaw);
  if (!Number.isFinite(version) || version !== currentSessionVersion) return null;

  const expected = createHmac("sha256", env.AUTH_SECRET)
    .update(`${role}.${username}.${expRaw}.${verRaw}`)
    .digest("hex");

  if (sig.length !== expected.length) return null;
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { role: role as Role, username, expiresAt };
}

// SameSite=Lax (no Strict) a propósito: la vuelta del OAuth de MP es una
// navegación top-level cross-site (MP → Edge Function → redirect a /admin);
// con Strict el browser no mandaría la cookie y el admin aterrizaría
// deslogueado en /admin?linked=true.
export function buildSessionCookie(username: string, role: Role): string {
  const { value, maxAgeSeconds } = signSession(username, role);
  const secure = env.NODE_ENV === "production" ? "Secure; " : "";
  return `${COOKIE_NAME}=${value}; HttpOnly; ${secure}Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildClearCookie(): string {
  const secure = env.NODE_ENV === "production" ? "Secure; " : "";
  return `${COOKIE_NAME}=; HttpOnly; ${secure}Path=/; SameSite=Lax; Max-Age=0`;
}
