import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import RevenueByProduct from "./RevenueByProduct";
import type { ProductRevenue } from "@/lib/analytics";

function makeProduct(overrides: Partial<ProductRevenue> = {}): ProductRevenue {
  return {
    drinkId: 1,
    name: "Fernet con Coca",
    qty: 10,
    subtotal: 25000,
    pctRevenue: 40,
    pctQty: 35,
    ...overrides,
  };
}

describe("RevenueByProduct", () => {
  it("muestra el estado vacío sin productos", () => {
    render(<RevenueByProduct products={[]} isBosko={false} />);
    expect(screen.getByText("Aún no hay datos de productos")).toBeInTheDocument();
  });

  it("renderiza el top 8 con ranking, unidades y revenue", () => {
    const products = Array.from({ length: 10 }, (_, i) =>
      makeProduct({ drinkId: i + 1, name: `Trago ${i + 1}`, subtotal: 10000 - i * 100 })
    );
    render(<RevenueByProduct products={products} isBosko={false} />);
    expect(screen.getByText("Trago 1")).toBeInTheDocument();
    expect(screen.queryByText("Trago 9")).not.toBeInTheDocument();
    expect(screen.getByText("Top 8")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
