#!/usr/bin/env node
// Next dev (con --hostname 0.0.0.0) banner "Local: localhost:3000" / "Network: 0.0.0.0:3000":
// ninguna de las dos sirve para entrar desde otro dispositivo de la LAN (tablet de
// caja/barra) — localhost solo resuelve en esta máquina y 0.0.0.0 no es una URL real.
// Este script imprime la IP LAN real antes de que arranque Next, mismo criterio que
// ya usa apps/api/src/server.ts (getLanIp).
import { networkInterfaces } from "node:os";

function getLanIp() {
  const interfaces = networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    if (/^(docker|br-|veth)/.test(name)) continue;
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        candidates.push(iface.address);
      }
    }
  }

  return (
    candidates.find((ip) => ip.startsWith("192.168.")) ??
    candidates.find((ip) => ip.startsWith("10.")) ??
    candidates[0] ??
    null
  );
}

const https = process.argv.includes("--https");
const scheme = https ? "https" : "http";
const lanIp = getLanIp();
if (lanIp) {
  console.log(`   LAN (para tablets/otros dispositivos): ${scheme}://${lanIp}:3000`);
  if (https) {
    console.log("   (WebUSB/impresora: usá esta URL HTTPS + Chrome en la tablet de caja)");
  }
} else {
  console.log(`   No se detectó una IP LAN — solo va a andar ${scheme}://localhost:3000 en esta máquina.`);
}
