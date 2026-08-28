import type { NextConfig } from "next";

/**
 * A fresh id for every build, inlined at build time.
 *
 * The service worker route stamps this into its source so the script bytes
 * change on each deploy — that is the only signal a browser uses to decide it
 * should reinstall a worker and refresh whatever the old one precached.
 *
 * It has to be resolved here rather than in the route: the route runs on every
 * request, and a value computed at request time would differ between serverless
 * instances, leaving clients flip-flopping between worker versions.
 */
const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ?? `b${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  /**
   * Somewhere other than .next when asked.
   *
   * NEXT_PUBLIC_* values are inlined into the server bundle at build time,
   * so a build made with .env.local present can never be started in solo
   * mode however the runtime environment is set. The end-to-end suite needs
   * a build with those keys genuinely absent, and building that over the top
   * of .next would quietly replace the developer's real one.
   */
  distDir: process.env.MACRONAUT_DIST_DIR || ".next",
  generateBuildId: () => BUILD_ID,
  env: { APP_BUILD_ID: BUILD_ID },
  experimental: {
    // Since v15 this defaults to 0, which throws away a prefetched dynamic
    // page the instant it arrives — the prefetch above would be wasted work.
    // Safe to cache briefly here because every mutation calls revalidatePath
    // on the affected routes, so a new log can never be hidden behind it.
    staleTimes: { dynamic: 30, static: 180 },
    // Photo logging posts a downscaled JPEG as base64 through a Server Action.
    // 1024px at quality 0.72 lands well under this; the headroom is for the
    // occasional very busy photo that compresses badly.
    serverActions: { bodySizeLimit: "4mb" },
  },

  /*
   * The headers that should cover everything, including the static files the
   * proxy deliberately skips. The Content-Security-Policy is not here — it
   * carries a per-request nonce, so it has to be built in the proxy.
   *
   * Vercel already sends Strict-Transport-Security, so it is not repeated.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // A .json or .txt served as text/html is how a stored file becomes
          // stored XSS. Never let the browser guess.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // frame-ancestors already covers this for modern browsers; this is
          // the same instruction for the ones that only understand the old
          // header, and costs nothing.
          { key: "X-Frame-Options", value: "DENY" },
          // Full URLs of a food diary have no business on other people's
          // servers. Same-origin requests still get the path.
          { key: "Referrer-Policy", value: "same-origin" },
          // The camera is used for barcodes and nothing else needs hardware.
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          // Keeps this origin out of other sites' fetches and prerenders.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
