import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook } from "@testing-library/react";

import { useCajaShortcuts } from "./useCajaShortcuts";

import type { Order, PaymentMethod } from "@cocktrail/shared";

function makeOrder(): Order {
  return {
    id: "order-1",
    token: "TKN-1",
    displayNumber: 1,
    items: [],
    total: 2500,
    paymentMethod: "efectivo",
    status: "pendiente",
    createdAt: Date.now(),
    createdBy: "cajera1",
  };
}

type State = {
  isCheckoutOpen: boolean;
  paymentMethod: PaymentMethod | null;
  latestOrder: Order | null;
  canConfirmCash: boolean;
  totalItems: number;
  highlightedGridIndex: number | null;
};

function baseState(overrides: Partial<State> = {}): State {
  return {
    isCheckoutOpen: false,
    paymentMethod: null,
    latestOrder: null,
    canConfirmCash: false,
    totalItems: 0,
    highlightedGridIndex: null,
    ...overrides,
  };
}

function makeCallbacks() {
  return {
    onOpenCheckout: vi.fn(),
    onSelectMethod: vi.fn(),
    onExactAmount: vi.fn(),
    onConfirmCash: vi.fn(),
    onNewSale: vi.fn(),
    onSelectHighlighted: vi.fn(),
    onEscape: vi.fn(),
  };
}

describe("useCajaShortcuts", () => {
  it("tecla C abre el checkout cuando hay items y está cerrado", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ totalItems: 2 }), callbacks));

    fireEvent.keyDown(window, { key: "c" });

    expect(callbacks.onOpenCheckout).toHaveBeenCalledTimes(1);
  });

  it("tecla C no abre el checkout si el carrito está vacío", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ totalItems: 0 }), callbacks));

    fireEvent.keyDown(window, { key: "c" });

    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("tecla C no abre el checkout si ya está abierto", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ isCheckoutOpen: true, totalItems: 2 }), callbacks));

    fireEvent.keyDown(window, { key: "c" });

    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("Enter ya no abre el checkout (esa acción quedó en la tecla C)", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ totalItems: 2 }), callbacks));

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
    expect(callbacks.onConfirmCash).not.toHaveBeenCalled();
    expect(callbacks.onNewSale).not.toHaveBeenCalled();
  });

  it("Enter con un producto resaltado del grid lo agrega en vez de abrir el checkout", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(baseState({ totalItems: 2, highlightedGridIndex: 3 }), callbacks),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onSelectHighlighted).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("Enter con un producto resaltado agrega aunque el carrito esté vacío", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(baseState({ totalItems: 0, highlightedGridIndex: 0 }), callbacks),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onSelectHighlighted).toHaveBeenCalledTimes(1);
  });

  it("Enter no abre el checkout si el carrito está vacío", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ totalItems: 0 }), callbacks));

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("Enter confirma el cobro en efectivo cuando el monto es válido", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", canConfirmCash: true, totalItems: 1 }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onConfirmCash).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("Enter no confirma el cobro en efectivo si el monto todavía no alcanza", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", canConfirmCash: false, totalItems: 1 }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onConfirmCash).not.toHaveBeenCalled();
    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("Enter con latestOrder dispara Nueva Venta y tiene prioridad sobre los demás casos", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({
          isCheckoutOpen: true,
          paymentMethod: "efectivo",
          canConfirmCash: true,
          totalItems: 1,
          latestOrder: makeOrder(),
        }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onNewSale).toHaveBeenCalledTimes(1);
    expect(callbacks.onConfirmCash).not.toHaveBeenCalled();
    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it("Enter con latestOrder tiene prioridad incluso sobre un producto resaltado del grid", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({ latestOrder: makeOrder(), highlightedGridIndex: 2, totalItems: 1 }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onNewSale).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectHighlighted).not.toHaveBeenCalled();
  });

  it("Enter no hace nada con el checkout abierto y sin método elegido", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(baseState({ isCheckoutOpen: true, paymentMethod: null, totalItems: 1 }), callbacks),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
    expect(callbacks.onConfirmCash).not.toHaveBeenCalled();
    expect(callbacks.onSelectMethod).not.toHaveBeenCalled();
  });

  it("Enter no hace nada con un cobro Posnet en curso", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "debito", canConfirmCash: false, totalItems: 1 }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onConfirmCash).not.toHaveBeenCalled();
    expect(callbacks.onOpenCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ["1", "efectivo"],
    ["2", "debito"],
  ] as const)("tecla %s selecciona el método %s cuando el checkout está abierto sin método", (key, method) => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(baseState({ isCheckoutOpen: true, paymentMethod: null, totalItems: 1 }), callbacks),
    );

    fireEvent.keyDown(window, { key });

    expect(callbacks.onSelectMethod).toHaveBeenCalledWith(method);
  });

  it("1/2 no hacen nada si ya hay un método elegido", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", totalItems: 1 }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "2" });

    expect(callbacks.onSelectMethod).not.toHaveBeenCalled();
  });

  it("tecla E carga el monto exacto solo con checkout abierto y método efectivo", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", totalItems: 1 }),
        callbacks,
      ),
    );

    fireEvent.keyDown(window, { key: "e" });

    expect(callbacks.onExactAmount).toHaveBeenCalledTimes(1);
  });

  it("tecla E no hace nada fuera del paso de efectivo", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ isCheckoutOpen: false, totalItems: 1 }), callbacks));

    fireEvent.keyDown(window, { key: "e" });

    expect(callbacks.onExactAmount).not.toHaveBeenCalled();
  });

  it("Espacio dispara Nueva Venta y previene el scroll cuando hay latestOrder", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ latestOrder: makeOrder() }), callbacks));

    const event = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    window.dispatchEvent(event);

    expect(callbacks.onNewSale).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("Espacio no hace nada sin latestOrder", () => {
    const callbacks = makeCallbacks();
    renderHook(() => useCajaShortcuts(baseState({ totalItems: 1 }), callbacks));

    fireEvent.keyDown(window, { key: " " });

    expect(callbacks.onNewSale).not.toHaveBeenCalled();
  });

  it("Escape llama a onEscape (la lógica de a dónde vuelve vive en el componente)", () => {
    const callbacks = makeCallbacks();
    renderHook(() =>
      useCajaShortcuts(baseState({ isCheckoutOpen: true, paymentMethod: "efectivo" }), callbacks),
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(callbacks.onEscape).toHaveBeenCalledTimes(1);
  });

  it("Escape se procesa incluso con foco en el input de monto en efectivo", () => {
    const callbacks = makeCallbacks();
    function Wrapper() {
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "efectivo" }),
        callbacks,
      );
      return <input data-testid="monto" />;
    }
    render(<Wrapper />);
    const input = document.querySelector<HTMLInputElement>('[data-testid="monto"]')!;
    input.focus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(callbacks.onEscape).toHaveBeenCalledTimes(1);
  });

  it("ningún atajo dispara con foco en un input de texto, salvo Enter para confirmar el cobro", () => {
    const callbacks = makeCallbacks();
    function Wrapper() {
      useCajaShortcuts(
        baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", canConfirmCash: true, totalItems: 1 }),
        callbacks,
      );
      return <input data-testid="monto" />;
    }
    render(<Wrapper />);
    const input = document.querySelector<HTMLInputElement>('[data-testid="monto"]')!;
    input.focus();

    fireEvent.keyDown(input, { key: "1" });
    expect(callbacks.onSelectMethod).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "e" });
    expect(callbacks.onExactAmount).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(callbacks.onConfirmCash).toHaveBeenCalledTimes(1);
  });

  it("usa el estado más reciente entre renders (sin stale closures)", () => {
    const callbacks = makeCallbacks();
    const { rerender } = renderHook(
      (props: State) => useCajaShortcuts(props, callbacks),
      { initialProps: baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", canConfirmCash: false, totalItems: 1 }) },
    );

    fireEvent.keyDown(window, { key: "Enter" });
    expect(callbacks.onConfirmCash).not.toHaveBeenCalled();

    rerender(baseState({ isCheckoutOpen: true, paymentMethod: "efectivo", canConfirmCash: true, totalItems: 1 }));
    fireEvent.keyDown(window, { key: "Enter" });

    expect(callbacks.onConfirmCash).toHaveBeenCalledTimes(1);
  });
});
