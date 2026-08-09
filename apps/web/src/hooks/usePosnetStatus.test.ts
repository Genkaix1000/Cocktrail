import { describe, expect, it, vi } from "vitest";
import type { MpHealth } from "@/services/mercadopago.service";
import { derivePosnetStatus } from "./usePosnetStatus";

vi.mock("@/services/mercadopago.service", () => ({
  mercadopagoService: {
    getMpHealth: vi.fn(),
    testDeviceCharge: vi.fn(),
  },
}));

function makeHealth(overrides: Partial<MpHealth> = {}): MpHealth {
  return {
    checks: {
      singleSeller: { ok: true, detail: "ok" },
      deviceOwnership: { ok: true, detail: "ok" },
      deviceMode: { ok: true, detail: "ok" },
      cajaProvisioned: { ok: true, detail: "ok" },
    },
    fallback: { status: "usable", checkedAt: "2026-07-23T00:00:00Z" },
    usingEnvDevice: false,
    blocking: false,
    hasLinkedDevice: true,
    checkedAt: "2026-07-23T16:00:00Z",
    ...overrides,
  };
}

describe("derivePosnetStatus (T24 — advertencia vs bloqueo)", () => {
  it("sin salud es unknown, nunca rojo", () => {
    expect(derivePosnetStatus(null).level).toBe("unknown");
  });

  it("todo OK es ok", () => {
    expect(derivePosnetStatus(makeHealth()).level).toBe("ok");
  });

  it("blocking=true es bloqueo con el action del chequeo de pertenencia", () => {
    const health = makeHealth({
      blocking: true,
      checks: {
        ...makeHealth().checks,
        deviceOwnership: {
          ok: false,
          detail: "El lector NO aparece en la cuenta activa.",
          action: "Reclamalo desde la app de MP.",
        },
      },
    });
    const result = derivePosnetStatus(health);
    expect(result.level).toBe("blocked");
    expect(result.message).toContain("Reclamalo desde la app de MP");
  });

  it("STANDALONE es advertencia (no bloqueo)", () => {
    const health = makeHealth({
      checks: {
        ...makeHealth().checks,
        deviceMode: { ok: false, detail: "STANDALONE", action: "Ponelo en modo PDV." },
      },
    });
    expect(derivePosnetStatus(health).level).toBe("warning");
  });

  it("caja huérfana es advertencia", () => {
    const health = makeHealth({
      checks: {
        ...makeHealth().checks,
        cajaProvisioned: { ok: false, detail: "huérfana", action: "Re-provisioná." },
      },
    });
    expect(derivePosnetStatus(health).level).toBe("warning");
  });

  it("usingEnvDevice es advertencia", () => {
    expect(derivePosnetStatus(makeHealth({ usingEnvDevice: true })).level).toBe("warning");
  });

  it("un chequeo desconocido (sin caja/sin lector) no es rojo: queda unknown", () => {
    const health = makeHealth({
      checks: {
        ...makeHealth().checks,
        deviceOwnership: { ok: null, detail: "La caja no tiene Posnet activo vinculado." },
        deviceMode: { ok: null, detail: "sin lector" },
      },
    });
    expect(derivePosnetStatus(health).level).toBe("unknown");
  });
});
