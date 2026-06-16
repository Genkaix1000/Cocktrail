import { randomUUID } from "node:crypto";
import type { Role } from "@cocktrail/shared";
import type {
  UsersRepository,
  SafeUser,
  UserPermissions,
} from "./users.repository.js";
import { hashPassword } from "./users.repository.js";
import { BadRequest, NotFound, Conflict } from "../../shared/errors/http-errors.js";

export class UsersService {
  constructor(private repo: UsersRepository) {}

  listUsers(): SafeUser[] {
    return this.repo.list();
  }

  createUser(input: {
    username: string;
    password: string;
    role: Role;
    permissions: UserPermissions;
  }): SafeUser {
    // Validar que no exista un usuario con el mismo nombre
    const existing = this.repo.findByUsername(input.username);
    if (existing) {
      throw new Conflict(`Ya existe un usuario con el nombre "${input.username}"`);
    }

    if (!input.username || input.username.trim().length === 0) {
      throw new BadRequest("El nombre de usuario es requerido");
    }

    const user = {
      id: randomUUID(),
      username: input.username.trim(),
      passwordHash: hashPassword(input.password),
      role: input.role,
      permissions: input.permissions,
      createdAt: Date.now(),
    };

    this.repo.create(user);

    // Retornar sin el hash
    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  updateUser(
    id: string,
    input: {
      username?: string;
      password?: string;
      role?: Role;
      permissions?: Partial<UserPermissions>;
    }
  ): SafeUser {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Usuario con id ${id} no encontrado`);
    }

    if (input.username && input.username !== existing.username) {
      const dup = this.repo.findByUsername(input.username);
      if (dup) {
        throw new Conflict(`Ya existe un usuario con el nombre "${input.username}"`);
      }
      existing.username = input.username.trim();
    }

    if (input.password) {
      existing.passwordHash = hashPassword(input.password);
    }

    if (input.role) {
      existing.role = input.role;
    }

    if (input.permissions) {
      existing.permissions = {
        ...existing.permissions,
        ...input.permissions,
      };
    }

    this.repo.update(existing);

    const { passwordHash: _ph, ...safe } = existing;
    return safe;
  }

  deleteUser(id: string): void {
    const existing = this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Usuario con id ${id} no encontrado`);
    }
    this.repo.delete(id);
  }
}
