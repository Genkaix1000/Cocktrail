"use client";

import { Trash2, UserPlus } from "lucide-react";
import type { SafeUser } from "@/services/users.service";
import { ROLE_META } from "./usuariosConstants";

const SYSTEM_USERNAMES = ["admin", "caja", "barra"];

type Props = {
  users: SafeUser[];
  selectedUserId?: string;
  isBosko: boolean;
  onSelectUser: (user: SafeUser) => void;
  onDeleteClick: (user: SafeUser) => void;
};

export default function UsersTable({ users, selectedUserId, isBosko, onSelectUser, onDeleteClick }: Props) {
  const systemUsers = users.filter((u) => SYSTEM_USERNAMES.includes(u.username.toLowerCase()));
  const staffUsers = users.filter((u) => !SYSTEM_USERNAMES.includes(u.username.toLowerCase()));

  return (
    <div className="flex-1 w-full space-y-6 min-w-0">
      {/* Cuentas del Sistema */}
      <div className="space-y-2.5">
        <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-400">
          Cuentas del Sistema (Inmutables)
        </h3>
        <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden divide-y divide-ink-850">
          {systemUsers.map((u, idx) => {
            const roleMeta = ROLE_META[u.role] || { label: u.role, color: "text-ink-300", bg: "bg-ink-800" };
            const isSelected = selectedUserId === u.id;
            const badgeClass = isBosko
              ? (u.role === "admin" ? "text-accent bg-accent-soft border border-accent/20" : u.role === "caja" ? "text-amber bg-amber-soft" : "text-green bg-green-soft")
              : `${roleMeta.bg} ${roleMeta.color}`;

            return (
              <div
                key={u.id}
                onClick={() => onSelectUser(u)}
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
              const isSelected = selectedUserId === u.id;
              const badgeClass = isBosko
                ? (u.role === "admin" ? "text-accent bg-accent-soft border border-accent/20" : u.role === "caja" ? "text-amber bg-amber-soft" : "text-green bg-green-soft")
                : `${roleMeta.bg} ${roleMeta.color}`;

              return (
                <div
                  key={u.id}
                  onClick={() => onSelectUser(u)}
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
                      onClick={() => onDeleteClick(u)}
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
    </div>
  );
}
