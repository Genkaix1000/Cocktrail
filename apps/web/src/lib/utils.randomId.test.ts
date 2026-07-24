import { afterEach, describe, expect, it, vi } from "vitest";

import { randomId } from "./utils";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back when crypto.randomUUID is missing (HTTP LAN)", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    expect(randomId()).toMatch(UUID_V4);
  });
});
