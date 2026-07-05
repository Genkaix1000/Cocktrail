import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DrinksTable from "./DrinksTable";
import type { Drink } from "@cocktrail/shared";

function makeDrink(overrides: Partial<Drink> = {}): Drink {
  return {
    id: 1,
    name: "Fernet con Coca",
    price: 5500,
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

function baseProps(overrides: Partial<React.ComponentProps<typeof DrinksTable>> = {}) {
  return {
    drinks: [makeDrink()],
    loadError: false,
    search: "",
    sortField: "name" as const,
    sortDirection: "asc" as const,
    isBosko: false,
    onSort: vi.fn(),
    onRetry: vi.fn(),
    onSelectDrink: vi.fn(),
    onToggleAvailable: vi.fn(),
    onDeleteClick: vi.fn(),
    ...overrides,
  };
}

describe("DrinksTable", () => {
  it("muestra el error de carga con botón de reintentar en vez de 'carta vacía'", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<DrinksTable {...baseProps({ drinks: [], loadError: true, onRetry })} />);

    expect(screen.getByText("No se pudo cargar la carta. Revisá tu conexión.")).toBeInTheDocument();
    expect(screen.queryByText("No hay tragos registrados")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("muestra el estado vacío cuando no hay tragos y no hay error", () => {
    render(<DrinksTable {...baseProps({ drinks: [] })} />);
    expect(screen.getByText("No hay tragos registrados")).toBeInTheDocument();
  });

  it("dispara onSelectDrink, onToggleAvailable y onDeleteClick sin propagar entre sí", async () => {
    const user = userEvent.setup();
    const onSelectDrink = vi.fn();
    const onToggleAvailable = vi.fn();
    const onDeleteClick = vi.fn();
    const drink = makeDrink();

    render(
      <DrinksTable
        {...baseProps({ drinks: [drink], onSelectDrink, onToggleAvailable, onDeleteClick })}
      />,
    );

    await user.click(screen.getByTitle("Ocultar de la carta"));
    expect(onToggleAvailable).toHaveBeenCalled();
    expect(onSelectDrink).not.toHaveBeenCalled();

    await user.click(screen.getByTitle("Eliminar"));
    expect(onDeleteClick).toHaveBeenCalledWith(drink);
    expect(onSelectDrink).not.toHaveBeenCalled();

    await user.click(screen.getByText("Fernet con Coca"));
    expect(onSelectDrink).toHaveBeenCalledWith(drink);
  });

  it("dispara onSort al tocar los headers de Nombre/Precio", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(<DrinksTable {...baseProps({ onSort })} />);

    await user.click(screen.getByText("Precio"));
    expect(onSort).toHaveBeenCalledWith("price");
  });
});
