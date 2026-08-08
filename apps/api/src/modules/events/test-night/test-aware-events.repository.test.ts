import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NightEvent } from "@cocktrail/shared";
import type { EventsRepository } from "../events.repository.js";
import { TestAwareEventsRepository } from "./test-aware-events.repository.js";
import { TestNightContext } from "./test-night-context.js";
import { TestNightStore } from "./test-night-store.js";

function makeInner(): EventsRepository {
  return {
    getActive: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (e: NightEvent) => e),
    update: vi.fn().mockImplementation(async (id: string, patch: Partial<NightEvent>) => ({
      id,
      status: "activo",
      startedAt: 1,
      orderCounter: 0,
      ...patch,
    })),
    findById: vi.fn().mockResolvedValue(null),
    listClosed: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventsRepository;
}

function makeEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "night-real",
    status: "activo",
    startedAt: 1_700_000_000_000,
    orderCounter: 0,
    keyword: "fernet",
    ...overrides,
  };
}

describe("TestAwareEventsRepository", () => {
  let inner: EventsRepository;
  let context: TestNightContext;
  let store: TestNightStore;
  let repo: TestAwareEventsRepository;

  beforeEach(() => {
    inner = makeInner();
    context = new TestNightContext();
    store = new TestNightStore();
    repo = new TestAwareEventsRepository(inner, context, store);
  });

  describe("noche real", () => {
    it("delega el create a Supabase y no toca el contexto", async () => {
      const event = makeEvent();
      await repo.create(event);

      expect(inner.create).toHaveBeenCalledWith(event);
      expect(context.getActiveId()).toBeNull();
      expect(store.getEvent()).toBeNull();
    });

    it("delega getActive/update/findById/delete a Supabase", async () => {
      vi.mocked(inner.getActive).mockResolvedValue(makeEvent());

      await repo.getActive();
      await repo.update("night-real", { orderCounter: 3 });
      await repo.findById("night-real");
      await repo.delete("night-real");

      expect(inner.getActive).toHaveBeenCalled();
      expect(inner.update).toHaveBeenCalledWith("night-real", { orderCounter: 3 });
      expect(inner.findById).toHaveBeenCalledWith("night-real");
      expect(inner.delete).toHaveBeenCalledWith("night-real");
    });
  });

  describe("noche de prueba", () => {
    beforeEach(async () => {
      await repo.create(makeEvent({ id: "night-test", isTest: true }));
    });

    it("create la guarda en memoria, setea el contexto y no toca Supabase", () => {
      expect(inner.create).not.toHaveBeenCalled();
      expect(context.getActiveId()).toBe("night-test");
      expect(store.getEvent()?.id).toBe("night-test");
    });

    it("getActive devuelve la de memoria sin consultar Supabase", async () => {
      const active = await repo.getActive();

      expect(active?.id).toBe("night-test");
      expect(active?.isTest).toBe(true);
      expect(inner.getActive).not.toHaveBeenCalled();
    });

    it("update/findById van al store", async () => {
      const updated = await repo.update("night-test", { orderCounter: 7 });
      expect(updated.orderCounter).toBe(7);
      expect((await repo.findById("night-test"))?.orderCounter).toBe(7);
      expect(inner.update).not.toHaveBeenCalled();
      expect(inner.findById).not.toHaveBeenCalled();
    });

    it("delete limpia contexto y store sin borrar nada en Supabase", async () => {
      await repo.delete("night-test");

      expect(inner.delete).not.toHaveBeenCalled();
      expect(context.getActiveId()).toBeNull();
      expect(store.getEvent()).toBeNull();
    });

    it("getActive vuelve a Supabase cuando la noche de prueba ya está cerrada", async () => {
      await repo.update("night-test", { status: "cerrado" });
      vi.mocked(inner.getActive).mockResolvedValue(null);

      expect(await repo.getActive()).toBeNull();
      expect(inner.getActive).toHaveBeenCalled();
    });

    it("listClosed SIEMPRE va a Supabase: la prueba nunca entra al historial", async () => {
      await repo.listClosed();

      expect(inner.listClosed).toHaveBeenCalled();
      expect(await repo.listClosed()).toEqual([]);
    });
  });

  // EL test crítico: si el contexto quedara pegado, una noche real NO puede terminar en memoria.
  describe("contexto pegado", () => {
    it("una noche nueva se escribe en Supabase aunque el contexto siga apuntando a una prueba", async () => {
      await repo.create(makeEvent({ id: "night-test", isTest: true }));
      // El cierre falló / nadie limpió: el contexto sigue vivo.
      expect(context.getActiveId()).toBe("night-test");

      const real = makeEvent({ id: "night-real-2" });
      await repo.create(real);
      await repo.update("night-real-2", { orderCounter: 1 });
      await repo.findById("night-real-2");
      await repo.delete("night-real-2");

      expect(inner.create).toHaveBeenCalledWith(real);
      expect(inner.update).toHaveBeenCalledWith("night-real-2", { orderCounter: 1 });
      expect(inner.findById).toHaveBeenCalledWith("night-real-2");
      expect(inner.delete).toHaveBeenCalledWith("night-real-2");
      // Y la noche real no se coló en el store de la prueba.
      expect(store.getEvent()?.id).toBe("night-test");
    });
  });
});
