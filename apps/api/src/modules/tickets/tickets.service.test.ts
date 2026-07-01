import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketsService } from "./tickets.service.js";
import type { TicketsRepository, Ticket } from "./tickets.repository.js";
import type { OrdersService } from "../orders/orders.service.js";
import type { Order } from "@cocktrail/shared";
import { generateTicketCode } from "./tickets.crypto.js";

const SECRET = "test-secret";

function makeOrder(overrides?: Partial<Order>): Order {
  return {
    id: "order-1",
    token: "tok",
    displayNumber: 1,
    items: [],
    total: 1000,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeTicket(overrides?: Partial<Ticket>): Ticket {
  const code = generateTicketCode("order-1", SECRET);
  return {
    id: "ticket-1",
    orderId: "order-1",
    code,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeTicketsRepo(overrides?: Partial<TicketsRepository>): TicketsRepository {
  return {
    create: vi.fn(),
    findByCode: vi.fn(),
    findByReadable: vi.fn(),
    findByOrderId: vi.fn(),
    list: vi.fn(),
    updateRedemption: vi.fn(),
    ...overrides,
  };
}

function makeOrdersService(overrides?: Partial<OrdersService>): OrdersService {
  return {
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
  } as unknown as OrdersService;
}

describe("TicketsService.redeemTicket", () => {
  let ticketsRepo: TicketsRepository;
  let ordersService: OrdersService;
  let service: TicketsService;

  beforeEach(() => {
    ticketsRepo = makeTicketsRepo();
    ordersService = makeOrdersService();
    service = new TicketsService(ticketsRepo, ordersService, SECRET);
  });

  it("tira NotFound si el ticket no existe", async () => {
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(undefined);
    await expect(service.redeemTicket("no-existe", "barman1")).rejects.toThrow("Ticket no existe");
  });

  it("tira BadRequest si la firma del ticket está corrupta", async () => {
    const ticket = makeTicket({ code: "AAAAAAAA-00000000" });
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(ticket);
    await expect(service.redeemTicket(ticket.code, "barman1")).rejects.toThrow(/firma corrupta/);
  });

  it("tira Conflict si el ticket ya fue canjeado", async () => {
    const ticket = makeTicket({ redeemedAt: Date.now() });
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(ticket);
    await expect(service.redeemTicket(ticket.code, "barman1")).rejects.toThrow(/ya canjeado/);
  });

  it("tira BadRequest si el ticket expiró (más de 6 horas)", async () => {
    const sevenHoursAgo = Date.now() - 7 * 60 * 60 * 1000;
    const ticket = makeTicket({ createdAt: sevenHoursAgo });
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(ticket);
    await expect(service.redeemTicket(ticket.code, "barman1")).rejects.toThrow(/expirado/);
  });

  it("tira NotFound si el pedido asociado no existe", async () => {
    const ticket = makeTicket();
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(ticket);
    vi.mocked(ordersService.getOrder).mockResolvedValue(undefined);
    await expect(service.redeemTicket(ticket.code, "barman1")).rejects.toThrow(/Pedido asociado no encontrado/);
  });

  it("con pedido en 'pendiente', pasa directo a 'entregado' y marca el ticket canjeado", async () => {
    const ticket = makeTicket();
    const order = makeOrder({ status: "pendiente" });
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(ticket);
    vi.mocked(ordersService.getOrder).mockResolvedValue(order);
    vi.mocked(ordersService.updateOrderStatus).mockResolvedValueOnce({ ...order, status: "entregado" });

    const result = await service.redeemTicket(ticket.code, "barman1", { method: "scan" });

    expect(ordersService.updateOrderStatus).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("entregado");
    expect(ticketsRepo.updateRedemption).toHaveBeenCalledWith(
      ticket.code,
      "barman1",
      expect.objectContaining({ method: "scan" }),
    );
  });

  it("tira Conflict si el pedido está 'cancelado' (no se puede entregar)", async () => {
    const ticket = makeTicket();
    const order = makeOrder({ status: "cancelado" });
    vi.mocked(ticketsRepo.findByCode).mockResolvedValue(ticket);
    vi.mocked(ordersService.getOrder).mockResolvedValue(order);

    await expect(service.redeemTicket(ticket.code, "barman1")).rejects.toThrow(/no se puede entregar/);
    expect(ticketsRepo.updateRedemption).not.toHaveBeenCalled();
  });

  it("resuelve el ticket por prefijo legible cuando el código tiene 8 caracteres", async () => {
    const ticket = makeTicket();
    const readable = ticket.code.split("-")[0];
    vi.mocked(ticketsRepo.findByReadable).mockResolvedValue(ticket);
    vi.mocked(ordersService.getOrder).mockResolvedValue(makeOrder({ status: "pendiente" }));
    vi.mocked(ordersService.updateOrderStatus).mockResolvedValueOnce(makeOrder({ status: "entregado" }));

    await service.redeemTicket(readable, "barman1");

    expect(ticketsRepo.findByReadable).toHaveBeenCalledWith(readable);
    expect(ticketsRepo.findByCode).not.toHaveBeenCalled();
  });
});

describe("TicketsService.generateForOrder", () => {
  it("genera un código firmado y lo guarda en el repositorio", async () => {
    const ticketsRepo = makeTicketsRepo();
    const ordersService = makeOrdersService();
    const service = new TicketsService(ticketsRepo, ordersService, SECRET);

    const code = await service.generateForOrder("order-42");

    expect(code).toMatch(/^[A-Z0-9]{8}-[0-9a-f]{8}$/);
    expect(ticketsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-42", code }),
    );
  });
});
