import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "@/server/auth";
import { getActiveOrders } from "@/server/store";
import BarraClient from "./BarraClient";

// Sin cache: cada visita rerendea con el snapshot fresco del store.
// El cliente subscribe a SSE para mantenerse sincronizado.
export const dynamic = "force-dynamic";

export default async function BarraPage() {
  const c = await cookies();
  const session = verifySession(c.get(COOKIE_NAME)?.value);

  // Defensa en profundidad: el proxy ya garantizó esto, pero si por
  // alguna razón llegamos sin sesión, mandamos a login.
  if (!session) redirect("/login");

  return (
    <BarraClient initialOrders={getActiveOrders()} role={session.role} />
  );
}
