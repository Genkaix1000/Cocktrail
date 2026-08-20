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
  // role.username.expiresAt.sessionVersion.sig — la versión la aplica el API;
  // acá solo validamos firma + expiry (Edge no tiene el contador en memoria).
  if (parts.length !== 5) return null;

  const [role, username, expRaw, verRaw, sig] = parts;
  if (!ROLES.has(role)) return null;

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  if (!Number.isFinite(Number(verRaw))) return null;

  // Sin secreto no se valida nada: cae cerrado. Un fallback acá significaría
  // que un despliegue mal configurado acepta cookies firmadas con un secreto
  // público.
  const secret =
    process.env.COCKTRAIL_AUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) {
    console.error("[proxy] Falta AUTH_SECRET — se rechazan todas las sesiones.");
    return null;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const payload = `${role}.${username}.${expRaw}.${verRaw}`;
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );

  const expected = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Comparación en tiempo constante: `!==` corta en el primer byte distinto y
  // filtra por temporización cuánto del prefijo acertó quien pruebe firmas.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  return { role, username, expiresAt };
}

export default async function proxy(request: NextRequest) {
  try {
    // Demo estática: la “sesión” vive en localStorage; el Edge no la ve.
    if (process.env.NEXT_PUBLIC_DEMO_STATIC === "1") {
      return NextResponse.next();
    }

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
