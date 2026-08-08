/**
 * Cola secuencial de impresión, in-memory y sin dependencia de React.
 * Un job a la vez (FIFO): las escrituras BLE con delays no toleran
 * intercalado, y la ticketera imprime de a un ticket igual.
 */

const MAX_PENDING = 10;

export type PrintJob = {
  label: string;
  orderId?: string;
  run: () => Promise<void>;
};

export type QueueStatus = {
  state: "idle" | "printing" | "error";
  message: string;
};

type PendingEntry = {
  job: PrintJob;
  resolve: () => void;
  reject: (err: Error) => void;
};

export type PrintQueue = {
  enqueue(job: PrintJob): Promise<void>;
  getStatus(): QueueStatus;
  subscribe(listener: (status: QueueStatus) => void): () => void;
};

function cascadeMessage(dropped: number): string {
  return dropped === 1
    ? "1 ticket sin imprimir — reimprimilo desde el historial"
    : `${dropped} tickets sin imprimir — reimprimilos desde el historial`;
}

export function createPrintQueue(): PrintQueue {
  const pending: PendingEntry[] = [];
  const listeners = new Set<(status: QueueStatus) => void>();
  let status: QueueStatus = { state: "idle", message: "" };
  let running = false;

  function setStatus(next: QueueStatus) {
    status = next;
    for (const listener of listeners) listener(status);
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    while (pending.length > 0) {
      const entry = pending.shift()!;
      setStatus({ state: "printing", message: `Imprimiendo ${entry.job.label}…` });
      try {
        await entry.job.run();
        entry.resolve();
      } catch (err) {
        // Fallo en cascada: si este job no imprimió (típicamente se cayó la
        // conexión), los pendientes tampoco van a salir — se descartan todos
        // y se reporta UN solo error resumido, no una catarata.
        // Los jobs dropeados reciben solo el conteo de tickets perdidos, no
        // el error raíz (evita repetir el mismo error de BLE en cada Promise).
        const jobError = err instanceof Error ? err : new Error(String(err));
        const dropped = pending.splice(0, pending.length);
        const message =
          dropped.length > 0
            ? `${jobError.message}. ${cascadeMessage(dropped.length)}`
            : jobError.message;
        const droppedError = new Error(cascadeMessage(dropped.length));
        for (const d of dropped) d.reject(droppedError);
        entry.reject(jobError);
        running = false;
        setStatus({ state: "error", message });
        return;
      }
    }
    running = false;
    setStatus({ state: "idle", message: "" });
  }

  return {
    enqueue(job: PrintJob): Promise<void> {
      if (pending.length >= MAX_PENDING) {
        return Promise.reject(
          new Error(
            `La cola de impresión está llena (${MAX_PENDING} tickets en espera). Esperá a que salgan antes de imprimir otro.`,
          ),
        );
      }
      const promise = new Promise<void>((resolve, reject) => {
        pending.push({ job, resolve, reject });
      });
      void pump();
      return promise;
    },
    getStatus() {
      return status;
    },
    subscribe(listener: (s: QueueStatus) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
