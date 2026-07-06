import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import NightRecords from "./NightRecords";
import type { NightRecord } from "@/lib/analytics";

function makeRecord(overrides: Partial<NightRecord> = {}): NightRecord {
  return {
    type: "star_drink",
    label: "Trago Estrella",
    value: "Fernet con Coca",
    sub: "23 unidades vendidas (últimos 30 días)",
    ...overrides,
  };
}

describe("NightRecords", () => {
  it("muestra el estado vacío sin récords", () => {
    render(<NightRecords records={[]} isBosko={false} />);
    expect(screen.getByText("Aún no hay récords registrados")).toBeInTheDocument();
  });

  it("renderiza la card de Trago Estrella con su emoji", () => {
    render(<NightRecords records={[makeRecord()]} isBosko={false} />);
    expect(screen.getByText("Trago Estrella")).toBeInTheDocument();
    expect(screen.getByText("Fernet con Coca")).toBeInTheDocument();
    expect(screen.getByText("🍹")).toBeInTheDocument();
  });
});
