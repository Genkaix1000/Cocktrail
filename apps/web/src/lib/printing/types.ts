import type { TicketContent } from "@cocktrail/shared";

/**
 * Payload que recibe cualquier transporte: ambos formatos siempre presentes.
 * El server es dueño del contenido; cada transporte elige su representación
 * física (ESC/POS texto para USB/nativo, raster 384px para BLE).
 */
export type TransportPrintPayload = {
  escposBase64: string;
  ticketContent: TicketContent;
};

export type TransportId = "native" | "webusb" | "ble-s1" | "native-ble-s1";

export type PrinterTransport = {
  id: TransportId;
  isAvailable(): boolean;
  isConnected(): Promise<boolean>;
  pair(): Promise<void>;
  /**
   * Reconecta a un dispositivo YA vinculado, sin volver a pedirlo. La impresora
   * Bluetooth se apaga sola por ahorro de energía y hay que despertarla; los
   * transportes por cable no necesitan hacer nada.
   */
  connect?(): Promise<void>;
  print(payload: TransportPrintPayload): Promise<void>;
};

export type PrinterPhase =
  | "unsupported"
  | "none"
  | "paired"
  | "connected"
  | "printing"
  | "error";

export type PrinterSnapshot = {
  phase: PrinterPhase;
  connected: boolean;
  message: string;
  transportId?: TransportId;
};
