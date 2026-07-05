type FakeListener = (event: { data: string }) => void;

/**
 * Doble de test de `EventSource` — implementa solo lo que `useSSE.ts` usa
 * realmente (`addEventListener`/`removeEventListener`/`close`), más `emit`/
 * `emitOpen` para simular frames del servidor llegando de verdad (incluido
 * el `JSON.stringify` que el hook real deshace con `JSON.parse`).
 */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  closed = false;
  private listeners = new Map<string, Set<FakeListener>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  static reset() {
    FakeEventSource.instances = [];
  }

  addEventListener(type: string, listener: FakeListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: FakeListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  /** Simula un frame `event: <type>\ndata: <json>` llegando del servidor. */
  emit(type: string, data: unknown) {
    this.emitRaw(type, JSON.stringify(data));
  }

  /** Simula un frame con un `data` crudo (ej. JSON malformado a propósito). */
  emitRaw(type: string, rawData: string) {
    const event = { data: rawData };
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  /** Simula el evento nativo `open` (conexión inicial o reconexión). */
  emitOpen() {
    this.listeners.get("open")?.forEach((listener) => listener({ data: "" }));
  }
}
