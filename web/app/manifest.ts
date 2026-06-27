import type { MetadataRoute } from "next";

// PWA manifest — "Add to Home Screen" shows the American-flag icon and launches
// standalone. iOS uses app/apple-icon.png; Android uses these maskable icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bellwood Hub — Mayor's AI Chief of Staff",
    short_name: "Bellwood Hub",
    description: "The Mayor's AI Chief of Staff — institutional memory for the Village of Bellwood.",
    start_url: "/chief",
    display: "standalone",
    background_color: "#0a1322",
    theme_color: "#0a1322",
    icons: [
      { src: "/flag-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/flag-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/flag-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
