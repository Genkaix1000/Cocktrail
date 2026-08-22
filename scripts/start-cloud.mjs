#!/usr/bin/env node
/**
 * Arranca los dos procesos del contenedor y los trata como una sola unidad: si
 * uno muere, el otro no sirve de nada, así que se baja todo y el host reinicia.
 *
 * - API (Express): puerto interno, solo alcanzable desde el propio contenedor.
 * - Web (Next standalone): el puerto público que inyecta el host (PORT).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const API_PORT = process.env.API_PORT || "3001";
const PUBLIC_PORT = process.env.PORT || "10000";

/**
 * El server de Next queda en un lugar distinto según cómo se construyó: la
 * imagen Docker aplana el standalone en la raíz, mientras que un build sobre el
 * repo lo deja anidado.
 */
function resolveWebEntry() {
  const candidatos = [
    "apps/web/server.js", // imagen Docker
    "apps/web/.next/standalone/apps/web/server.js", // build sobre el repo
  ];
  const encontrado = candidatos.find((p) => existsSync(p));
  if (!encontrado) {
    console.error(`[start] No encontré el server de Next. Busqué en:\n  ${candidatos.join("\n  ")}`);
    process.exit(1);
  }
  return encontrado;
}

let shuttingDown = false;
const children = [];

function start(name, script, env) {
  const child = spawn("node", [script], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = (stream) => (chunk) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) stream.write(`[${name}] ${line}\n`);
    }
  };
  child.stdout.on("data", prefix(process.stdout));
  child.stderr.on("data", prefix(process.stderr));

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[start] ${name} terminó (code=${code} signal=${signal}) — bajando todo.`);
    shutdown(code === 0 ? 1 : (code ?? 1));
  });

  children.push({ name, child });
  return child;
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
  // Margen para un cierre ordenado antes de forzar la salida.
  setTimeout(() => process.exit(exitCode), 5000).unref();
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`[start] ${signal} recibido — cerrando.`);
    shutdown(0);
  });
}

const webEntry = resolveWebEntry();
console.log(`[start] API en :${API_PORT} (interna) · web en :${PUBLIC_PORT} (pública) desde ${webEntry}`);

start("api", "apps/api/dist/server.js", { PORT: API_PORT });
start("web", webEntry, {
  PORT: PUBLIC_PORT,
  HOSTNAME: "0.0.0.0",
  API_PROXY_TARGET: process.env.API_PROXY_TARGET || `http://127.0.0.1:${API_PORT}`,
});
