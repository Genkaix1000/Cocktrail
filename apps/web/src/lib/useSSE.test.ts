import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useSSE } from "./useSSE";
import { FakeEventSource } from "./__testUtils__/fakeEventSource";

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSSE", () => {
  it("despacha el handler correcto según el type del evento, con el data ya parseado", () => {
    const onOrderCreated = vi.fn();
    renderHook(() => useSSE({ "order.created": onOrderCreated }));

    const es = FakeEventSource.instances.at(-1)!;
    es.emit("order.created", { order: { id: "o1" } });

    expect(onOrderCreated).toHaveBeenCalledWith({ order: { id: "o1" } });
  });

  it("no dispara handlers de otros tipos de evento", () => {
    const onOrderCreated = vi.fn();
    const onOrderUpdated = vi.fn();
    renderHook(() =>
      useSSE({ "order.created": onOrderCreated, "order.updated": onOrderUpdated }),
    );

    const es = FakeEventSource.instances.at(-1)!;
    es.emit("order.created", { order: { id: "o1" } });

    expect(onOrderCreated).toHaveBeenCalledTimes(1);
    expect(onOrderUpdated).not.toHaveBeenCalled();
  });

  it("despacha bar-session.expired con el payload tipado", () => {
    const onExpired = vi.fn();
    renderHook(() => useSSE({ "bar-session.expired": onExpired }));

    const es = FakeEventSource.instances.at(-1)!;
    es.emit("bar-session.expired", {
      barId: "bar-1",
      ejectedUser: "caja",
      ejectedBy: "admin",
    });

    expect(onExpired).toHaveBeenCalledWith({
      barId: "bar-1",
      ejectedUser: "caja",
      ejectedBy: "admin",
    });
  });

  it("ignora un frame con JSON malformado sin romper", () => {
    const onOrderCreated = vi.fn();
    renderHook(() => useSSE({ "order.created": onOrderCreated }));

    const es = FakeEventSource.instances.at(-1)!;
    expect(() => es.emitRaw("order.created", "{not valid json")).not.toThrow();
    expect(onOrderCreated).not.toHaveBeenCalled();
  });

  it("llama a onOpen en el evento open, inicial y en una reconexión simulada", () => {
    const onOpen = vi.fn();
    renderHook(() => useSSE({}, { onOpen }));

    const es = FakeEventSource.instances.at(-1)!;
    es.emitOpen();
    es.emitOpen();

    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("al desmontar, remueve los listeners y cierra la conexión", () => {
    const onOrderCreated = vi.fn();
    const onOpen = vi.fn();
    const { unmount } = renderHook(() => useSSE({ "order.created": onOrderCreated }, { onOpen }));

    const es = FakeEventSource.instances.at(-1)!;
    expect(es.closed).toBe(false);

    unmount();

    expect(es.closed).toBe(true);

    // Tras desmontar, emitir no debe disparar los handlers (listeners removidos).
    es.emit("order.created", { order: { id: "o1" } });
    es.emitOpen();
    expect(onOrderCreated).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
