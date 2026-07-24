import { describe, expect, it, beforeEach } from "vitest";
import {
  STAFF_COLS_DEFAULT,
  STAFF_COLS_STORAGE_KEY,
  loadStaffCols,
  saveStaffCols,
} from "./staffCrud";

describe("staffCrud", () => {
  beforeEach(() => {
    localStorage.removeItem(STAFF_COLS_STORAGE_KEY);
  });

  it("loadStaffCols devuelve todas las columnas por default", () => {
    expect(loadStaffCols()).toEqual(STAFF_COLS_DEFAULT);
  });

  it("save + load fuerza user/actions", () => {
    saveStaffCols(["role"]);
    const cols = loadStaffCols();
    expect(cols).toContain("role");
    expect(cols).toContain("user");
    expect(cols).toContain("actions");
  });
});
