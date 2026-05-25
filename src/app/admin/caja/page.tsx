import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "@/server/auth";
import { listDrinks } from "@/server/store";
import CajaClient from "./CajaClient";

export const dynamic = "force-dynamic";

export default async function CajaPage() {
  const c = await cookies();
  const session = verifySession(c.get(COOKIE_NAME)?.value);

  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/barra");

  return <CajaClient drinks={listDrinks()} />;
}
