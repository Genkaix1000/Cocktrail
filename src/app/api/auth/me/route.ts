import { cookies } from "next/headers";
import { COOKIE_NAME, verifySession } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const session = verifySession(store.get(COOKIE_NAME)?.value);
  if (!session) return Response.json(null);
  return Response.json({ role: session.role });
}
