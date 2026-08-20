import type { MetadataRoute } from "next";

/**
 * The installed app is the player's client: it opens at /play, which drops straight into
 * whichever tournament this device joined. Hosting — creating tournaments, settings, the
 * projector — stays on the web, so none of it is reachable from here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cheffeloker Night",
    short_name: "Cheffeloker",
    description: "Your seat, the clock, and the table you are sitting at",
    start_url: "/play",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Sampled from the app's own background gradient, so the status bar blends in.
    background_color: "#11265c",
    theme_color: "#11265c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
