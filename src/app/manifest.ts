import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Macronaut — your cute little food buddy",
    short_name: "Macronaut",
    description:
      "Tell Momo what you ate and it works out the rest. A sweet little AI companion for food, weight, and actually seeing yourself improve.",
    id: "/",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    // Portrait on a phone, but never lock a laptop into it.
    orientation: "any",
    background_color: "#F7F5FF",
    theme_color: "#F7F5FF",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Log today's fuel",
        short_name: "Log food",
        url: "/today",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Weight journey",
        short_name: "Progress",
        url: "/progress",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
