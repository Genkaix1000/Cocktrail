import { NextResponse } from "next/server";

/**
 * POST body = texto plano del reporte de impresora.
 * Solo para debug local: imprime en la terminal de Next (no en el browser).
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const text = (await req.text()).trim();
  console.log("\n========== miBoliche impresora debug (PWA) ==========");
  console.log(text || "(vacío)");
  console.log("====================================================\n");

  return NextResponse.json({ ok: true });
}
