import { describe, expect, it } from "vitest";

import {
  buildS1Sequence,
  MIN_TICKET_DOTS,
  S1_NAME_PREFIX,
  S1_SERVICE,
  S1_WRITE_CHARACTERISTIC,
  type S1Step,
} from "./s1-protocol";

const WIDTH_BYTES = 48; // 384px

function makeBitmap(height: number) {
  const data = new Uint8Array(WIDTH_BYTES * height);
  // Relleno determinístico no trivial para verificar que los bytes fluyen
  // enteros y en orden a través de franjas y chunks.
  for (let i = 0; i < data.length; i++) data[i] = (i * 7 + 3) % 256;
  return { widthBytes: WIDTH_BYTES, height, data };
}

function bytes(step: S1Step): number[] {
  return Array.from(step.bytes);
}

/**
 * Índice del primer paso de imagen. El ticket se centra en el papel, así que
 * antes de la imagen puede haber avances (ESC J): los índices fijos no sirven.
 */
function primerBloque(steps: S1Step[]): number {
  return steps.findIndex((s) => s.bytes[0] === 0x1d && s.bytes[1] === 0x76 && s.bytes[2] === 0x30);
}

/**
 * Pasos de avance de papel del RELLENO. Excluye los dos últimos pasos, porque
 * el feed de cierre del ticket es también un ESC J y contaría de más.
 */
function feedsDe(steps: S1Step[]): S1Step[] {
  return steps
    .slice(0, -2)
    .filter((s) => s.bytes.length === 3 && s.bytes[0] === 0x1b && s.bytes[1] === 0x4a);
}

/** Steps ESC J (avance de papel): 1B 4A n. Incluye el feed final (n=0x50). */
function escJSteps(steps: S1Step[]): S1Step[] {
  return steps.filter(
    (s) => s.bytes.length === 3 && s.bytes[0] === 0x1b && s.bytes[1] === 0x4a,
  );
}

describe("constantes", () => {
  it("expone servicio, característica y prefijo de nombre de la S1", () => {
    expect(S1_SERVICE).toBe(0xff00);
    expect(S1_WRITE_CHARACTERISTIC).toBe(0xff02);
    expect(S1_NAME_PREFIX).toBe("PPS1");
  });

  it("largo mínimo del ticket: 520 dots (~65mm a 203dpi)", () => {
    expect(MIN_TICKET_DOTS).toBe(520);
  });
});

describe("buildS1Sequence — modo normal (m=0x00, opts explícitos)", () => {
  // Los golden tests de chunking usan chunkSize 512 explícito para conservar
  // la matemática original; el default es 20 (MTU mínimo, ver test aparte).
  it("bitmap de 48x240: dos franjas de 120, cada una con su header", () => {
    const steps = buildS1Sequence(makeBitmap(240), { chunkSize: 512, mode: "normal" });

    // Setup en orden
    expect(bytes(steps[0])).toEqual([0x10, 0xff, 0xf1, 0x03]);
    expect(steps[0].delayAfterMs).toBe(100);
    expect(bytes(steps[1])).toEqual(new Array(12).fill(0));
    expect(bytes(steps[2])).toEqual([0x10, 0xff, 0x10, 0x00, 0x01]);

    // 240 filas -> 2 bloques de 120 (el tamaño validado con el aparato)
    const headers = steps.filter((st) => st.bytes[0] === 0x1d && st.bytes[1] === 0x76);
    expect(headers).toHaveLength(2);
    for (const h of headers) {
      expect(bytes(h).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 120, 0]);
    }

    // Cierre
    expect(bytes(steps[steps.length - 2])).toEqual([0x1b, 0x4a, 0x50]);
    expect(steps[steps.length - 2].delayAfterMs).toBe(2000);
    expect(bytes(steps[steps.length - 1])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });

  it("H=360 se parte en 3 franjas de 120, cada una con su PROPIO header", () => {
    const bitmap = makeBitmap(360);
    const steps = buildS1Sequence(bitmap, { chunkSize: 512, mode: "normal" });

    const headers = steps.filter((st) => st.bytes[0] === 0x1d && st.bytes[1] === 0x76);
    expect(headers).toHaveLength(3);
    for (const h of headers) {
      expect(bytes(h).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 120, 0]);
    }
    // Cada franja arranca donde termina la anterior
    expect(bytes(headers[1]).slice(8, 16)).toEqual(
      Array.from(bitmap.data.subarray(120 * WIDTH_BYTES, 120 * WIDTH_BYTES + 8)),
    );
    expect(bytes(headers[2]).slice(8, 16)).toEqual(
      Array.from(bitmap.data.subarray(240 * WIDTH_BYTES, 240 * WIDTH_BYTES + 8)),
    );

    // Relleno: faltan 160 dots, TODOS después de la imagen
    const feeds = feedsDe(steps);
    expect(feeds.map((f) => f.bytes[2])).toEqual([160]);
    expect(steps.indexOf(feeds[0])).toBeGreaterThan(steps.indexOf(headers[2]));

    expect(bytes(steps[steps.length - 2])).toEqual([0x1b, 0x4a, 0x50]);
    expect(bytes(steps[steps.length - 1])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });

  it("bitmap chico (8 filas) con chunk 512: relleno hasta 520 dots, todo después de la imagen", () => {
    const steps = buildS1Sequence(makeBitmap(8), { chunkSize: 512, mode: "normal" });

    const b1 = primerBloque(steps);
    expect(steps[b1].bytes.length).toBe(8 + WIDTH_BYTES * 8);
    expect(steps[b1].delayAfterMs).toBe(300);

    // Faltan 512 dots, todos DESPUÉS de la imagen y en tramos de ≤255.
    const feeds = feedsDe(steps);
    expect(feeds.reduce((a, f) => a + f.bytes[2], 0)).toBe(512);
    expect(feeds.every((f) => f.bytes[2] <= 255)).toBe(true);
    expect(feeds.every((f) => steps.indexOf(f) > b1)).toBe(true);

    expect(bytes(steps[steps.length - 2])).toEqual([0x1b, 0x4a, 0x50]);
    expect(bytes(steps[steps.length - 1])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });
});

describe("buildS1Sequence — modo doubleHeight (default, lo validado en el gate T1)", () => {
  it("default SIN opts de modo: header GS v 0 con m=0x02", () => {
    const steps = buildS1Sequence(makeBitmap(180), { chunkSize: 512 });

    // 180 filas downsampleadas -> 2 bloques (120 + 60), ambos con m=0x02
    const headersDh = steps.filter((st) => st.bytes[0] === 0x1d && st.bytes[1] === 0x76);
    expect(headersDh).toHaveLength(2);
    expect(bytes(headersDh[0]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 120, 0]);
    expect(bytes(headersDh[1]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 60, 0]);

    // Impreso real = 180 filas x2 = 360 dots < 520 -> faltan 160, centrados 80/80
    const feedsDh = feedsDe(steps);
    expect(feedsDh.map((f) => f.bytes[2])).toEqual([160]);
    expect(feedsDh.every((f) => f.delayAfterMs === 60)).toBe(true);
    expect(steps.indexOf(feedsDh[0])).toBeGreaterThan(primerBloque(steps));
    expect(bytes(steps[steps.length - 2])).toEqual([0x1b, 0x4a, 0x50]);
    expect(bytes(steps[steps.length - 1])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });

  it("si lo impreso llega a 520 dots no agrega relleno (solo queda el feed final)", () => {
    // 260 filas downsampleadas x2 = 520 dots justos
    const steps = buildS1Sequence(makeBitmap(260), { chunkSize: 512 });
    const feeds = escJSteps(steps);
    expect(feeds).toHaveLength(1);
    expect(bytes(feeds[0])).toEqual([0x1b, 0x4a, 0x50]);
  });

  it("las franjas siguen siendo de <=120 filas también con m=2", () => {
    const steps = buildS1Sequence(makeBitmap(300), { chunkSize: 512 });
    // 300 filas -> 120 + 120 + 60, cada bloque con su header
    const headers = steps.filter((st) => st.bytes[0] === 0x1d && st.bytes[1] === 0x76);
    expect(headers.map((h) => h.bytes[6])).toEqual([120, 120, 60]);
    expect(headers.every((h) => h.bytes[3] === 0x02)).toBe(true);
  });
});

describe("buildS1Sequence — chunk size", () => {
  it("default SIN opts: chunks de 20 bytes (payload seguro con MTU mínimo BLE) y m=0x02", () => {
    // Franja de 8 filas: 8 + 384 = 392 bytes -> 19 chunks de 20 + 1 de 12
    const steps = buildS1Sequence(makeBitmap(8));

    // 3 setup + 20 chunks + 2 ESC J (faltante 504 = 255+249) + feed + stop
    expect(steps).toHaveLength(3 + 20 + 2 + 2);
    expect(steps[primerBloque(steps)].bytes[3]).toBe(0x02); // modo default: doubleHeight
    const b = primerBloque(steps);
    const imageSteps = steps.slice(b, b + 20);
    expect(imageSteps.slice(0, 19).every((s) => s.bytes.length === 20)).toBe(true);
    expect(imageSteps[19].bytes.length).toBe(12);
    expect(imageSteps.slice(0, 19).every((s) => s.delayAfterMs === 10)).toBe(true);
    expect(imageSteps[19].delayAfterMs).toBe(300);
    const feedsChunk = feedsDe(steps);
    expect(feedsChunk.reduce((a, f) => a + f.bytes[2], 0)).toBe(504); // 520 - 8×2
    expect(feedsChunk.every((f) => f.bytes[2] <= 255)).toBe(true);

    // Los bytes reensamblados son idénticos a la corrida con chunk 512
    const reassembled = imageSteps.flatMap((s) => Array.from(s.bytes));
    const golden = buildS1Sequence(makeBitmap(8), { chunkSize: 512 });
    expect(reassembled).toEqual(Array.from(golden[primerBloque(golden)].bytes));
  });

  it("chunkSize inválido (no entero o fuera de [20, 512]) cae al default 20", () => {
    const byDefault = buildS1Sequence(makeBitmap(8));
    for (const chunkSize of [8, 19, 513, 512.5, NaN, -1]) {
      const steps = buildS1Sequence(makeBitmap(8), { chunkSize });
      expect(steps).toHaveLength(byDefault.length);
      expect(steps[primerBloque(steps)].bytes.length).toBe(20);
    }
  });
});
