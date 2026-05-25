import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "@/server/auth";
import {
  getCurrentEvent,
  listCashSales,
  listOrders,
  listDrinks,
} from "@/server/store";
import AdminClient from "./AdminClient";
import CajaClient from "./CajaClient";

// Sin cache: snapshot fresco en cada visita; el client se mantiene
// sincronizado vía SSE.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const c = await cookies();
  const session = verifySession(c.get(COOKIE_NAME)?.value);

  // Defensa en profundidad: el proxy ya garantizó admin/caja, pero si por
  // alguna razón llegamos sin sesión o con rol incorrecto, redirect.
  if (!session) redirect("/login");
  if (session.role === "barman") redirect("/barra");

  if (session.role === "caja") {
    return <CajaClient drinks={listDrinks()} />;
  }

  return (
    <AdminClient
      initialEvent={getCurrentEvent()}
      initialOrders={listOrders()}
      initialCashSales={listCashSales()}
    />
  );
}
