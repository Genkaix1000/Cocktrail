import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que el celular del cliente acceda al dev server por LAN durante la demo.
  // Si tu IP local cambia, agregala acá.
  allowedDevOrigins: [
    "192.168.0.*",
    "192.168.1.*",
    "10.0.0.*",
    "172.16.0.*",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
