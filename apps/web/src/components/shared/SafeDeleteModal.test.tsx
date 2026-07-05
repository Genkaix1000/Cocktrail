import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SafeDeleteModal from "./SafeDeleteModal";

describe("SafeDeleteModal", () => {
  it("deshabilita el submit hasta que el texto coincide exactamente", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <SafeDeleteModal
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

  it("cada apertura nueva arranca con el input vacío (el padre monta el modal de cero)", () => {
    const { unmount } = render(
      <SafeDeleteModal
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminar trago"
        expectedText="Fernet"
        typeLabel="el trago"
      />
    );
    unmount();

    render(
      <SafeDeleteModal
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
