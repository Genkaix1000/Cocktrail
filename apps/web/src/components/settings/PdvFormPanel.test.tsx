import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PdvFormPanel, { type PdvForm } from "./PdvFormPanel";

function renderPanel(overrides: Partial<Parameters<typeof PdvFormPanel>[0]> = {}) {
  const props = {
    form: { name: "Barra VIP", barCode: "BARRA-01" } as PdvForm,
    saving: false,
    supportedBarCode: "BARRA-01",
    onChange: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(<PdvFormPanel {...props} />);
  return props;
}

describe("PdvFormPanel", () => {
  it("las labels están asociadas a sus campos", () => {
    renderPanel();
    expect(screen.getByLabelText(/Nombre de la barra/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Código de barra/i)).toHaveValue("BARRA-01");
  });

  it("el foco inicial cae en el campo de nombre", () => {
    renderPanel();
    expect(screen.getByLabelText(/Nombre de la barra/i)).toHaveFocus();
  });

  it("Escape cierra el panel", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.keyboard("{Escape}");
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("no tiene focus trap: Tab sale del panel sin quedar atrapado", async () => {
    // Anti-regresión del criterio del PR 6: es un panel inline, no un diálogo modal.
    const user = userEvent.setup();
    renderPanel();

    // Tab por todos los elementos focuseables: si hubiera trap, el foco
    // volvería al primero; sin trap, termina en el body.
    for (let i = 0; i < 10; i++) {
      await user.tab();
    }
    expect(document.activeElement).toBe(document.body);
  });

  it("valida el nombre obligatorio y deshabilita Crear PDV", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ form: { name: "", barCode: "BARRA-01" } });

    expect(screen.getByRole("button", { name: "Crear PDV" })).toBeDisabled();
    await user.type(screen.getByLabelText(/Nombre de la barra/i), "x");
    await user.keyboard("{Backspace}");
    expect(screen.getByText(/El nombre es obligatorio/i)).toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("guarda con el botón Crear PDV", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("button", { name: "Crear PDV" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando el código de barra no es el soportado", () => {
    renderPanel({ form: { name: "Otra", barCode: "BARRA-02" } });
    expect(screen.getByText(/Multi-barra\s*no está implementado todavía/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear PDV" })).toBeDisabled();
  });
});
