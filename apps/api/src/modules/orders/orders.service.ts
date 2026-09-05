import { randomBytes, randomUUID } from "node:crypto";
import type { CreateOrderResult, NewOrderInput, Order, OrderStatus, NightEvent, TicketContent } from "@cocktrail/shared";
import type { OrdersRepository } from "./orders.repository.js";
import type { DrinksRepository } from "../drinks/drinks.repository.js";
import type { VerifyPaymentFn, PaymentVerdict } from "./payment-verification.port.js";
import { BadRequest, Conflict, NotFound, UnprocessableEntity } from "../../shared/errors/http-errors.js";
import type { EmitFn } from "../../shared/sse/sse-manager.js";

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ["entregado", "cancelado"],
  // Cancelar entregado = anular del arqueo (sin reembolso MP; el dueño lo ve muted).
  entregado: ["cancelado"],
  cancelado: [],
};

function shortToken(): string {
  return randomBytes(4).toString("hex");
}

export type { CreateOrderResult } from "@cocktrail/shared";

export type OrdersServiceDeps = {
  ordersRepo: OrdersRepository;
  drinksRepo: DrinksRepository;
  getActiveEvent: () => Promise<NightEvent | null>;
  incrementOrderCounter: (eventId: string) => Promise<number>;
  emit: EmitFn;
  generateTicketCodeString?: (orderId: string) => string;
  saveTicket?: (orderId: string, code: string) => Promise<void>;
  /** Arma bytes ESC/POS (base64) + content estructurado. La impresión física es en el device de caja. */
  renderTicketPayload?: (order: Order, nightEvent: NightEvent) => Promise<{ ticketData: string; ticketContent: TicketContent }>;
  /** Puerto de verificación de pago — el adaptador (MP) lo cablea app.ts. */
  verifyPayment?: VerifyPaymentFn;
  /**
   * Guarda del runner fail-open: si las migraciones del cobro no aplicaron,
   * la venta no-efectivo se bloquea con un mensaje claro en vez de romper el
   * INSERT con un error incomprensible.
   */
  isPaymentSchemaReady?: () => boolean;
  /** Ghost mode global: cobro efímero sin persistir en registros. */
  isGhostMode?: () => Promise<boolean>;
};

export class OrdersService {
  constructor(private deps: OrdersServiceDeps) {}

  async createOrder(input: NewOrderInput, createdBy?: string): Promise<CreateOrderResult> {
    const { ordersRepo, drinksRepo, verifyPayment } = this.deps;

    // Replay (R20): mismo intento lógico → misma Order, sin doble registro.
    if (input.idempotencyKey) {
      const previous = await ordersRepo.findByIdempotencyKey(input.idempotencyKey);
      if (previous) return { ...previous, printed: false };
    }

    const event = await this.deps.getActiveEvent();
    if (!event || event.status !== "activo") {
      throw new Conflict("Todavía no se abrió la noche. Pedile al admin que la abra desde /admin para poder cobrar.");
    }
    if (input.items.length === 0) {
      throw new BadRequest("El pedido no tiene items.");
    }

    const items = [];
    for (const it of input.items) {
      const drink = await drinksRepo.findById(it.drinkId);
      if (!drink) throw new NotFound(`Drink ${it.drinkId} no existe.`);
      if (!drink.available) throw new Conflict(`${drink.name} no está disponible.`);
      if (it.qty <= 0) throw new BadRequest("Cantidad inválida.");
      items.push({
        drinkId: drink.id,
        name: drink.name,
        qty: it.qty,
        unitPrice: drink.price,
        subtotal: drink.price * it.qty,
      });
    }

    const total = items.reduce((sum, it) => sum + it.subtotal, 0);

    // La exigencia de prueba de pago cuelga del ORIGEN (createdBy sale de la
    // cookie, no del body) y del método — /carta ("Cliente") sigue igual.
    const esVentaDeCaja = Boolean(createdBy && createdBy !== "Cliente");
    const schemaReady = this.deps.isPaymentSchemaReady ? this.deps.isPaymentSchemaReady() : true;

    let verdict: PaymentVerdict = { result: "no_aplica" };
    if (esVentaDeCaja) {
      if (input.paymentMethod !== "efectivo" && input.paymentMethod !== "cortesia") {
        if (!schemaReady) {
          throw new Conflict(
            "El cobro con QR/Posnet está bloqueado: faltan aplicar migraciones de base (ver banner de /admin). El efectivo sigue funcionando.",
            "PAYMENT_SCHEMA_NOT_READY",
          );
        }
        if (!input.payment) {
          throw new UnprocessableEntity(
            "Falta la prueba de pago: una venta de caja con QR/Posnet solo se registra con el cobro confirmado (campo `payment`).",
            "PAYMENT_PROOF_REQUIRED",
          );
        }
        if (!verifyPayment) {
          throw new Conflict("La verificación de pagos no está configurada en el servidor.");
        }
      }
      if (verifyPayment && input.paymentMethod !== "cortesia") {
        const proofInput = input.payment
          ? { proof: input.payment, expectedAmount: total, method: input.paymentMethod }
          : { expectedAmount: total, method: input.paymentMethod };
        verdict = await verifyPayment(proofInput);
      }
      if (verdict.result === "rechazado") {
        // Sin Order, sin ticket, sin order.created (criterio D).
        throw new Conflict(
          `Cobro rechazado: ${verdict.reason}${verdict.detail ? ` (${verdict.detail})` : ""}. No se registró la venta.`,
          "PAYMENT_REJECTED",
        );
      }
      if (verdict.result === "indeterminado") {
        throw new Conflict(
          `No se pudo confirmar el cobro: ${verdict.reason} La venta NO se registró — verificá el cobro y reintentá desde la constancia.`,
          "PAYMENT_UNVERIFIED",
        );
      }
    }

    const ghostMode = this.deps.isGhostMode ? await this.deps.isGhostMode() : false;
    const displayNumber = ghostMode
      ? Math.floor(Math.random() * 9000) + 1000
      : await this.deps.incrementOrderCounter(event.id);

    const order: Order = {
      id: randomUUID(),
      token: shortToken(),
      displayNumber,
      items,
      total,
      paymentMethod: input.paymentMethod,
      status: "pendiente",
      createdAt: Date.now(),
      createdBy: createdBy || "Cliente",
    };
    if (input.idempotencyKey) order.idempotencyKey = input.idempotencyKey;
    if (verdict.result === "confirmado") {
      order.paymentStatus = "cobrado";
      order.paymentRef = verdict.providerPaymentId;
      order.paymentRecordId = verdict.proofRecordId;
    } else if (esVentaDeCaja && input.paymentMethod === "efectivo" && schemaReady) {
      // El escape del efectivo es irreductible: nadie verifica billetes server-side.
      order.paymentStatus = "cobrado";
    } else if (input.paymentMethod === "cortesia") {
      order.total = 0;
      order.isGift = true;
      order.paymentStatus = "cobrado";
    }
    // /carta ("Cliente"): sin paymentStatus → la DB aplica el default 'desconocido'.

    if (this.deps.generateTicketCodeString) {
      order.ticketCode = this.deps.generateTicketCodeString(order.id);
    }

    // Ghost: ticket efímero — imprime, no persiste orders/tickets/audit/SSE.
    if (ghostMode) {
      let ticketData: string | undefined;
      let ticketContent: TicketContent | undefined;
      if (this.deps.renderTicketPayload && esVentaDeCaja && (verdict.result === "no_aplica" || verdict.result === "confirmado")) {
        try {
          ({ ticketData, ticketContent } = await this.deps.renderTicketPayload(order, event));
        } catch {
          ticketData = undefined;
          ticketContent = undefined;
        }
      }
      return { ...order, printed: false, ticketData, ticketContent, ghost: true };
    }

    try {
      await ordersRepo.create(order, event.id);
    } catch (err) {
      // Carrera de replays (23505 en los UNIQUE parciales). PostgREST no expone
      // error.constraint, así que se distingue por cuál lookup encuentra al ganador.
      if ((err as { code?: string })?.code === "23505") {
        if (input.idempotencyKey) {
          const winner = await ordersRepo.findByIdempotencyKey(input.idempotencyKey);
          if (winner) return { ...winner, printed: false };
        }
        if (verdict.result === "confirmado") {
          // Cobro ya usado por otra venta: devolver esa Order, nunca duplicar.
          const winner = await ordersRepo.findByMpOrderId(verdict.proofRecordId);
          if (winner) return { ...winner, printed: false };
        }
      }
      throw err;
    }

    if (this.deps.saveTicket && order.ticketCode) {
      await this.deps.saveTicket(order.id, order.ticketCode);
    }

    let ticketData: string | undefined;
    let ticketContent: TicketContent | undefined;
    // El payload cuelga del veredicto (no_aplica = efectivo; confirmado = MP
    // verificado) — a esta altura los otros veredictos ya abortaron.
    // El device de caja imprime (USB o Bluetooth); el server solo arma el ticket.
    if (this.deps.renderTicketPayload && esVentaDeCaja && (verdict.result === "no_aplica" || verdict.result === "confirmado")) {
      try {
        ({ ticketData, ticketContent } = await this.deps.renderTicketPayload(order, event));
      } catch {
        // Si el render falla, la venta NO se cae: sale sin ticket, igual que siempre.
        ticketData = undefined;
        ticketContent = undefined;
      }
    }

    this.deps.emit({ type: "order.created", order });
    return { ...order, printed: false, ticketData, ticketContent };
  }

  async updateOrderStatus(
    id: string,
    status: OrderStatus,
    operator?: string,
    deliveryMeta?: { deliveredByBar?: string; redeemMethod?: "scan" | "manual" },
  ): Promise<Order> {
    const order = await this.deps.ordersRepo.findById(id);
    if (!order) throw new NotFound(`Order ${id} no existe.`);

    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      throw new Conflict(`Transición inválida: ${order.status} → ${status}.`);
    }

    const timestamps: {
      deliveredAt?: number;
      cancelledAt?: number;
      cancelledBy?: string;
      deliveredBy?: string;
      deliveredByBar?: string;
      redeemMethod?: "scan" | "manual";
    } = {};
    if (status === "entregado") {
      timestamps.deliveredAt = Date.now();
      timestamps.deliveredBy = operator || "desconocido";
      if (deliveryMeta?.deliveredByBar) timestamps.deliveredByBar = deliveryMeta.deliveredByBar;
      if (deliveryMeta?.redeemMethod) timestamps.redeemMethod = deliveryMeta.redeemMethod;
    }
    if (status === "cancelado") {
      timestamps.cancelledAt = Date.now();
      timestamps.cancelledBy = operator || "desconocido";
    }

    // `expectedStatus: order.status` hace el UPDATE atómico ante una transición concurrente
    // (ej. canje + cancelación del mismo pedido casi al mismo tiempo) — si otra request ya
    // cambió el status entre el findById de arriba y este UPDATE, la condición no matchea y
    // undefined nos avisa que perdimos la carrera, en vez de pisar el resultado del ganador.
    const updated = await this.deps.ordersRepo.updateStatus(id, status, timestamps, order.status);
    if (!updated) {
      const current = await this.deps.ordersRepo.findById(id);
      throw new Conflict(
        `Transición inválida: ${current?.status ?? "desconocido"} → ${status} (el pedido cambió de estado durante la operación).`,
      );
    }
    this.deps.emit({ type: "order.updated", order: updated });
    return updated;
  }

  /**
   * Intención "entregar este pedido" para el flujo de canje de ticket (/barra), sin que el
   * caller (TicketsService) necesite conocer el literal "entregado" ni la máquina de estados
   * interna. Wrapper delgado sobre updateOrderStatus — la atomicidad (UPDATE condicionado a
   * status="pendiente") es exactamente la misma, solo cambia quién arma los parámetros. Ver
   * docs/specs/02-auditoria-api/deuda-estructural-fase2.md (punto 5) y docs/specs/deuda-pre-fase-6/atomicidad-canje-ticket.md.
   */
  async markDelivered(
    orderId: string,
    operator: string,
    meta?: { deliveredByBar?: string; redeemMethod?: "scan" | "manual" },
  ): Promise<Order> {
    const order = await this.deps.ordersRepo.findById(orderId);
    if (!order) throw new NotFound(`Order ${orderId} no existe.`);
    if (order.status !== "pendiente") {
      throw new Conflict(`El pedido está en un estado (${order.status}) que no se puede entregar.`);
    }
    return this.updateOrderStatus(orderId, "entregado", operator, meta);
  }

  async getActiveOrders(): Promise<Order[]> {
    const event = await this.deps.getActiveEvent();
    if (!event) return [];
    return this.deps.ordersRepo.findActive(event.id);
  }

  async listOrders(): Promise<Order[]> {
    const event = await this.deps.getActiveEvent();
    if (!event) return [];
    return this.deps.ordersRepo.listForEvent(event.id);
  }

  async getOrdersLog(all: boolean = false): Promise<Order[]> {
    if (all) {
      return this.deps.ordersRepo.listAll();
    }
    const event = await this.deps.getActiveEvent();
    if (!event) return [];
    return this.deps.ordersRepo.listForEvent(event.id);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.deps.ordersRepo.findById(id);
  }

  async getOrderByToken(token: string): Promise<Order | undefined> {
    return this.deps.ordersRepo.findByToken(token);
  }
}
