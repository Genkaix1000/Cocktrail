import { snapshot } from "@/server/store";

// Nunca cachear: el dashboard y la KDS hacen bootstrap leyendo esto al cargar.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(snapshot());
}
