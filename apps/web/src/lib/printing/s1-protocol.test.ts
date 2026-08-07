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
  it("bitmap de 48x240: secuencia dorada completa (orden, headers, chunks, delays)", () => {
    const steps = buildS1Sequence(makeBitmap(240), { chunkSize: 512, mode: "normal" });

    // 3 setup + 23 chunks de imagen + 2 ESC J de largo mínimo + feed + stop
    expect(steps).toHaveLength(30);

    // ENABLE -> wake -> densidad, 100ms cada uno
    expect(bytes(steps[0])).toEqual([0x10, 0xff, 0xf1, 0x03]);
    expect(steps[0].delayAfterMs).toBe(100);
    expect(bytes(steps[1])).toEqual(new Array(12).fill(0));
    expect(steps[1].delayAfterMs).toBe(100);
    expect(bytes(steps[2])).toEqual([0x10, 0xff, 0x10, 0x00, 0x01]);
    expect(steps[2].delayAfterMs).toBe(100);

    // Header GS v 0 exacto al inicio del primer chunk: m=0 xL=48 xH=0 yL=240 yH=0
    expect(bytes(steps[primerBloque(steps)]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 240, 0]);

    // Franja de 240 filas = 8 + 11520 = 11528 bytes -> 22 chunks de 512 + 1 de 264
    const b = primerBloque(steps);
    const imageSteps = steps.slice(b, b + 23);
    expect(imageSteps.slice(0, 22).every((s) => s.bytes.length === 512)).toBe(true);
    expect(imageSteps[22].bytes.length).toBe(264);
    const totalImageBytes = imageSteps.reduce((sum, s) => sum + s.bytes.length, 0);
    expect(totalImageBytes).toBe(8 + WIDTH_BYTES * 240);

    // Delays: 10ms por chunk intermedio, 300ms tras el último chunk de imagen
    expect(imageSteps.slice(0, 22).every((s) => s.delayAfterMs === 10)).toBe(true);
    expect(imageSteps[22].delayAfterMs).toBe(300);

    // Los datos del raster viajan intactos después del header
    const bitmap = makeBitmap(240);
    expect(bytes(steps[primerBloque(steps)]).slice(8, 16)).toEqual(Array.from(bitmap.data.subarray(0, 8)));
    expect(imageSteps[22].bytes[263]).toBe(bitmap.data[bitmap.data.length - 1]);

    // Largo mínimo: faltan 280 dots, repartidos 140 arriba y 140 abajo para
    // que el ticket quede centrado en el papel.
    const feeds = feedsDe(steps);
    expect(feeds.map((f) => f.bytes[2])).toEqual([255, 25]);
    expect(feeds.every((f) => f.delayAfterMs === 60)).toBe(true);
    // TODOS después de la imagen: un ESC J antes cuelga el firmware.
    expect(steps.indexOf(feeds[0])).toBeGreaterThan(primerBloque(steps));

    // Feed (2000ms antes del stop) y stop
    expect(bytes(steps[steps.length - 2])).toEqual([0x1b, 0x4a, 0x50]);
    expect(steps[steps.length - 2].delayAfterMs).toBe(2000);
    expect(bytes(steps[29])).toEqual([0x10, 0xff, 0xf1, 0x45]);
    expect(steps[29].delayAfterMs).toBe(0);
  });

  it("H=360 se parte en franjas de 240+120, cada una con su PROPIO header GS v 0", () => {
    const bitmap = makeBitmap(360);
    const steps = buildS1Sequence(bitmap, { chunkSize: 512, mode: "normal" });

    const b1 = primerBloque(steps);
    // Franja 1: header yL=240
    expect(bytes(steps[b1]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 240, 0]);

    // La franja 2 tiene su PROPIO header yL=120: el firmware solo honra yL, así
    // que un único bloque de 360 filas imprime garbage.
    const headers = steps.filter((st) => st.bytes[0] === 0x1d && st.bytes[1] === 0x76);
    expect(headers).toHaveLength(2);
    expect(bytes(headers[1]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 120, 0]);
    // ...y su cuerpo empieza en la fila 240 del raster
    expect(bytes(headers[1]).slice(8, 16)).toEqual(
      Array.from(bitmap.data.subarray(240 * WIDTH_BYTES, 240 * WIDTH_BYTES + 8)),
    );

    // Franja 2: 8 + 5760 = 5768 bytes -> 11 chunks de 512 + 1 de 136
    const i2 = steps.indexOf(headers[1]);
    const stripe2 = steps.slice(i2, i2 + 12);
    expect(stripe2.slice(0, 11).every((st) => st.bytes.length === 512)).toBe(true);
    expect(stripe2[11].bytes.length).toBe(136);

    // Delays: último chunk de franja intermedia 80ms; el de la última, 300ms
    expect(steps[i2 - 1].delayAfterMs).toBe(80);
    expect(stripe2[11].delayAfterMs).toBe(300);

    // Largo mínimo: faltan 160 dots, repartidos 80 arriba y 80 abajo para que
    // el ticket quede centrado en el papel.
    const feeds = feedsDe(steps);
    expect(feeds.map((f) => f.bytes[2])).toEqual([160]);
    // Después de la imagen: un ESC J antes del bloque cuelga el firmware.
    expect(steps.indexOf(feeds[0])).toBeGreaterThan(i2);

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

    // Ticket típico downsampleado (~180 filas) entra en UN solo bloque
    expect(bytes(steps[primerBloque(steps)]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 180, 0]);

    // 8 + 8640 = 8648 bytes -> 16 chunks de 512 + 1 de 456
    const b = primerBloque(steps);
    const imageSteps = steps.slice(b, b + 17);
    expect(imageSteps.slice(0, 16).every((s) => s.bytes.length === 512)).toBe(true);
    expect(imageSteps[16].bytes.length).toBe(456);
    expect(imageSteps[16].delayAfterMs).toBe(300);

    // Impreso real = 180 filas x2 = 360 dots < 520 -> faltan 160, centrados 80/80
    expect(steps).toHaveLength(3 + 17 + 1 + 2);
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

  it("las franjas siguen siendo de <=240 filas también con m=2", () => {
    const steps = buildS1Sequence(makeBitmap(300), { chunkSize: 512 });
    expect(bytes(steps[primerBloque(steps)]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 240, 0]);
    // Franja 1: 8 + 11520 = 11528 -> 23 chunks; franja 2 arranca en el step 26
    expect(bytes(steps[26]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 60, 0]);
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
