"use client";

import { useState } from "react";
import { LogOut, Sun, Moon, X, Check } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

type Props = {
  onLogout: () => void | Promise<void>;
  username?: string;
  role?: string;
};

/** Sesión del sidebar (avatar/nombre/rol + toggle de tema + logout con confirmación). */
export function OSProfileFooter({ onLogout, username, role }: Props) {
  const { theme, toggleDark, isDark } = useTheme();
  const isBosko = theme === "bosko";
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);

  // Initials
  const initials = username ? username.slice(0, 2).toUpperCase() : "AD";

  const avatarClass = isBosko
    ? "bg-white/10 border border-white/20 text-[#fffeb3]"
    : "bg-accent/10 border border-accent/25 text-accent";

  const textClass = isBosko ? "text-white" : "text-ink-50";
  const subtextClass = isBosko ? "text-white/50" : "text-ink-500";

  return (
    <div
      className="mt-auto pt-4 border-t flex items-center justify-between w-full font-mono text-[11px]"
      style={{ borderColor: isBosko ? "rgba(255,255,255,0.1)" : "var(--ink-800)" }}
    >
      {showConfirmLogout ? (
        <div className="flex items-center justify-between w-full animate-in fade-in duration-200">
          <span className="text-red-400 font-bold tracking-tight text-[11px] truncate">¿Cerrar sesión?</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setShowConfirmLogout(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] text-[#a1a1aa] transition-all cursor-pointer"
              title="Cancelar"
            >
              <X size={12} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-950 border border-red-550/40 hover:bg-red-900 text-red-300 transition-all cursor-pointer"
              title="Confirmar"
            >
              <Check size={12} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center font-bold uppercase text-[11px] shrink-0 select-none ${avatarClass}`}>
              {initials}
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <p className={`text-[12.5px] truncate leading-tight font-bold ${textClass}`}>
                {username || "Admin"}
              </p>
              <p className={`text-[9.5px] capitalize truncate mt-0.5 ${subtextClass}`}>
                {role || "Personal"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle skin (theme toggle icon) */}
            <button
              type="button"
              onClick={toggleDark}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-ink-900 border border-ink-800 hover:bg-ink-850 text-ink-300 hover:text-ink-100 transition-all cursor-pointer active:scale-90"
              title={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {/* Logout button (Static colors, doesn't change on day mode) */}
            <button
              type="button"
              onClick={() => setShowConfirmLogout(true)}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#18181b] border border-[#27272a] hover:bg-red-950/20 hover:border-red-500/35 text-[#a1a1aa] hover:text-red-400 transition-all cursor-pointer active:scale-90"
              title="Cerrar Sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
