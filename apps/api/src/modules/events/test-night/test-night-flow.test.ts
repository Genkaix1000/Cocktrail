import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Drink } from "@cocktrail/shared";
import { EventsService } from "../events.service.js";
import type { EventsRepository } from "../events.repository.js";
import type { OrdersRepository } from "../../orders/orders.repository.js";
import type { DrinksRepository } from "../../drinks/drinks.repository.js";
import type { TicketsRepository } from "../../tickets/tickets.repository.js";
import { OrdersService } from "../../orders/orders.service.js";
import { TicketsService } from "../../tickets/tickets.service.js";
import { PrinterService } from "../../printer/printer.service.js";
import { TestNightContext } from "./test-night-context.js";
import { TestNightStore } from "./test-night-store.js";
import { TestAwareEventsRepository } from "./test-aware-events.repository.js";
import { TestAwareOrdersRepository } from "./test-aware-orders.repository.js";
import { TestAwareTicketsRepository } from "./test-aware-tickets.repository.js";

const FERNET: Drink = {
  id: 1,
  name: "Fernet",
  price: 5000,
  available: true,
  category: "tragos",
} as unknown as Drink;

/**
 * Camino de venta completo en una noche de prueba, con los services REALES y los repos
 * de Supabase mockeados: la aserción central es que esos mocks nunca se llaman.
 */
function armarSistema() {
  const innerEvents = {
    getActive: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (e) => e),
    update: vi.fn().mockImplementation(async (id, patch) => ({ id, ...patch })),
    findById: vi.fn().mockResolvedValue(null),
    listClosed: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventsRepository;

  const innerOrders = {
    create: vi.fn().mockImplementation(async (o) => o),
    findById: vi.fn().mockResolvedValue(undefined),
    findByToken: vi.fn().mockResolvedValue(undefined),
    findByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    findByMpOrderId: vi.fn().mockResolvedValue(undefined),
    findActive: vi.fn().mockResolvedValue([]),
    listForEvent: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  } as unknown as OrdersRepository;

  const innerTickets = {
    create: vi.fn().mockImplementation(async (t) => t),
    findByCode: vi.fn().mockResolvedValue(undefined),
    findByReadable: vi.fn().mockResolvedValue(undefined),
    findByOrderId: vi.fn().mockResolvedValue(undefined),
    listByOrderIds: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    updateRedemption: vi.fn().mockResolvedValue(undefined),
  } as unknown as TicketsRepository;

  const drinksRepo = {
    list: vi.fn().mockResolvedValue([FERNET]),
    findById: vi.fn().mockResolvedValue(FERNET),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    nextId: vi.fn(),
  } as unknown as DrinksRepository;

  const context = new TestNightContext();
  const store = new TestNightStore();
  const eventsRepo = new TestAwareEventsRepository(innerEvents, context, store);
  const ordersRepo = new TestAwareOrdersRepository(innerOrders, context, store);
  const ticketsRepo = new TestAwareTicketsRepository(innerTickets, context, store);

  const emit = vi.fn();
  const eventsService = new EventsService(eventsRepo, ordersRepo, drinksRepo, emit, undefined, {
    context,
    store,
  });
  const printerService = new PrinterService();

  let ticketsService: TicketsService;
  const ordersService = new OrdersService({
    ordersRepo,
    drinksRepo,
    getActiveEvent: async () => eventsService.getCurrentEvent(),
    incrementOrderCounter: async () => eventsService.incrementOrderCounter(),
    emit,
    generateTicketCodeString: (orderId: string) => ticketsService.generateCodeString(orderId),
    saveTicket: async (orderId: string, code: string) => ticketsService.saveTicketForOrder(orderId, code),
    renderTicketPayload: async (order, nightEvent) => printerService.renderTicketPayload(order, nightEvent),
  });
  ticketsService = new TicketsService(ticketsRepo, ordersService, "un-secreto-de-al-menos-32-caracteres!!");

  const supabaseMocks = [
    ...Object.values(innerEvents as unknown as Record<string, ReturnType<typeof vi.fn>>),
    ...Object.values(innerOrders as unknown as Record<string, ReturnType<typeof vi.fn>>),
    ...Object.values(innerTickets as unknown as Record<string, ReturnType<typeof vi.fn>>),
  ];

  return { eventsService, ordersService, ticketsService, context, store, emit, supabaseMocks };
}

describe("noche de prueba — camino de venta completo", () => {
  let sistema: ReturnType<typeof armarSistema>;

  beforeEach(async () => {
    sistema = armarSistema();
    await sistema.eventsService.initialize();
    // initialize() lee la noche activa de la base: se descuenta esa llamada.
    vi.clearAllMocks();
  });

  it("vende, numera, emite ticket y cierra sin una sola escritura en Supabase", async () => {
    const { eventsService, ordersService, ticketsService, context, store, supabaseMocks } = sistema;

    const night = await eventsService.openEvent("clave-de-prueba", true);
    expect(night.isTest).toBe(true);
    expect(context.getActiveId()).toBe(night.id);

    const venta = await ordersService.createOrder(
      { items: [{ drinkId: 1, qty: 2 }], paymentMethod: "efectivo" },
      "Caja",
    );

    expect(venta.displayNumber).toBe(1);
    expect(venta.total).toBe(10000);
    expect(venta.ticketData).toBeTruthy();
    // B4: el ticket de prueba se distingue a simple vista.
    expect(venta.ticketContent?.brand).toContain("PRUEBA");

    // El ticket vive en memoria y se puede canjear.
    const ticket = await ticketsService.getTicketByOrderId(venta.id);
    expect(ticket?.code).toBe(venta.ticketCode);

    // Los totales y el snapshot salen del store.
    expect((await eventsService.getEventTotals()).total).toBe(10000);
    const snapshot = await eventsService.snapshot();
    expect(snapshot.orders.map((o) => o.id)).toEqual([venta.id]);

    const summary = await eventsService.closeEvent("admin");
    expect(summary.totals.total).toBe(10000);
    expect(summary.orders).toHaveLength(1);

    for (const mock of supabaseMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
    // Y al cerrar no queda nada colgando (A5).
    expect(context.getActiveId()).toBeNull();
    expect(store.getEvent()).toBeNull();
    expect(store.listOrders()).toEqual([]);
  });

  it("cerrar la prueba NO intenta borrar la noche: no hay nada que borrar", async () => {
    const { eventsService, supabaseMocks } = sistema;

    // Una noche de prueba sin ventas cierra en $0 — la regla de "noche vacía se borra"
    // no aplica porque nunca se escribió.
    await eventsService.openEvent("clave", true);
    await eventsService.closeEvent("admin");

    for (const mock of supabaseMocks) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("después de cerrar la prueba, la noche siguiente se escribe en Supabase", async () => {
    const { eventsService, ordersService, context } = sistema;

    await eventsService.openEvent("prueba", true);
    await eventsService.closeEvent("admin");
    expect(context.getActiveId()).toBeNull();

    const real = await eventsService.openEvent("noche-real");
    expect(real.isTest).toBeUndefined();

    const venta = await ordersService.createOrder(
      { items: [{ drinkId: 1, qty: 1 }], paymentMethod: "efectivo" },
      "Caja",
    );
    expect(venta.ticketContent?.brand).toBeUndefined();
    expect(sistema.store.hasOrder(venta.id)).toBe(false);
  });

  it("initialize() limpia el contexto: tras un reinicio no hay noche de prueba (A6)", async () => {
    const { eventsService, context, store } = sistema;

    await eventsService.openEvent("prueba", true);
    expect(context.getActiveId()).not.toBeNull();

    // Simula el arranque del proceso siguiente sobre el mismo objeto de service.
    (eventsService as unknown as { initPromise: Promise<void> | null }).initPromise = null;
    await eventsService.initialize();

    expect(context.getActiveId()).toBeNull();
    expect(store.getEvent()).toBeNull();
  });
});
