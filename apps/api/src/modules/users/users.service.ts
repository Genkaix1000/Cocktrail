import { randomUUID } from "node:crypto";
import type { Role } from "@cocktrail/shared";
import type {
  UsersRepository,
  SafeUser,
  StaffUser,
} from "./users.repository.js";
import { hashPassword } from "./users.repository.js";
import { BadRequest, NotFound, Conflict } from "../../shared/errors/http-errors.js";

const SYSTEM_USERS: SafeUser[] = [
  {
    id: "system-admin",
    username: "admin",
    role: "admin",
    createdAt: 1782229602710,
  },
  {
    id: "system-superadmin",
    username: "superadmin",
    role: "admin",
    createdAt: 1782229602710,
  },
  {
    id: "system-caja",
    username: "caja",
    role: "caja",
    createdAt: 1782229602710,
  },
];

const RESERVED_NAMES = ["admin", "caja", "superadmin"];

export class UsersService {
  constructor(private repo: UsersRepository) {}

  async listUsers(): Promise<SafeUser[]> {
    const dbUsers = await this.repo.list();
    const systemUsernames = new Set(SYSTEM_USERS.map(u => u.username));
    
    // Filter out db users that have system usernames to avoid duplicates
    const filteredDb = dbUsers.filter(u => !systemUsernames.has(u.username.toLowerCase()));
    
    return [...SYSTEM_USERS, ...filteredDb];
  }

  async createUser(input: {
    username: string;
    password: string;
    role: Role;
  }): Promise<SafeUser> {
    const cleanUsername = input.username.trim();
    if (RESERVED_NAMES.includes(cleanUsername.toLowerCase())) {
      throw new Conflict(`El nombre de usuario "${cleanUsername}" está reservado por el sistema.`);
    }

    if (!cleanUsername || cleanUsername.length === 0) {
      throw new BadRequest("El nombre de usuario es requerido.");
    }

    const existing = await this.repo.findByUsername(cleanUsername);
    if (existing) {
      throw new Conflict(`Ya existe un usuario con el nombre "${cleanUsername}"`);
    }

    const user: StaffUser = {
      id: randomUUID(),
      username: cleanUsername,
      passwordHash: hashPassword(input.password),
      role: input.role,
      createdAt: Date.now(),
    };

    await this.repo.create(user);

    const { passwordHash: _ph, ...safe } = user;
    return safe;
  }

  async updateUser(
    id: string,
    input: {
      username?: string;
      password?: string;
      role?: Role;
    }
  ): Promise<SafeUser> {
    if (id.startsWith("system-")) {
      throw new BadRequest("No se puede modificar un usuario del sistema");
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Usuario con id ${id} no encontrado`);
    }

    if (RESERVED_NAMES.includes(existing.username.toLowerCase())) {
      throw new BadRequest("No se puede modificar un usuario del sistema");
    }

    if (input.username && input.username !== existing.username) {
      const cleanUsername = input.username.trim();
      if (RESERVED_NAMES.includes(cleanUsername.toLowerCase())) {
        throw new Conflict(`El nombre de usuario "${cleanUsername}" está reservado por el sistema.`);
      }
      const dup = await this.repo.findByUsername(cleanUsername);
      if (dup) {
        throw new Conflict(`Ya existe un usuario con el nombre "${cleanUsername}"`);
      }
      existing.username = cleanUsername;
    }

    if (input.password) {
      existing.passwordHash = hashPassword(input.password);
    }

    if (input.role) {
      existing.role = input.role;
    }

    await this.repo.update(existing);

    const { passwordHash: _ph, ...safe } = existing;
    return safe;
  }

  async deleteUser(id: string): Promise<void> {
    if (id.startsWith("system-")) {
      throw new BadRequest("No se puede eliminar un usuario del sistema");
    }

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFound(`Usuario con id ${id} no encontrado`);
    }

    if (RESERVED_NAMES.includes(existing.username.toLowerCase())) {
      throw new BadRequest("No se puede eliminar un usuario del sistema");
    }

    await this.repo.delete(id);
  }
}
