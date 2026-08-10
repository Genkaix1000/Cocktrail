import { beforeEach, describe, expect, it } from "vitest";
import {
  HELP_GENERAL_SEEN_KEY,
  getCategories,
  hasSeenHelpGeneral,
  isAppInstalledOrDownloaded,
  markHelpGeneralSeen,
} from "./helpTours";

describe("helpTours storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hasSeenHelpGeneral es false hasta marcar", () => {
    expect(hasSeenHelpGeneral()).toBe(false);
    markHelpGeneralSeen();
    expect(hasSeenHelpGeneral()).toBe(true);
    expect(localStorage.getItem(HELP_GENERAL_SEEN_KEY)).toBe("1");
  });

  it("migra tour lineal viejo como seen", () => {
    localStorage.setItem("cocktrail_tour_seen_admin", "1");
    expect(hasSeenHelpGeneral()).toBe(true);
  });
});

describe("isAppInstalledOrDownloaded", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("retorna true cuando app_downloaded está en localStorage", () => {
    expect(isAppInstalledOrDownloaded()).toBe(false);
    localStorage.setItem("app_downloaded", "true");
    expect(isAppInstalledOrDownloaded()).toBe(true);
  });

  it("omite el paso de instalación en el onboarding cuando la app está descargada", () => {
    localStorage.setItem("app_downloaded", "true");

    const adminGeneral = getCategories("admin").find((c) => c.id === "general")!;
    const adminIds = adminGeneral.steps.map((s) => s.id);
    expect(adminIds).not.toContain("general-install");

    const cajaGeneral = getCategories("caja").find((c) => c.id === "general")!;
    const cajaIds = cajaGeneral.steps.map((s) => s.id);
    expect(cajaIds).not.toContain("caja-install");
  });
});

describe("getCategories", () => {
  it("admin incluye general, pagos y sistema", () => {
    const ids = getCategories("admin").map((c) => c.id);
    expect(ids).toContain("general");
    expect(ids).toContain("pagos");
    expect(ids).toContain("sistema");
    expect(ids).toContain("dashboard");
  });

  it("caja respeta permisos de historial/metricas", () => {
    const limited = getCategories("caja", {
      hasHistorial: false,
      hasMetricas: false,
      canCloseNight: false,
      hasLinkedDevice: null,
    }).map((c) => c.id);
    expect(limited).toEqual(["general", "venta"]);

    const full = getCategories("caja", {
      hasHistorial: true,
      hasMetricas: true,
      canCloseNight: true,
      hasLinkedDevice: true,
    }).map((c) => c.id);
    expect(full).toContain("caja-historial");
    expect(full).toContain("metricas");
  });

  it("pagos tiene los pasos definidos estáticamente", () => {
    const pagos = getCategories("admin").find((c) => c.id === "pagos");
    expect(pagos?.steps.length).toBeGreaterThan(0);
    expect(pagos?.dynamicSteps).toBeFalsy();
  });

  it("tour general admin es corto: install → nav → noche → pagos", () => {
    const general = getCategories("admin").find((c) => c.id === "general")!;
    const ids = general.steps.map((s) => s.id);
    if (ids[0] === "general-install") {
      expect(ids.slice(0, 4)).toEqual([
        "general-install",
        "general-welcome",
        "general-nav",
        "general-night",
      ]);
    }
    expect(ids).toContain("general-pagos");
    expect(ids).toContain("general-night");
    expect(ids).not.toContain("general-night-open");
    expect(ids).not.toContain("general-night-close-hint");
    expect(ids).not.toContain("general-carta");
  });
});
