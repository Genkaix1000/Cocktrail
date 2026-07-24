import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmRail } from "./ConfirmRail";

describe("ConfirmRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide confirmación al click idle y confirma / cancela", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <ConfirmRail
        confirm={false}
        message="¿Eliminar?"
        onAsk={onAsk}
        onCancel={onCancel}
        onConfirm={onConfirm}
      >
        <span>trash</span>
      </ConfirmRail>,
    );

    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onAsk).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmRail
        confirm
        message="¿Eliminar?"
        onAsk={onAsk}
        onCancel={onCancel}
        onConfirm={onConfirm}
      >
        <span>trash</span>
      </ConfirmRail>,
    );

    expect(screen.getByText("¿Eliminar?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancela con Escape en modo confirm", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmRail
        confirm
        message="¿Eliminar?"
        onAsk={vi.fn()}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      >
        <span>trash</span>
      </ConfirmRail>,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
