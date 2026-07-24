#!/usr/bin/env node
/**
 * Genera certs locales (mkcert) para servir la web por HTTPS en la LAN.
 * WebUSB en Chrome Android exige origen seguro.
 *
 * Uso: node apps/web/scripts/ensure-lan-https.mjs
 * Requiere: brew install mkcert && mkcert -install
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.join(__dirname, "..", "certs");
const keyPath = path.join(certsDir, "key.pem");
const certPath = path.join(certsDir, "cert.pem");

function getLanIp() {
  const interfaces = networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(interfaces)) {
    if (/^(docker|br-|veth)/.test(name)) continue;
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) candidates.push(iface.address);
    }
  }
  return (
    candidates.find((ip) => ip.startsWith("192.168.")) ??
    candidates.find((ip) => ip.startsWith("10.")) ??
    candidates[0] ??
    null
  );
}

function hasMkcert() {
  try {
    execSync("mkcert -help", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (existsSync(keyPath) && existsSync(certPath)) {
  console.log(`   HTTPS certs OK: ${certsDir}`);
  process.exit(0);
}

if (!hasMkcert()) {
  console.error(`
   Falta mkcert para HTTPS en LAN (necesario para WebUSB / impresora en tablet).

   macOS:
     brew install mkcert nss
     mkcert -install

   Después volvé a correr: pnpm --filter cocktrail-app dev:https
`);
  process.exit(1);
}

const lanIp = getLanIp();
mkdirSync(certsDir, { recursive: true });

const hosts = ["localhost", "127.0.0.1"];
if (lanIp) hosts.push(lanIp);

console.log(`   Generando certs HTTPS para: ${hosts.join(", ")}`);
execFileSync("mkcert", ["-key-file", keyPath, "-cert-file", certPath, ...hosts], {
  stdio: "inherit",
});
console.log(`
   Listo. En la tablet Android (Chrome):
   1. Abrí https://${lanIp ?? "IP"}:3000/caja
   2. Si Chrome avisa del cert: en la Mac corré \`mkcert -CAROOT\` y
      instalá el rootCA.pem en la tablet (Ajustes → Seguridad → Instalar certificado),
      o aceptá el aviso una vez para probar.
   3. Agregá la URL a la pantalla de inicio — no hace falta tipear https cada vez.
`);
