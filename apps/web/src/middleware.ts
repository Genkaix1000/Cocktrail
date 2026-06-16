import { type NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/caja",
    "/caja/:path*",
    "/barra",
    "/barra/:path*",
    "/login",
  ],
};

const COOKIE_NAME = "cocktrail_session";
const ROLES = new Set(["admin", "caja", "barman"]);

/**
 * Valida la cookie firmada LOCALMENTE en el Edge runtime de Next.js
 * usando Web Crypto APIs (HMAC-SHA256). Evita flicker y no requiere
 * fetch al backend durante la fase de transición.
 *
 * Fase futura: este middleware mutará para consultar
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

  // Validar HMAC con Web Crypto API (compatible con Edge runtime)
  const secret =
    process.env.COCKTRAIL_AUTH_SECRET ??
    process.env.AUTH_SECRET ??
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

  // Constant-length comparison (no timing safe en Edge, pero sí length check)
  if (sig.length !== expected.length) return null;
  if (sig !== expected) return null;

  return { role, username, expiresAt };
}

export default async function middleware(request: NextRequest) {
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

  // /barra → requiere barman o admin
  if (pathname === "/barra" || pathname.startsWith("/barra/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (session.role !== "barman" && session.role !== "admin") {
      const home = session.role === "caja" ? "/caja" : "/login";
      return NextResponse.redirect(new URL(home, request.url));
    }
    return NextResponse.next();
  }

  // /login → si ya estás logueado, redirigir a tu home
  if (pathname === "/login" && session) {
    const home = session.role === "admin" ? "/admin" : session.role === "caja" ? "/caja" : "/barra";
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}
