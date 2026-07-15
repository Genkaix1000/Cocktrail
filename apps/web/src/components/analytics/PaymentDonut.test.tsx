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

  it("con total real $0, muestra los 4 métodos en cero con el punto de la leyenda en gris (no colores de relleno)", () => {
    const breakdown: PaymentBreakdown[] = [
      { method: "efectivo", label: "Efectivo", total: 0, count: 0, pct: 0, color: "#10b981" },
      { method: "tarjeta", label: "Tarjeta", total: 0, count: 0, pct: 0, color: "#3b82f6" },
      { method: "qr", label: "Transferencia / QR", total: 0, count: 0, pct: 0, color: "#a855f7" },
      { method: "otros", label: "Otros", total: 0, count: 0, pct: 0, color: "#f97316" },
    ];
    const { container } = render(<PaymentDonut breakdown={breakdown} total={0} isBosko={false} />);

    // No debe mostrar el mensaje genérico de "sin datos" — se muestran los 4
    // métodos igual, en $0/0%, para que la leyenda sea legible.
    expect(screen.queryByText("Sin datos de pago disponibles")).not.toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getAllByText("0 ops").length).toBe(4);
    expect(screen.getAllByText("0%").length).toBe(4);

    // Ningún punto de la leyenda usa los colores reales del canal.
    const dots = container.querySelectorAll(".rounded-full.shrink-0");
    dots.forEach((dot) => {
      expect((dot as HTMLElement).style.backgroundColor).not.toBe("rgb(16, 185, 129)"); // #10b981
    });

    // Los 4 segmentos de color existen en el SVG pero con longitud 0 (pct:0)
    // — ningún arco es visible, el círculo de fondo gris queda como único
    // elemento visible del anillo.
    const coloredArcs = container.querySelectorAll('circle[stroke="#10b981"], circle[stroke="#3b82f6"], circle[stroke="#a855f7"], circle[stroke="#f97316"]');
    coloredArcs.forEach((arc) => {
      const dasharray = (arc as SVGCircleElement).getAttribute("stroke-dasharray") ?? "";
      const [visibleLength] = dasharray.split(" ");
      expect(Number(visibleLength)).toBe(0);
    });
  });
});
