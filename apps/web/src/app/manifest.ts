import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "miBoliche Caja",
    short_name: "miBoliche",
    description: "Ventas, cobros y cierre de noche del boliche",
    id: "/",
    start_url: "/caja",
    display: "standalone",
    background_color: "#111315",
    theme_color: "#111315",
    lang: "es-AR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
