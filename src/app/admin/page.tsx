import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "@/server/auth";
import {
  getCurrentEvent,
  listCashSales,
  listOrders,
} from "@/server/store";
import AdminClient from "./AdminClient";

// Sin cache: snapshot fresco en cada visita; el client se mantiene
// sincronizado vía SSE.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const c = await cookies();
  const session = verifySession(c.get(COOKIE_NAME)?.value);

  // Defensa en profundidad: el proxy ya garantizó admin, pero si por
  // alguna razón llegamos sin sesión o con rol incorrecto, redirect.
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/barra");

  return (
    <AdminClient
      initialEvent={getCurrentEvent()}
      initialOrders={listOrders()}
      initialCashSales={listCashSales()}
    />
  );
}
