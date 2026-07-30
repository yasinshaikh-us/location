import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Location Timeline",
    short_name: "Location Timeline",
    description: "Ask questions about your own location history",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#14181D",
    theme_color: "#14181D",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
