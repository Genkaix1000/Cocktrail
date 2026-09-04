import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PaymentDonut from "./PaymentDonut";
import type { PaymentBreakdown } from "@/lib/analytics";

describe("PaymentDonut", () => {
  it("muestra el mensaje sin datos de pago", () => {
    render(<PaymentDonut breakdown={[]} total={0} />);
    expect(screen.getByText("Sin datos de pago disponibles")).toBeInTheDocument();
    expect(screen.getByText("% sobre facturado bruto")).toBeInTheDocument();
  });

  it("renderiza el % del canal dominante y la leyenda", () => {
    const breakdown: PaymentBreakdown[] = [
      { method: "efectivo", label: "Efectivo", total: 60000, count: 12, pct: 60, color: "#4ade80" },
      { method: "qr", label: "QR", total: 40000, count: 8, pct: 40, color: "#6db3f2" },
    ];
    render(<PaymentDonut breakdown={breakdown} total={100000} />);
    expect(screen.getByRole("img", { name: /Efectivo 60%/ })).toBeInTheDocument();
    expect(screen.getAllByText("Efectivo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("QR")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("con total real $0, muestra los métodos en cero sin arcos de color", () => {
    const breakdown: PaymentBreakdown[] = [
      { method: "efectivo", label: "Efectivo", total: 0, count: 0, pct: 0, color: "var(--success-base)" },
      { method: "tarjeta", label: "Tarjeta", total: 0, count: 0, pct: 0, color: "var(--channel-card)" },
      { method: "qr", label: "Transferencia / QR", total: 0, count: 0, pct: 0, color: "var(--channel-qr)" },
      { method: "otros", label: "Otros", total: 0, count: 0, pct: 0, color: "var(--text-tertiary)" },
    ];
    const { container } = render(<PaymentDonut breakdown={breakdown} total={0} />);

    expect(screen.queryByText("Sin datos de pago disponibles")).not.toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("Sin ventas")).toBeInTheDocument();
    expect(screen.getAllByText("0%").length).toBeGreaterThanOrEqual(4);

    const coloredArcs = container.querySelectorAll("circle[stroke='var(--success-base)'], circle[stroke='var(--channel-qr)'], circle[stroke='var(--channel-card)']");
    expect(coloredArcs.length).toBe(0);
  });
});
