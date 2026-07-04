"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Shield, Trash2, UserPlus, X, Users } from "lucide-react";
import {
  usersService,
  type SafeUser,
  type CreateUserInput,
  type UserPermissions,
} from "@/services/users.service";
import type { Role } from "@cocktrail/shared";
import { useTheme } from "@/components/ThemeProvider";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";

const ROLE_META: Record<Role, { label: string; color: string; bg: string }> = {
  admin: { label: "Administrador", color: "text-blue", bg: "bg-blue-soft" },
  caja: { label: "Cajero", color: "text-amber", bg: "bg-amber-soft" },
  barman: { label: "Barman", color: "text-green", bg: "bg-green-soft" },
};

const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  closeNight: "Cerrar la noche",
  modifyCarta: "Modificar la carta",
  manageUsers: "Administrar usuarios",
  monitoreo: "Monitoreo",
  metricas: "Métricas",
  historial: "Historial de operaciones",
  general: "General/Estética",
  carta: "Modificar carta",
  pagos: "Mercado Pago",
  staff: "Gestión de Staff",
  cancelarTickets: "Cancelar tickets",
};

const PERMISSIONS_BY_ROLE: Record<Role, (keyof UserPermissions)[]> = {
  admin: ["monitoreo", "metricas", "historial", "general", "carta", "pagos", "staff", "closeNight"],
  caja: ["metricas", "historial", "closeNight", "cancelarTickets"],
  barman: ["cancelarTickets"],
};

const INITIAL_PERMISSIONS: UserPermissions = {
  closeNight: false,
  modifyCarta: false,
  manageUsers: false,
  monitoreo: false,
  metricas: false,
  historial: false,
  general: false,
  carta: false,
  pagos: false,
  staff: false,
  cancelarTickets: false,
};

export default function UsuariosSection() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false); // Side-drawer state
  const [editUser, setEditUser] = useState<(Partial<CreateUserInput> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SafeUser | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const { theme } = useTheme();

  const loadUsers = useCallback(async () => {
    try {
      const data = await usersService.list();
      setUsers(data);
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, [loadUsers]);

  const openCreate = useCallback(() => {
    setEditUser({
      username: "",
      password: "",
      role: "barman",
      permissions: { ...INITIAL_PERMISSIONS },
    });
    setError("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((u: SafeUser) => {
    setEditUser({
      id: u.id,
      username: u.username,
      password: "",
      role: u.role,
      permissions: { ...INITIAL_PERMISSIONS, ...u.permissions },
    });
    setError("");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditUser(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editUser || saving) return;
    if (!editUser.username?.trim()) {
      setError("El usuario es requerido");
      return;
    }
    if (!editUser.id && !editUser.password) {
      setError("La contraseña es requerida para nuevos usuarios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editUser.id) {
        // Update
        const payload: Partial<CreateUserInput> = {
          username: editUser.username.trim(),
          role: editUser.role,
          permissions: editUser.permissions as UserPermissions,
        };
        if (editUser.password?.trim()) {
          payload.password = editUser.password.trim();
        }
        const updated = await usersService.update(editUser.id, payload);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } else {
        // Create: a diferencia del update, acá no había trim de username/password
        // antes de mandarlos al backend (bug: permitía crear usuarios con espacios
        // al inicio/final, generando cuentas "duplicadas" invisibles).
        const payload: CreateUserInput = {
          username: editUser.username.trim(),
          password: (editUser.password ?? "").trim(),
          role: (editUser.role ?? "barman") as Role,
          permissions: editUser.permissions as UserPermissions,
        };
        const created = await usersService.create(payload);
        setUsers((prev) => [...prev, created]);
      }
      closeModal();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar usuario");
    } finally {
      setSaving(false);
    }
  }, [editUser, saving, closeModal]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await usersService.delete(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setDeleteConfirm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error deleting user:", err);
    }
  }, []);

  const togglePermission = useCallback(
    (key: keyof UserPermissions) => {
      setEditUser((prev) => {
        if (!prev) return null;
        const currentPermissions = prev.permissions
          ? { ...prev.permissions }
          : { ...INITIAL_PERMISSIONS };
        const val = !currentPermissions[key];
        const next = { ...currentPermissions, [key]: val };
        
        if (key === "cancelarTickets" && val) {
          next.historial = true;
        }
        if (key === "historial" && !val) {
          next.cancelarTickets = false;
        }
        return {
          ...prev,
          permissions: next,
        };
      });
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  const isBosko = theme === "bosko";

  return (
    <div className="space-y-8">
      {/* Title + actions */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
              <Users size={16} />
            </div>
            <span>Usuarios</span>
          </h1>
          <p className="text-[13px] text-ink-400/80 mt-1">
            Gestioná las cuentas de personal de tu boliche. {users.length} usuarios creados.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="h-10 px-4 rounded-xl bg-ink-800 border border-ink-700 text-ink-100 hover:text-ink-50 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.97]"
        >
          <UserPlus size={14} strokeWidth={2.5} />
          Agregar
        </button>
      </div>

      {/* Info about env users */}
      <div className="p-4 rounded-xl bg-ink-900/50 border border-ink-800">
        <p className="text-[12px] text-ink-400/80 leading-relaxed">
          <Shield size={13} className="inline mr-1.5 text-ink-400" />
          Los usuarios base (<span className="text-accent font-mono font-semibold">admin</span>,{" "}
          <span className="text-accent font-mono font-semibold">caja</span>,{" "}
          <span className="text-accent font-mono font-semibold">barra</span>) se configuran desde las variables de entorno del servidor.
          Aquí podés crear cuentas adicionales de staff con permisos personalizados.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Users list table */}
        <div className="flex-1 w-full space-y-6 min-w-0">
          {(() => {
            const systemUsers = users.filter((u) => ["admin", "caja", "barra"].includes(u.username.toLowerCase()));
            const staffUsers = users.filter((u) => !["admin", "caja", "barra"].includes(u.username.toLowerCase()));

            return (
              <>
                {/* Cuentas del Sistema */}
                <div className="space-y-2.5">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-400">
                    Cuentas del Sistema (Inmutables)
                  </h3>
                  <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden divide-y divide-ink-850">
                    {systemUsers.map((u, idx) => {
                      const roleMeta = ROLE_META[u.role] || { label: u.role, color: "text-ink-300", bg: "bg-ink-800" };
                      const isSelected = editUser?.id === u.id;
                      const badgeClass = isBosko
                        ? (u.role === "admin" ? "text-accent bg-accent-soft border border-accent/20" : u.role === "caja" ? "text-amber bg-amber-soft" : "text-green bg-green-soft")
                        : `${roleMeta.bg} ${roleMeta.color}`;

                      return (
                        <div
                          key={u.id}
                          onClick={() => openEdit(u)}
                          className={`flex items-stretch justify-between transition-colors cursor-pointer hover:bg-ink-850/30 ${
                            idx % 2 === 0 ? "bg-ink-800/30" : ""
                          } ${
                            isSelected
                              ? isBosko
                                ? "bg-accent-soft/20 border-l-2 border-l-accent"
                                : "bg-blue/5 border-l-2 border-l-blue"
                              : "border-l-2 border-transparent"
                          }`}
                        >
                          <div className="flex-1 flex items-center gap-3.5 min-w-0 px-5 py-4 border-r border-ink-850">
                            <div className="w-10 h-10 rounded-xl bg-ink-800 border border-ink-700 flex items-center justify-center text-ink-400 text-[14px] font-bold uppercase shrink-0">
                              {u.username.slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-ink-50 truncate">{u.username}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded leading-none ${badgeClass}`}>
                                  {roleMeta.label}
                                </span>
                                <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-800 border border-ink-750 text-ink-450 leading-none">
                                  Sistema
                                </span>
                                <span className="text-[11px] text-ink-500">
                                  {new Date(u.createdAt).toLocaleDateString("es-AR")}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="w-20 flex items-center justify-center shrink-0 px-5 py-4" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled
                              className="w-8.5 h-8.5 rounded-lg border flex items-center justify-center transition-all bg-ink-850/50 border-ink-800/40 text-ink-600 cursor-not-allowed opacity-30"
                              title="Usuario del sistema (inmutable)"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Personal de la Noche */}
                <div className="space-y-2.5">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-400">
                    Personal de la Noche (Staff)
                  </h3>
                  {staffUsers.length === 0 ? (
                    <div className="bg-ink-900 border border-dashed border-ink-800 rounded-xl p-10 text-center">
                      <UserPlus size={32} className="mx-auto text-ink-600 mb-3" />
                      <p className="text-[14px] text-ink-400 font-semibold">No hay usuarios creados</p>
                      <p className="text-[12px] text-ink-500 mt-1">Agregá personal de la noche para darles acceso al sistema</p>
                    </div>
                  ) : (
                    <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden divide-y divide-ink-850">
                      {staffUsers.map((u, idx) => {
                        const roleMeta = ROLE_META[u.role] || { label: u.role, color: "text-ink-300", bg: "bg-ink-800" };
                        const isSelected = editUser?.id === u.id;
                        const badgeClass = isBosko
                          ? (u.role === "admin" ? "text-accent bg-accent-soft border border-accent/20" : u.role === "caja" ? "text-amber bg-amber-soft" : "text-green bg-green-soft")
                          : `${roleMeta.bg} ${roleMeta.color}`;

                        return (
                          <div
                            key={u.id}
                            onClick={() => openEdit(u)}
                            className={`flex items-stretch justify-between transition-colors cursor-pointer hover:bg-ink-850/30 ${
                              idx % 2 === 0 ? "bg-ink-800/30" : ""
                            } ${
                              isSelected
                                ? isBosko
                                  ? "bg-accent-soft/20 border-l-2 border-l-accent"
                                  : "bg-blue/5 border-l-2 border-l-blue"
                                : "border-l-2 border-transparent"
                            }`}
                          >
                            <div className="flex-1 flex items-center gap-3.5 min-w-0 px-5 py-4 border-r border-ink-850">
                              <div className="w-10 h-10 rounded-xl bg-ink-800 border border-ink-700 flex items-center justify-center text-ink-450 text-[14px] font-bold uppercase shrink-0">
                                {u.username.slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-ink-50 truncate">{u.username}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded leading-none ${badgeClass}`}>
                                    {roleMeta.label}
                                  </span>
                                  <span className="text-[11px] text-ink-450">
                                    {new Date(u.createdAt).toLocaleDateString("es-AR")}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="w-20 flex items-center justify-center shrink-0 px-5 py-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirm(u)}
                                className="w-8.5 h-8.5 rounded-lg border flex items-center justify-center transition-all bg-ink-800 border-ink-700 text-ink-400 hover:text-danger hover:border-danger-line cursor-pointer"
                                title="Eliminar usuario"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
 
        {/* Inline Drawer / Side Panel for CRUD */}
        {modalOpen && editUser && (
          <div className="w-full lg:w-[480px] shrink-0 bg-ink-900 border border-ink-800 rounded-xl p-6 flex flex-col gap-5 animate-in slide-in-from-right duration-200">
            {(() => {
              const isEditSystemUser = !!(editUser.username && ["admin", "caja", "barra"].includes(editUser.username.toLowerCase()));
              return (
                <>
                  <div className="flex justify-between items-center pb-3 border-b border-ink-800">
                    <h2 className="text-[18px] font-bold text-ink-50 uppercase tracking-wider">
                      {isEditSystemUser ? "Ver Usuario" : editUser.id ? "Editar Usuario" : "Nuevo Usuario"}
                    </h2>
                    <button
                      type="button"
                      onClick={closeModal}
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
                        onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
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
                        onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
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
                              onClick={() => {
                                if (isEditSystemUser) return;
                                const allowed = PERMISSIONS_BY_ROLE[r] || [];
                                const newPermissions = { ...INITIAL_PERMISSIONS };
                                if (editUser.permissions) {
                                  allowed.forEach((p) => {
                                    if (editUser.permissions?.[p]) {
                                      newPermissions[p] = true;
                                    }
                                  });
                                }
                                setEditUser({ ...editUser, role: r, permissions: newPermissions });
                              }}
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
                                onChange={() => !isEditSystemUser && togglePermission(key)}
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
                          onClick={closeModal}
                          className="w-full h-10 rounded-xl bg-ink-850 border border-ink-750 text-xs font-bold uppercase tracking-[0.08em] text-ink-300 hover:text-ink-100 transition-all cursor-pointer active:scale-[0.97]"
                        >
                          Cerrar Vista
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={closeModal}
                          className="h-9 px-4 rounded-xl bg-ink-850 border border-ink-750 text-xs font-semibold text-ink-300 hover:text-ink-100 transition-all cursor-pointer active:scale-[0.97]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
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
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Saved feedback */}
      {saved && (
        <div className="fixed bottom-6 right-6 bg-green-soft border border-green-line text-green px-4 py-2.5 rounded-xl text-[12px] font-medium flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom-4 z-50">
          <Check size={16} />
          Cambios guardados
        </div>
      )}

      {/* Safe Delete Modal */}
      <SafeDeleteModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        title="Eliminar Usuario de Staff"
        expectedText={deleteConfirm?.username || ""}
        typeLabel="el usuario"
      />
    </div>
  );
}
