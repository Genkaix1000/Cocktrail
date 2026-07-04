"use client";

import { History, LayoutDashboard, Power, Printer, TrendingUp } from "lucide-react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { OSProfileFooter } from "@/components/shared/OSHeadbar";
import type { NightEvent, Theme } from "@cocktrail/shared";

type CurrentUser = {
  role: string;
  username: string;
  permissions: {
    closeNight: boolean;
    modifyCarta: boolean;
    manageUsers: boolean;
    monitoreo: boolean;
    metricas: boolean;
    historial: boolean;
    general: boolean;
    carta: boolean;
    pagos: boolean;
    staff: boolean;
    cancelarTickets: boolean;
  };
};

type Props = {
  isDrawer?: boolean;
  theme: Theme;
  activeTab: "venta" | "historial" | "metricas";
  setActiveTab: (tab: "venta" | "historial" | "metricas") => void;
  setMobileMenuOpen: (open: boolean) => void;
  hasPermission: (key: keyof CurrentUser["permissions"]) => boolean;
  currentUser: CurrentUser | null;
  event: NightEvent | null;
  setCloseModalOpen: (open: boolean) => void;
  printerStatus: { connected: boolean; message: string } | null;
  testPrint: () => void | Promise<void>;
  printerTestMessage: string | null;
  handleLogout: () => void | Promise<void>;
};

/**
 * Sidebar de Caja — extraído de CajaClient.tsx (antes `renderSidebar`) sin
 * cambios de comportamiento: navegación entre Venta/Historial/Métricas,
 * botón "Cerrar noche" (visible solo con permiso + evento activo) y estado
 * de la impresora térmica. Usa tokens semánticos ink-*, salvo el tema
 * "bosko" que tiene overrides puntuales de color ya presentes en el original.
 */
export default function CajaSidebar({
  isDrawer = false,
  theme,
  activeTab,
  setActiveTab,
  setMobileMenuOpen,
  hasPermission,
  currentUser,
  event,
  setCloseModalOpen,
  printerStatus,
  testPrint,
  printerTestMessage,
  handleLogout,
}: Props) {
  const isBosko = theme === "bosko";

  // Custom classes for theme consistency
  const sidebarClass = isBosko
    ? "bg-[#013e37] dark:bg-[#012b26] border-r border-[#014d44] dark:border-accent/10 text-[#fffeb3]"
    : "bg-ink-950 border-r border-ink-800 text-ink-50";

  const navBtnBase = "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer";

  const navBtnActive = isBosko
    ? `${navBtnBase} bg-white/10 border border-white/20 text-[#fffeb3] shadow-sm font-bold`
    : `${navBtnBase} bg-ink-900 border border-ink-800 text-ink-50 shadow-sm font-bold`;

  const navBtnIdle = isBosko
    ? `${navBtnBase} bg-transparent border border-transparent text-white/70 hover:text-white hover:bg-white/5`
    : `${navBtnBase} bg-transparent border border-transparent text-ink-400 hover:text-ink-50 hover:bg-ink-900/40`;

  const navIconActive = isBosko
    ? "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#fffeb3]/15 text-[#fffeb3] transition-all duration-200"
    : "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent/15 text-accent transition-all duration-200";

  const navIconIdle = isBosko
    ? "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5 text-white/40 transition-all duration-200"
    : "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-ink-800/50 text-ink-500 transition-all duration-200";

  const borderClass = isBosko ? "border-white/10" : "border-ink-800";
  const sublabelClass = isBosko ? "text-white/40" : "text-ink-500";

  return (
    <aside className={`
      w-[280px] shrink-0 flex flex-col print:hidden p-6 gap-6
      ${sidebarClass}
      ${isDrawer ? "h-full" : "h-full hidden md:flex"}
    `}>
      {/* Brand logo top */}
      <div className={`h-[60px] flex items-center justify-center border-b shrink-0 w-full ${borderClass}`}>
        <BrandLogo size="lg" />
      </div>

      {/* Navigation menu */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-6 no-scrollbar">
        <div className="flex flex-col gap-1.5">
          {/* Nueva Venta Button */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("venta");
              setMobileMenuOpen(false);
            }}
            className={activeTab === "venta" ? navBtnActive : navBtnIdle}
          >
            <div className={activeTab === "venta" ? navIconActive : navIconIdle}>
              <LayoutDashboard size={16} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold">
                Nueva Venta
              </span>
              <span className={`text-[10px] ${sublabelClass}`}>Terminal de Cobro</span>
            </div>
          </button>

          {/* Historial de Ventas Button */}
          {hasPermission("historial") && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("historial");
                setMobileMenuOpen(false);
              }}
              className={activeTab === "historial" ? navBtnActive : navBtnIdle}
            >
              <div className={activeTab === "historial" ? navIconActive : navIconIdle}>
                <History size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">
                  Historial de Ventas
                </span>
                <span className={`text-[10px] ${sublabelClass}`}>Ventas del Turno</span>
              </div>
            </button>
          )}

          {/* Métricas Button */}
          {hasPermission("metricas") && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("metricas");
                setMobileMenuOpen(false);
              }}
              className={activeTab === "metricas" ? navBtnActive : navBtnIdle}
            >
              <div className={activeTab === "metricas" ? navIconActive : navIconIdle}>
                <TrendingUp size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">
                  Métricas
                </span>
                <span className={`text-[10px] ${sublabelClass}`}>Estadísticas del Turno</span>
              </div>
            </button>
          )}
        </div>

        {/* Closing capability directly from Caja if user has permissions */}
        {currentUser?.permissions?.closeNight && event?.status === "activo" && (
          <div className={`border-t pt-4 ${borderClass}`}>
            <button
              type="button"
              onClick={() => {
                setCloseModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className="w-full h-10 rounded-xl bg-danger-soft border border-danger-line text-danger flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Power size={13} />
              <span>Cerrar noche</span>
            </button>
          </div>
        )}
      </div>

      {/* Estado de la impresora térmica */}
      <div className={`border-t pt-4 px-1 ${borderClass}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${printerStatus?.connected ? "text-green" : "text-danger"}`}>
            <Printer size={13} />
            {printerStatus?.connected ? "Impresora conectada" : "Impresora no encontrada"}
          </span>
        </div>
        <button
          type="button"
          onClick={testPrint}
          className="w-full h-9 rounded-xl bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] active:scale-95 transition-all cursor-pointer"
        >
          Imprimir ticket de prueba
        </button>
        {printerTestMessage && (
          <p className="text-[10px] text-ink-400 mt-1.5 text-center">{printerTestMessage}</p>
        )}
      </div>

      {/* User profile footer */}
      <OSProfileFooter onLogout={handleLogout} username={currentUser?.username} role={currentUser?.role} />
    </aside>
  );
}
