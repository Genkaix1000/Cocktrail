import { describe, expect, it } from "vitest";

import { createPrintQueue, type QueueStatus } from "./queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createPrintQueue", () => {
  it("arranca idle", () => {
    const queue = createPrintQueue();
    expect(queue.getStatus()).toEqual({ state: "idle", message: "" });
  });

  it("corre los jobs de a uno, en orden FIFO", async () => {
    const queue = createPrintQueue();
    const d1 = deferred();
    const d2 = deferred();
    const started: string[] = [];

    const p1 = queue.enqueue({
      label: "ticket A",
      run: () => {
        started.push("A");
        return d1.promise;
      },
    });
    const p2 = queue.enqueue({
      label: "ticket B",
      run: () => {
        started.push("B");
        return d2.promise;
      },
    });

    // B no arranca hasta que A termine
    await tick();
    expect(started).toEqual(["A"]);
    expect(queue.getStatus()).toEqual({ state: "printing", message: "Imprimiendo ticket A…" });

    d1.resolve();
    await p1;
    await tick();
    expect(started).toEqual(["A", "B"]);
    expect(queue.getStatus()).toEqual({ state: "printing", message: "Imprimiendo ticket B…" });

    d2.resolve();
    await p2;
    expect(queue.getStatus()).toEqual({ state: "idle", message: "" });
  });

  it("fallo en cascada: descarta los pendientes y reporta UN solo error resumido", async () => {
    const queue = createPrintQueue();
    const d1 = deferred();
    const statuses: QueueStatus[] = [];
    queue.subscribe((s) => statuses.push(s));

    const p1 = queue.enqueue({ label: "ticket A", run: () => d1.promise });
    const p2 = queue.enqueue({ label: "ticket B", run: async () => {} });
    const p3 = queue.enqueue({ label: "ticket C", run: async () => {} });

    const r1 = p1.catch((e: Error) => e.message);
    const r2 = p2.catch((e: Error) => e.message);
    const r3 = p3.catch((e: Error) => e.message);

    d1.reject(new Error("Se cortó el Bluetooth"));

    expect(await r1).toBe("Se cortó el Bluetooth");
    expect(await r2).toBe("2 tickets sin imprimir — reimprimilos desde el historial");
    expect(await r3).toBe("2 tickets sin imprimir — reimprimilos desde el historial");

    expect(queue.getStatus()).toEqual({
      state: "error",
      message: "Se cortó el Bluetooth. 2 tickets sin imprimir — reimprimilos desde el historial",
    });
    // Un solo estado de error emitido, no uno por job descartado
    expect(statuses.filter((s) => s.state === "error")).toHaveLength(1);
  });

  it("con un solo pendiente descartado el mensaje va en singular", async () => {
    const queue = createPrintQueue();
    const d1 = deferred();

    const p1 = queue.enqueue({ label: "ticket A", run: () => d1.promise });
    const p2 = queue.enqueue({ label: "ticket B", run: async () => {} });
    const r1 = p1.catch((e: Error) => e.message);
    const r2 = p2.catch((e: Error) => e.message);

    d1.reject(new Error("boom"));

    expect(await r1).toBe("boom");
    expect(await r2).toBe("1 ticket sin imprimir — reimprimilo desde el historial");
  });

  it("después de un error, un enqueue nuevo vuelve a imprimir", async () => {
    const queue = createPrintQueue();
    const failing = queue.enqueue({
      label: "ticket A",
      run: async () => {
        throw new Error("boom");
      },
    });
    await failing.catch(() => {});
    expect(queue.getStatus().state).toBe("error");

    await queue.enqueue({ label: "ticket B", run: async () => {} });
    expect(queue.getStatus()).toEqual({ state: "idle", message: "" });
  });

  it("cota 10: con la cola llena rechaza con un error claro", async () => {
    const queue = createPrintQueue();
    const hang = deferred();
    // 1 imprimiendo + 10 en espera
    const running = queue.enqueue({ label: "ticket 0", run: () => hang.promise });
    const pendings: Promise<void>[] = [];
    for (let i = 1; i <= 10; i++) {
      pendings.push(queue.enqueue({ label: `ticket ${i}`, run: async () => {} }));
    }

    await expect(queue.enqueue({ label: "ticket 11", run: async () => {} })).rejects.toThrow(
      /cola de impresión está llena \(10 tickets/i,
    );

    // Descomprimir: que todos terminen para no dejar promesas colgadas
    hang.resolve();
    await running;
    await Promise.all(pendings);
    expect(queue.getStatus().state).toBe("idle");
  });
});
