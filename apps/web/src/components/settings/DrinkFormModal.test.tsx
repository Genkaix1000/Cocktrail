import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DrinkFormModal, { flagsForCategory, type DrinkForm } from "./DrinkFormModal";

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
    categoryId: null,
    ...overrides,
  };
}

const categories = [
  { id: "tendencias", name: "Tendencias", sortOrder: 1 },
  { id: "cervezas", name: "Cervezas", sortOrder: 2 },
  { id: "promos-combos", name: "Promos", sortOrder: 10 },
];

describe("flagsForCategory", () => {
  it("mapea tendencias y promos a flags visuales", () => {
    expect(flagsForCategory("tendencias")).toEqual({ promo: false, trending: true });
    expect(flagsForCategory("promos-combos")).toEqual({ promo: true, trending: false });
    expect(flagsForCategory("cervezas")).toEqual({ promo: false, trending: false });
  });
});

describe("DrinkFormModal", () => {
  it("dispara onChange al editar nombre y no expone vibe", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal
        editDrink={makeForm()}
        categories={categories}
        saving={false}
        onChange={onChange}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("PROMO 2 Vodka con Speed"), "G");
    expect(onChange).toHaveBeenCalledWith({ name: "G" });
    expect(screen.queryByPlaceholderText("ej. PROMO AMIGOS, FIESTA TOTAL")).not.toBeInTheDocument();
  });

  it("elige categoría del select y setea flags derivados", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal
        editDrink={makeForm()}
        categories={categories}
        saving={false}
        onChange={onChange}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox"), "promos-combos");
    expect(onChange).toHaveBeenCalledWith({
      categoryId: "promos-combos",
      promo: true,
      trending: false,
    });
  });

  it("deshabilita Guardar/Crear sin nombre o precio, y muestra 'Editar Trago' cuando ya tiene id", () => {
    render(
      <DrinkFormModal
        editDrink={makeForm({ id: 1, name: "Fernet", price: 2500 })}
        categories={categories}
        saving={false}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Editar trago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("recarga el preview de imagen y notifica el nuevo valor al padre", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal
        editDrink={makeForm()}
        categories={categories}
        saving={false}
        onChange={onChange}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("/drinks/andes.jpg o URL"), "/nueva.webp");
    await user.click(screen.getByTitle("Cargar preview de imagen"));

    expect(onChange).toHaveBeenCalledWith({ image: "/nueva.webp" });
  });
});
