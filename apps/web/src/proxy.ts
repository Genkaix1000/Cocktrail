import { type NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/caja",
    "/caja/:path*",
    "/login",
  ],
};

const COOKIE_NAME = "cocktrail_session";
const ROLES = new Set(["admin", "caja"]);

/**
 * Valida la cookie firmada LOCALMENTE en el Edge runtime de Next.js
 * usando Web Crypto APIs (HMAC-SHA256). Evita flicker y no requiere
 * fetch al backend durante la fase de transición.
 *
 * Fase futura: este proxy mutará para consultar
 * NEXT_PUBLIC_API_URL + '/api/auth/me'.
 */
async function verifySessionEdge(
  raw: string | undefined,
): Promise<{ role: string; username: string; expiresAt: number } | null> {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;

  const [role, username, expRaw, sig] = parts;
  if (!ROLES.has(role)) return null;

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

  const secret =
    process.env.COCKTRAIL_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "dev-secret-change-me-in-production-longer-than-32-chars";

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const payload = `${role}.${username}.${expRaw}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  const expected = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (sig.length !== expected.length) return null;
  if (sig !== expected) return null;

  return { role, username, expiresAt };
}

export default async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    const session = await verifySessionEdge(
      request.cookies.get(COOKIE_NAME)?.value,
    );

    // /admin → requiere admin
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      if (!session) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      if (session.role !== "admin") {
        const home = session.role === "caja" ? "/caja" : "/login";
        return NextResponse.redirect(new URL(home, request.url));
      }
      return NextResponse.next();
    }

    // /caja → requiere caja
    if (pathname === "/caja" || pathname.startsWith("/caja/")) {
      if (!session) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      if (session.role !== "caja") {
        const home = session.role === "admin" ? "/admin" : "/login";
        return NextResponse.redirect(new URL(home, request.url));
      }
      return NextResponse.next();
    }

    // /login → si ya estás logueado, redirigir a tu home
    if (pathname === "/login" && session) {
      const home = session.role === "admin" ? "/admin" : "/caja";
      return NextResponse.redirect(new URL(home, request.url));
    }

    return NextResponse.next();
  } catch (err) {
    // Next.js en dev intenta mutar err.message (deobfuscate). DOMException y
    // algunos errores de Web Crypto tienen message solo-getter → TypeError y
    // a veces 404 engañoso. Re-lanzamos un Error plano con el mensaje original.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[proxy] unexpected error:", message);
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
