import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "@/types/domain";

export type { Role };

export const COOKIE_NAME = "cocktrail_session";

const SECRET =
  process.env.COCKTRAIL_AUTH_SECRET ??
  "demo-secret-do-not-deploy-as-is";

const TTL_MS = 12 * 60 * 60 * 1000; // 12h: una noche cubre con margen

// Las credenciales por default son admin/admin y barman/barman para el demo.
// Override vía env vars si querés cambiarlas sin tocar código.
const ADMIN_USER = process.env.COCKTRAIL_ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.COCKTRAIL_ADMIN_PASS ?? "admin";
const BARMAN_USER = process.env.COCKTRAIL_BARMAN_USER ?? "barman";
const BARMAN_PASS = process.env.COCKTRAIL_BARMAN_PASS ?? "barman";

const USERS: Record<string, { password: string; role: Role }> = {
  [ADMIN_USER]: { password: ADMIN_PASS, role: "admin" },
  [BARMAN_USER]: { password: BARMAN_PASS, role: "barman" },
};

export type AuthenticatedUser = {
  username: string;
  role: Role;
};

export function authenticate(
  username: string,
  password: string,
): AuthenticatedUser | null {
  const u = USERS[username];
  if (!u || u.password !== password) return null;
  return { username, role: u.role };
}

export type SignedCookie = {
  value: string;
  maxAgeSeconds: number;
};

export function signSession(role: Role): SignedCookie {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${role}.${expiresAt}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex");
  return {
    value: `${payload}.${sig}`,
    maxAgeSeconds: Math.floor(TTL_MS / 1000),
  };
}

export type Session = {
  role: Role;
  expiresAt: number;
};

const ROLES = new Set<Role>(["admin", "barman"]);

export function verifySession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [role, expRaw, sig] = parts;
  if (!ROLES.has(role as Role)) return null;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const expected = createHmac("sha256", SECRET)
    .update(`${role}.${expRaw}`)
    .digest("hex");

  if (sig.length !== expected.length) return null;
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { role: role as Role, expiresAt };
}

/**
 * Construye el header `Set-Cookie` para el browser.
 * No incluye `Secure` porque la demo corre por HTTP en LAN.
 */
export function buildSessionCookie(role: Role): string {
  const { value, maxAgeSeconds } = signSession(role);
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function buildClearCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
