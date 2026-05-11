import { buildClearCookie } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", buildClearCookie());
  return res;
}
