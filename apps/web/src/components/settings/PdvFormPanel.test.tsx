import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PdvFormPanel, { type PdvForm } from "./PdvFormPanel";

const VIP = { code: "BARRA-01", name: "Barra VIP" };
const PORTATIL = { code: "PORTATIL", name: "Portátil" };

function renderPanel(overrides: Partial<Parameters<typeof PdvFormPanel>[0]> = {}) {
  const props = {
    form: { name: "Barra VIP", barCode: "BARRA-01" } as PdvForm,
    saving: false,
    availablePresets: [VIP],
    onChange: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(<PdvFormPanel {...props} />);
  return props;
}

describe("PdvFormPanel", () => {
  it("las labels van asociadas a sus campos", () => {
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
    const user = userEvent.setup();
    renderPanel();

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

  it("con varios presets permite elegir Portátil", async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      form: { name: "Barra VIP", barCode: "BARRA-01" },
      availablePresets: [VIP, PORTATIL],
    });

    await user.selectOptions(screen.getByLabelText(/Código de barra/i), "PORTATIL");
    expect(props.onChange).toHaveBeenCalledWith({ barCode: "PORTATIL", name: "Portátil" });
  });

  it("deshabilita Crear si el código no está en los presets disponibles", () => {
    renderPanel({
      form: { name: "Otra", barCode: "BARRA-99" },
      availablePresets: [VIP],
    });
    expect(screen.getByRole("button", { name: "Crear PDV" })).toBeDisabled();
  });
});
