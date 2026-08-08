import type { NightEvent } from "@cocktrail/shared";
import type { EventsRepository } from "../events.repository.js";
import type { TestNightContext } from "./test-night-context.js";
import type { TestNightStore } from "./test-night-store.js";

/**
 * Decora el repo de noches: si la noche es de prueba, va al store en memoria; si no,
 * al de Supabase. Los servicios no se enteran.
 *
 * El ruteo es siempre por **id** contra `TestNightContext`, nunca por un flag global:
 * es lo que garantiza que una noche real no pueda terminar escrita en memoria.
 */
export class TestAwareEventsRepository implements EventsRepository {
  constructor(
    private readonly inner: EventsRepository,
    private readonly context: TestNightContext,
    private readonly store: TestNightStore,
  ) {}

  /** El store solo se toca si el contexto y la noche guardada coinciden. */
  private storedTestEvent(): NightEvent | null {
    const event = this.store.getEvent();
    if (!event) return null;
    return this.context.isTestNight(event.id) ? event : null;
  }

  private routesToStore(id: string): boolean {
    return this.context.isTestNight(id) && this.storedTestEvent()?.id === id;
  }

  async create(event: NightEvent): Promise<NightEvent> {
    if (!event.isTest) return this.inner.create(event);
    this.context.set(event.id);
    return this.store.setEvent(event);
  }

  async getActive(): Promise<NightEvent | null> {
    const test = this.storedTestEvent();
    if (test && test.status === "activo") return test;
    return this.inner.getActive();
  }

  async update(id: string, updates: Partial<NightEvent>): Promise<NightEvent> {
    if (!this.routesToStore(id)) return this.inner.update(id, updates);
    const updated = this.store.updateEvent(updates);
    if (!updated) throw new Error(`Noche de prueba ${id} no encontrada en memoria.`);
    return updated;
  }

  async findById(id: string): Promise<NightEvent | null> {
    if (this.routesToStore(id)) return this.storedTestEvent();
    return this.inner.findById(id);
  }

  /** SIEMPRE Supabase: una noche de prueba nunca entra al historial (criterio A4). */
  async listClosed(): Promise<NightEvent[]> {
    return this.inner.listClosed();
  }

  async delete(id: string): Promise<void> {
    if (this.routesToStore(id)) {
      this.context.clear();
      this.store.reset();
      return;
    }
    await this.inner.delete(id);
  }
}
