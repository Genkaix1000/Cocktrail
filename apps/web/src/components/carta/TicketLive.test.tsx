import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import TicketLive from "./TicketLive";
import { useSSE } from "@/lib/useSSE";
import type { DomainEventHandlers } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import { clearActiveOrder } from "@/lib/activeOrder";
import { drinksService } from "@/services/drinks.service";
import type { Order } from "@cocktrail/shared";

vi.mock("@/lib/useSSE", () => ({
  useSSE: vi.fn(),
}));

vi.mock("@/services/events.service", () => ({
  eventsService: {
    getState: vi.fn(),
  },
}));

vi.mock("@/lib/activeOrder", () => ({
  clearActiveOrder: vi.fn(),
}));

// TicketLive renderiza <Ticket>, que a su vez pide drinksService.list().
vi.mock("@/services/drinks.service", () => ({
  drinksService: {
    list: vi.fn(),
  },
}));

const mockedUseSSE = vi.mocked(useSSE);
const mockedEventsService = vi.mocked(eventsService);
const mockedClearActiveOrder = vi.mocked(clearActiveOrder);
const mockedDrinksService = vi.mocked(drinksService);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 7,
    items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 2500, subtotal: 2500 }],
    total: 2500,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    ticketCode: "ABC123",
    ...overrides,
  };
}

let capturedHandlers: DomainEventHandlers = {};
let capturedOnOpen: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  capturedHandlers = {};
  capturedOnOpen = undefined;
  mockedDrinksService.list.mockResolvedValue([]);
  mockedEventsService.getState.mockResolvedValue({
    event: null,
    drinks: [],
    orders: [],
    cashSales: [],
    totals: { total: 0, byPaymentMethod: {} } as never,
    activeTheme: "bosko" as never,
  });
  mockedUseSSE.mockImplementation((handlers, options) => {
    capturedHandlers = handlers;
    capturedOnOpen = options?.onOpen;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TicketLive", () => {
  it("renderiza el Ticket con el pedido inicial recibido por props", async () => {
    render(<TicketLive initialOrder={makeOrder({ displayNumber: 11 })} />);

    expect(await screen.findByText("#11")).toBeInTheDocument();
  });

  it("actualiza el pedido mostrado al recibir un evento SSE 'order.updated' del mismo token", async () => {
    const initialOrder = makeOrder({ token: "TKN-1", displayNumber: 7, status: "pendiente" });
    render(<TicketLive initialOrder={initialOrder} />);

    await screen.findByText("#7");

    const updatedOrder = { ...initialOrder, status: "entregado" as const };
    capturedHandlers["order.updated"]?.({ order: updatedOrder });

    await waitFor(() => expect(screen.getByText("ENTREGADO")).toBeInTheDocument());
  });

  it("ignora eventos 'order.updated' de otro token", async () => {
    const initialOrder = makeOrder({ token: "TKN-1", displayNumber: 7, status: "pendiente" });
    render(<TicketLive initialOrder={initialOrder} />);

    await screen.findByText("#7");

    capturedHandlers["order.updated"]?.({
      order: { ...initialOrder, token: "OTHER-TOKEN", status: "cancelado" },
    });

    // No debería cambiar: sigue pendiente, sin sello de cancelado.
    expect(screen.queryByText("CANCELADO")).not.toBeInTheDocument();
  });

  it("al reconectar (onOpen) refresca el pedido contra eventsService.getState()", async () => {
    const initialOrder = makeOrder({ token: "TKN-1", status: "pendiente" });
    const refreshedOrder = { ...initialOrder, status: "entregado" as const };
    mockedEventsService.getState.mockResolvedValue({
      event: null,
      drinks: [],
      orders: [refreshedOrder],
      cashSales: [],
      totals: { total: 0, byPaymentMethod: {} } as never,
      activeTheme: "bosko" as never,
    });

    render(<TicketLive initialOrder={initialOrder} />);
    await screen.findByText("#7");

    await capturedOnOpen?.();

    await waitFor(() => expect(screen.getByText("ENTREGADO")).toBeInTheDocument());
  });

  it("libera el pedido activo del localStorage al llegar a un estado terminal", async () => {
    const initialOrder = makeOrder({ status: "pendiente" });
    render(<TicketLive initialOrder={initialOrder} />);
    await screen.findByText("#7");

    expect(mockedClearActiveOrder).not.toHaveBeenCalled();

    capturedHandlers["order.updated"]?.({ order: { ...initialOrder, status: "cancelado" } });

    await waitFor(() => expect(mockedClearActiveOrder).toHaveBeenCalled());
  });
});
