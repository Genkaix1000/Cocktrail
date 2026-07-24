import { describe, expect, it, beforeEach } from "vitest";
import { gridMinWidth, loadCols, saveCols } from "./crudCols";

const ALL = ["a", "b", "c"] as const;
const REQUIRED = ["a"] as const;
const KEY = "test:cols";

describe("crudCols", () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it("loadCols cae al default sin nada guardado y fuerza las required al guardar", () => {
    expect(loadCols(KEY, ALL, REQUIRED, ALL)).toEqual(["a", "b", "c"]);

    saveCols(KEY, ALL, REQUIRED, ["c"]);
    expect(loadCols(KEY, ALL, REQUIRED, ALL)).toEqual(["a", "c"]);
  });

  it("gridMinWidth suma los mínimos de cada columna más los gaps", () => {
    // 56 + 160 + 104 = 320, con 2 gaps de 12.
    expect(gridMinWidth("56px minmax(160px, 1fr) 104px")).toBe(344);
    expect(gridMinWidth("100px 100px", 0)).toBe(200);
  });
});
