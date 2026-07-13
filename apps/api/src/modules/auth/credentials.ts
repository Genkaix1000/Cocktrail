import { createHash } from "node:crypto";
import type { Role } from "@cocktrail/shared";
import { env } from "../../config/env.js";
import type { UsersRepository } from "../users/users.repository.js";

const USERS: Record<string, { password: string; role: Role }> = {
  [env.ADMIN_USER]: { password: env.ADMIN_PASS, role: "admin" },
  [env.CAJA_USER]: { password: env.CAJA_PASS, role: "caja" },
  [env.BARMAN_USER]: { password: env.BARMAN_PASS, role: "barman" },
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
