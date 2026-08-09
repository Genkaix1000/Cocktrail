import { describe, expect, it } from "vitest";
import { buildPagosSteps, buildSteps, type TourStepId } from "./tourSteps";

function ids(cfg: Parameters<typeof buildSteps>[0]): TourStepId[] {
  return buildSteps(cfg).map((s) => s.id);
}

describe("buildSteps", () => {
  it("empieza por welcome + nav, después pagos", () => {
    const list = ids({
      linked: false,
      displayName: null,
      hasOrphanCaja: false,
      resumePostLink: false,
    });
    expect(list.slice(0, 3)).toEqual(["welcome", "nav-overview", "mp-unlinked"]);
    expect(list).toContain("pdv-section");
    expect(list).toContain("pdv-posnet");
    expect(list).toContain("carta-nuevo");
    expect(list).toContain("carta-form");
    expect(list).toContain("staff-nuevo");
    expect(list).toContain("staff-form");
    expect(list.at(-1)).toBe("done");
  });

  it("linked usa mp-card al final con scrollAlign end", () => {
    const step = buildSteps({
      linked: true,
      displayName: "Bosko",
      hasOrphanCaja: false,
      resumePostLink: false,
    }).find((s) => s.id === "mp-linked");
    expect(step?.selector).toBe('[data-tour="mp-card"]');
    expect(step?.scrollAlign).toBe("end");
    expect(step?.body).not.toMatch(/sandbox/i);
  });

  it("carta-nuevo y staff-nuevo avanzan al click", () => {
    const steps = buildSteps({
      linked: true,
      displayName: "A",
      hasOrphanCaja: false,
      resumePostLink: false,
    });
    expect(steps.find((s) => s.id === "carta-nuevo")?.advanceOnClick).toBe(true);
    expect(steps.find((s) => s.id === "staff-nuevo")?.advanceOnClick).toBe(true);
  });

  it("resume post-link arranca en congrats sin welcome/nav", () => {
    expect(
      ids({
        linked: true,
        displayName: "X",
        hasOrphanCaja: false,
        resumePostLink: true,
      })[0],
    ).toBe("mp-congrats");
  });

  it("welcome usa branding Mi Boliche", () => {
    const welcome = buildSteps({
      linked: true,
      displayName: null,
      hasOrphanCaja: false,
      resumePostLink: false,
    })[0];
    expect(welcome.title).toMatch(/Mi Boliche/i);
    expect(welcome.icon).toBe("brand");
    expect(welcome.phase).toBe("inicio");
  });
});

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
