/**
 * Tipos compartidos entre BarraClient.tsx (shell) y las secciones extraídas de
 * `components/barra/`. `FlashData` refleja el shape que ya usaba `triggerFlash`
 * en el shell — se centraliza acá para no duplicarlo en cada componente que lo
 * recibe como prop (PendingOrdersList, ManualRedeemModal, CancelOrderModal, DevPanel).
 */
export type FlashData = {
  type: "success" | "duplicate" | "error";
  message: string;
  displayNumber?: number;
  items?: Array<{ name: string; qty: number }>;
};

export type CurrentUser = {
  role: string;
  username: string;
} | null;
