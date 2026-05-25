import { type NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/server/auth";

// APIs que sólo el admin puede invocar.
const ADMIN_POST = new Set(["/api/event/close", "/api/cash-sales"]);

const ORDER_PATCH_PATTERN = /^\/api\/orders\/[^/]+$/;

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(): Response {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySession(request.cookies.get(COOKIE_NAME)?.value);

  // Páginas: /admin (y subrutas) → admin; /barra → cualquier logueado
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (session.role !== "admin") {
      return NextResponse.redirect(new URL("/barra", request.url));
    }
    return NextResponse.next();
  }
  if (pathname === "/barra" || pathname.startsWith("/barra/")) {
    if (!session) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Si ya estás logueado, /login te redirige a tu home.
  if (pathname === "/login" && session) {
    const home = session.role === "barman" ? "/barra" : "/admin";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // APIs protegidas.
  if (request.method === "POST" && ADMIN_POST.has(pathname)) {
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();
    return NextResponse.next();
  }
  if (request.method === "PATCH" && ORDER_PATCH_PATTERN.test(pathname)) {
    if (!session) return unauthorized();
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // Corre el proxy para todo excepto estáticos, datos RSC y probes del browser.
  // La lógica de arriba decide qué proteger.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|.well-known).*)",
  ],
};
