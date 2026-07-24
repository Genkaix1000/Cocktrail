import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deshabilitar la insignia/botón de desarrollo de Next.js de la esquina inferior izquierda
  devIndicators: false,
  // Fijar la raíz del monorepo para Turbopack y silenciar advertencias por otros lockfiles en $HOME
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  // Permite que el celular del cliente acceda al dev server por LAN durante la demo.
  // Si tu IP local cambia, agregala acá.
  allowedDevOrigins: [
    "192.168.0.*",
    "192.168.1.*",
    "10.0.0.*",
    "172.16.0.*",
    "192.168.42.*",  // Android USB tethering
    "192.168.43.*",  // Android WiFi hotspot
    "172.20.10.*",   // iPhone hotspot (USB o WiFi)
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    // El cliente pega same-origin a /api (NEXT_PUBLIC_API_URL vacío) para que la
    // cookie de sesión quede en el mismo host que la app. Este rewrite reenvía
    // esas requests al backend (server→server, mismo host). Configurable por
    // API_PROXY_TARGET para no hardcodear el puerto; default 3001 (convención).
    const apiTarget = process.env.API_PROXY_TARGET || "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
