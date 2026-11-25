import type { MetadataRoute } from "next";

/** Web app manifest so an installed Chrome app shows the candle logo instead of a letter tile. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Terminal",
    short_name: "Terminal",
    description: "A clean, live market terminal: indices, rates, FX, commodities, crypto, movers and news.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0e12",
    theme_color: "#0c0e12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
