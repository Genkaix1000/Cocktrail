#!/usr/bin/env node
/**
 * Next deja el standalone sin los assets estáticos ni public/: los copia a mano
 * quien empaqueta. Sin esto, la app levanta pero sin CSS ni imágenes.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PARES = [
  ["apps/web/.next/static", "apps/web/.next/standalone/apps/web/.next/static"],
  ["apps/web/public", "apps/web/.next/standalone/apps/web/public"],
];

for (const [origen, destino] of PARES) {
  if (!existsSync(origen)) {
    console.error(`[standalone] No existe ${origen} — ¿corriste el build de la web?`);
    process.exit(1);
  }
  mkdirSync(dirname(destino), { recursive: true });
  cpSync(origen, destino, { recursive: true });
  console.log(`[standalone] ${origen} → ${destino}`);
}
