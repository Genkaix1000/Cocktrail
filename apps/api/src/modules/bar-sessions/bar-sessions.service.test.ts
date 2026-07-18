import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BarsRepository, Bar } from "../mercadopago/bars.repository.js";
import type {
  BarSession,
  BarSessionsRepository,
} from "./bar-sessions.repository.js";
import {
  BAR_SESSION_TTL_MS,
  BarSessionsService,
  barSessionUserId,
} from "./bar-sessions.service.js";

const NOW = Date.parse("2026-07-17T23:00:00.000Z");

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    id: "bar-1",
    name: "Caja VIP",
    code: "BARRA-01",
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
    };
    service = new BarSessionsService(repo, barsRepo, () => NOW);
  });

  it("genera identidades distintas para cada cajero", () => {
    expect(barSessionUserId("caja", "caja")).toBe("caja:caja");
    expect(barSessionUserId("marina", "caja")).toBe("caja:marina");
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

    const result = await service.listOptions("caja:ana");

    expect(result.currentSession).toEqual(own);
    expect(result.boxes.map((box) => [box.name, box.status])).toEqual([
      ["Caja VIP", "mine"],
      ["Caja Terraza", "occupied"],
      ["Caja General", "available"],
    ]);
    expect(result.boxes[1]?.session?.username).toBe("bruno");
  });

  it("no abandona la sesión actual si la caja elegida está ocupada", async () => {
    const occupied = makeSession({
      userId: "caja:bruno",
      username: "bruno",
    });
    vi.mocked(repo.findByBarId).mockResolvedValue(occupied);

    const result = await service.join("bar-1", "caja:ana", "ana", "caja");

    expect(result).toMatchObject({
      joined: false,
      occupied: true,
      connectedUser: "bruno",
    });
    expect(repo.deleteByUserId).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("reutiliza de forma idempotente la sesión propia", async () => {
    const own = makeSession();
    const refreshed = makeSession({ lastSeenAt: new Date(NOW).toISOString() });
    vi.mocked(repo.findByBarId).mockResolvedValue(own);
    vi.mocked(repo.touchByUserId).mockResolvedValue(refreshed);

    const result = await service.join("bar-1", own.userId, own.username, "caja");

    expect(result).toEqual({ joined: true, session: refreshed });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("crea una sesión libre y limpia antes las expiradas", async () => {
    vi.mocked(repo.findByBarId).mockResolvedValue(null);
    vi.mocked(repo.findByUserId).mockResolvedValue(null);

    const result = await service.join("bar-1", "caja:ana", "ana", "caja");

    expect(result.joined).toBe(true);
    expect(repo.deleteExpired).toHaveBeenCalledWith(
      new Date(NOW - BAR_SESSION_TTL_MS).toISOString(),
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        barId: "bar-1",
        userId: "caja:ana",
        username: "ana",
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

    const result = await service.join("bar-1", "caja:ana", "ana", "caja");

    expect(result).toMatchObject({
      joined: false,
      occupied: true,
      connectedUser: "bruno",
    });
  });

  it("heartbeat renueva una sesión activa", async () => {
    const refreshed = makeSession({ lastSeenAt: new Date(NOW).toISOString() });
    vi.mocked(repo.touchByUserId).mockResolvedValue(refreshed);

    await expect(service.heartbeat("caja:ana")).resolves.toEqual(refreshed);
  });

  it("leave solo elimina la sesión del usuario actual", async () => {
    const own = makeSession();
    vi.mocked(repo.findByUserId).mockResolvedValue(own);

    await expect(service.leave(own.userId)).resolves.toEqual(own);
    expect(repo.deleteByUserId).toHaveBeenCalledWith(own.userId);
    expect(repo.deleteByBarId).not.toHaveBeenCalled();
  });
});
