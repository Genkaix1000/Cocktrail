import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import SmartInsights from "./SmartInsights";
import type { SmartInsight } from "@/lib/analytics";

describe("SmartInsights", () => {
  it("muestra el mensaje de datos insuficientes sin insights", () => {
    render(<SmartInsights insights={[]} isBosko={false} />);
    expect(
      screen.getByText("Todavía no hay suficientes datos para generar insights.")
    ).toBeInTheDocument();
  });

  it("renderiza cada insight con su tono", () => {
    const insights: SmartInsight[] = [
      { icon: "📈", text: "Facturación 20% arriba del promedio", tone: "positive" },
      { icon: "⚠️", text: "Menos tickets que la noche anterior", tone: "negative" },
      { icon: "ℹ️", text: "Sin cambios relevantes", tone: "neutral" },
    ];
    render(<SmartInsights insights={insights} isBosko={false} />);
    expect(screen.getByText("Facturación 20% arriba del promedio")).toBeInTheDocument();
    expect(screen.getByText("Menos tickets que la noche anterior")).toBeInTheDocument();
    expect(screen.getByText("Sin cambios relevantes")).toBeInTheDocument();
  });
});
