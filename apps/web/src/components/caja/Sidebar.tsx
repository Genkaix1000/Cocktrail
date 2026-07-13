"use client";

import { History, LayoutDashboard, Power, Printer, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { OSProfileFooter } from "@/components/shared/OSProfileFooter";
import { useThemeSafe } from "@/components/ThemeProvider";
import type { NightEvent, Theme } from "@cocktrail/shared";

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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

/**
 * Sidebar de Caja — extraído de CajaClient.tsx (antes `renderSidebar`)
 * Adaptado con soporte para estado colapsado (plegable) para tablets,
 * mostrando la clave de la noche cuando está abierta.
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
  isCollapsed = false,
  onToggleCollapse = () => {},
}: Props) {
  const isBosko = theme === "bosko";
  const themeProps = useThemeSafe();

  // Collapsed status only applies if it's not the mobile drawer
  const collapsed = isCollapsed && !isDrawer;

  // Custom classes for theme consistency
  const sidebarClass = isBosko
    ? "bg-[#013e37] dark:bg-[#012b26] border-r border-[#014d44] dark:border-accent/10 text-[#fffeb3]"
    : "bg-ink-950 border-r border-ink-800 text-ink-50";

  const getNavBtnClass = (tab: "venta" | "historial" | "metricas") => {
    const isActive = activeTab === tab;
    const base = isBosko
      ? (isActive ? "bg-white/10 border-white/20 text-[#fffeb3]" : "bg-transparent border-transparent text-white/70 hover:text-white hover:bg-white/5")
      : (isActive ? "bg-ink-900 border-ink-800 text-ink-50" : "bg-transparent border-transparent text-ink-400 hover:text-ink-50 hover:bg-ink-900/40");
    
    const layout = collapsed
      ? "w-full flex items-center justify-center p-2.5 rounded-xl border transition-all duration-200 cursor-pointer"
      : "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left border transition-all duration-200 cursor-pointer";

    const font = isActive ? "font-bold shadow-sm" : "";
    return `${layout} ${base} ${font}`;
  };

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
      shrink-0 flex flex-col print:hidden transition-all duration-300 ease-in-out relative
      ${sidebarClass}
      ${collapsed ? "w-[76px] p-4 gap-4" : "w-[280px] p-6 gap-6"}
      ${isDrawer ? "h-full" : "h-full hidden md:flex"}
    `}>
      {/* Brand logo top */}
      <div className={`h-[60px] flex items-center border-b shrink-0 w-full ${borderClass} ${collapsed ? "justify-center" : "justify-between"}`}>
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`w-10 h-10 rounded-xl flex items-center justify-center bg-transparent border ${isBosko ? "border-white/20 text-[#fffeb3]" : "border-ink-800 text-ink-50"} hover:text-accent transition-all cursor-pointer font-serif-italic font-black text-xl`}
            title="Expandir menú"
          >
            {themeProps?.textLogoValue ? themeProps.textLogoValue[0] : "C"}
          </button>
        ) : (
          <>
            <BrandLogo size="lg" />
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 hover:bg-white/5 rounded-lg text-ink-400 hover:text-ink-50 transition-all cursor-pointer"
              title="Colapsar menú"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
      </div>

      {/* Navigation menu */}
      <div className={`flex-1 overflow-y-auto flex flex-col gap-6 no-scrollbar ${collapsed ? "pb-[180px]" : "pb-[280px]"}`}>
        <div className="flex flex-col gap-1.5">
          {/* Nueva Venta Button */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("venta");
              setMobileMenuOpen(false);
            }}
            className={getNavBtnClass("venta")}
            title={collapsed ? "Nueva Venta" : undefined}
          >
            <div className={activeTab === "venta" ? navIconActive : navIconIdle}>
              <LayoutDashboard size={16} strokeWidth={1.8} />
            </div>
            {!collapsed && (
              <div className="flex flex-col animate-in fade-in duration-200">
                <span className="text-[13px] font-semibold">
                  Nueva Venta
                </span>
                <span className={`text-[10px] ${sublabelClass}`}>Terminal de Cobro</span>
              </div>
            )}
          </button>

          {/* Historial de Ventas Button */}
          {hasPermission("historial") && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("historial");
                setMobileMenuOpen(false);
              }}
              className={getNavBtnClass("historial")}
              title={collapsed ? "Historial de Ventas" : undefined}
            >
              <div className={activeTab === "historial" ? navIconActive : navIconIdle}>
                <History size={16} strokeWidth={1.8} />
              </div>
              {!collapsed && (
                <div className="flex flex-col animate-in fade-in duration-200">
                  <span className="text-[13px] font-semibold">
                    Historial de Ventas
                  </span>
                  <span className={`text-[10px] ${sublabelClass}`}>Ventas del Turno</span>
                </div>
              )}
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
              className={getNavBtnClass("metricas")}
              title={collapsed ? "Métricas" : undefined}
            >
              <div className={activeTab === "metricas" ? navIconActive : navIconIdle}>
                <TrendingUp size={16} strokeWidth={1.8} />
              </div>
              {!collapsed && (
                <div className="flex flex-col animate-in fade-in duration-200">
                  <span className="text-[13px] font-semibold">
                    Métricas
                  </span>
                  <span className={`text-[10px] ${sublabelClass}`}>Estadísticas del Turno</span>
                </div>
              )}
            </button>
          )}
        </div>



      </div>

      {/* Footer Fijo en la parte inferior */}
      <div className={`absolute bottom-0 left-0 right-0 border-t ${borderClass} bg-ink-950 flex flex-col gap-4.5 z-20 ${collapsed ? "p-3 bg-ink-950/95 backdrop-blur-sm" : "p-6 bg-ink-950/90 backdrop-blur-md"}`}>
        {/* Closing capability directly from Caja if user has permissions */}
        {currentUser?.permissions?.closeNight && event?.status === "activo" && (
          <div>
            <button
              type="button"
              onClick={() => {
                setCloseModalOpen(true);
                setMobileMenuOpen(false);
              }}
              className={`w-full h-10 rounded-xl bg-danger-soft border border-danger-line text-danger flex items-center justify-center hover:brightness-110 active:scale-95 transition-all cursor-pointer ${
                collapsed ? "" : "gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]"
              }`}
              title="Cerrar noche"
            >
              <Power size={13} />
              {!collapsed && <span>Cerrar noche</span>}
            </button>
          </div>
        )}

        {/* Estado de la impresora térmica */}
        <div className={collapsed ? "px-0 text-center" : "px-1"}>
          <div className="flex items-center justify-between gap-2 mb-2 w-full">
            {collapsed ? (
              <button
                type="button"
                onClick={testPrint}
                className={`w-10 h-10 rounded-xl flex items-center justify-center border cursor-pointer active:scale-95 transition-all relative mx-auto ${
                  printerStatus?.connected 
                    ? "bg-green-soft border-green-line text-green" 
                    : "bg-danger-soft border-danger-line text-danger"
                }`}
                title={printerStatus?.connected ? "Impresora conectada. Click para test." : "Impresora no encontrada. Click para test."}
              >
                <Printer size={16} />
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${printerStatus?.connected ? "bg-green" : "bg-danger"}`} />
              </button>
            ) : (
              <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${printerStatus?.connected ? "text-green" : "text-danger"}`}>
                <Printer size={13} />
                {printerStatus?.connected ? "Impresora conectada" : "Impresora no encontrada"}
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={testPrint}
              className="w-full h-9 rounded-xl bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] active:scale-95 transition-all cursor-pointer"
            >
              Imprimir ticket de prueba
            </button>
          )}
          {printerTestMessage && !collapsed && (
            <p className="text-[10px] text-ink-400 mt-1.5 text-center">{printerTestMessage}</p>
          )}
        </div>

        {/* User profile footer */}
        <OSProfileFooter 
          onLogout={handleLogout} 
          username={currentUser?.username} 
          role={currentUser?.role} 
          isCollapsed={collapsed} 
        />
      </div>
    </aside>
  );
}
