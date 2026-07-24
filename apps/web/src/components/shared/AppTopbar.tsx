"use client";

import { Menu, Moon, Sun, User, Shield, Banknote } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import type { Role } from "@cocktrail/shared";

type Props = {
  breadcrumbs: string[];
  username?: string;
  role?: Role | string;
  onMenuClick?: () => void;
};

function RoleIcon({ role }: { role?: string }) {
  const r = (role || "").toLowerCase();
  if (r === "caja") return <Banknote size={12} strokeWidth={1.8} />;
  return <Shield size={12} strokeWidth={1.8} />;
}

/** Topbar Bosko: enrutado + toggle día/noche + usuario (nombre / rol). */
export function AppTopbar({ breadcrumbs, username, role, onMenuClick }: Props) {
  const { isDark, toggleDark } = useTheme();
  const displayName = username || "Admin";
  const displayRole = role || "Personal";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center justify-between w-full gap-4 min-w-0">
      <div className="flex items-center gap-3.5 min-w-0">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden w-9 h-9 rounded-xl bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            aria-label="Abrir menú"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
        )}

        <nav
          className="hidden sm:flex items-center gap-1.5 text-[12px] font-medium tracking-wide text-[var(--text-tertiary)] min-w-0"
          aria-label="Ubicación"
        >
          {breadcrumbs.map((crumb, idx) => (
            <span key={`${crumb}-${idx}`} className="flex items-center gap-1.5 min-w-0">
              {idx > 0 && <span className="text-[var(--border-strong)]">/</span>}
              <span
                className={
                  idx === breadcrumbs.length - 1
                    ? "text-[var(--accent-text)] font-semibold truncate"
                    : "text-[var(--text-secondary)] truncate"
                }
              >
                {crumb}
              </span>
            </span>
          ))}
        </nav>

        <span className="sm:hidden text-[12px] font-semibold text-[var(--accent-text)] truncate">
          {breadcrumbs[breadcrumbs.length - 1]}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={toggleDark}
          className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)] transition-all cursor-pointer active:scale-95"
          title={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
          aria-label={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
        >
          {isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[var(--accent-text)] bg-[var(--accent-surface)] border border-[var(--accent-line)]"
            aria-hidden
          >
            <span className="text-[11px] font-bold uppercase tracking-tight">{initials}</span>
          </div>
          <div className="hidden sm:flex flex-col min-w-0 text-left leading-tight">
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
