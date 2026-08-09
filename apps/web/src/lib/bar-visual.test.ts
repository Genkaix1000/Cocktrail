import { describe, expect, it } from "vitest";
import { barDisplayLabel, barVisualKind } from "./bar-visual";

describe("barVisualKind", () => {
  it("detecta VIP y Portátil por código o external_pos_id", () => {
    expect(barVisualKind("BARRA-01")).toBe("vip");
    expect(barVisualKind("COCKTRAILBAR01")).toBe("vip");
    expect(barVisualKind("PORTATIL")).toBe("portatil");
    expect(barVisualKind("COCKTRAILPORTATIL")).toBe("portatil");
    expect(barVisualKind("OTRA")).toBe("other");
  });
});

describe("barDisplayLabel", () => {
  it("usa nombres fijos para VIP y Portátil", () => {
    expect(barDisplayLabel("BARRA-01")).toBe("Barra VIP");
    expect(barDisplayLabel("PORTATIL")).toBe("Portátil");
    expect(barDisplayLabel("X", "Mi caja")).toBe("Mi caja");
  });
});
