import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DrinkFormModal, { type DrinkForm } from "./DrinkFormModal";

function makeForm(overrides: Partial<DrinkForm> = {}): DrinkForm {
  return {
    name: "",
    price: 0,
    description: "",
    vibe: "",
    flavors: [],
    iconName: "glass-water",
    trending: false,
    promo: false,
    available: true,
    ...overrides,
  };
}

describe("DrinkFormModal", () => {
  it("dispara onChange con el patch correcto al editar nombre, precio y vibe", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal editDrink={makeForm()} isBosko={false} saving={false} onChange={onChange} onCancel={vi.fn()} onSave={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Fernet con Coca"), "G");
    expect(onChange).toHaveBeenCalledWith({ name: "G" });

    await user.type(screen.getByPlaceholderText("ej. PROMO AMIGOS, FIESTA TOTAL"), "P");
    expect(onChange).toHaveBeenCalledWith({ vibe: "P" });
  });

  it("dispara onChange al elegir un tag (promo/trending)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal editDrink={makeForm()} isBosko={false} saving={false} onChange={onChange} onCancel={vi.fn()} onSave={vi.fn()} />,
    );

    await user.click(screen.getByText("Promo"));
    expect(onChange).toHaveBeenCalledWith({ promo: true, trending: false });
  });

  it("deshabilita Guardar/Crear sin nombre o precio, y muestra 'Editar Trago' cuando ya tiene id", () => {
    render(
      <DrinkFormModal
        editDrink={makeForm({ id: 1, name: "Fernet", price: 2500 })}
        isBosko={false}
        saving={false}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Editar Trago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("recarga el preview de imagen y notifica el nuevo valor al padre", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal editDrink={makeForm()} isBosko={false} saving={false} onChange={onChange} onCancel={vi.fn()} onSave={vi.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("/imagen.webp o URL externa"), "/nueva.webp");
    await user.click(screen.getByTitle("Cargar preview de imagen"));

    expect(onChange).toHaveBeenCalledWith({ image: "/nueva.webp" });
  });
});
