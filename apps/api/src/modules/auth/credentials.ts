import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Role } from "@cocktrail/shared";
import { env } from "../../config/env.js";
import type { UsersRepository } from "../users/users.repository.js";

const USERS: Record<string, { password: string; role: Role }> = {
  [env.ADMIN_USER]: { password: env.ADMIN_PASS, role: "admin" },
  [env.CAJA_USER]: { password: env.CAJA_PASS, role: "caja" },
};

export type AuthenticatedUser = {
  username: string;
  role: Role;
};

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LEN);
  const derived = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function isLegacySha256(hash: string): boolean {
  return !hash.startsWith("scrypt$") && /^[a-f0-9]{64}$/.test(hash);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacySha256(stored)) {
    const legacy = createHash("sha256").update(password).digest("hex");
    return legacy === stored;
  }
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64");
  const hash = Buffer.from(parts[2]!, "base64");
  const derived = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, SCRYPT_KEYLEN, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
  return timingSafeEqual(derived, hash);
}

export type AuthResult = {
  user: AuthenticatedUser;
  /** true si el password se verificó con el hash legado y debe re-hashearse. */
  migrated?: boolean;
};

export async function authenticate(
  username: string,
  password: string,
  usersRepo?: UsersRepository,
): Promise<AuthResult | null> {
  // 1. Database users
  if (usersRepo) {
    const dbUser = await usersRepo.findByUsername(username);
    if (dbUser) {
      const valid = await verifyPassword(password, dbUser.passwordHash);
      if (valid) {
        const migrated = isLegacySha256(dbUser.passwordHash);
        return { user: { username: dbUser.username, role: dbUser.role }, migrated };
      }
    }
  }

  // 2. Fallback system users (env vars — comparación timing-safe).
  // Estos usuarios solo existen en dev (env.ts bloquea los defaults en prod).
  const u = USERS[username];
  if (u) {
    const expected = Buffer.from(u.password, "utf8");
    const actual = Buffer.from(password, "utf8");
    // timingSafeEqual exige misma longitud — el padding evita leakear el largo.
    const maxLen = Math.max(expected.length, actual.length);
    const a = Buffer.alloc(maxLen);
    const b = Buffer.alloc(maxLen);
    expected.copy(a);
    actual.copy(b);
    if (timingSafeEqual(a, b) && expected.length === actual.length) {
      return { user: { username, role: u.role } };
    }
  }

  return null;
}

export { hashPassword };
