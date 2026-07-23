import { Conflict, NotFound } from "../../shared/errors/http-errors.js";
import type { BarsRepository } from "../mercadopago/bars.repository.js";
import type { BarSessionsRepository, BarSession } from "./bar-sessions.repository.js";

export const BAR_SESSION_TTL_MS = 2 * 60 * 1000;

/**
 * D6: la identidad de la sesión de caja deriva de la sesión autenticada
 * (rol + usuario), no del navegador. Sin deviceId por pestaña: reentrar
 * desde cualquier pestaña devuelve la propia caja, y el logout la libera
 * de verdad. El TTL queda solo como red de seguridad (corte de luz).
 */
export type AuthenticatedUser = { username: string; role: "caja" | "admin" };

export type JoinResult = {
  joined: true;
  session: BarSession;
} | {
  joined: false;
  occupied: true;
  connectedUser: string;
  connectedAt: string;
};

export type BarSessionOption = {
  barId: string;
  name: string;
  code: string | null;
  status: "available" | "occupied" | "mine";
  session: Pick<BarSession, "username" | "connectedAt"> | null;
};

export type BarSessionOptions = {
  boxes: BarSessionOption[];
  currentSession: BarSession | null;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export class BarSessionsService {
  constructor(
    private readonly repo: BarSessionsRepository,
    private readonly barsRepo: BarsRepository,
    private readonly now: () => number = Date.now,
  ) {}

  /** Identidad estable "rol:username" (D6). También cubre los usuarios fallback de .env. */
  identityFor(user: AuthenticatedUser): string {
    return `${user.role}:${user.username}`;
  }

  async join(barId: string, user: AuthenticatedUser): Promise<JoinResult> {
    const userId = this.identityFor(user);
    await this.removeExpired();

    const bar = await this.barsRepo.findById(barId);
    if (!bar) {
      throw new NotFound("La caja seleccionada no existe.");
    }

    const barSession = await this.repo.findByBarId(barId);
    if (barSession) {
      if (barSession.userId === userId) {
        const refreshed = await this.repo.touchByUserId(userId);
        return { joined: true, session: refreshed ?? barSession };
      }
      return {
        joined: false,
        occupied: true,
        connectedUser: barSession.username,
        connectedAt: barSession.connectedAt,
      };
    }

    const userSession = await this.repo.findByUserId(userId);
    if (userSession) await this.repo.deleteByUserId(userId);

    try {
      const session = await this.repo.create({
        barId,
        userId,
        username: user.username,
        role: user.role,
        lastSeenAt: new Date(this.now()).toISOString(),
      });
      return { joined: true, session };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // La restricción UNIQUE(bar_id) resuelve de forma atómica dos joins
      // concurrentes. Informar quién ganó la carrera.
      const winner = await this.repo.findByBarId(barId);
      if (winner) {
        return {
          joined: false,
          occupied: true,
          connectedUser: winner.username,
          connectedAt: winner.connectedAt,
        };
      }
      throw error;
    }
  }

  async leave(user: AuthenticatedUser): Promise<BarSession | null> {
    const userId = this.identityFor(user);
    const session = await this.repo.findByUserId(userId);
    if (!session) return null;
    await this.repo.deleteByUserId(userId);
    return session;
  }

  async forceLogout(barId: string): Promise<BarSession | null> {
    const session = await this.repo.findByBarId(barId);
    if (session) {
      await this.repo.deleteByBarId(barId);
    }
    return session;
  }

  async listAll(): Promise<BarSession[]> {
    await this.removeExpired();
    return this.repo.listAll();
  }

  async listOptions(user: AuthenticatedUser): Promise<BarSessionOptions> {
    const userId = this.identityFor(user);
    await this.removeExpired();
    const [bars, sessions, currentSession] = await Promise.all([
      this.barsRepo.listAll(),
      this.repo.listAll(),
      this.repo.findByUserId(userId),
    ]);
    const byBar = new Map(sessions.map((session) => [session.barId, session]));

    return {
      boxes: bars.map((bar) => {
        const session = byBar.get(bar.id) ?? null;
        return {
          barId: bar.id,
          name: bar.name?.trim() || bar.code?.trim() || "Caja sin nombre",
          code: bar.code,
          status: !session
            ? "available"
            : session.userId === userId
              ? "mine"
              : "occupied",
          session: session
            ? { username: session.username, connectedAt: session.connectedAt }
            : null,
        };
      }),
      currentSession,
    };
  }

  async heartbeat(user: AuthenticatedUser): Promise<BarSession> {
    await this.removeExpired();
    const session = await this.repo.touchByUserId(this.identityFor(user));
    if (!session) {
      throw new Conflict("La sesión de caja ya no está activa.", "BAR_SESSION_EXPIRED");
    }
    return session;
  }

  private async removeExpired(): Promise<void> {
    const cutoff = new Date(this.now() - BAR_SESSION_TTL_MS).toISOString();
    await this.repo.deleteExpired(cutoff);
  }
}
