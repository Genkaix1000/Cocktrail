import { describe, expect, it } from "vitest";
import { centeredSquareCrop, needsCropTool } from "./cropDrinkImage";

describe("cropDrinkImage helpers", () => {
  it("needsCropTool si algún lado supera 512", () => {
    expect(needsCropTool(800, 400)).toBe(true);
    expect(needsCropTool(400, 400)).toBe(false);
    expect(needsCropTool(512, 512)).toBe(false);
  });

  it("centeredSquareCrop usa el lado menor", () => {
    expect(centeredSquareCrop(1000, 500)).toEqual({ sx: 250, sy: 0, sw: 500, sh: 500 });
    expect(centeredSquareCrop(400, 800)).toEqual({ sx: 0, sy: 200, sw: 400, sh: 400 });
  });
});
