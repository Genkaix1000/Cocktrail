import { describe, expect, it } from "vitest";

import { plural } from "./utils";

describe("plural", () => {
  it("usa el singular con 1 (el bug era '1 noches')", () => {
    expect(plural(1, "noche", "noches")).toBe("1 noche");
  });

  it("usa el plural con 0 y con más de 1", () => {
    expect(plural(0, "noche", "noches")).toBe("0 noches");
    expect(plural(2, "noche", "noches")).toBe("2 noches");
    expect(plural(37, "unidad vendida", "unidades vendidas")).toBe("37 unidades vendidas");
  });

  it("trata -1 como singular", () => {
    expect(plural(-1, "noche", "noches")).toBe("-1 noche");
  });
});
