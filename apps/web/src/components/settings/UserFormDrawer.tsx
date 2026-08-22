"use client";

import { Shield, X } from "lucide-react";
import type { CreateUserInput } from "@/services/users.service";
import type { Role } from "@cocktrail/shared";
import { isSystemUser } from "./staffCrud";

const ROLE_META: Record<Role, { label: string }> = {
  admin: { label: "Administrador" },
  caja: { label: "Cajero" },
};

type EditUser = Partial<CreateUserInput> & { id?: string };

type Props = {
  editUser: EditUser;
  error: string;
  saving: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRoleChange: (role: Role) => void;
  onCancel: () => void;
  onSave: () => void;
};

const labelCls = "text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5";
const inputCls =
  "w-full h-10 px-3.5 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-all";
const inputDisabledCls =
  "w-full h-10 px-3.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-tertiary)] cursor-not-allowed opacity-70";

export default function UserFormDrawer({
  editUser,
  error,
  saving,
  onUsernameChange,
  onPasswordChange,
  onRoleChange,
  onCancel,
  onSave,
}: Props) {
  const isEditSystemUser = !!(editUser.username && isSystemUser(editUser.username));

  return (
    <div
      data-tour="user-form"
      className="w-full lg:w-[480px] shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5 shadow-card animate-in slide-in-from-right duration-200"
    >
      <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-tight">
          {isEditSystemUser ? "Ver usuario" : editUser.id ? "Editar usuario" : "Nuevo usuario"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-[var(--danger-soft)] text-[var(--danger-base)] text-[12px] font-medium">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className={labelCls}>Usuario *</label>
          <input
            type="text"
            disabled={isEditSystemUser}
            value={editUser.username || ""}
            onChange={(e) => onUsernameChange(e.target.value)}
            className={isEditSystemUser ? inputDisabledCls : inputCls}
            placeholder="nombre_operador"
          />
        </div>

        <div>
          <label className={labelCls}>
            {isEditSystemUser
              ? "Contraseña"
              : editUser.id
                ? "Nueva contraseña (opcional)"
                : "Contraseña *"}
          </label>
          <input
            type="password"
            disabled={isEditSystemUser}
            value={isEditSystemUser ? "••••••••" : editUser.password || ""}
            onChange={(e) => onPasswordChange(e.target.value)}
            className={isEditSystemUser ? inputDisabledCls : inputCls}
            placeholder={isEditSystemUser ? "" : editUser.id ? "Opcional" : "Mínimo 8 caracteres"}
          />
        </div>

        <div>
          <label className={labelCls}>Rol</label>
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
            {(["admin", "caja"] as Role[]).map((r) => {
              const meta = ROLE_META[r] || { label: r };
              const isSelected = editUser.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  disabled={isEditSystemUser}
                  onClick={() => !isEditSystemUser && onRoleChange(r)}
                  className={`h-9 rounded-full text-[12px] font-semibold transition-all ${
                    isEditSystemUser ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                  } ${
                    isSelected
                      ? r === "caja"
                        ? "bg-[var(--amber-soft)] text-[var(--amber-base)]"
                        : "bg-[var(--accent-surface)] text-[var(--accent-text)]"
                      : "bg-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-1 pt-4 border-t border-[var(--border-subtle)] shrink-0">
        {isEditSystemUser ? (
          <div className="flex flex-col gap-3 w-full">
            <div className="w-full py-3 px-4 rounded-xl border border-[var(--amber-line)] bg-[var(--amber-soft)] text-[var(--amber-base)] text-xs font-semibold text-center flex items-center justify-center gap-2">
              <Shield size={14} />
              <span>Este usuario es de sistema y es inmutable</span>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="w-full h-10 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-all cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="h-10 px-4 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !editUser.username || (!editUser.id && !editUser.password)}
              className="h-10 px-4 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold transition-all disabled:opacity-45 cursor-pointer"
            >
              {saving ? "Guardando..." : editUser.id ? "Guardar" : "Crear"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
