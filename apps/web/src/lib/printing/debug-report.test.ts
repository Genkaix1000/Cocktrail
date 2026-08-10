import { describe, expect, it, vi, afterEach } from "vitest";

import { buildPrinterDebugReport } from "./debug-report";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildPrinterDebugReport", () => {
  it("incluye href, secureContext y estado bluetooth", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://192.168.0.11:3000/caja", origin: "https://192.168.0.11:3000" },
      isSecureContext: true,
      matchMedia: (q: string) => ({ matches: q.includes("standalone") }),
    });
    vi.stubGlobal("navigator", {
      userAgent: "TestAgent",
      bluetooth: {
        getAvailability: async () => true,
        getDevices: async () => [{ id: "dev-1", name: "PPS1-TEST" }],
      },
      permissions: undefined,
    });
    // localStorage del ble id
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    const report = await buildPrinterDebugReport();
    expect(report).toContain("=== miBoliche impresora debug ===");
    expect(report).toContain("https://192.168.0.11:3000/caja");
    expect(report).toContain("secureContext: true");
    expect(report).toContain("standalone: true");
    expect(report).toContain("navigator.bluetooth: present");
    expect(report).toContain("bluetooth.getAvailability: true");
    expect(report).toContain("PPS1-TEST");
  });
});
