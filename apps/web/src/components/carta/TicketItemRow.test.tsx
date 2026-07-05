import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import TicketItemRow from "./TicketItemRow";
import type { OrderItem } from "@cocktrail/shared";

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    drinkId: 1,
    name: "Fernet con Coca",
    qty: 2,
    unitPrice: 2500,
    subtotal: 5000,
    ...overrides,
  };
}

describe("TicketItemRow", () => {
  it("sin showPrice muestra nombre y cantidad, sin precio", () => {
    render(
      <ul>
        <TicketItemRow item={makeItem()} accentColor="#1a5c3a" />
      </ul>,
    );

    expect(screen.getByText("Fernet con Coca")).toBeInTheDocument();
    expect(screen.getByText("x2")).toBeInTheDocument();
    expect(screen.queryByText("$5.000")).not.toBeInTheDocument();
  });

  it("con showPrice muestra también el subtotal", () => {
    render(
      <ul>
        <TicketItemRow item={makeItem()} accentColor="#1a5c3a" showPrice />
      </ul>,
    );

    expect(screen.getByText("Fernet con Coca")).toBeInTheDocument();
    expect(screen.getByText("$5.000")).toBeInTheDocument();
  });

  it("usa glass-water como ícono de fallback cuando no hay drink resuelto", () => {
    const { container } = render(
      <ul>
        <TicketItemRow item={makeItem()} accentColor="#1a5c3a" />
      </ul>,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
