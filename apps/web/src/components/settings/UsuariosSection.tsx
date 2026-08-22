"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Loader2, Plus, Search, Shield } from "lucide-react";
import {
  usersService,
  type SafeUser,
  type CreateUserInput,
} from "@/services/users.service";
import { ApiError } from "@/services/api-client";
import type { Role } from "@cocktrail/shared";
import Toast from "@/components/shared/Toast";
import { SectionHelpButton } from "@/components/help/SectionHelpButton";
import UsersTable, { type StaffColumnFilters } from "./UsersTable";
import UserFormDrawer from "./UserFormDrawer";
import {
  type StaffColId,
  STAFF_COLS_DEFAULT,
  STAFF_COLS_REQUIRED,
  isSystemUser,
  loadStaffCols,
  saveStaffCols,
} from "./staffCrud";

const DELETE_UNDO_MS = 5000;

function formatUsersApiError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : "Error al guardar usuario";
  }
  const details = (err.data as { details?: Record<string, string[] | undefined> } | undefined)
    ?.details;
  if (details) {
    const first = Object.values(details).flat().find(Boolean);
    if (first) return first;
  }
  return err.message || "Error al guardar usuario";
}

const EMPTY_COL_FILTERS: StaffColumnFilters = {
  user: "",
  role: "all",
  type: "all",
};

type ViewFilter = "all" | "system" | "staff";

export default function UsuariosSection() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<StaffColumnFilters>(EMPTY_COL_FILTERS);
  const [visibleCols, setVisibleCols] = useState<StaffColId[]>(STAFF_COLS_DEFAULT);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<(Partial<CreateUserInput> & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [undoDelete, setUndoDelete] = useState<SafeUser | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  const pendingDeleteRef = useRef<{ user: SafeUser; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  useEffect(() => {
    setVisibleCols(loadStaffCols());
  }, []);

  const commitDelete = useCallback(async (user: SafeUser) => {
    try {
      await usersService.delete(user.id);
    } catch (err) {
      console.error("Error deleting user:", err);
      setUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));
      setError("No se pudo eliminar el usuario. Reintentá en unos segundos.");
    }
  }, []);

  const flushPendingDelete = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    void commitDelete(pending.user);
  }, [commitDelete]);

  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      void usersService.delete(pending.user.id).catch(() => {});
      pendingDeleteRef.current = null;
    };
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await usersService.list();
      setUsers(data);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("No se pudo cargar el staff. Reintentá en unos segundos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
  }, [loadUsers]);

  const setFiltersOpenSafe = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setFiltersOpen((prev) => {
      const next = typeof open === "function" ? open(prev) : open;
      if (!next) setColumnFilters(EMPTY_COL_FILTERS);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let list = [...users];

    if (viewFilter === "system") list = list.filter((u) => isSystemUser(u.username));
    if (viewFilter === "staff") list = list.filter((u) => !isSystemUser(u.username));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => u.username.toLowerCase().includes(q));
    }

    if (filtersOpen) {
      const cf = columnFilters;
      if (cf.user.trim()) {
        const q = cf.user.toLowerCase();
        list = list.filter((u) => u.username.toLowerCase().includes(q));
      }
      if (cf.role !== "all") list = list.filter((u) => u.role === cf.role);
      if (cf.type === "system") list = list.filter((u) => isSystemUser(u.username));
      if (cf.type === "staff") list = list.filter((u) => !isSystemUser(u.username));
    }

    list.sort((a, b) => a.username.localeCompare(b.username, "es"));
    return list;
  }, [users, search, viewFilter, filtersOpen, columnFilters]);

  const toggleCol = useCallback((col: StaffColId) => {
    if (STAFF_COLS_REQUIRED.includes(col)) return;
    setVisibleCols((prev) => {
      const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
      const order: StaffColId[] = ["user", "role", "type", "created", "actions"];
      const ordered = order.filter((c) => next.includes(c) || STAFF_COLS_REQUIRED.includes(c));
      saveStaffCols(ordered);
      return ordered;
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditUser({ username: "", password: "", role: "caja" });
    setFormError("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((u: SafeUser) => {
    setEditUser({
      id: u.id,
      username: u.username,
      password: "",
      role: u.role,
    });
    setFormError("");
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditUser(null);
    setFormError("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!editUser || saving) return;
    if (!editUser.username?.trim()) {
      setFormError("El usuario es requerido");
      return;
    }
    if (!editUser.id && !editUser.password) {
      setFormError("La contraseña es requerida para nuevos usuarios");
      return;
    }
    if (editUser.password && editUser.password.trim().length > 0 && editUser.password.trim().length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (editUser.id) {
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
    } catch (err) {
      setFormError(formatUsersApiError(err));
    } finally {
      setSaving(false);
    }
  }, [editUser, saving, closeModal]);

  const handleConfirmDelete = useCallback(
    (user: SafeUser) => {
      if (isSystemUser(user.username)) return;
      setConfirmingDeleteId(null);
      flushPendingDelete();
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (editUser?.id === user.id) {
        setModalOpen(false);
        setEditUser(null);
      }
      const timer = setTimeout(() => {
        pendingDeleteRef.current = null;
        setUndoDelete((current) => (current?.id === user.id ? null : current));
        void commitDelete(user);
      }, DELETE_UNDO_MS);
      pendingDeleteRef.current = { user, timer };
      setUndoDelete(user);
      setError(null);
    },
    [flushPendingDelete, commitDelete, editUser?.id],
  );

  const handleUndoDelete = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setUsers((prev) => (prev.some((u) => u.id === pending.user.id) ? prev : [...prev, pending.user]));
    setUndoDelete(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  const views: { id: ViewFilter; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "system", label: "Sistema" },
    { id: "staff", label: "Staff" },
  ];

  return (
    <div className="flex flex-col gap-8 w-full min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
            Staff
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
            Gestioná las cuentas de personal. {filtered.length}{" "}
            {filtered.length === 1 ? "usuario" : "usuarios"}
            {filtered.length !== users.length
              ? filtered.length === 1
                ? " visible"
                : " visibles"
              : ""}
            .
          </p>
        </div>
        <SectionHelpButton category="staff" />
      </div>

      <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 shadow-card">
        <Shield size={15} className="text-[var(--accent-text)] shrink-0 mt-0.5" />
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
          Las cuentas base (<span className="font-mono font-semibold text-[var(--accent-text)]">admin</span>,{" "}
          <span className="font-mono font-semibold text-[var(--accent-text)]">caja</span>) vienen del
          servidor y no se pueden borrar. Acá creás staff adicional con rol admin o caja.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div data-tour="staff-table" className="flex-1 w-full space-y-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              {views.map((v) => {
                const active = viewFilter === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewFilter(v.id)}
                    className={`h-10 px-4 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)] border border-transparent"
                        : "bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
              <button
                type="button"
                title="Filtros de columna"
                aria-label="Filtros de columna"
                aria-pressed={filtersOpen}
                onClick={() => setFiltersOpenSafe((o) => !o)}
                className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                  filtersOpen
                    ? "bg-[var(--accent-surface)] border-transparent text-[var(--accent-text)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
                }`}
              >
                <Filter size={15} />
              </button>
            </div>

            <div className="flex-1 min-w-[180px] flex items-center h-10 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden focus-within:border-[var(--accent-primary)]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por usuario…"
                className="flex-1 h-full pl-4 pr-2 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
              />
              <span className="w-10 h-10 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                <Search size={15} />
              </span>
            </div>

            <button
              type="button"
              data-tour="nuevo-usuario"
              onClick={openCreate}
              className="h-10 px-4 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.98]"
            >
              <Plus size={14} strokeWidth={2.5} />
              Nuevo usuario
            </button>
          </div>

          <UsersTable
            users={filtered}
            hasActiveSearch={Boolean(search.trim())}
            selectedUserId={editUser?.id}
            confirmingDeleteId={confirmingDeleteId}
            visibleCols={visibleCols}
            filtersOpen={filtersOpen}
            columnFilters={columnFilters}
            onSelectUser={openEdit}
            onAskDelete={(u) => setConfirmingDeleteId(u.id)}
            onCancelDelete={() => setConfirmingDeleteId(null)}
            onConfirmDelete={handleConfirmDelete}
            onToggleCol={toggleCol}
            onColumnFiltersChange={(patch) => setColumnFilters((prev) => ({ ...prev, ...patch }))}
          />
        </div>

        {modalOpen && editUser && (
          <UserFormDrawer
            editUser={editUser}
            error={formError}
            saving={saving}
            onUsernameChange={(username) => setEditUser({ ...editUser, username })}
            onPasswordChange={(password) => setEditUser({ ...editUser, password })}
            onRoleChange={(role) => setEditUser({ ...editUser, role })}
            onCancel={closeModal}
            onSave={handleSave}
          />
        )}
      </div>

      {undoDelete ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message={`Eliminado: ${undoDelete.username}`}
            duration={DELETE_UNDO_MS}
            action={{ label: "Deshacer", onClick: handleUndoDelete }}
            onClose={() => setUndoDelete(null)}
          />
        </div>
      ) : saved ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="success" message="Cambios guardados" duration={2500} onClose={() => setSaved(false)} />
        </div>
      ) : error ? (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="error" message={error} onClose={() => setError(null)} />
        </div>
      ) : null}
    </div>
  );
}
