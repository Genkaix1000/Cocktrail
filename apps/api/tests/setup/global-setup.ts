import { config } from "dotenv";
import { resolve } from "node:path";

export default async function globalSetup() {
  if (!process.env.INTEGRATION) return;

  config({ path: resolve(import.meta.dirname, "../../.env.test") });
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

  // Los helpers borran noches, pedidos y tickets sin acotar a un rango de test.
  // Corriendo esto contra la base de la nube se pierde la operación real — ya
  // pasó dos veces contra la base compartida de desarrollo.
  const esRemota = /supabase\.co|pooler\.supabase\.com/.test(url);
  if (esRemota) {
    throw new Error(
      `Los tests de integración apuntan a una base REMOTA (${url}).\n` +
        "Estos tests borran datos sin acotar: contra la nube destruyen la operación real.\n" +
        "Corrigelo apuntando SUPABASE_URL a la instancia local (apps/api/.env.test).",
    );
  }

  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "" },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`status ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `No se pudo conectar a Supabase local en ${url}. ` +
        `Levantá el stack con "docker compose up -d" desde la raíz del repo antes de correr los tests de integración.\n` +
        `Detalle: ${(err as Error).message}`,
    );
  }
}
