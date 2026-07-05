import type { Role } from "@cocktrail/shared";
import type { UserPermissions } from "@/services/users.service";

export const ROLE_META: Record<Role, { label: string; color: string; bg: string }> = {
  admin: { label: "Administrador", color: "text-blue", bg: "bg-blue-soft" },
  caja: { label: "Cajero", color: "text-amber", bg: "bg-amber-soft" },
  barman: { label: "Barman", color: "text-green", bg: "bg-green-soft" },
};

export const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
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

export const PERMISSIONS_BY_ROLE: Record<Role, (keyof UserPermissions)[]> = {
  admin: ["monitoreo", "metricas", "historial", "carta", "pagos", "staff", "closeNight"],
  caja: ["metricas", "historial", "closeNight", "cancelarTickets"],
  barman: ["cancelarTickets"],
};

export const INITIAL_PERMISSIONS: UserPermissions = {
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
