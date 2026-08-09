import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SafeDeleteModal, { HOLD_CONFIRM_MS } from "./SafeDeleteModal";

describe("SafeDeleteModal (hold-to-confirm)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no confirma si se suelta antes de completar el hold", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <SafeDeleteModal
        onClose={onClose}
        onConfirm={onConfirm}
        title="Desvincular Mercado Pago"
        confirmLabel="Desvincular"
      />,
    );

    const btn = screen.getByRole("button", { name: /Desvincular\. Mantené/i });
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(HOLD_CONFIRM_MS - 100);
    });
    fireEvent.pointerUp(btn);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirma al completar el hold", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <SafeDeleteModal
        onClose={onClose}
        onConfirm={onConfirm}
        title="Desvincular Mercado Pago"
        confirmLabel="Desvincular"
      />,
    );

    const btn = screen.getByRole("button", { name: /Desvincular\. Mantené/i });
    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(HOLD_CONFIRM_MS + 10);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancelar y Cerrar llaman onClose", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SafeDeleteModal
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Eliminar"
        confirmLabel="Eliminar"
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
