"use client";

import { useEffect, useState, useRef } from "react";
import {
  Wifi,
  WifiOff,
  Database,
  Power,
  X,
  CreditCard,
  Lock,
  Loader2,
  Printer,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Globe,
  Activity,
  Server,
  LogOut,
  Sun,
  Moon,
  RefreshCw,
  Clock,
  ArrowRight,
  Bell
} from "lucide-react";
import { systemService, type SystemStatus } from "@/services/system.service";
import { authService } from "@/services/auth.service";
import { useTheme } from "./ThemeProvider";

type OSHeadbarProps = {
  activeScreen: string;
};

// ── OSHeadbar Component (Top Right: Badge + Clock Only) ──
export function OSHeadbar({ activeScreen }: OSHeadbarProps) {
  const { theme, isDark } = useTheme();
  const isBosko = theme === "bosko";

  // Real-time Clock (HH:MM p.m. / a.m.)
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Contrast text color for clock
  const clockColor = isBosko
    ? "text-[#fffeb3]"
    : isDark
      ? "text-ink-100"
      : "text-ink-950";

  // Contrast styling for badge
  const badgeClass = isBosko
    ? "bg-white/10 border-white/20 text-[#fffeb3]"
    : isDark
      ? "bg-ink-900 border-ink-800 text-ink-200"
      : "bg-ink-100 border-ink-300 text-ink-800";

  return (
    <div className="flex items-center gap-4 select-none font-mono text-[11px] relative">
      {/* 1. Screen Badge / Role */}
      <div className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-wider ${badgeClass}`}>
        {activeScreen}
      </div>

      {/* 2. Clock */}
      <div className={`font-bold tracking-wider ${clockColor}`}>
        {time}
      </div>
    </div>
  );
}

// ── OSProfileFooter Props ──
type OSProfileFooterProps = {
  onLogout: () => void | Promise<void>;
  username?: string;
  role?: string;
};

// ── OSProfileFooter Component (Bottom Left Sidebar Session / Control Center Trigger) ──
export function OSProfileFooter({ onLogout, username, role }: OSProfileFooterProps) {
  const { theme, toggleDark, isDark } = useTheme();
  const isBosko = theme === "bosko";

  // Session state parsed from cookie
  const [session, setSession] = useState<{ role: string; username: string } | null>(null);

  // Dropdown states
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPosnetDetails, setShowPosnetDetails] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // System Health States
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [highlightedCard, setHighlightedCard] = useState<string | null>(null);
  const [pingingCloud, setPingingCloud] = useState(false);
  const [cloudPingResult, setCloudPingResult] = useState<boolean | null>(null);

  // Printer configuration
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState("default");

  // Diagnostics throttling
  const [throttleSeconds, setThrottleSeconds] = useState(0);

  // Modals state
  const [showShutdownModal, setShowShutdownModal] = useState(false);

  // Shutdown credentials & state
  const [shutdownPassword, setShutdownPassword] = useState("");
  const [shutdownUsername, setShutdownUsername] = useState("");
  const [shutdownError, setShutdownError] = useState<string | null>(null);
  const [shutdownProgress, setShutdownProgress] = useState(false);
  const [systemTerminated, setSystemTerminated] = useState(false);
  const [forceShutdown, setForceShutdown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Listen to open requests and highlights from notifications
  useEffect(() => {
    const handleOpenRequest = (e: Event) => {
      const customEvent = e as CustomEvent<{ highlight: string }>;
      setShowDropdown(true);
      if (customEvent.detail?.highlight) {
        setHighlightedCard(customEvent.detail.highlight);
        setTimeout(() => {
          setHighlightedCard(null);
        }, 4000);
      }
    };
    const handleTriggerShutdown = () => {
      setShowShutdownModal(true);
    };
    window.addEventListener("cocktrail-open-control-center", handleOpenRequest as EventListener);
    window.addEventListener("cocktrail-trigger-shutdown", handleTriggerShutdown);
    return () => {
      window.removeEventListener("cocktrail-open-control-center", handleOpenRequest as EventListener);
      window.removeEventListener("cocktrail-trigger-shutdown", handleTriggerShutdown);
    };
  }, []);

  // Parse session from props or fall back to api call
  useEffect(() => {
    if (username && role) {
      setSession({ role, username });
      return;
    }
    const fetchSession = async () => {
      try {
        const u = await authService.getMe();
        if (u) {
          setSession({ role: u.role, username: u.username });
        } else {
          setSession(null);
        }
      } catch (err) {
        console.warn("Failed to fetch session in footer:", err);
        setSession(null);
      }
    };
    fetchSession();
    window.addEventListener("focus", fetchSession);
    return () => window.removeEventListener("focus", fetchSession);
  }, [username, role]);

  // Throttle timer for manual check
  useEffect(() => {
    if (throttleSeconds <= 0) return;
    const t = setInterval(() => {
      setThrottleSeconds(prev => prev - 1);
    }, 1000);
    return () => clearInterval(t);
  }, [throttleSeconds]);

  // Load printer preference on mount
  useEffect(() => {
    const saved = localStorage.getItem("cocktrail_selected_printer");
    if (saved) {
      setSelectedPrinter(saved);
    }
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showDropdown]);

  // Perform self-check
  const runSelfCheck = async () => {
    if (checking || systemTerminated) return;
    setChecking(true);
    try {
      const data = await systemService.getStatus();
      setStatus(data);
      // Dispatch status updates to bell alerts!
      window.dispatchEvent(new CustomEvent("cocktrail-status-updated", { detail: data }));
    } catch (err: any) {
      console.warn("System status check failed:", err);
    } finally {
      setChecking(false);
    }
  };

  // Run initial self check on mount
  useEffect(() => {
    if (systemTerminated) return;
    runSelfCheck();
  }, [systemTerminated]);

  // Fetch CUPS printers list
  const fetchPrinters = async () => {
    try {
      const list = await systemService.getPrinters();
      setPrinters(list || []);
    } catch (err) {
      console.warn("Failed to fetch printers:", err);
    }
  };

  const handleSelectPrinter = (name: string) => {
    setSelectedPrinter(name);
    localStorage.setItem("cocktrail_selected_printer", name);
  };

  const handleManualCheck = async () => {
    if (throttleSeconds > 0 || checking) return;
    setThrottleSeconds(5);
    await runSelfCheck();
  };

  // Cloud Ping Check (Supabase Alive verification)
  const handleCloudPing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pingingCloud) return;
    setPingingCloud(true);
    setCloudPingResult(null);
    try {
      const data = await systemService.getStatus();
      setStatus(data);
      setCloudPingResult(data.cloudDb.connected);
      window.dispatchEvent(new CustomEvent("cocktrail-status-updated", { detail: data }));
    } catch (err) {
      setCloudPingResult(false);
    } finally {
      setPingingCloud(false);
    }
  };

  // Sync now
  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await systemService.sync();
      if (res.success) {
        runSelfCheck();
      } else {
        alert(res.message || "Fallo de sincronización.");
      }
    } catch (err: any) {
      console.error("Sync error:", err);
      alert(err.message || "Error al conectar con la API de sincronización.");
    } finally {
      setSyncing(false);
    }
  };

  // Trigger Shutdown
  const handleShutdown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shutdownProgress) return;
    setShutdownProgress(true);
    setShutdownError(null);

    try {
      const res = await systemService.shutdown(
        shutdownPassword,
        session ? undefined : shutdownUsername
      );
      
      if (res.success) {
        setSystemTerminated(true);
        setShowShutdownModal(false);
      } else {
        setShutdownError(res.message || "Contraseña inválida.");
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setShutdownError("Credenciales inválidas. Reintentá.");
      } else {
        console.warn("Shutdown request failed/aborted, assuming success:", err);
        setSystemTerminated(true);
        setShowShutdownModal(false);
      }
    } finally {
      setShutdownProgress(false);
    }
  };

  // Format Servicio Levantado time
  const formatStartedTime = (startedAt?: number) => {
    if (!startedAt) return "Calculando...";
    const date = new Date(startedAt);
    return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + " hs";
  };

  // Identify warnings for shutdown
  const pendingSync = status?.sync?.pendingEvents || 0;
  const activeOrdersCount = status?.eventDetails?.orderCounter || 0;
  const hasShutdownWarnings = activeOrdersCount > 0;

  // Custom styling classes
  const avatarClass = isBosko
    ? "bg-white/10 border border-white/20 text-[#fffeb3]"
    : "bg-accent/10 border border-accent/25 text-accent";
    
  const footerTextClass = isBosko ? "text-white font-semibold" : "text-ink-50 font-semibold";
  const footerSubtextClass = isBosko ? "text-white/50" : "text-ink-500";
  
  const footerBtnClass = isBosko
    ? "bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-[#fffeb3]"
    : "bg-ink-850 hover:bg-ink-800 border border-ink-750 text-ink-300";

  return (
    <div 
      ref={containerRef}
      className="relative mt-auto pt-4 border-t flex flex-col w-full z-50 font-mono"
      style={{ borderColor: isBosko ? "rgba(255,255,255,0.1)" : undefined }}
    >
      {/* ── Start Dropdown Menu (Positioned above trigger at bottom-left) ── */}
      {showDropdown && (
        <div className="absolute left-0 bottom-[65px] z-50 w-[320px] bg-ink-900/95 backdrop-blur-md border border-ink-800 rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-2 duration-250 flex flex-col gap-4 text-left">
          
          {/* Header Area: Control Center Title */}
          <div className="flex items-center justify-between border-b border-ink-800/80 pb-2 mb-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-accent font-mono">
              Centro de Control
            </span>
            <button
              type="button"
              onClick={() => setShowDropdown(false)}
              className="p-1.5 rounded-lg bg-ink-950/40 hover:bg-ink-850/60 border border-ink-800/60 text-ink-400 hover:text-ink-200 transition-all cursor-pointer animate-in fade-in"
            >
              <X size={12} />
            </button>
          </div>

          {/* Section 1: Entorno (System Status Details) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-500 font-mono">
                Entorno
              </span>
              <button
                type="button"
                onClick={handleManualCheck}
                disabled={checking || throttleSeconds > 0}
                className="p-1 rounded bg-ink-950/20 hover:bg-ink-950/60 border border-transparent hover:border-ink-850/60 text-ink-400 hover:text-ink-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-transparent transition-all cursor-pointer flex items-center gap-1 font-mono text-[9px]"
                title={throttleSeconds > 0 ? `Esperar (${throttleSeconds}s)` : "Comprobar"}
              >
                {checking ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <RefreshCw size={10} />
                )}
                {throttleSeconds > 0 && <span>{throttleSeconds}s</span>}
              </button>
            </div>

            {/* Local DB */}
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-2xl bg-ink-950/45 border transition-all duration-300 hover:bg-ink-950/70 ${
              highlightedCard === "localDb"
                ? "border-red-500/80 ring-2 ring-red-500/20 bg-red-950/10 scale-[1.02]"
                : "border-ink-850/50"
            }`}>
              <div className="flex items-center gap-2.5">
                <Database size={13} className="text-ink-400 shrink-0" />
                <span className="text-[11px] font-semibold text-ink-200">Base de Datos Local</span>
              </div>
              <span className={`w-2 h-2 rounded-full shadow-sm shrink-0 ${status?.localDb.connected ? "bg-green-500 shadow-green-500/30" : "bg-red-500 shadow-red-500/30"}`} />
            </div>

            {/* Cloud DB (Amber/yellow with manual Supabase Ping chevron verification) */}
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-2xl bg-ink-950/45 border transition-all duration-300 hover:bg-ink-950/70 ${
              highlightedCard === "cloudDb"
                ? "border-amber-500/80 ring-2 ring-amber-500/20 bg-amber-950/10 scale-[1.02]"
                : "border-ink-850/50"
            }`}>
              <div className="flex items-center gap-2.5">
                <Globe size={13} className="text-ink-400 shrink-0" />
                <span className="text-[11px] font-semibold text-ink-200">Base de Datos Nube</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCloudPing}
                  disabled={pingingCloud}
                  className="p-1 rounded hover:bg-ink-800 text-ink-400 hover:text-ink-200 transition-colors cursor-pointer disabled:opacity-40"
                  title="Verificar conexión a Supabase"
                >
                  {pingingCloud ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <ArrowRight size={12} className="rotate-0 hover:translate-x-0.5 transition-transform" />
                  )}
                </button>
                <span className={`w-2 h-2 rounded-full shadow-sm shrink-0 ${
                  pingingCloud
                    ? "bg-amber-500 shadow-amber-500/30 animate-pulse"
                    : cloudPingResult === true
                      ? "bg-green-500 shadow-green-500/30"
                      : cloudPingResult === false
                        ? "bg-red-500 shadow-red-500/30"
                        : "bg-amber-500 shadow-amber-500/30"
                }`} />
              </div>
            </div>

            {/* Wifi / Internet */}
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-2xl bg-ink-950/45 border transition-all duration-300 hover:bg-ink-950/70 ${
              highlightedCard === "internet"
                ? "border-red-500/80 ring-2 ring-red-500/20 bg-red-950/10 scale-[1.02]"
                : "border-ink-850/50"
            }`}>
              <div className="flex items-center gap-2.5">
                {status?.internet.connected ? <Wifi size={13} className="text-ink-400 shrink-0" /> : <WifiOff size={13} className="text-ink-400 shrink-0" />}
                <span className="text-[11px] font-semibold text-ink-200">Conexión Internet</span>
              </div>
              <span className={`w-2 h-2 rounded-full shadow-sm shrink-0 ${status?.internet.connected ? "bg-green-500 shadow-green-500/30" : "bg-red-500 shadow-red-500/30"}`} />
            </div>

            {/* Posnet (Dot correctly aligned as right-most element) */}
            <div className={`flex flex-col rounded-2xl bg-ink-950/45 border transition-all duration-300 hover:bg-ink-950/70 overflow-hidden ${
              highlightedCard === "posnet"
                ? "border-red-500/80 ring-2 ring-red-500/20 bg-red-950/10 scale-[1.02]"
                : "border-ink-850/50"
            }`}>
              <div 
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
                onClick={() => setShowPosnetDetails(!showPosnetDetails)}
              >
                <div className="flex items-center gap-2.5">
                  <CreditCard size={13} className="text-ink-400 shrink-0" />
                  <span className="text-[11px] font-semibold text-ink-200">Posnet Mercado Pago</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {showPosnetDetails ? <ChevronUp size={12} className="text-ink-500 shrink-0" /> : <ChevronDown size={12} className="text-ink-500 shrink-0" />}
                  <span className={`w-2 h-2 rounded-full shadow-sm shrink-0 ${status?.posnet.connected ? "bg-green-500 shadow-green-500/30" : "bg-red-500 shadow-red-500/30"}`} />
                </div>
              </div>
              {showPosnetDetails && (
                <div className="px-3 pb-3 pt-1 border-t border-ink-850/30 text-[10px] text-ink-400 flex flex-col gap-1.5 pl-8 font-mono bg-black/10">
                  <div>Estado: <span className="font-bold text-ink-200">{status?.posnet.message}</span></div>
                  {status?.posnet.details && (
                    <>
                      <div>Modelo: <span className="font-bold text-ink-200">{status.posnet.details.model}</span></div>
                      <div>Modo: <span className="font-bold text-ink-200">{status.posnet.details.operatingMode}</span></div>
                      <div>S/N: <span className="font-bold text-ink-200">{status.posnet.details.serialNumber}</span></div>
                    </>
                  )}
                  <div>ID Dispositivo: <span className="font-bold text-ink-200">{status?.posnet.deviceId || "Ninguno"}</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Impresión (Printer Selection - Dot turns red if disconnected) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-500 font-mono">
              Impresión
            </span>
            <div className={`flex flex-col px-3 py-2.5 rounded-2xl bg-ink-950/45 border transition-all duration-300 hover:bg-ink-950/70 gap-2 ${
              highlightedCard === "printer"
                ? "border-red-500/80 ring-2 ring-red-500/20 bg-red-950/10 scale-[1.02]"
                : "border-ink-850/50"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Printer size={13} className="text-ink-400 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-ink-200">Impresora de Tickets</span>
                    <span className="text-[9px] text-ink-500 font-mono mt-0.5 max-w-[140px] truncate">
                      {selectedPrinter === "default" ? "Por defecto del sistema" : selectedPrinter.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                <span className={`w-2 h-2 rounded-full shadow-sm shrink-0 ${status?.printer.connected ? "bg-green-500 shadow-green-500/30" : "bg-red-500 shadow-red-500/30"}`} />
              </div>
              
              <div className="flex items-center gap-2 mt-1 border-t border-ink-850/30 pt-2">
                <span className="text-[9px] text-ink-500 uppercase tracking-wider shrink-0 font-mono">Cambiar:</span>
                <select
                  value={selectedPrinter}
                  onChange={(e) => handleSelectPrinter(e.target.value)}
                  className="flex-1 bg-ink-900 border border-ink-850 focus:border-accent rounded-lg px-2 py-1 text-[10px] text-ink-100 font-mono outline-none cursor-pointer"
                >
                  <option value="default">Por Defecto del Sistema</option>
                  {printers.map((name) => (
                    <option key={name} value={name}>
                      {name.replace(/_/g, " ")}
                    </option>
                  ))}
                  {printers.length === 0 && (
                    <option disabled>No se detectaron impresoras</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Preferencias */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-500 font-mono">
              Preferencias
            </span>

            {/* Screen mode toggle */}
            <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-ink-950/45 border border-ink-850/50 hover:bg-ink-950/70 transition-colors">
              <div className="flex items-center gap-2.5">
                {isDark ? <Moon size={13} className="text-ink-400 shrink-0" /> : <Sun size={13} className="text-ink-400 shrink-0" />}
                <span className="text-[11px] font-semibold text-ink-200">Modo de pantalla</span>
              </div>
              <button
                type="button"
                onClick={toggleDark}
                className={`h-6 px-2.5 rounded-lg text-[9.5px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isDark 
                    ? "bg-amber-500/10 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20" 
                    : "bg-ink-800 border border-ink-700 text-ink-300 hover:bg-ink-750"
                }`}
              >
                {isDark ? "Activar Día" : "Activar Noche"}
              </button>
            </div>

            {/* Uptime formatted in Spanish as Servicio Levantado */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-2xl bg-ink-950/45 border border-ink-850/50">
              <div className="flex items-center gap-2.5">
                <Clock size={13} className="text-ink-400 shrink-0" />
                <span className="text-[11px] font-semibold text-ink-200">Servicio levantado</span>
              </div>
              <span className="text-[11px] font-bold text-ink-100 font-mono">
                {formatStartedTime(status?.serverStartedAt)}
              </span>
            </div>
          </div>

          {/* Section 4: Actions (Logout & Shutdown stacked vertically as full-width) */}
          <div className="flex flex-col gap-2 border-t border-ink-800/80 pt-3.5">
            {/* Cerrar Sesión Button inside dropdown */}
            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                setShowLogoutConfirm(true);
              }}
              className="w-full h-9 bg-ink-800 hover:bg-ink-750 border border-ink-700 text-ink-200 hover:text-ink-50 font-bold rounded-xl active:scale-[0.97] transition-all text-[10px] uppercase cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut size={11} />
              <span>Cerrar sesión</span>
            </button>

            {/* Apagar Terminal Button */}
            <button
              type="button"
              onClick={() => {
                setShowDropdown(false);
                setShowShutdownModal(true);
              }}
              className="w-full h-9 bg-red-950/20 hover:bg-red-500/20 border border-red-500/35 text-red-400 hover:text-red-300 font-bold rounded-xl active:scale-[0.97] transition-all text-[10px] uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Power size={11} />
              <span>Apagar Terminal</span>
            </button>
          </div>

        </div>
      )}

      {/* ── Profile card trigger container (Logout button removed, trigger is full width) ── */}
      <div 
        onClick={() => {
          setShowDropdown(!showDropdown);
          if (!showDropdown) {
            runSelfCheck();
            fetchPrinters();
          }
        }}
        className={`flex items-center gap-2.5 w-full p-2 rounded-[18px] border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
          showDropdown
            ? isBosko
              ? "bg-white/10 border-white/20"
              : "bg-ink-900 border-ink-800"
            : isBosko
              ? "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10"
              : "bg-transparent border-transparent hover:bg-ink-850/50 hover:border-ink-800"
        }`}
        title="Ver diagnósticos y configuración de Cocktrail"
      >
        <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center font-bold uppercase text-[11px] shrink-0 select-none ${avatarClass}`}>
          {session?.username?.slice(0, 2) || "AD"}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-[12.5px] truncate leading-tight font-bold ${footerTextClass}`}>
            {session ? session.username : "Cajera"}
          </p>
          <p className={`text-[9.5px] capitalize truncate mt-0.5 ${footerSubtextClass}`}>
            {session ? session.role : "Personal"}
          </p>
        </div>
      </div>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-ink-900 border border-ink-800 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 font-mono text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-danger-soft border border-danger-line flex items-center justify-center text-danger mb-4">
              <LogOut size={22} />
            </div>
            
            <h3 className="font-bold text-sm uppercase tracking-wider text-ink-50 mb-2">
              ¿Cerrar sesión?
            </h3>
            
            <p className="text-xs text-ink-400 leading-normal mb-5">
              Confirmá si querés salir de tu cuenta y volver a la pantalla de login.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-10 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await onLogout();
                }}
                className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl active:scale-95 transition-all text-xs uppercase cursor-pointer"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shutdown Verification & Authorization Modal ── */}
      {showShutdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-ink-900 border border-ink-800 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 font-mono">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink-800">
              <div className="flex items-center gap-2 text-red-500">
                <Power size={18} />
                <h3 className="font-bold text-sm uppercase tracking-wider text-ink-50">Apagar Terminal</h3>
              </div>
              <button 
                onClick={() => {
                  setShowShutdownModal(false);
                  setShutdownPassword("");
                  setShutdownUsername("");
                  setShutdownError(null);
                  setForceShutdown(false);
                }} 
                className="p-2 bg-ink-850 hover:bg-ink-800 border border-ink-750 text-ink-400 rounded-full transition-transform cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-ink-400 leading-relaxed mb-4">
              Esta acción detendrá los procesos locales del backend de Cocktrail y los contenedores Docker asociados.
            </p>

            {/* Warnings Verification block */}
            {hasShutdownWarnings && (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4.5 flex flex-col gap-2.5 mb-4 text-left">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <AlertTriangle size={14} />
                  <span>Verificaciones de Seguridad</span>
                </div>
                
                {activeOrdersCount > 0 && (
                  <p className="text-[11px] text-amber-300 leading-normal">
                    ⚠️ La noche actual tiene <span className="font-bold text-white">{activeOrdersCount}</span> pedidos registrados. Debés realizar el cierre de caja de la noche para que los reportes de ventas se consoliden.
                  </p>
                )}

                <label className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-500/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceShutdown}
                    onChange={(e) => setForceShutdown(e.target.checked)}
                    className="accent-amber-500 w-3.5 h-3.5"
                  />
                  <span className="text-[10px] text-ink-100 font-bold uppercase tracking-wider font-mono">
                    Forzar apagado de todos modos
                  </span>
                </label>
              </div>
            )}

            {/* Auth form block */}
            {(!hasShutdownWarnings || forceShutdown) ? (
              <form onSubmit={handleShutdown} className="flex flex-col gap-4">
                {shutdownError && (
                  <div className="text-xs text-danger bg-danger-soft border border-danger-line rounded-xl px-4 py-2.5">
                    {shutdownError}
                  </div>
                )}

                {/* Username field: Show only if session is not available */}
                {!session && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-300 font-mono">Usuario</span>
                    <input
                      type="text"
                      required
                      value={shutdownUsername}
                      onChange={(e) => setShutdownUsername(e.target.value)}
                      className="bg-ink-950 border border-ink-800 focus:border-accent rounded-xl px-4 py-2.5 text-xs text-ink-50 outline-none transition-colors"
                      placeholder="Tu usuario"
                    />
                  </label>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-300 font-mono">
                    Contraseña de Autorización
                  </span>
                  <div className="relative">
                    <Lock size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" />
                    <input
                      type="password"
                      required
                      autoFocus
                      value={shutdownPassword}
                      onChange={(e) => setShutdownPassword(e.target.value)}
                      className="w-full bg-ink-950 border border-ink-800 focus:border-accent rounded-xl pl-10 pr-4 py-2.5 text-xs text-ink-50 outline-none transition-colors"
                      placeholder="Ingresá tu clave"
                    />
                  </div>
                </label>

                <div className="flex gap-3.5 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowShutdownModal(false);
                      setShutdownPassword("");
                      setShutdownUsername("");
                      setShutdownError(null);
                      setForceShutdown(false);
                    }}
                    className="flex-1 h-10 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={shutdownProgress || !shutdownPassword}
                    className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl active:scale-95 transition-all text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    {shutdownProgress && <Loader2 size={12} className="animate-spin" />}
                    {shutdownProgress ? "Apagando..." : "Confirmar"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3 mt-2">
                <p className="text-[10px] text-ink-500 leading-normal text-left font-mono">
                  * Debés resolver los avisos de seguridad anteriores o marcar la casilla de forzar apagado para habilitar la autenticación de apagado.
                </p>
                <button
                  type="button"
                  onClick={() => setShowShutdownModal(false)}
                  className="w-full h-10 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase cursor-pointer"
                >
                  Cerrar Ventana
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── System Blackout overlay after successful shutdown ── */}
      {systemTerminated && (
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col items-center justify-center text-center p-6 select-none font-mono">
          <div className="w-16 h-16 rounded-full border border-red-500/20 bg-red-500/10 flex items-center justify-center text-red-500 mb-6 animate-pulse">
            <Power size={28} />
          </div>
          <h2 className="text-xl font-bold text-ink-50 mb-2 uppercase tracking-widest font-mono">Sistema Apagado</h2>
          <p className="text-sm text-ink-500 max-w-sm leading-relaxed font-mono">
            Se cerraron las bases de datos y el servidor se detuvo correctamente. Ya podés cerrar esta pestaña o apagar la pantalla física.
          </p>
        </div>
      )}
    </div>
  );
}
