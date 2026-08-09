import { describe, expect, it } from "vitest";
import { scoreMpHealth, type MpHealthScore } from "./MpHealthPanel";
import type { MpHealth } from "@/services/mercadopago.service";

const ok = { ok: true as const, detail: "ok" };
const fail = { ok: false as const, detail: "fail", action: "fix it" };
const unk = { ok: null, detail: "unknown" };

function base(partial: Partial<MpHealth> = {}): MpHealth {
  return {
    checks: {
      singleSeller: ok,
      deviceOwnership: ok,
      deviceMode: ok,
      cajaProvisioned: ok,
    },
    fallback: { status: "unknown", checkedAt: null },
    usingEnvDevice: false,
    blocking: false,
    hasLinkedDevice: true,
    checkedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("scoreMpHealth", () => {
  it("100% si todos los checks decididos están OK", () => {
    const s = scoreMpHealth(base());
    expect(s.percent).toBe(100);
    expect(s.failures).toHaveLength(0);
  });

  it("baja el % con fallas y lista solo esas", () => {
    const s = scoreMpHealth(
      base({
        checks: {
          singleSeller: ok,
          cajaProvisioned: fail,
          deviceOwnership: fail,
          deviceMode: ok,
        },
      }),
    );
    expect(s.percent).toBe(50);
    expect(s.failures.map((f) => f.key)).toEqual(["cajaProvisioned", "deviceOwnership"]);
  });

  it("sin Posnet: no cuenta ownership/mode", () => {
    const s = scoreMpHealth(
      base({
        hasLinkedDevice: false,
        checks: {
          singleSeller: ok,
          cajaProvisioned: ok,
          deviceOwnership: fail,
          deviceMode: fail,
        },
      }),
    );
    expect(s.percent).toBe(100);
    expect(s.failures).toHaveLength(0);
  });

  it("unknown no baja el score", () => {
    const s: MpHealthScore = scoreMpHealth(
      base({
        checks: {
          singleSeller: ok,
          cajaProvisioned: unk,
          deviceOwnership: ok,
          deviceMode: ok,
        },
      }),
    );
    expect(s.percent).toBe(100);
  });
});
