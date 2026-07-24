import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LogoutNavRail } from "./LogoutNavRail";

describe("LogoutNavRail", () => {
  it("en idle muestra Cerrar sesión y al click pide confirmación", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    render(
      <LogoutNavRail
        confirm={false}
        onAsk={onAsk}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(onAsk).toHaveBeenCalledOnce();
  });

  it("en confirm muestra acciones y Esc cancela", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <LogoutNavRail
        confirm
        onAsk={vi.fn()}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("¿Cerrar sesión?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar cierre de sesión" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("colapsado en confirm: solo check; click afuera cancela", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <div>
        <button type="button">afuera</button>
        <LogoutNavRail
          collapsed
          confirm
          onAsk={vi.fn()}
          onCancel={onCancel}
          onConfirm={vi.fn()}
        />
      </div>,
    );
    expect(screen.getByRole("button", { name: "Confirmar cierre de sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar cierre de sesión" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "afuera" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
