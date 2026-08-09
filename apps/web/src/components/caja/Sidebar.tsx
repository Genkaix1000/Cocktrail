"use client";

import {
  History,
  LayoutDashboard,
  Power,
  Printer,
  CreditCard,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { LogoutNavRail } from "@/components/shared/LogoutNavRail";
import type { PosnetLevel } from "@/hooks/usePosnetStatus";
import type { NightEvent } from "@cocktrail/shared";

type CurrentUser = {
  role: string;
  username: string;
  permissions: {
    closeNight: boolean;
    cancelarTickets: boolean;
    historial: boolean;
    metricas: boolean;
  };
};

type Props = {
  isDrawer?: boolean;
  activeTab: "venta" | "historial" | "metricas";
  setActiveTab: (tab: "venta" | "historial" | "metricas") => void;
  setMobileMenuOpen: (open: boolean) => void;
  hasPermission: (key: keyof CurrentUser["permissions"]) => boolean;
  currentUser: CurrentUser | null;
  event: NightEvent | null;
  setCloseModalOpen: (open: boolean) => void;
  printerStatus: { connected: boolean; message: string } | null;
  testPrint: () => void | Promise<void>;
  pairPrinterDevice: () => void | Promise<void>;
  connectPrinter: () => void | Promise<void>;
  /** Vinculada alguna vez: alcanza con reconectar, no hay que elegirla de nuevo. */
  printerPaired: boolean;
  printerTestMessage: string | null;
  posnetLevel: PosnetLevel;
  posnetMessage: string | null;
  /** null = aún no sabemos; false = sin Posnet vinculado (QR dinámico). */
  hasLinkedDevice?: boolean | null;
  handleLogout: () => void | Promise<void>;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

const sectionLabelClass =
  "px-4 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)] mb-0.5";

function navBtnClass(active: boolean, collapsed: boolean) {
  const tone = active
    ? "relative text-[var(--accent-text)] font-semibold before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[5px] before:rounded-r-[6px] before:bg-[var(--accent-primary)]"
    : "text-[var(--text-tertiary)] font-normal hover:text-[var(--text-secondary)]";
  const layout = collapsed
    ? "w-full flex items-center justify-center px-0 py-2.5"
    : "w-full flex items-center gap-2.5 pl-4 pr-3 py-1.5";
  return `${layout} text-left transition-colors duration-150 cursor-pointer bg-transparent ${tone}`;
}

function deviceTone(level: "ok" | "warn" | "bad" | "neutral") {
  if (level === "ok") return "text-[var(--success-base)]";
  if (level === "warn") return "text-[var(--amber-base)]";
  if (level === "bad") return "text-[var(--danger-base)]";
  return "text-[var(--text-tertiary)]";
}

function deviceChip(level: "ok" | "warn" | "bad" | "neutral") {
  if (level === "ok") return "bg-[var(--success-soft)] border-[var(--success-line)] text-[var(--success-base)]";
  if (level === "warn") return "bg-[var(--amber-soft)] border-[var(--amber-line)] text-[var(--amber-base)]";
  if (level === "bad") return "bg-[var(--danger-soft)] border-[var(--danger-line)] text-[var(--danger-base)]";
  return "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-tertiary)]";
}

function posnetTitle(level: PosnetLevel): string {
  if (level === "blocked") return "Posnet bloqueado";
  if (level === "warning") return "Posnet con aviso";
  if (level === "ok") return "Posnet listo";
  return "Posnet";
}

/**
 * Sidebar de Caja — mismo lenguaje Bosko que admin (rail activo, panel card, logout rail).
 */
export default function CajaSidebar({
  isDrawer = false,
  activeTab,
  setActiveTab,
  setMobileMenuOpen,
  hasPermission,
  currentUser,
  event,
  setCloseModalOpen,
  printerStatus,
  testPrint,
  pairPrinterDevice,
  connectPrinter,
  printerPaired,
  printerTestMessage,
  posnetLevel,
  posnetMessage,
  hasLinkedDevice = null,
  handleLogout,
  isCollapsed = false,
  onToggleCollapse = () => {},
}: Props) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const collapsed = isCollapsed && !isDrawer;
  const canCloseNight = !!currentUser?.permissions?.closeNight && event?.status === "activo";

  const printerLevel: "ok" | "bad" = printerStatus?.connected ? "ok" : "bad";
  const posnetTone: "ok" | "warn" | "bad" | "neutral" =
    posnetLevel === "blocked"
      ? "bad"
      : posnetLevel === "warning"
        ? "warn"
        : posnetLevel === "ok"
          ? "ok"
          : "neutral";

  function go(tab: "venta" | "historial" | "metricas") {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setConfirmLogout(false);
  }

  const secondaryBtn =
    "w-full h-9 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-semibold border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-app)] active:scale-95 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait";

  return (
    <aside
      data-tour="caja-sidebar"
      className={`
        shrink-0 flex flex-col print:hidden relative overflow-hidden
        bg-[var(--bg-panel)] text-[var(--text-primary)]
        rounded-[24px] shadow-card transition-[width] duration-300 ease-in-out
        ${collapsed ? "w-[76px]" : "w-[260px]"}
        ${isDrawer ? "h-full" : "h-full hidden md:flex"}
      `}
    >
      <div
        className={`flex items-center shrink-0 w-full pt-4 pb-2 ${
          collapsed ? "justify-center px-2" : "justify-between px-4"
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--accent-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
            title="Expandir menú"
            aria-label="Expandir menú"
          >
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        ) : (
          <>
            <BrandLogo size="md" />
            <button data-tour-nav="collapse"
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              title="Colapsar menú"
              aria-label="Colapsar menú"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto flex flex-col no-scrollbar pt-2 ${
          collapsed ? "gap-2 px-1 pb-[200px]" : "gap-4 pb-[260px]"
        }`}
      >
        <div className="flex flex-col">
          {!collapsed && <p className={sectionLabelClass}>Menú</p>}

          <button
            data-tour-nav="venta"
            type="button"
            title={collapsed ? "Nueva Venta" : undefined}
            onClick={() => go("venta")}
            className={navBtnClass(activeTab === "venta", collapsed)}
          >
            <LayoutDashboard
              size={17}
              strokeWidth={activeTab === "venta" ? 2.1 : 1.75}
              className={
                activeTab === "venta"
                  ? "text-[var(--accent-primary)] shrink-0"
                  : "text-[var(--text-tertiary)] shrink-0"
              }
            />
            {!collapsed && <span className="text-[13.5px] truncate">Nueva Venta</span>}
          </button>

          {hasPermission("historial") && (
            <button
              data-tour-nav="historial"
              type="button"
              title={collapsed ? "Historial de Ventas" : undefined}
              onClick={() => go("historial")}
              className={navBtnClass(activeTab === "historial", collapsed)}
            >
              <History
                size={17}
                strokeWidth={activeTab === "historial" ? 2.1 : 1.75}
                className={
                  activeTab === "historial"
                    ? "text-[var(--accent-primary)] shrink-0"
                    : "text-[var(--text-tertiary)] shrink-0"
                }
              />
              {!collapsed && <span className="text-[13.5px] truncate">Historial de Ventas</span>}
            </button>
          )}

          {hasPermission("metricas") && (
            <button
              data-tour-nav="metricas"
              type="button"
              title={collapsed ? "Métricas" : undefined}
              onClick={() => go("metricas")}
              className={navBtnClass(activeTab === "metricas", collapsed)}
            >
              <TrendingUp
                size={17}
                strokeWidth={activeTab === "metricas" ? 2.1 : 1.75}
                className={
                  activeTab === "metricas"
                    ? "text-[var(--accent-primary)] shrink-0"
                    : "text-[var(--text-tertiary)] shrink-0"
                }
              />
              {!collapsed && <span className="text-[13.5px] truncate">Métricas</span>}
            </button>
          )}
        </div>

        <div className="flex flex-col">
          {!collapsed && <p className={sectionLabelClass}>General</p>}
          <LogoutNavRail
            collapsed={collapsed}
            confirm={confirmLogout}
            onAsk={() => setConfirmLogout(true)}
            onCancel={() => setConfirmLogout(false)}
            onConfirm={handleLogout}
          />
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 pointer-events-none ${
          collapsed ? "p-2 pb-4" : "px-3 pt-3 pb-5"
        }`}
      >
        <div className="pointer-events-auto flex flex-col gap-3">
          <div
            data-tour="caja-dispositivos"
            className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${
              collapsed ? "p-2" : "p-3"
            }`}
          >
            {collapsed ? (
              <div className="flex flex-col gap-2 items-center">
                <button
                  type="button"
                  onClick={printerStatus?.connected ? testPrint : pairPrinterDevice}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer active:scale-95 transition-all relative ${deviceChip(printerLevel)}`}
                  title={printerStatus?.connected ? "Impresora OK" : "Vincular impresora"}
                  aria-label={printerStatus?.connected ? "Probar impresora" : "Vincular impresora"}
                >
                  <Printer size={16} />
                </button>
                {hasLinkedDevice !== false && (
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border ${deviceChip(posnetTone)}`}
                    title={posnetTitle(posnetLevel)}
                    aria-label={posnetTitle(posnetLevel)}
                  >
                    <CreditCard size={16} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <span
                    className={`flex items-center gap-1.5 text-[11px] font-semibold ${deviceTone(printerLevel)}`}
                  >
                    <Printer size={13} />
                    {printerStatus?.connected ? "Impresora OK" : "Sin impresora"}
                  </span>
                  {printerStatus?.connected ? (
                    <button type="button" onClick={testPrint} className={`${secondaryBtn} mt-2`}>
                      Ticket de prueba
                    </button>
                  ) : printerPaired ? (
                    <>
                      <button type="button" onClick={connectPrinter} className={`${secondaryBtn} mt-2`}>
                        Conectar
                      </button>
                      <button
                        type="button"
                        onClick={pairPrinterDevice}
                        className="w-full mt-1.5 text-[10px] text-[var(--text-tertiary)] underline cursor-pointer"
                      >
                        Vincular otra
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={pairPrinterDevice} className={`${secondaryBtn} mt-2`}>
                      Vincular
                    </button>
                  )}
                  {printerTestMessage && (
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5 text-center truncate">
                      {printerTestMessage}
                    </p>
                  )}
                </div>

                {hasLinkedDevice !== false && (
                  <div>
                    <span
                      className={`flex items-center gap-1.5 text-[11px] font-semibold ${deviceTone(posnetTone)}`}
                      title={posnetLevel !== "ok" ? (posnetMessage ?? undefined) : undefined}
                    >
                      <CreditCard size={13} />
                      {posnetTitle(posnetLevel)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {canCloseNight && (
            <button
              data-tour="caja-cerrar"
              type="button"
              onClick={() => {
                setCloseModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className={`w-full rounded-xl bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger-base)] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer ${
                collapsed ? "h-11" : "h-10 gap-1.5 text-[12px] font-semibold"
              }`}
              title="Cerrar noche"
            >
              <Power size={14} strokeWidth={2} />
              {!collapsed && <span>Cerrar noche</span>}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
