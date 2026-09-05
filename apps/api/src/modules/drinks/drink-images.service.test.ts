import { describe, expect, it } from "vitest";
import { BadRequest } from "../../shared/errors/http-errors.js";
import { parseWebpBase64 } from "./drink-images.service.js";

describe("parseWebpBase64", () => {
  it("acepta data-url webp mínima", () => {
    const header = Buffer.alloc(16, 0);
    header.write("RIFF", 0);
    header.write("WEBP", 8);
    const dataUrl = `data:image/webp;base64,${header.toString("base64")}`;
    expect(parseWebpBase64(dataUrl).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("rechaza jpeg", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => parseWebpBase64(jpeg.toString("base64"))).toThrow(BadRequest);
  });
});
