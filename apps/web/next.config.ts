import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
