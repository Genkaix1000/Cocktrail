import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DrinkCard from "./DrinkCard";

describe("DrinkCard", () => {
  it("renderiza nombre y precio formateado en variante regular", () => {
    render(<DrinkCard name="Fernet con Coca" price={2500} icon="glass-water" />);
    expect(screen.getByText("Fernet con Coca")).toBeInTheDocument();
    expect(screen.getByText("$2.500")).toBeInTheDocument();
  });

  it("solo muestra el botón de agregar cuando quantity es 0", () => {
    render(<DrinkCard name="Gin Tonic" price={3000} quantity={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("muestra el contador y el botón de quitar cuando quantity > 0", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    render(<DrinkCard name="Gin Tonic" price={3000} quantity={2} onAdd={onAdd} onRemove={onRemove} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar del pedido" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Agregar al pedido" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("activa onAdd al clickear la card completa (handleActivate)", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<DrinkCard name="Gin Tonic" price={3000} onAdd={onAdd} />);
    await user.click(screen.getByText("Gin Tonic"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renderiza el badge de PROMO en variante promo", () => {
    render(<DrinkCard name="2x1 Fernet" price={2500} variant="promo" />);
    expect(screen.getByText("⚡ PROMO")).toBeInTheDocument();
  });

  it("renderiza el badge de TREND en variante trending", () => {
    render(<DrinkCard name="Aperol Spritz" price={4000} variant="trending" />);
    expect(screen.getByText("▲ TREND")).toBeInTheDocument();
  });
});
