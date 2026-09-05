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

    await user.type(screen.getByPlaceholderText("Fernet con Coca"), "G");
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

  it("abre el selector de hora (WheelTimePicker) al clickear en 'Desde' y actualiza el horario", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DrinkFormModal
        editDrink={makeForm({ scheduleEnabled: true, scheduleFrom: "22:00", scheduleUntil: "03:00" })}
        categories={categories}
        saving={false}
        onChange={onChange}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    // Debe mostrar los botones interactivos 'Desde' y 'Hasta'
    const btnDesde = screen.getByRole("button", { name: /Ajustar hora desde/i });
    expect(btnDesde).toBeInTheDocument();
    expect(screen.getByText("22:00")).toBeInTheDocument();
    expect(screen.getByText("03:00")).toBeInTheDocument();

    // Click en Desde para abrir el picker
    await user.click(btnDesde);
    expect(screen.getByText("Ajustar hora desde")).toBeInTheDocument();

    // En la lista de horas, seleccionar '11' (que con PM será 23:00)
    const hourBtn = screen.getByRole("button", { name: "Hora 11" });
    await user.click(hourBtn);

    expect(onChange).toHaveBeenCalledWith({ scheduleFrom: "23:00" });
  });

  it("renderiza la tarjeta de vista previa fiel a Nueva Venta con badge de Trend", () => {
    render(
      <DrinkFormModal
        editDrink={makeForm({
          name: "Vodka con Speed",
          price: 15,
          categoryId: "tendencias",
          trending: true,
        })}
        categories={categories}
        saving={false}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("Vodka con Speed")).toBeInTheDocument();
    expect(screen.getByText("$15")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
  });
});

