import { computeTotals, type Drink, type EventSummary, type NightEvent, type Order, type Role } from "@cocktrail/shared";
import { DEMO_DRINKS, buildDemoOrders } from "./seed";
export const DEMO_GATE_KEY = "miboliche_demo_gate_exp";
export const DEMO_ROLE_KEY = "miboliche_demo_role";

type DemoState = {
  drinks: Drink[];
  orders: Order[];
  event: NightEvent;
  closedEvents: EventSummary[];
  theme: string;
  barSession: {
    id: string;
    barId: string;
    userId: string;
    username: string;
    role: "caja" | "admin";
    connectedAt: string;
    lastSeenAt: string;
  } | null;
};

/** Noche abierta hace ~5h para que el gráfico horario tenga datos. */
function newEvent(orderCounter: number): NightEvent {
  return {
    id: "demo-night-1",
    status: "activo",
    startedAt: Date.now() - 5 * 3600_000,
    orderCounter,
    keyword: "DEMO",
  };
}

function buildState(): DemoState {
  const drinks = structuredClone(DEMO_DRINKS);
  const startedAt = Date.now() - 5 * 3600_000;
  const orders = buildDemoOrders(drinks, startedAt);
  return {
    drinks,
    orders,
    event: newEvent(orders.length),
    closedEvents: [],
    theme: "miboliche",
    barSession: null,
  };
}

const g = globalThis as typeof globalThis & { __mibolicheDemoV3?: DemoState };

export function demoState(): DemoState {
  return (g.__mibolicheDemoV3 ??= buildState());
}

export function resetDemoState(): void {
  g.__mibolicheDemoV3 = buildState();
}

export function isDemoStatic(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_STATIC === "1";
}

export function readGateExp(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(DEMO_GATE_KEY);
  if (!raw) return null;
  const exp = Number(raw);
  if (!Number.isFinite(exp) || exp <= Date.now()) {
    localStorage.removeItem(DEMO_GATE_KEY);
    return null;
  }
  return exp;
}

export function writeGateExp(expiresAt: number): void {
  localStorage.setItem(DEMO_GATE_KEY, String(expiresAt));
}

export function clearRole(): void {
  localStorage.removeItem(DEMO_ROLE_KEY);
}

/** Solo si venció / reset total de acceso. Logout NO debe llamar esto. */
export function clearGate(): void {
  localStorage.removeItem(DEMO_GATE_KEY);
  clearRole();
}

export function readRole(): Role | null {
  if (typeof window === "undefined") return null;
  if (!readGateExp()) return null;
  const r = localStorage.getItem(DEMO_ROLE_KEY);
  return r === "admin" || r === "caja" ? r : null;
}

export function writeRole(role: Role): void {
  localStorage.setItem(DEMO_ROLE_KEY, role);
}

export function snapshotTotals() {
  return computeTotals(demoState().orders);
}
