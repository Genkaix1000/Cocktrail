import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ProductSearch from "./ProductSearch";

import type { Drink } from "@cocktrail/shared";

function makeDrink(overrides: Partial<Drink> = {}): Drink {
  return {
    id: 1,
    name: "Fernet con Coca",
    price: 2500,
    description: "Clásico",
    vibe: "party",
    flavors: [],
    iconName: "glass-water",
    trending: false,
    promo: false,
    available: true,
    ...overrides,
  };
}

const drinks: Drink[] = [
  makeDrink({ id: 1, name: "Fernet con Coca" }),
  makeDrink({ id: 2, name: "Gin Tonic" }),
  makeDrink({ id: 3, name: "Gin Fizz" }),
];

describe("ProductSearch", () => {
  it("filtra la lista de resultados al tipear", async () => {
    const user = userEvent.setup();
    render(<ProductSearch drinks={drinks} onSelect={vi.fn()} />);

    await user.type(screen.getByRole("textbox"), "gin");

    expect(screen.getByText("Gin Tonic")).toBeInTheDocument();
    expect(screen.getByText("Gin Fizz")).toBeInTheDocument();
    expect(screen.queryByText("Fernet con Coca")).not.toBeInTheDocument();
  });

  it("ArrowDown/ArrowUp mueven el resaltado entre los resultados", async () => {
    const user = userEvent.setup();
    render(<ProductSearch drinks={drinks} onSelect={vi.fn()} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "gin");

    // Orden alfabético: "Gin Fizz" antes que "Gin Tonic"
    expect(screen.getByText("Gin Fizz").closest("li")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("Gin Tonic").closest("li")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Gin Fizz").closest("li")).toHaveAttribute("aria-selected", "false");

    await user.keyboard("{ArrowUp}");
    expect(screen.getByText("Gin Fizz").closest("li")).toHaveAttribute("aria-selected", "true");
  });

  it("Enter con un resultado resaltado llama a onSelect con el id correcto", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProductSearch drinks={drinks} onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "gin");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2); // Gin Tonic
  });

  it("Enter sin resultados no llama a onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProductSearch drinks={drinks} onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "whisky");
    await user.keyboard("{Enter}");

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("click en un resultado llama a onSelect (paridad con teclado)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProductSearch drinks={drinks} onSelect={onSelect} />);

    await user.type(screen.getByRole("textbox"), "fernet");
    await user.click(screen.getByText("Fernet con Coca"));

    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
