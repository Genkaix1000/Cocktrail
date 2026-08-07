import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  claveDiaArgentina,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
} from "./fechas.js";

// El bug original salió porque el server de Render corre en UTC. Estos tests
// simulan ese entorno: si alguien saca el `timeZone` explícito, fallan.
const TZ_ORIGINAL = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "UTC";
});

afterAll(() => {
  process.env.TZ = TZ_ORIGINAL;
});

// 2026-08-07 19:27:05 UTC === 2026-08-07 16:27:05 en Argentina (UTC-3).
const TARDE_UTC = Date.parse("2026-08-07T19:27:05.000Z");
// 2026-08-08 01:10 UTC === 2026-08-07 22:10 en Argentina: el día NO cambió acá.
const NOCHE_UTC = Date.parse("2026-08-08T01:10:00.000Z");

describe("formatearHora", () => {
  it("muestra la hora argentina, no la UTC", () => {
    expect(formatearHora(TARDE_UTC)).toBe("16:27");
  });

  it("agrega segundos cuando se piden", () => {
    expect(formatearHora(TARDE_UTC, { conSegundos: true })).toBe("16:27:05");
  });

  it("usa 24h: las 19:27 locales no se muestran como 07:27", () => {
    // 22:27 UTC === 19:27 Argentina
    expect(formatearHora(Date.parse("2026-08-07T22:27:00.000Z"))).toBe("19:27");
  });
});

describe("formatearFechaHora", () => {
  it("usa la fecha y hora argentinas", () => {
    expect(formatearFechaHora(TARDE_UTC)).toContain("07/08/2026");
    expect(formatearFechaHora(TARDE_UTC)).toContain("16:27");
  });

  it("no adelanta el día cuando en UTC ya es mañana", () => {
    expect(formatearFechaHora(NOCHE_UTC)).toContain("07/08/2026");
  });
});

describe("formatearFecha", () => {
  it("incluye el día argentino", () => {
    expect(formatearFecha(NOCHE_UTC)).toContain("07/08/2026");
  });
});

describe("claveDiaArgentina", () => {
  it("da el día argentino en formato ordenable", () => {
    expect(claveDiaArgentina(TARDE_UTC)).toBe("2026-08-07");
  });

  it("no adelanta el día después de las 21:00 locales (donde UTC ya cambió)", () => {
    expect(claveDiaArgentina(NOCHE_UTC)).toBe("2026-08-07");
    // toISOString daría el día siguiente: ese es justamente el bug que evita.
    expect(new Date(NOCHE_UTC).toISOString().slice(0, 10)).toBe("2026-08-08");
  });

  it("cruza al día siguiente recién pasada la medianoche argentina", () => {
    expect(claveDiaArgentina(Date.parse("2026-08-08T03:30:00.000Z"))).toBe("2026-08-08");
  });
});
