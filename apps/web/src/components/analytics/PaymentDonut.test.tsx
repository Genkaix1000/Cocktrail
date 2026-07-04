import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import PaymentDonut from "./PaymentDonut";
import type { PaymentBreakdown } from "@/lib/analytics";

describe("PaymentDonut", () => {
  it("muestra el mensaje sin datos de pago", () => {
    render(<PaymentDonut breakdown={[]} total={0} isBosko={false} />);
    expect(screen.getByText("Sin datos de pago disponibles")).toBeInTheDocument();
  });

  it("renderiza el total y la leyenda por método de pago", () => {
    const breakdown: PaymentBreakdown[] = [
      { method: "efectivo", label: "Efectivo", total: 60000, count: 12, pct: 60, color: "#4ade80" },
      { method: "qr", label: "QR", total: 40000, count: 8, pct: 40, color: "#6db3f2" },
    ];
    render(<PaymentDonut breakdown={breakdown} total={100000} isBosko={false} />);
    expect(screen.getByText("$100.000")).toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("QR")).toBeInTheDocument();
    expect(screen.getByText("12 ops")).toBeInTheDocument();
  });
});
