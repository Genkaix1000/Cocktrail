import type { Metadata } from "next";

// El title del layout raíz es "Bosko — Caja" (la tablet de caja es el uso
// principal). Las rutas de /admin son client components y no pueden exportar
// `metadata`, así que el override vive acá, en este layout de servidor.
export const metadata: Metadata = {
  title: "Bosko — Admin",
  description: "Panel de administración: monitoreo, historial de noches y configuración",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
