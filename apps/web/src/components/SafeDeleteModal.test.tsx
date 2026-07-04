import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SafeDeleteModal from "./SafeDeleteModal";

describe("SafeDeleteModal", () => {
  it("no renderiza nada cuando isOpen es false", () => {
    const { container } = render(
      <SafeDeleteModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminar trago"
        expectedText="Fernet"
        typeLabel="el trago"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("deshabilita el submit hasta que el texto coincide exactamente", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SafeDeleteModal
        isOpen
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Eliminar trago"
        expectedText="Fernet"
        typeLabel="el trago"
      />
    );
    const input = screen.getByLabelText(/escribe/i);
    const submitButton = screen.getByRole("button", { name: /eliminar/i });
    expect(submitButton).toBeDisabled();

    await user.type(input, "Fern");
    expect(submitButton).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.type(input, "et");
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("llama a onClose desde el botón de cerrar y desde cancelar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SafeDeleteModal
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Eliminar usuario"
        expectedText="cajera1"
        typeLabel="el usuario"
      />
    );
    await user.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("resetea el input al reabrir con un expectedText distinto", () => {
    const { rerender } = render(
      <SafeDeleteModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminar trago"
        expectedText="Fernet"
        typeLabel="el trago"
      />
    );
    const input = screen.getByLabelText(/escribe/i) as HTMLInputElement;
    input.focus();

    rerender(
      <SafeDeleteModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminar trago"
        expectedText="Gin Tonic"
        typeLabel="el trago"
      />
    );
    expect((screen.getByLabelText(/escribe/i) as HTMLInputElement).value).toBe("");
  });
});
