"use client";

import { CircleHelp, Menu, Moon, Sun, User, Shield, Banknote } from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useHelpSafe } from "@/components/help/HelpCenterProvider";
import type { Role } from "@cocktrail/shared";

type Props = {
  breadcrumbs: string[];
  username?: string;
  role?: Role | string;
  onMenuClick?: () => void;
  /** Acciones extra a la izquierda de ayuda/tema (ej. impresora en admin POS). */
  trailing?: ReactNode;
};

function RoleIcon({ role }: { role?: string }) {
  const r = (role || "").toLowerCase();
  if (r === "caja") return <Banknote size={12} strokeWidth={1.8} />;
  return <Shield size={12} strokeWidth={1.8} />;
}

/** Topbar Bosko autónoma: enrutado + toggle día/noche + usuario. */
export function AppTopbar({ breadcrumbs, username, role, onMenuClick, trailing }: Props) {
  const { isDark, toggleDark } = useTheme();
  const help = useHelpSafe();
  const displayName = username?.trim() || "—";
  const displayRole = role || "Personal";
  const initials = username?.trim() ? username.trim().slice(0, 2).toUpperCase() : "?";

  return (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden w-10 h-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Abrir menú"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
        )}

        <nav
          className="hidden sm:flex items-center gap-1.5 text-[13px] font-medium tracking-wide text-[var(--text-tertiary)] min-w-0"
          aria-label="Ubicación"
        >
          {breadcrumbs.map((crumb, idx) => (
            <span key={`${crumb}-${idx}`} className="flex items-center gap-1.5 min-w-0">
              {idx > 0 && <span className="text-[var(--border-strong)]">/</span>}
              <span
                className={
                  idx === breadcrumbs.length - 1
                    ? "text-[var(--text-primary)] font-semibold truncate"
                    : "text-[var(--text-secondary)] truncate"
                }
              >
                {crumb}
              </span>
            </span>
          ))}
        </nav>

        <span className="sm:hidden text-[13px] font-semibold text-[var(--text-primary)] truncate">
          {breadcrumbs[breadcrumbs.length - 1]}
        </span>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {trailing}
        {help && (
          <button
            type="button"
            onClick={() => void help.startGeneralTour()}
            className="w-10 h-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-all cursor-pointer active:scale-95"
            title="Ayuda general"
            aria-label="Ayuda general"
          >
            <CircleHelp size={16} strokeWidth={1.8} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleDark}
          className="w-10 h-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-all cursor-pointer active:scale-95"
          title={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
          aria-label={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
        >
          {isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
        </button>

        <div className="flex items-center gap-2.5 min-w-0 pl-1">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[var(--accent-text)] bg-[var(--accent-surface)] border border-[var(--accent-line)]"
            aria-hidden
          >
            <span className="text-[11px] font-bold uppercase tracking-tight">{initials}</span>
          </div>
          <div className="hidden sm:flex flex-col min-w-0 text-left leading-tight pr-1">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--text-primary)] truncate">
              <User size={13} strokeWidth={2} className="text-[var(--accent-text)] shrink-0" />
              <span className="truncate">{displayName}</span>
            </p>
            <p className="flex items-center gap-1.5 text-[12px] font-normal text-[var(--text-secondary)] capitalize truncate mt-0.5">
              <span className="text-[var(--text-tertiary)] shrink-0">
                <RoleIcon role={displayRole} />
              </span>
              <span className="truncate">{displayRole}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
