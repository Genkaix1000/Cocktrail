"use client";

import { Trash2, UserPlus } from "lucide-react";
import type { Role } from "@cocktrail/shared";
import type { SafeUser } from "@/services/users.service";
import { ConfirmRail } from "@/components/shared/ConfirmRail";
import ColumnPicker from "@/components/shared/ColumnPicker";
import { gridMinWidth } from "@/lib/crudCols";
import {
  STAFF_COL_LABELS,
  STAFF_COLS_TOGGLEABLE,
  type StaffColId,
  isSystemUser,
  staffGridTemplate,
} from "./staffCrud";

export type StaffColumnFilters = {
  user: string;
  role: "all" | Role;
  type: "all" | "system" | "staff";
};

type Props = {
  users: SafeUser[];
  hasActiveSearch: boolean;
  selectedUserId?: string;
  confirmingDeleteId: string | null;
  visibleCols: StaffColId[];
  filtersOpen: boolean;
  columnFilters: StaffColumnFilters;
  onSelectUser: (user: SafeUser) => void;
  onAskDelete: (user: SafeUser) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (user: SafeUser) => void;
  onToggleCol: (col: StaffColId) => void;
  onColumnFiltersChange: (patch: Partial<StaffColumnFilters>) => void;
};

const pillBase =
  "inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none";

const ROLE_PILL: Record<Role, string> = {
  admin: "bg-[var(--accent-surface)] text-[var(--accent-text)]",
  caja: "bg-[var(--amber-soft)] text-[var(--amber-base)]",
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  caja: "Cajero",
};

function FilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-7 px-2 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary)]"
    />
  );
}

export default function UsersTable({
  users,
  hasActiveSearch,
  selectedUserId,
  confirmingDeleteId,
  visibleCols,
  filtersOpen,
  columnFilters,
  onSelectUser,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleCol,
  onColumnFiltersChange,
}: Props) {
  const grid = staffGridTemplate(visibleCols);
  const minWidth = gridMinWidth(grid);

  function renderHeaderCell(col: StaffColId) {
    if (col === "actions") {
      return (
        <div key={col} className="flex items-center justify-start gap-1.5 px-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            Acciones
          </span>
          <ColumnPicker
            cols={STAFF_COLS_TOGGLEABLE}
            labels={STAFF_COL_LABELS}
            visible={visibleCols}
            onToggle={onToggleCol}
          />
        </div>
      );
    }
    return (
      <div
        key={col}
        className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
      >
        {STAFF_COL_LABELS[col]}
      </div>
    );
  }

  function renderFilterCell(col: StaffColId) {
    if (col === "user") {
      return (
        <div key={col} className="px-2 py-1.5">
          <FilterInput
            value={columnFilters.user}
            onChange={(v) => onColumnFiltersChange({ user: v })}
            placeholder="Filtrar…"
          />
        </div>
      );
    }
    if (col === "role") {
      return (
        <div key={col} className="px-2 py-1.5">
          <select
            value={columnFilters.role}
            onChange={(e) =>
              onColumnFiltersChange({ role: e.target.value as StaffColumnFilters["role"] })
            }
            className="w-full h-7 px-1.5 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none"
          >
            <option value="all">Todos</option>
            <option value="admin">Admin</option>
            <option value="caja">Cajero</option>
          </select>
        </div>
      );
    }
    if (col === "type") {
      return (
        <div key={col} className="px-2 py-1.5">
          <select
            value={columnFilters.type}
            onChange={(e) =>
              onColumnFiltersChange({ type: e.target.value as StaffColumnFilters["type"] })
            }
            className="w-full h-7 px-1.5 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none"
          >
            <option value="all">Todos</option>
            <option value="system">Sistema</option>
            <option value="staff">Staff</option>
          </select>
        </div>
      );
    }
    return <div key={col} className="px-2 py-1.5" />;
  }

  function renderDataCell(col: StaffColId, u: SafeUser, isConfirming: boolean) {
    const system = isSystemUser(u.username);

    if (col === "user") {
      return (
        <div key={col} className="flex items-center gap-3 min-w-0 px-3 py-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold uppercase shrink-0 ${
              isConfirming
                ? "bg-[var(--danger-base)]/15 text-[var(--danger-base)]"
                : "bg-[var(--accent-surface)] text-[var(--accent-text)]"
            }`}
          >
            {u.username.slice(0, 2)}
          </div>
          <p
            className={`text-[13px] font-semibold truncate ${
              isConfirming ? "text-[var(--danger-base)]" : "text-[var(--text-primary)]"
            }`}
          >
            {u.username}
          </p>
        </div>
      );
    }
    if (col === "role") {
      return (
        <div key={col} className="px-3 py-2.5 flex items-center justify-start">
          {!isConfirming && (
            <span className={`${pillBase} ${ROLE_PILL[u.role] ?? ""}`}>
              {ROLE_LABEL[u.role] ?? u.role}
            </span>
          )}
        </div>
      );
    }
    if (col === "type") {
      return (
        <div key={col} className="px-3 py-2.5 flex items-center justify-start">
          {!isConfirming && (
            <span
              className={`${pillBase} ${
                system
                  ? "bg-[var(--bg-panel)] text-[var(--text-tertiary)]"
                  : "bg-[var(--success-soft)] text-[var(--success-base)]"
              }`}
            >
              {system ? "Sistema" : "Staff"}
            </span>
          )}
        </div>
      );
    }
    if (col === "created") {
      return (
        <div
          key={col}
          className={`px-3 py-2.5 text-[12px] text-left tabular ${
            isConfirming ? "text-[var(--danger-base)]/70" : "text-[var(--text-secondary)]"
          }`}
        >
          {new Date(u.createdAt).toLocaleDateString("es-AR")}
        </div>
      );
    }
    if (col === "actions") {
      return (
        <div
          key={col}
          className="flex items-center justify-start gap-1.5 px-3 py-2 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {!isConfirming &&
            (system ? (
              <button
                type="button"
                disabled
                className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-tertiary)] opacity-40 cursor-not-allowed flex items-center justify-center"
                title="Usuario del sistema (inmutable)"
              >
                <Trash2 size={11} />
              </button>
            ) : (
              <ConfirmRail
                confirm={false}
                message="¿Eliminar?"
                className="w-7 shrink-0"
                onAsk={() => onAskDelete(u)}
                onCancel={onCancelDelete}
                onConfirm={() => onConfirmDelete(u)}
              >
                <span className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--danger-base)] hover:border-[var(--danger-base)]/40 transition-all">
                  <Trash2 size={11} />
                </span>
              </ConfirmRail>
            ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-card">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-x-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]"
            style={{ gridTemplateColumns: grid }}
          >
            {visibleCols.map(renderHeaderCell)}
          </div>

          {filtersOpen && (
            <div
              className="grid gap-x-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              style={{ gridTemplateColumns: grid }}
            >
              {visibleCols.map(renderFilterCell)}
            </div>
          )}

          {users.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <UserPlus size={28} className="mx-auto text-[var(--text-tertiary)] mb-2" />
              <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
                {hasActiveSearch || filtersOpen
                  ? "Sin resultados para tu búsqueda"
                  : "No hay usuarios creados"}
              </p>
              {!hasActiveSearch && !filtersOpen && (
                <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                  Agregá personal de staff para darles acceso al sistema
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {users.map((u, idx) => {
                const isSelected = selectedUserId === u.id;
                const isConfirming = confirmingDeleteId === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => !isConfirming && onSelectUser(u)}
                    className={`relative grid gap-x-3 items-stretch transition-colors duration-[260ms] ${
                      isConfirming
                        ? "bg-[var(--danger-soft)] cursor-default"
                        : `cursor-pointer hover:bg-[var(--bg-panel)] ${
                            isSelected
                              ? "bg-[var(--accent-surface)]/50 border-l-2 border-l-[var(--accent-primary)]"
                              : idx % 2 === 1
                                ? "bg-[var(--bg-panel)]/45 border-l-2 border-transparent"
                                : "bg-[var(--bg-surface)] border-l-2 border-transparent"
                          }`
                    }`}
                    style={{ gridTemplateColumns: grid }}
                  >
                    {visibleCols.map((col) => renderDataCell(col, u, isConfirming))}
                    {isConfirming && (
                      <div
                        className="absolute inset-y-0 right-0 z-10 flex items-center min-w-[220px] w-[min(280px,55%)] pl-4 pr-3 bg-[var(--danger-soft)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ConfirmRail
                          confirm
                          message="¿Eliminar?"
                          className="w-full h-full"
                          onAsk={() => {}}
                          onCancel={onCancelDelete}
                          onConfirm={() => onConfirmDelete(u)}
                        >
                          <span />
                        </ConfirmRail>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
