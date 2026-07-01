import { config } from "dotenv";
import { resolve } from "node:path";

export default async function globalSetup() {
  if (!process.env.INTEGRATION) return;

  config({ path: resolve(import.meta.dirname, "../../.env.test") });
  const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

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
