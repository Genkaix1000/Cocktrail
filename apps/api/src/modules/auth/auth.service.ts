import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type { Role } from "@cocktrail/shared";
import { env } from "../../config/env.js";
import type { UsersRepository } from "../users/users.repository.js";

export const COOKIE_NAME = "cocktrail_session";

const TTL_MS = 12 * 60 * 60 * 1000; // 12h

const USERS: Record<string, { password: string; role: Role }> = {
  [env.ADMIN_USER]: { password: env.ADMIN_PASS, role: "admin" },
  [env.CAJA_USER]: { password: env.CAJA_PASS, role: "caja" },
  [env.BARMAN_USER]: { password: env.BARMAN_PASS, role: "barman" },
  cajavip: { password: "cajavip", role: "caja" },
};

export type AuthenticatedUser = {
  username: string;
  role: Role;
};

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export async function authenticate(
  username: string,
  password: string,
  usersRepo?: UsersRepository,
): Promise<AuthenticatedUser | null> {
  // 1. Check database users if repo is provided
  if (usersRepo) {
    const dbUser = await usersRepo.findByUsername(username);
    if (dbUser) {
      const inputHash = hashPassword(password);
      if (dbUser.passwordHash === inputHash) {
        return { username: dbUser.username, role: dbUser.role };
      }
    }
  }

  // 2. Check fallback system users
  const u = USERS[username];
  if (u && u.password === password) {
    return { username, role: u.role };
  }

  return null;
}

export type SignedCookie = {
  value: string;
  maxAgeSeconds: number;
};

export function signSession(username: string, role: Role): SignedCookie {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${role}.${username}.${expiresAt}`;
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

const ROLES = new Set<Role>(["admin", "caja", "barman"]);

export function verifySession(raw: string | undefined): Session | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [role, username, expRaw, sig] = parts;
  if (!ROLES.has(role as Role)) return null;
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const expected = createHmac("sha256", env.AUTH_SECRET)
    .update(`${role}.${username}.${expRaw}`)
    .digest("hex");

  if (sig.length !== expected.length) return null;
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { role: role as Role, username, expiresAt };
}

export function buildSessionCookie(username: string, role: Role): string {
  const { value, maxAgeSeconds } = signSession(username, role);
  const secure = env.NODE_ENV === "production" ? "Secure; " : "";
  return `${COOKIE_NAME}=${value}; HttpOnly; ${secure}Path=/; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function buildClearCookie(): string {
  const secure = env.NODE_ENV === "production" ? "Secure; " : "";
  return `${COOKIE_NAME}=; HttpOnly; ${secure}Path=/; SameSite=Strict; Max-Age=0`;
}

// ── Captcha Registry ──

type CaptchaRecord = {
  failedAttempts: number;
  captchaQuestion?: string;
  captchaAnswer?: string;
};

const captchaRegistry = new Map<string, CaptchaRecord>();

export function getCaptchaInfo(ip: string): { required: boolean; question?: string } {
  const record = captchaRegistry.get(ip);
  if (record && record.failedAttempts >= 3) {
    if (!record.captchaQuestion) {
      generateCaptchaFor(ip);
    }
    const updated = captchaRegistry.get(ip)!;
    return { required: true, question: updated.captchaQuestion };
  }
  return { required: false };
}

export function generateCaptchaFor(ip: string): string {
  const num1 = Math.floor(Math.random() * 10) + 1;
  const num2 = Math.floor(Math.random() * 10) + 1;
  const question = `¿Cuánto es ${num1} + ${num2}?`;
  const answer = String(num1 + num2);

  const record = captchaRegistry.get(ip) || { failedAttempts: 0 };
  captchaRegistry.set(ip, {
    ...record,
    captchaQuestion: question,
    captchaAnswer: answer,
  });

  return question;
}

export function registerFailedAttempt(ip: string): { captchaRequired: boolean; captchaQuestion?: string } {
  const record = captchaRegistry.get(ip) || { failedAttempts: 0 };
  const newAttempts = record.failedAttempts + 1;
  
  captchaRegistry.set(ip, {
    ...record,
    failedAttempts: newAttempts,
  });

  if (newAttempts >= 3) {
    const question = generateCaptchaFor(ip);
    return { captchaRequired: true, captchaQuestion: question };
  }
  
  return { captchaRequired: false };
}

export function clearFailedAttempts(ip: string): void {
  captchaRegistry.delete(ip);
}

export function verifyCaptcha(ip: string, answer: string | undefined): boolean {
  const record = captchaRegistry.get(ip);
  if (!record || record.failedAttempts < 3) return true; // Captcha not required yet
  if (!answer) return false;
  return record.captchaAnswer === answer.trim();
}
