#!/usr/bin/env node
// generate-keys.mjs — genera JWT_SECRET/ANON_KEY/SERVICE_ROLE_KEY para el gateway
// Kong local y renderiza supabase/docker/kong.yml desde kong.yml.template. Kong
// DB-less no interpola env vars en `key-auth`, así que el render se hace ACÁ, en
// el host, antes de levantar el stack — no dentro del container. Sin dependencias
// nuevas (solo node:crypto/node:fs/node:child_process). Ver docs/DEPLOY.md y
// docs/specs/deuda-pre-fase-6/hardening-kong-demo-keys.md.
//
// Uso:
//   node supabase/generate-keys.mjs --demo      # keys demo públicas de siempre (dev local, default de onboarding)
//   node supabase/generate-keys.mjs             # genera keys nuevas y únicas (falla si ya hay unas no-demo)
//   node supabase/generate-keys.mjs --rotate    # regenera keys nuevas aunque ya existan unas no-demo
//   node supabase/generate-keys.mjs --demo --if-missing   # no-op si kong.yml ya existe (usado por postinstall)

import { randomBytes, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = __dirname;
const ENV_PATH = path.join(SUPABASE_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(SUPABASE_DIR, ".env.example");
const TEMPLATE_PATH = path.join(SUPABASE_DIR, "docker", "kong.yml.template");
const KONG_YML_PATH = path.join(SUPABASE_DIR, "docker", "kong.yml");

const DEMO_JWT_SECRET = "your-super-secret-jwt-token-with-at-least-32-characters-long";
const DEMO_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.zQomPPgIVgwVRMh3NJhhAl2cJ-GKQgNXpMTbIKxKyoo";
const DEMO_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.4HviqYnTKiRK-RJvWzgAAuaFiq8--foTrXQpl7HYMU4";

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwtHS256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(`${encHeader}.${encPayload}`).digest();
  return `${encHeader}.${encPayload}.${base64url(signature)}`;
}

function generateRealKeys() {
  const jwtSecret = randomBytes(32).toString("hex");
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24 * 365 * 10; // 10 años: self-hosted local, sin rotación automática
  const anonKey = signJwtHS256({ role: "anon", iss: "cocktrail", iat, exp }, jwtSecret);
  const serviceRoleKey = signJwtHS256({ role: "service_role", iss: "cocktrail", iat, exp }, jwtSecret);
  return { jwtSecret, anonKey, serviceRoleKey };
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8");
}

function getEnvVar(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
}

function setEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=.*$`, "m").test(content)) {
    return content.replace(new RegExp(`^${key}=.*$`, "m"), line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const isDemo = args.includes("--demo");
  const isRotate = args.includes("--rotate") || args.includes("--force");
  const ifMissing = args.includes("--if-missing");

  if (ifMissing && existsSync(KONG_YML_PATH)) {
    // postinstall: no pisar un kong.yml ya generado (demo o real) en cada `pnpm install`.
    process.exit(0);
  }

  let envContent = readEnvFile(ENV_PATH);
  const isFirstRun = envContent === null;

  if (isFirstRun) {
    copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
    envContent = readEnvFile(ENV_PATH);
  } else if (!isDemo && !isRotate) {
    const currentSecret = getEnvVar(envContent, "JWT_SECRET");
    if (currentSecret && currentSecret !== DEMO_JWT_SECRET) {
      console.error(
        "[generate-keys] supabase/.env ya tiene credenciales propias (no-demo). " +
          "Para reemplazarlas corré este script con --rotate. Abortando sin tocar nada.",
      );
      process.exit(1);
    }
  }

  const { jwtSecret, anonKey, serviceRoleKey } = isDemo
    ? { jwtSecret: DEMO_JWT_SECRET, anonKey: DEMO_ANON_KEY, serviceRoleKey: DEMO_SERVICE_ROLE_KEY }
    : generateRealKeys();

  envContent = setEnvVar(envContent, "JWT_SECRET", jwtSecret);
  envContent = setEnvVar(envContent, "ANON_KEY", anonKey);
  envContent = setEnvVar(envContent, "SERVICE_ROLE_KEY", serviceRoleKey);
  writeFileSync(ENV_PATH, envContent);

  const template = readFileSync(TEMPLATE_PATH, "utf8");
  try {
    const rendered = execFileSync("envsubst", {
      input: template,
      env: { ...process.env, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey },
    });
    writeFileSync(KONG_YML_PATH, rendered);
  } catch (err) {
    console.error(
      "[generate-keys] No se pudo renderizar kong.yml con `envsubst` — ¿está instalado en este " +
        "host? (paquete `gettext` en la mayoría de distros Linux). No se sobrescribió kong.yml.",
    );
    console.error(err.message);
    process.exit(1);
  }

  console.log(`[generate-keys] supabase/.env y supabase/docker/kong.yml generados (modo: ${isDemo ? "demo" : "real"}).`);
  if (!isDemo) {
    console.log(
      "[generate-keys] IMPORTANTE: copiá SERVICE_ROLE_KEY a apps/api/.env como " +
        "SUPABASE_SERVICE_ROLE_KEY y reiniciá el backend — si no, va a seguir usando la key vieja.",
    );
  }
}

main();
