import { describe, expect, it, beforeEach } from "vitest";
import {
  CARTA_COLS_DEFAULT,
  CARTA_COLS_STORAGE_KEY,
  loadCartaCols,
  saveCartaCols,
} from "./cartaCrud";

describe("cartaCrud", () => {
  beforeEach(() => {
    localStorage.removeItem(CARTA_COLS_STORAGE_KEY);
  });

  it("loadCartaCols devuelve default si no hay storage", () => {
    expect(loadCartaCols()).toEqual(CARTA_COLS_DEFAULT);
  });

  it("save + load redondea y fuerza name/actions", () => {
    saveCartaCols(["id", "price"]);
    const cols = loadCartaCols();
    expect(cols).toContain("id");
    expect(cols).toContain("price");
    expect(cols).toContain("name");
    expect(cols).toContain("actions");
  });
});
