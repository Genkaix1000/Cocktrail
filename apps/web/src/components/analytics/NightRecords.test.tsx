import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import NightRecords from "./NightRecords";
import type { NightRecord } from "@/lib/analytics";

function makeRecord(overrides: Partial<NightRecord> = {}): NightRecord {
  return {
    type: "best",
    label: "Mejor Noche",
    value: "$120.000",
    sub: "Vie 6 jun",
    ...overrides,
  };
}

describe("NightRecords", () => {
  it("muestra el estado vacío sin récords", () => {
    render(<NightRecords records={[]} isBosko={false} />);
    expect(screen.getByText("Aún no hay récords registrados")).toBeInTheDocument();
  });

  it("renderiza una card por récord con su emoji", () => {
    render(
      <NightRecords
        records={[
          makeRecord({ type: "best", label: "Mejor Noche" }),
          makeRecord({ type: "worst", label: "Peor Noche", sub: "Lun 2 jun" }),
        ]}
        isBosko={false}
      />
    );
    expect(screen.getByText("Mejor Noche")).toBeInTheDocument();
    expect(screen.getByText("Peor Noche")).toBeInTheDocument();
    expect(screen.getByText("🏆")).toBeInTheDocument();
    expect(screen.getByText("📉")).toBeInTheDocument();
  });
});
