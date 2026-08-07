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
    expect(bytes(steps[3]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 240, 0]);

    // Franja de 240 filas = 8 + 11520 = 11528 bytes -> 22 chunks de 512 + 1 de 264
    const imageSteps = steps.slice(3, 26);
    expect(imageSteps.slice(0, 22).every((s) => s.bytes.length === 512)).toBe(true);
    expect(imageSteps[22].bytes.length).toBe(264);
    const totalImageBytes = imageSteps.reduce((sum, s) => sum + s.bytes.length, 0);
    expect(totalImageBytes).toBe(8 + WIDTH_BYTES * 240);

    // Delays: 10ms por chunk intermedio, 300ms tras el último chunk de imagen
    expect(imageSteps.slice(0, 22).every((s) => s.delayAfterMs === 10)).toBe(true);
    expect(imageSteps[22].delayAfterMs).toBe(300);

    // Los datos del raster viajan intactos después del header
    const bitmap = makeBitmap(240);
    expect(bytes(steps[3]).slice(8, 16)).toEqual(Array.from(bitmap.data.subarray(0, 8)));
    expect(imageSteps[22].bytes[263]).toBe(bitmap.data[bitmap.data.length - 1]);

    // Largo mínimo: 240 impresos < 520 -> ESC J 255 + ESC J 25, delay 60
    expect(bytes(steps[26])).toEqual([0x1b, 0x4a, 255]);
    expect(steps[26].delayAfterMs).toBe(60);
    expect(bytes(steps[27])).toEqual([0x1b, 0x4a, 25]);
    expect(steps[27].delayAfterMs).toBe(60);

    // Feed (2000ms antes del stop) y stop
    expect(bytes(steps[28])).toEqual([0x1b, 0x4a, 0x50]);
    expect(steps[28].delayAfterMs).toBe(2000);
    expect(bytes(steps[29])).toEqual([0x10, 0xff, 0xf1, 0x45]);
    expect(steps[29].delayAfterMs).toBe(0);
  });

  it("H=360 se parte en franjas de 240+120, cada una con su PROPIO header GS v 0", () => {
    const bitmap = makeBitmap(360);
    const steps = buildS1Sequence(bitmap, { chunkSize: 512, mode: "normal" });

    // 3 setup + 23 chunks (franja 240) + 12 chunks (franja 120) + 1 ESC J + feed + stop
    expect(steps).toHaveLength(41);

    // Franja 1: header yL=240
    expect(bytes(steps[3]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 240, 0]);

    // Franja 2 arranca en el step 26 con su propio header yL=120 (el firmware
    // solo honra yL: un solo bloque de 360 filas imprime garbage)
    const stripe2First = steps[26];
    expect(bytes(stripe2First).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 120, 0]);
    // ...y su cuerpo empieza en la fila 240 del raster
    expect(bytes(stripe2First).slice(8, 16)).toEqual(
      Array.from(bitmap.data.subarray(240 * WIDTH_BYTES, 240 * WIDTH_BYTES + 8)),
    );

    // Franja 2: 8 + 5760 = 5768 bytes -> 11 chunks de 512 + 1 de 136
    const stripe2 = steps.slice(26, 38);
    expect(stripe2.slice(0, 11).every((s) => s.bytes.length === 512)).toBe(true);
    expect(stripe2[11].bytes.length).toBe(136);

    // Delays: último chunk de franja intermedia 80ms; el de la última, 300ms
    expect(steps[25].delayAfterMs).toBe(80);
    expect(stripe2[11].delayAfterMs).toBe(300);

    // Largo mínimo: 360 < 520 -> un solo ESC J con el faltante (160)
    expect(bytes(steps[38])).toEqual([0x1b, 0x4a, 160]);
    expect(steps[38].delayAfterMs).toBe(60);

    expect(bytes(steps[39])).toEqual([0x1b, 0x4a, 0x50]);
    expect(bytes(steps[40])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });

  it("bitmap chico (8 filas) con chunk 512: un chunk con delay 300 y relleno hasta 520 dots", () => {
    const steps = buildS1Sequence(makeBitmap(8), { chunkSize: 512, mode: "normal" });

    // 3 setup + 1 chunk + 3 ESC J (faltante 512 = 255+255+2) + feed + stop
    expect(steps).toHaveLength(9);
    expect(steps[3].bytes.length).toBe(8 + WIDTH_BYTES * 8);
    expect(steps[3].delayAfterMs).toBe(300);
    expect(bytes(steps[4])).toEqual([0x1b, 0x4a, 255]);
    expect(bytes(steps[5])).toEqual([0x1b, 0x4a, 255]);
    expect(bytes(steps[6])).toEqual([0x1b, 0x4a, 2]);
    expect(bytes(steps[7])).toEqual([0x1b, 0x4a, 0x50]);
    expect(bytes(steps[8])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });
});

describe("buildS1Sequence — modo doubleHeight (default, lo validado en el gate T1)", () => {
  it("default SIN opts de modo: header GS v 0 con m=0x02", () => {
    const steps = buildS1Sequence(makeBitmap(180), { chunkSize: 512 });

    // Ticket típico downsampleado (~180 filas) entra en UN solo bloque
    expect(bytes(steps[3]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 180, 0]);

    // 8 + 8640 = 8648 bytes -> 16 chunks de 512 + 1 de 456
    const imageSteps = steps.slice(3, 20);
    expect(imageSteps.slice(0, 16).every((s) => s.bytes.length === 512)).toBe(true);
    expect(imageSteps[16].bytes.length).toBe(456);
    expect(imageSteps[16].delayAfterMs).toBe(300);

    // Impreso real = 180 filas x2 = 360 dots < 520 -> ESC J 160
    expect(steps).toHaveLength(3 + 17 + 1 + 2);
    expect(bytes(steps[20])).toEqual([0x1b, 0x4a, 160]);
    expect(steps[20].delayAfterMs).toBe(60);
    expect(bytes(steps[21])).toEqual([0x1b, 0x4a, 0x50]);
    expect(bytes(steps[22])).toEqual([0x10, 0xff, 0xf1, 0x45]);
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
    expect(bytes(steps[3]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 240, 0]);
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
    expect(steps[3].bytes[3]).toBe(0x02); // modo default: doubleHeight
    const imageSteps = steps.slice(3, 23);
    expect(imageSteps.slice(0, 19).every((s) => s.bytes.length === 20)).toBe(true);
    expect(imageSteps[19].bytes.length).toBe(12);
    expect(imageSteps.slice(0, 19).every((s) => s.delayAfterMs === 10)).toBe(true);
    expect(imageSteps[19].delayAfterMs).toBe(300);
    expect(bytes(steps[23])).toEqual([0x1b, 0x4a, 255]);
    expect(bytes(steps[24])).toEqual([0x1b, 0x4a, 249]);

    // Los bytes reensamblados son idénticos a la corrida con chunk 512
    const reassembled = imageSteps.flatMap((s) => Array.from(s.bytes));
    const golden = buildS1Sequence(makeBitmap(8), { chunkSize: 512 });
    expect(reassembled).toEqual(Array.from(golden[3].bytes));
  });

  it("chunkSize inválido (no entero o fuera de [20, 512]) cae al default 20", () => {
    const byDefault = buildS1Sequence(makeBitmap(8));
    for (const chunkSize of [8, 19, 513, 512.5, NaN, -1]) {
      const steps = buildS1Sequence(makeBitmap(8), { chunkSize });
      expect(steps).toHaveLength(byDefault.length);
      expect(steps[3].bytes.length).toBe(20);
    }
  });
});
