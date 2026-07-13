import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useEventState } from "./useEventState";
import { FakeEventSource } from "@/lib/__testUtils__/fakeEventSource";
import { eventsService } from "@/services/events.service";
import type { EventSummary, NightEvent, Order } from "@cocktrail/shared";

vi.mock("@/services/events.service", () => ({
  eventsService: {
    getState: vi.fn(),
  },
}));

const mockedEventsService = vi.mocked(eventsService);

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [],
    total: 0,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "caja1",
    ...overrides,
  };
}

function makeNightEvent(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "event-1",
    keyword: "TEQUILA",
    startedAt: Date.now(),
    ...overrides,
  } as NightEvent;
}

function makeSummary(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: "event-1",
    status: "cerrado",
    startedAt: Date.now() - 1000,
    closedAt: Date.now(),
    orderCounter: 0,
    totals: {
      webTotal: 0, webCount: 0, efectivoTotal: 0, efectivoCount: 0,
      qrTotal: 0, qrCount: 0, debitoTotal: 0, debitoCount: 0,
      drinksSold: [], total: 0,
    },
    orders: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
  mockedEventsService.getState.mockResolvedValue({
    event: null,
    drinks: [],
    orders: [],
    totals: {
      webTotal: 0, webCount: 0, efectivoTotal: 0, efectivoCount: 0,
      qrTotal: 0, qrCount: 0, debitoTotal: 0, debitoCount: 0,
      drinksSold: [], total: 0,
    },
    activeTheme: "bosko",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEventState", () => {
  it("arranca con los valores de `initial` cuando se pasan (caso AdminClient)", () => {
    const seedEvent = makeNightEvent();
    const seedOrders = [makeOrder({ id: "seed-1" })];

    const { result } = renderHook(() =>
      useEventState({ initial: { event: seedEvent, orders: seedOrders } }),
    );

    expect(result.current.event).toEqual(seedEvent);
    expect(result.current.orders).toEqual(seedOrders);
  });

  it("arranca en null/[] sin `initial` (caso CajaClient)", () => {
    const { result } = renderHook(() => useEventState());

    expect(result.current.event).toBeNull();
    expect(result.current.orders).toEqual([]);
  });

  it("order.created hace upsert por id: agrega si es nuevo", () => {
    const { result } = renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;

    act(() => es.emit("order.created", { order: makeOrder({ id: "o1" }) }));

    expect(result.current.orders.map((o) => o.id)).toEqual(["o1"]);
  });

  it("order.updated hace upsert por id: reemplaza si ya existe", () => {
    const { result } = renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;

    act(() => es.emit("order.created", { order: makeOrder({ id: "o1", status: "pendiente" }) }));
    act(() => es.emit("order.updated", { order: makeOrder({ id: "o1", status: "entregado" }) }));

    expect(result.current.orders).toHaveLength(1);
    expect(result.current.orders[0].status).toBe("entregado");
  });

  it("event.opened setea el evento y dispara refetch", async () => {
    const { result } = renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;
    const newEvent = makeNightEvent({ keyword: "RON" });

    mockedEventsService.getState.mockResolvedValueOnce({
      event: newEvent,
      drinks: [],
      orders: [makeOrder({ id: "refetched" })],
      totals: {
        webTotal: 0, webCount: 0, efectivoTotal: 0, efectivoCount: 0,
        qrTotal: 0, qrCount: 0, debitoTotal: 0, debitoCount: 0,
        drinksSold: [], total: 0,
      },
      activeTheme: "bosko",
    });

    act(() => es.emit("event.opened", { event: newEvent }));

    await waitFor(() => expect(result.current.event).toEqual(newEvent));
    await waitFor(() => expect(result.current.orders.map((o) => o.id)).toEqual(["refetched"]));
  });

  it("event.closed setea summary, dispara refetch, y llama onEventClosed", () => {
    const onEventClosed = vi.fn();
    const { result } = renderHook(() => useEventState({ onEventClosed }));
    const es = FakeEventSource.instances.at(-1)!;
    const summary = makeSummary();

    mockedEventsService.getState.mockClear();
    act(() => es.emit("event.closed", { summary }));

    expect(result.current.summary).toEqual(summary);
    expect(mockedEventsService.getState).toHaveBeenCalledTimes(1);
    expect(onEventClosed).toHaveBeenCalledWith(summary);
  });

  it("no llama a onEventClosed si no se pasó la opción", () => {
    const { result } = renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;

    expect(() => act(() => es.emit("event.closed", { summary: makeSummary() }))).not.toThrow();
    expect(result.current.summary).not.toBeNull();
  });

  it("onActivity se llama una vez por cada evento de actividad, no en event.opened/closed", () => {
    const onActivity = vi.fn();
    renderHook(() => useEventState({ onActivity }));
    const es = FakeEventSource.instances.at(-1)!;

    act(() => es.emit("order.created", { order: makeOrder({ id: "o1" }) }));
    act(() => es.emit("order.updated", { order: makeOrder({ id: "o1" }) }));

    // onOpen también cuenta como actividad (ver siguiente test) — se resetea acá.
    onActivity.mockClear();
    act(() => es.emit("event.opened", { event: makeNightEvent() }));
    act(() => es.emit("event.closed", { summary: makeSummary() }));

    expect(onActivity).not.toHaveBeenCalled();
  });

  it("onActivity no se llama si no se pasó la opción (no explota)", () => {
    renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;

    expect(() => act(() => es.emit("order.created", { order: makeOrder() }))).not.toThrow();
  });

  it("onOpen llama a refetch siempre, y a onActivity además si se pasó (reconexión)", () => {
    const onActivity = vi.fn();
    renderHook(() => useEventState({ onActivity }));
    const es = FakeEventSource.instances.at(-1)!;

    mockedEventsService.getState.mockClear();
    act(() => es.emitOpen());

    expect(mockedEventsService.getState).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it("onOpen sin onActivity solo refetchea (comportamiento actual de Caja)", () => {
    renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;

    mockedEventsService.getState.mockClear();
    expect(() => act(() => es.emitOpen())).not.toThrow();
    expect(mockedEventsService.getState).toHaveBeenCalledTimes(1);
  });

  it("al desmontar, cierra la conexión SSE", () => {
    const { unmount } = renderHook(() => useEventState());
    const es = FakeEventSource.instances.at(-1)!;

    expect(es.closed).toBe(false);
    unmount();
    expect(es.closed).toBe(true);
  });

  it("expone setEvent/setSummary para flujos que no son SSE", () => {
    const { result } = renderHook(() => useEventState());
    const newEvent = makeNightEvent();

    act(() => result.current.setEvent(newEvent));
    expect(result.current.event).toEqual(newEvent);

    act(() => result.current.setSummary(makeSummary()));
    act(() => result.current.setSummary(null));
    expect(result.current.summary).toBeNull();
  });

  it("upsertOrder aplica un pedido sin pasar por SSE (caso HistorialSection en Caja)", () => {
    const { result } = renderHook(() => useEventState());
    const order = makeOrder({ id: "o1", status: "pendiente" });

    act(() => result.current.upsertOrder(order));
    expect(result.current.orders).toEqual([order]);

    const updated = makeOrder({ id: "o1", status: "cancelado" });
    act(() => result.current.upsertOrder(updated));
    expect(result.current.orders).toEqual([updated]);
  });
});
