"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Shield, Trash2, UserPlus, X } from "lucide-react";
import {
  usersService,
  type SafeUser,
  type CreateUserInput,
  type UserPermissions,
} from "@/services/users.service";
import type { Role } from "@cocktrail/shared";
import { useTheme } from "@/components/ThemeProvider";
import SafeDeleteModal from "@/components/SafeDeleteModal";

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
        // Create
        const created = await usersService.create(editUser as CreateUserInput);
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
        return {
          ...prev,
          permissions: { ...currentPermissions, [key]: !currentPermissions[key] },
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
    <div className="space-y-6">
      {/* Title + actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-50">Usuarios</h1>
          <p className="text-[12px] text-ink-400 mt-1">
            Gestioná las cuentas de personal de tu boliche. {users.length} usuarios creados.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={`h-9 px-4 rounded-lg text-ink-950 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 hover:brightness-110 transition-all cursor-pointer ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
        >
          <UserPlus size={14} strokeWidth={2.5} />
          Agregar
        </button>
      </div>

      {/* Info about env users */}
      <div className="p-3 rounded-xl bg-ink-900/50 border border-ink-800">
        <p className="text-[10px] text-ink-500 leading-relaxed">
          <Shield size={12} className="inline mr-1 text-ink-400" />
          Los usuarios base (<span className="text-ink-300 font-mono">admin</span>,{" "}
          <span className="text-ink-300 font-mono">caja</span>,{" "}
          <span className="text-ink-300 font-mono">barra</span>) se configuran desde las variables de entorno del servidor.
          Aquí podés crear cuentas adicionales de staff con permisos personalizados.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Users list table */}
        <div className="flex-1 w-full space-y-4 min-w-0">
          {users.length === 0 ? (
            <div className="bg-ink-900 border border-dashed border-ink-800 rounded-xl p-10 text-center">
              <UserPlus size={32} className="mx-auto text-ink-600 mb-3" />
              <p className="text-[13px] text-ink-400 font-medium">No hay usuarios adicionales</p>
              <p className="text-[11px] text-ink-600 mt-1">Agregá personal de la noche para darles acceso al sistema</p>
            </div>
          ) : (
            <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden divide-y divide-ink-850">
              {users.map((u) => {
                const roleMeta = ROLE_META[u.role];
                const isSelected = editUser?.id === u.id;
                return (
                  <div
                    key={u.id}
                    onClick={() => openEdit(u)}
                    className={`flex items-center justify-between px-5 py-4 transition-colors cursor-pointer hover:bg-ink-850/50 ${
                      isSelected
                        ? isBosko
                          ? "bg-[#4ade80]/5 border-l-2 border-l-[#4ade80]"
                          : "bg-blue/5 border-l-2 border-l-blue"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-ink-800 border border-ink-700 flex items-center justify-center text-ink-400 text-[14px] font-bold uppercase shrink-0">
                        {u.username.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink-50 truncate">{u.username}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${roleMeta.bg} ${roleMeta.color}`}>
                            {roleMeta.label}
                          </span>
                          <span className="text-[10px] text-ink-600">
                            {new Date(u.createdAt).toLocaleDateString("es-AR")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Permissions pills */}
                      <div className="hidden sm:flex gap-1.5">
                        {(Object.entries(u.permissions) as [keyof UserPermissions, boolean][]).map(
                          ([key, val]) =>
                            val && (
                              <span
                                key={key}
                                className="text-[9px] px-2 py-0.5 rounded bg-ink-800 border border-ink-700 text-ink-400"
                              >
                                {PERMISSION_LABELS[key]}
                              </span>
                            ),
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(u)}
                        className="w-8 h-8 rounded-lg bg-ink-800 border border-ink-700 text-ink-400 flex items-center justify-center hover:text-danger hover:border-danger-line transition-all cursor-pointer"
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

        {/* Inline Drawer / Side Panel for CRUD */}
        {modalOpen && editUser && (
          <div className="w-full lg:w-[480px] shrink-0 bg-ink-900 border border-ink-800 rounded-xl p-5 flex flex-col gap-4 animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-ink-800">
              <h2 className="text-sm font-bold text-ink-50 uppercase tracking-wider">
                {editUser.id ? "Editar Usuario" : "Nuevo Usuario"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 bg-ink-850 hover:bg-ink-800 rounded-lg text-ink-400 hover:text-ink-200 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger-soft border border-danger-line text-danger text-[12px]">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Username */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">Usuario *</label>
                <input
                  type="text"
                  value={editUser.username || ""}
                  onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                  className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-blue transition-all"
                  placeholder="nombre_operador"
                />
              </div>

              {/* Password */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5 font-sans">
                  {editUser.id ? "Nueva Contraseña (dejar vacío para mantener)" : "Contraseña *"}
                </label>
                <input
                  type="password"
                  value={editUser.password || ""}
                  onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                  className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-blue transition-all"
                  placeholder={editUser.id ? "Opcional" : "Mínimo 4 caracteres"}
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5">Rol</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["admin", "caja", "barman"] as Role[]).map((r) => {
                    const meta = ROLE_META[r];
                    const isSelected = editUser.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
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
                          h-9 rounded-lg text-[12px] font-medium transition-all cursor-pointer
                          ${isSelected
                            ? `${meta.bg} ${meta.color} border border-current`
                            : "bg-ink-800 border border-ink-700 text-ink-400 hover:text-ink-200"
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
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-2">
                  Permisos para {ROLE_META[editUser.role || "barman"]?.label}
                </label>
                <div className="space-y-2">
                  {(PERMISSIONS_BY_ROLE[editUser.role || "barman"] || []).map((key: keyof UserPermissions) => {
                    const label = PERMISSION_LABELS[key];
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-ink-850/50 cursor-pointer hover:bg-ink-850 transition-colors select-none"
                      >
                        <input
                          type="checkbox"
                          checked={editUser.permissions?.[key] || false}
                          onChange={() => togglePermission(key)}
                          className="w-4 h-4 rounded border-ink-600 bg-ink-850 text-blue accent-blue cursor-pointer"
                        />
                        <span className="text-[12px] text-ink-200">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-ink-800 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="h-8.5 px-3 rounded-lg bg-ink-850 border border-ink-750 text-[11px] font-medium text-ink-300 hover:text-ink-100 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !editUser.username || (!editUser.id && !editUser.password)}
                className={`h-8.5 px-4 rounded-lg text-ink-950 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 transition-all disabled:opacity-50 cursor-pointer ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
              >
                {saving ? "Guardando..." : editUser.id ? "Guardar" : "Crear"}
              </button>
            </div>
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
