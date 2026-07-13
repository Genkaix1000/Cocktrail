"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Shield, UserPlus, Users } from "lucide-react";
import {
  usersService,
  type SafeUser,
  type CreateUserInput,
} from "@/services/users.service";
import type { Role } from "@cocktrail/shared";
import { useTheme } from "@/components/ThemeProvider";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";
import UsersTable from "./UsersTable";
import UserFormDrawer from "./UserFormDrawer";

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
      role: "caja",
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
          role: (editUser.role ?? "caja") as Role,
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

  const handleRoleChange = useCallback((r: Role) => {
    setEditUser((prev) => (prev ? { ...prev, role: r } : null));
  }, []);

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
          <span className="text-accent font-mono font-semibold">caja</span>) se configuran desde las variables de entorno del servidor.
          Aquí podés crear cuentas adicionales de staff con rol admin o caja.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <UsersTable
          users={users}
          selectedUserId={editUser?.id}
          isBosko={isBosko}
          onSelectUser={openEdit}
          onDeleteClick={setDeleteConfirm}
        />

        {modalOpen && editUser && (
          <UserFormDrawer
            editUser={editUser}
            error={error}
            saving={saving}
            isBosko={isBosko}
            onUsernameChange={(username) => setEditUser({ ...editUser, username })}
            onPasswordChange={(password) => setEditUser({ ...editUser, password })}
            onRoleChange={handleRoleChange}
            onCancel={closeModal}
            onSave={handleSave}
          />
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
      {deleteConfirm && (
        <SafeDeleteModal
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm.id)}
          title="Eliminar Usuario de Staff"
          expectedText={deleteConfirm.username}
          typeLabel="el usuario"
        />
      )}
    </div>
  );
}
