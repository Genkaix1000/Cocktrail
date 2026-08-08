import type { Order, OrderStatus } from "@cocktrail/shared";
import type { OrdersRepository } from "../../orders/orders.repository.js";
import type { TestNightContext } from "./test-night-context.js";
import type { TestNightStore } from "./test-night-store.js";

const NO_ACTIVOS: OrderStatus[] = ["entregado", "cancelado"];

/**
 * Decora el repo de pedidos. Las escrituras enrutan por `eventId` (una noche real jamás
 * matchea el id de la de prueba); las lecturas por id/token/key miran primero el store,
 * porque el caller no siempre tiene la noche a mano (ej. la reimpresión del ticket).
 */
export class TestAwareOrdersRepository implements OrdersRepository {
  constructor(
    private readonly inner: OrdersRepository,
    private readonly context: TestNightContext,
    private readonly store: TestNightStore,
  ) {}

  /** El store solo se consulta si el contexto sigue apuntando a la noche guardada. */
  private storeIsLive(): boolean {
    const event = this.store.getEvent();
    return event !== null && this.context.isTestNight(event.id);
  }

  private routesToStore(eventId: string): boolean {
    return this.storeIsLive() && this.context.isTestNight(eventId);
  }

  private fromStore(predicate: (order: Order) => boolean): Order | undefined {
    if (!this.storeIsLive()) return undefined;
    return this.store.findOrder(predicate);
  }

  async create(order: Order, eventId: string): Promise<Order> {
    if (!this.routesToStore(eventId)) return this.inner.create(order, eventId);
    return this.store.addOrder(order);
  }

  async findById(id: string): Promise<Order | undefined> {
    return this.fromStore((o) => o.id === id) ?? (await this.inner.findById(id));
  }

  async findByToken(token: string): Promise<Order | undefined> {
    return this.fromStore((o) => o.token === token) ?? (await this.inner.findByToken(token));
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<Order | undefined> {
    return (
      this.fromStore((o) => o.idempotencyKey === idempotencyKey) ??
      (await this.inner.findByIdempotencyKey(idempotencyKey))
    );
  }

  async findByMpOrderId(mpOrderId: string): Promise<Order | undefined> {
    return (
      this.fromStore((o) => o.paymentRecordId === mpOrderId) ??
      (await this.inner.findByMpOrderId(mpOrderId))
    );
  }

  async findActive(eventId: string): Promise<Order[]> {
    if (!this.routesToStore(eventId)) return this.inner.findActive(eventId);
    return this.store.listOrders().filter((o) => !NO_ACTIVOS.includes(o.status));
  }

  async listForEvent(eventId: string): Promise<Order[]> {
    if (!this.routesToStore(eventId)) return this.inner.listForEvent(eventId);
    return this.store.listOrders();
  }

  /** SIEMPRE Supabase: los pedidos de prueba no existen para el historial global. */
  async listAll(): Promise<Order[]> {
    return this.inner.listAll();
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    timestamps?: {
      readyAt?: number;
      deliveredAt?: number;
      cancelledAt?: number;
      cancelledBy?: string;
      deliveredBy?: string;
      deliveredByBar?: string;
      redeemMethod?: "scan" | "manual";
    },
    expectedStatus?: OrderStatus,
  ): Promise<Order | undefined> {
    const current = this.fromStore((o) => o.id === id);
    if (!current) return this.inner.updateStatus(id, status, timestamps, expectedStatus);

    // Mismo contrato que el UPDATE condicionado de Supabase: si la fila ya no está en
    // `expectedStatus`, no se escribe nada y se devuelve undefined.
    if (expectedStatus && current.status !== expectedStatus) return undefined;

    const updates: Partial<Order> = { status };
    if (timestamps?.readyAt) updates.readyAt = timestamps.readyAt;
    if (timestamps?.deliveredAt) updates.deliveredAt = timestamps.deliveredAt;
    if (timestamps?.cancelledAt) updates.cancelledAt = timestamps.cancelledAt;
    if (timestamps?.cancelledBy) updates.cancelledBy = timestamps.cancelledBy;
    if (timestamps?.deliveredBy) updates.deliveredBy = timestamps.deliveredBy;
    if (timestamps?.deliveredByBar) updates.deliveredByBar = timestamps.deliveredByBar;
    if (timestamps?.redeemMethod) updates.redeemMethod = timestamps.redeemMethod;

    return this.store.updateOrder(id, updates);
  }
}
