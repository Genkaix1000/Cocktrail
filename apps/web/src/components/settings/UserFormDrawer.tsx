"use client";

import { Shield, X } from "lucide-react";
import type { CreateUserInput, UserPermissions } from "@/services/users.service";
import type { Role } from "@cocktrail/shared";
import { ROLE_META, PERMISSIONS_BY_ROLE, PERMISSION_LABELS } from "./usuariosConstants";

const SYSTEM_USERNAMES = ["admin", "caja", "barra"];

type EditUser = Partial<CreateUserInput> & { id?: string };

type Props = {
  editUser: EditUser;
  error: string;
  saving: boolean;
  isBosko: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRoleChange: (role: Role) => void;
  onTogglePermission: (key: keyof UserPermissions) => void;
  onCancel: () => void;
  onSave: () => void;
};

export default function UserFormDrawer({
  editUser,
  error,
  saving,
  isBosko,
  onUsernameChange,
  onPasswordChange,
  onRoleChange,
  onTogglePermission,
  onCancel,
  onSave,
}: Props) {
  const isEditSystemUser = !!(editUser.username && SYSTEM_USERNAMES.includes(editUser.username.toLowerCase()));

  return (
    <div className="w-full lg:w-[480px] shrink-0 bg-ink-900 border border-ink-800 rounded-xl p-6 flex flex-col gap-5 animate-in slide-in-from-right duration-200">
      <div className="flex justify-between items-center pb-3 border-b border-ink-800">
        <h2 className="text-[18px] font-bold text-ink-50 uppercase tracking-wider">
          {isEditSystemUser ? "Ver Usuario" : editUser.id ? "Editar Usuario" : "Nuevo Usuario"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 bg-ink-850 hover:bg-ink-800 rounded-lg text-ink-400 hover:text-ink-200 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-danger-soft border border-danger-line text-danger text-[12px]">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {/* Username */}
        <div className="space-y-1.5">
          <label className="text-[14px] font-semibold text-ink-100 block">Usuario *</label>
          <input
            type="text"
            disabled={isEditSystemUser}
            value={editUser.username || ""}
            onChange={(e) => onUsernameChange(e.target.value)}
            className={`w-full h-10 px-3.5 border rounded-lg text-sm transition-all duration-200 outline-none ${
              isEditSystemUser
                ? "bg-ink-850/40 border-ink-800 text-ink-400 cursor-not-allowed"
                : "bg-ink-850 border-ink-700 text-ink-50 focus:border-accent"
            }`}
            placeholder="nombre_operador"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[14px] font-semibold text-ink-100 block font-sans">
            {isEditSystemUser ? "Contraseña" : editUser.id ? "Nueva Contraseña (dejar vacío para mantener)" : "Contraseña *"}
          </label>
          <input
            type="password"
            disabled={isEditSystemUser}
            value={isEditSystemUser ? "••••••••" : (editUser.password || "")}
            onChange={(e) => onPasswordChange(e.target.value)}
            className={`w-full h-10 px-3.5 border rounded-lg text-sm transition-all duration-200 outline-none ${
              isEditSystemUser
                ? "bg-ink-850/40 border-ink-800 text-ink-400 cursor-not-allowed"
                : "bg-ink-850 border-ink-700 text-ink-50 focus:border-accent"
            }`}
            placeholder={isEditSystemUser ? "" : editUser.id ? "Opcional" : "Mínimo 4 caracteres"}
          />
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label className="text-[14px] font-semibold text-ink-100 block">Rol</label>
          <div className="grid grid-cols-3 gap-2">
            {(["admin", "caja", "barman"] as Role[]).map((r) => {
              const meta = ROLE_META[r] || { label: r, color: "text-ink-300", bg: "bg-ink-800" };
              const isSelected = editUser.role === r;
              const activeStyle = isBosko
                ? "bg-accent/15 text-accent border border-accent/35 font-bold shadow-sm"
                : "bg-blue/15 text-blue border border-blue/35 font-bold shadow-sm";

              return (
                <button
                  key={r}
                  type="button"
                  disabled={isEditSystemUser}
                  onClick={() => !isEditSystemUser && onRoleChange(r)}
                  className={`
                    h-10 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-95
                    ${isEditSystemUser ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
                    ${isSelected
                      ? activeStyle
                      : "bg-ink-850 border border-ink-750 text-ink-400 hover:text-ink-200 hover:bg-ink-800"
                    }
                  `}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Permissions */}
        <div className="space-y-2">
          <label className="text-[14px] font-semibold text-ink-100 block">
            Permisos asignados
          </label>
          <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 no-scrollbar">
            {(PERMISSIONS_BY_ROLE[editUser.role || "barman"] || []).map((key: keyof UserPermissions) => {
              const label = PERMISSION_LABELS[key];
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-xl border border-transparent select-none transition-all duration-200 ${
                    isEditSystemUser
                      ? "bg-ink-850/20 text-ink-400 cursor-not-allowed"
                      : "bg-ink-850/50 cursor-pointer hover:bg-ink-800 hover:border-accent/10"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={isEditSystemUser}
                    checked={editUser.permissions?.[key] || false}
                    onChange={() => !isEditSystemUser && onTogglePermission(key)}
                    className={`w-4.5 h-4.5 rounded border-ink-600 bg-ink-850 text-accent accent-accent transition-all ${isEditSystemUser ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  />
                  <span className="text-[13px] font-medium">{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-ink-800 shrink-0">
        {isEditSystemUser ? (
          <div className="flex flex-col gap-3 w-full">
            <div className="w-full py-3 px-4 rounded-xl border border-amber-500/25 bg-amber-500/5 text-amber-500 text-xs font-bold text-center flex items-center justify-center gap-2">
              <Shield size={14} />
              <span>Este usuario es de sistema y es inmutable</span>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="w-full h-10 rounded-xl bg-ink-850 border border-ink-750 text-xs font-bold uppercase tracking-[0.08em] text-ink-300 hover:text-ink-100 transition-all cursor-pointer active:scale-[0.97]"
            >
              Cerrar Vista
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="h-9 px-4 rounded-xl bg-ink-850 border border-ink-750 text-xs font-semibold text-ink-300 hover:text-ink-100 transition-all cursor-pointer active:scale-[0.97]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !editUser.username || (!editUser.id && !editUser.password)}
              className={`h-9 px-5 rounded-xl text-xs font-bold uppercase tracking-[0.08em] transition-all duration-200 select-none active:scale-[0.97] ${
                (saving || !editUser.username || (!editUser.id && !editUser.password))
                  ? "bg-ink-850/50 border border-ink-800 text-ink-500 cursor-not-allowed opacity-50"
                  : isBosko
                  ? "ct-action-btn text-[#050d07] shadow-md cursor-pointer hover:brightness-110"
                  : "bg-blue hover:bg-blue-bright text-ink-950 shadow-[0_4px_15px_rgba(109,179,242,0.15)] cursor-pointer"
              }`}
            >
              {saving ? "Guardando..." : editUser.id ? "Guardar" : "Crear"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
