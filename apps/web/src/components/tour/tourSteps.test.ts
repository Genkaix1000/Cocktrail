import { describe, expect, it } from "vitest";
import { buildPagosSteps } from "./tourSteps";

describe("buildPagosSteps", () => {
  it("unlinked empieza en vinculame y no incluye carta/staff", () => {
    const list = buildPagosSteps({
      linked: false,
      displayName: null,
      hasOrphanCaja: false,
      resumePostLink: false,
    });
    expect(list[0]?.id).toBe("mp-unlinked");
    expect(list.map((s) => s.id)).not.toContain("carta-intro");
    expect(list.map((s) => s.id)).toContain("pdv-posnet");
  });

  it("linked usa mp-card con scrollAlign end", () => {
    const step = buildPagosSteps({
      linked: true,
      displayName: "Bosko",
      hasOrphanCaja: false,
      resumePostLink: false,
    }).find((s) => s.id === "mp-linked");
    expect(step?.selector).toBe('[data-tour="mp-card"]');
    expect(step?.scrollAlign).toBe("end");
    expect(step?.body).toContain("Bosko");
  });

  it("linked con orphan incluye pdv-orphan", () => {
    const ids = buildPagosSteps({
      linked: true,
      displayName: null,
      hasOrphanCaja: true,
      resumePostLink: false,
    }).map((s) => s.id);
    expect(ids).toContain("pdv-orphan");
  });

  it("resume post-link arranca en congrats", () => {
    expect(
      buildPagosSteps({
        linked: true,
        displayName: "X",
        hasOrphanCaja: false,
        resumePostLink: true,
      })[0]?.id,
    ).toBe("mp-congrats");
  });
});
