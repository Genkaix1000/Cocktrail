import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen de Docker: server.js autocontenido, sin node_modules del monorepo.
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
  // Deshabilitar la insignia/botón de desarrollo de Next.js de la esquina inferior izquierda
  devIndicators: false,
  // Fijar la raíz del monorepo para Turbopack y silenciar advertencias por otros lockfiles en $HOME
  turbopack: {
    root: path.resolve(__dirname, "../../"),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async rewrites() {
    if (process.env.NEXT_PUBLIC_DEMO_STATIC === "1") {
      return [];
    }
    const apiTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
      // Health check del hosting: pega al puerto público (Next) y se reenvía a
      // la API, así un 200 prueba que los DOS procesos están vivos. Si la API
      // se cae, esto falla y el orquestador reinicia el contenedor.
      {
        source: "/health",
        destination: `${apiTarget}/health`,
      },
    ];
  },
  // Las cabeceras de seguridad las ponía solo Express, pero las páginas las
  // sirve Next: sin esto, /login y /caja viajan sin ninguna.
  async headers() {
    const seguridad = [
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob: https://images.unsplash.com https://api.qrserver.com https://www.mercadopago.com https://*.mercadopago.com https://*.mlstatic.com",
          "connect-src 'self' wss: https://challenges.cloudflare.com",
          "frame-src https://challenges.cloudflare.com",
        ].join("; "),
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        // bluetooth/usb: vincular S1 / ticketera.
        // NO bloquear geolocation: en Android Chrome el escaneo BLE histórico
        // pide ubicación; geolocation=() deja requestDevice sin abrir el selector.
        value: "camera=(), microphone=(), bluetooth=(self), usb=(self)",
      },
    ];
    if (process.env.NODE_ENV === "production") {
      seguridad.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }
    return [{ source: "/:path*", headers: seguridad }];
  },
  allowedDevOrigins: [
    "192.168.0.10",
    "192.168.0.11",
    "192.168.0.*",
    "192.168.1.*",
    "192.168.*",
    "10.0.*",
    "localhost:3000",
    "*.local",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
