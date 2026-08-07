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

/** Índice del paso que arranca la imagen (header GS v 0). */
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

describe("buildS1Sequence — un solo bloque GS v 0 (como la app oficial)", () => {
  it("manda la imagen entera en UN bloque, con la altura completa en yL+yH", () => {
    // 600 filas: más de 255, el caso que antes se partía y salía cortado.
    const steps = buildS1Sequence(makeBitmap(600), { chunkSize: 512 });

    const headers = steps.filter((s) => s.bytes[0] === 0x1d && s.bytes[1] === 0x76);
    expect(headers).toHaveLength(1);
    // m=0x00 (sin doble alto), 48 bytes de ancho, 600 = 0x0258 -> yL=0x58 yH=0x02
    expect(bytes(headers[0]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x00, 48, 0, 0x58, 0x02]);
  });

  it("setup en orden: enable, wake de 12 ceros, densidad", () => {
    const steps = buildS1Sequence(makeBitmap(100), { chunkSize: 512 });
    expect(bytes(steps[0])).toEqual([0x10, 0xff, 0xf1, 0x03]);
    expect(steps[0].delayAfterMs).toBe(100);
    expect(bytes(steps[1])).toEqual(new Array(12).fill(0));
    expect(bytes(steps[2])).toEqual([0x10, 0xff, 0x10, 0x00, 0x01]);
    expect(steps[2].delayAfterMs).toBe(100);
  });

  it("los bytes del raster llegan enteros y en orden", () => {
    const bitmap = makeBitmap(240);
    const steps = buildS1Sequence(bitmap, { chunkSize: 512 });
    const b = primerBloque(steps);
    // Todo lo que va desde el header hasta antes del relleno es la imagen.
    const feeds = feedsDe(steps);
    const fin = feeds.length > 0 ? steps.indexOf(feeds[0]) : steps.length - 2;
    const reensamblado = steps.slice(b, fin).flatMap((s) => Array.from(s.bytes));
    expect(reensamblado).toHaveLength(8 + WIDTH_BYTES * 240);
    expect(reensamblado.slice(8)).toEqual(Array.from(bitmap.data));
  });

  it("cierra con feed y stop; el último chunk de imagen espera 300ms", () => {
    const steps = buildS1Sequence(makeBitmap(240), { chunkSize: 512 });
    const feeds = feedsDe(steps);
    const ultimoDeImagen = steps[steps.indexOf(feeds[0]) - 1];
    expect(ultimoDeImagen.delayAfterMs).toBe(300);
    expect(bytes(steps[steps.length - 2])).toEqual([0x1b, 0x4a, 0x50]);
    expect(steps[steps.length - 2].delayAfterMs).toBe(2000);
    expect(bytes(steps[steps.length - 1])).toEqual([0x10, 0xff, 0xf1, 0x45]);
  });
});

describe("buildS1Sequence — largo mínimo", () => {
  it("completa hasta 520 dots con avances de papel, todos DESPUÉS de la imagen", () => {
    const steps = buildS1Sequence(makeBitmap(240), { chunkSize: 512 });
    const feeds = feedsDe(steps);
    // Faltan 280 dots; ESC J admite hasta 255 por comando.
    expect(feeds.reduce((a, f) => a + f.bytes[2], 0)).toBe(280);
    expect(feeds.every((f) => f.bytes[2] <= 255)).toBe(true);
    expect(feeds.every((f) => f.delayAfterMs === 60)).toBe(true);
    // Un ESC J ANTES de la imagen cuelga el firmware: nunca debe pasar.
    const b = primerBloque(steps);
    expect(feeds.every((f) => steps.indexOf(f) > b)).toBe(true);
  });

  it("si el ticket ya llega a 520 dots no agrega relleno", () => {
    const steps = buildS1Sequence(makeBitmap(520), { chunkSize: 512 });
    expect(feedsDe(steps)).toHaveLength(0);
    // Queda solo el feed de cierre.
    expect(escJSteps(steps)).toHaveLength(1);
  });
});

describe("buildS1Sequence — modo doubleHeight (NO se usa: rompe tickets largos)", () => {
  it("con m=0x02 explícito el header lo refleja y el relleno cuenta el doble", () => {
    const steps = buildS1Sequence(makeBitmap(100), { chunkSize: 512, mode: "doubleHeight" });
    expect(bytes(steps[primerBloque(steps)]).slice(0, 8)).toEqual([0x1d, 0x76, 0x30, 0x02, 48, 0, 100, 0]);
    // 100 filas estiradas = 200 dots impresos -> faltan 320 para el mínimo
    expect(feedsDe(steps).reduce((a, f) => a + f.bytes[2], 0)).toBe(320);
  });
});

describe("buildS1Sequence — chunk size", () => {
  it("default SIN opts: chunks de 20 bytes (payload seguro con MTU mínimo BLE) y m=0x00", () => {
    // Bloque de 8 filas: 8 + 384 = 392 bytes -> 19 chunks de 20 + 1 de 12
    const steps = buildS1Sequence(makeBitmap(8));
    const b = primerBloque(steps);
    const imageSteps = steps.slice(b, b + 20);
    expect(imageSteps.slice(0, 19).every((s) => s.bytes.length === 20)).toBe(true);
    expect(imageSteps[19].bytes.length).toBe(12);
    expect(imageSteps.slice(0, 19).every((s) => s.delayAfterMs === 10)).toBe(true);
    expect(imageSteps[19].delayAfterMs).toBe(300);
    expect(steps[b].bytes[3]).toBe(0x00); // modo default: sin doble alto

    // Los bytes reensamblados son idénticos a la corrida con chunk 512
    const reassembled = imageSteps.flatMap((s) => Array.from(s.bytes));
    const golden = buildS1Sequence(makeBitmap(8), { chunkSize: 512 });
    expect(reassembled).toEqual(Array.from(golden[primerBloque(golden)].bytes));
  });

  it("chunkSize inválido (no entero o fuera de [20, 512]) cae al default 20", () => {
    for (const invalido of [8, 19, 513, 512.5, NaN, -1]) {
      const steps = buildS1Sequence(makeBitmap(8), { chunkSize: invalido });
      expect(steps[primerBloque(steps)].bytes.length).toBe(20);
    }
  });
});
