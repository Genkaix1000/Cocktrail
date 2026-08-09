import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BarsRepository, Bar } from "../mercadopago/bars.repository.js";
import type {
  BarSession,
  BarSessionsRepository,
} from "./bar-sessions.repository.js";
import {
  BAR_SESSION_TTL_MS,
  BarSessionsService,
  type AuthenticatedUser,
} from "./bar-sessions.service.js";

const NOW = Date.parse("2026-07-17T23:00:00.000Z");

const ANA: AuthenticatedUser = { username: "ana", role: "caja" };

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    id: "bar-1",
    name: "Caja VIP",
    code: "BARRA-01",
    enabled: true,
    createdAt: "2026-07-17T20:00:00.000Z",
    ...overrides,
  };
}

function makeSession(overrides: Partial<BarSession> = {}): BarSession {
  return {
    id: "session-1",
    barId: "bar-1",
    userId: "caja:ana",
    username: "ana",
    role: "caja",
    connectedAt: "2026-07-17T22:55:00.000Z",
    lastSeenAt: "2026-07-17T22:59:30.000Z",
    ...overrides,
  };
}

describe("BarSessionsService", () => {
  let repo: BarSessionsRepository;
  let barsRepo: BarsRepository;
  let service: BarSessionsService;

  beforeEach(() => {
    repo = {
      findByBarId: vi.fn(),
      findByUserId: vi.fn(),
      listAll: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation(async (input) =>
        makeSession({
          barId: input.barId,
          userId: input.userId,
          username: input.username,
          role: input.role,
          lastSeenAt: input.lastSeenAt,
        }),
      ),
      deleteByBarId: vi.fn(),
      deleteByUserId: vi.fn(),
      deleteExpired: vi.fn(),
      touchByUserId: vi.fn(),
    };
    barsRepo = {
      findByCode: vi.fn(),
      findById: vi.fn().mockResolvedValue(makeBar()),
      listAll: vi.fn().mockResolvedValue([makeBar()]),
      findOrCreateByCode: vi.fn(),
      setEnabled: vi.fn(async (id, enabled) => makeBar({ id, enabled })),
    };
    service = new BarSessionsService(repo, barsRepo, () => NOW);
  });

  it("la identidad deriva de la sesión autenticada, sin deviceId de pestaña (D6)", () => {
    // Mismo usuario, cualquier pestaña/navegador → SIEMPRE la misma identidad.
    expect(service.identityFor({ username: "caja", role: "caja" })).toBe("caja:caja");
    expect(service.identityFor({ username: "marina", role: "caja" })).toBe("caja:marina");
    // Usuarios distintos (o roles distintos) → identidades distintas.
    expect(service.identityFor({ username: "caja", role: "caja" })).not.toBe(
      service.identityFor({ username: "marina", role: "caja" }),
    );
    expect(service.identityFor({ username: "manu", role: "admin" })).not.toBe(
      service.identityFor({ username: "manu", role: "caja" }),
    );
  });

  it("lista cajas disponibles, ocupadas y la sesión propia", async () => {
    const own = makeSession();
    const occupied = makeSession({
      id: "session-2",
      barId: "bar-2",
      userId: "caja:bruno",
      username: "bruno",
    });
    vi.mocked(barsRepo.listAll).mockResolvedValue([
      makeBar(),
      makeBar({ id: "bar-2", name: "Caja Terraza", code: "BARRA-02" }),
      makeBar({ id: "bar-3", name: "Caja General", code: "BARRA-03" }),
    ]);
    vi.mocked(repo.listAll).mockResolvedValue([own, occupied]);
    vi.mocked(repo.findByUserId).mockResolvedValue(own);

    const result = await service.listOptions(ANA);

    expect(repo.findByUserId).toHaveBeenCalledWith("caja:ana");
    expect(result.currentSession).toEqual(own);
    expect(result.boxes.map((box) => [box.name, box.status])).toEqual([
      ["Caja VIP", "mine"],
      ["Caja Terraza", "occupied"],
      ["Caja General", "available"],
    ]);
    expect(result.boxes[1]?.session?.username).toBe("bruno");
  });

  it("listOptions omite barras deshabilitadas", async () => {
    vi.mocked(barsRepo.listAll).mockResolvedValue([
      makeBar(),
      makeBar({ id: "bar-off", name: "Portátil", code: "PORTATIL", enabled: false }),
    ]);
    const result = await service.listOptions(ANA);
    expect(result.boxes.map((b) => b.code)).toEqual(["BARRA-01"]);
  });

  it("setBarEnabled(false) actualiza y echa la sesión de esa barra", async () => {
    const session = makeSession();
    vi.mocked(repo.findByBarId).mockResolvedValue(session);
    const result = await service.setBarEnabled("bar-1", false);
    expect(barsRepo.setEnabled).toHaveBeenCalledWith("bar-1", false);
    expect(repo.deleteByBarId).toHaveBeenCalledWith("bar-1");
    expect(result.ejected).toEqual(session);
  });

  it("no abandona la sesión actual si la caja elegida está ocupada", async () => {
    const occupied = makeSession({
      userId: "caja:bruno",
      username: "bruno",
    });
    vi.mocked(repo.findByBarId).mockResolvedValue(occupied);

    const result = await service.join("bar-1", ANA);

    expect(result).toMatchObject({
      joined: false,
      occupied: true,
      connectedUser: "bruno",
    });
    expect(repo.deleteByUserId).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("reutiliza de forma idempotente la sesión propia (reentrar desde otra pestaña)", async () => {
    const own = makeSession();
    const refreshed = makeSession({ lastSeenAt: new Date(NOW).toISOString() });
    vi.mocked(repo.findByBarId).mockResolvedValue(own);
    vi.mocked(repo.touchByUserId).mockResolvedValue(refreshed);

    // Una pestaña nueva ya no es "otra persona": la identidad es la misma
    // y el join devuelve la propia caja.
    const result = await service.join("bar-1", ANA);

    expect(result).toEqual({ joined: true, session: refreshed });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("crea una sesión libre y limpia antes las expiradas", async () => {
    vi.mocked(repo.findByBarId).mockResolvedValue(null);
    vi.mocked(repo.findByUserId).mockResolvedValue(null);

    const result = await service.join("bar-1", ANA);

    expect(result.joined).toBe(true);
    expect(repo.deleteExpired).toHaveBeenCalledWith(
      new Date(NOW - BAR_SESSION_TTL_MS).toISOString(),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        barId: "bar-1",
        userId: "caja:ana",
        username: "ana",
        role: "caja",
        lastSeenAt: new Date(NOW).toISOString(),
      }),
    );
  });

  it("la restricción única resuelve dos joins concurrentes", async () => {
    const winner = makeSession({
      userId: "caja:bruno",
      username: "bruno",
    });
    vi.mocked(repo.findByBarId)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    vi.mocked(repo.findByUserId).mockResolvedValue(null);
    vi.mocked(repo.create).mockRejectedValue({ code: "23505" });

    const result = await service.join("bar-1", ANA);

    expect(result).toMatchObject({
      joined: false,
      occupied: true,
      connectedUser: "bruno",
    });
  });

  it("heartbeat renueva una sesión activa", async () => {
    const refreshed = makeSession({ lastSeenAt: new Date(NOW).toISOString() });
    vi.mocked(repo.touchByUserId).mockResolvedValue(refreshed);

    await expect(service.heartbeat(ANA)).resolves.toEqual(refreshed);
    expect(repo.touchByUserId).toHaveBeenCalledWith("caja:ana");
  });

  it("leave (logout incluido) libera la caja del usuario autenticado", async () => {
    const own = makeSession();
    vi.mocked(repo.findByUserId).mockResolvedValue(own);

    await expect(service.leave(ANA)).resolves.toEqual(own);
    expect(repo.findByUserId).toHaveBeenCalledWith("caja:ana");
    expect(repo.deleteByUserId).toHaveBeenCalledWith("caja:ana");
    expect(repo.deleteByBarId).not.toHaveBeenCalled();
  });
});
