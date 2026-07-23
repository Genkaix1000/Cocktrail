#!/usr/bin/env node
// Wrapper de `next dev` para Mac:
// 1) saca vars Malloc* (Node/macOS las pelean al spawnear workers → spam en stderr)
// 2) filtra la línea inofensiva MallocStackLogging
// 3) limita presión de CPU/RAM en laptops chicas (p. ej. M1 8GB)
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

for (const key of Object.keys(process.env)) {
  if (/^Malloc/i.test(key)) delete process.env[key];
}

// 2 workers = compilación más rápida. En Macs con 8GB + Docker bajá a 1.
if (!process.env.NEXT_CPU_COUNT) {
  process.env.NEXT_CPU_COUNT = "2";
}
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = "--max-old-space-size=3072";
}

const nextBin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

// Turbopack (default Next 16). Para forzar webpack: COCKTRAIL_WEBPACK=1
const useWebpack = process.env.COCKTRAIL_WEBPACK === "1";
const nextArgs = ["dev", "--hostname", "0.0.0.0"];
if (useWebpack) nextArgs.push("--webpack");
nextArgs.push(...process.argv.slice(2));

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  stdio: ["inherit", "inherit", "pipe"],
  env: process.env,
});

const rl = createInterface({ input: child.stderr });
rl.on("line", (line) => {
  if (line.includes("MallocStackLogging")) return;
  process.stderr.write(`${line}\n`);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
