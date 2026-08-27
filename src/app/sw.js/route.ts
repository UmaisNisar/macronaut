/**
 * The service worker, served from a route rather than `public/` so a build id
 * can be baked into it.
 *
 * Why that matters: a browser only reinstalls a service worker when the script
 * *bytes* change. With a hardcoded version string the file was byte-identical
 * on every deploy, so installed apps kept their precached copies of
 * `offline.html` and the icons indefinitely. Stamping the deployment id in
 * means every release produces a new script, which installs, purges the old
 * caches and re-fetches the precache list.
 */

export const dynamic = "force-dynamic";

/**
 * Inlined at build time by next.config.ts, so every instance of every
 * serverless function in a deployment agrees on the same value.
 */
function buildVersion(): string {
  return process.env.APP_BUILD_ID ?? "dev";
}

function source(version: string): string {
  return `/*
 * Macronaut service worker — generated per deployment.
 *
 * Scope is deliberately narrow. Every page is dynamic and account-scoped, so
 * HTML and RSC payloads are NEVER cached: a stale "Today" showing yesterday's
 * numbers would be worse than an error. What is cached is the immutable build
 * output, which is what makes a repeat launch feel instant.
 *
 *   /_next/static/*, /icons/*, fonts  -> cache-first (content-hashed, safe)
 *   navigations                       -> network-only, offline.html on failure
 *   everything else                   -> straight to the network
 */

const VERSION = ${JSON.stringify(`macronaut-${version}`)};
const STATIC_CACHE = VERSION + "-static";
const SHELL_CACHE = VERSION + "-shell";
const PAGE_CACHE = VERSION + "-pages";
const OFFLINE_URL = "/offline.html";

/*
 * Only Today is kept, and only as a last resort when the network is gone.
 *
 * The rule everywhere else is that pages are never cached, because a stale
 * dashboard showing yesterday's calories is worse than an error. The exception
 * exists because the outbox could only accept a meal if the app was already
 * open — launch it cold in a restaurant basement and you got the offline page,
 * which is exactly when you most want to log something. A snapshot you can
 * type into beats a dead end, and the app shows an offline banner over it so
 * the numbers are never mistaken for live ones.
 *
 * Note this stores a signed-in page on the device. It is cleared when the app
 * signs out, and whenever a new deployment activates.
 */
const CACHEABLE_PAGES = ["/today"];

const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Bypass the HTTP cache so a new deploy really does get the new file.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            fetch(url, { cache: "reload" }).then((res) => {
              if (res.ok) return cache.put(url, res);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Content-hashed build output and static icons: safe to keep. */
function isImmutable(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\\.(?:woff2?|ttf|otf)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Server Actions are POSTs; mutations must never be replayed from a cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImmutable(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && CACHEABLE_PAGES.includes(url.pathname)) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy)),
            );
          }
          return response;
        } catch {
          const pages = await caches.open(PAGE_CACHE);
          const snapshot = await pages.match(url.pathname);
          if (snapshot) return snapshot;

          const shell = await caches.open(SHELL_CACHE);
          return (
            (await shell.match(OFFLINE_URL)) ??
            new Response("Offline", {
              status: 503,
              headers: { "content-type": "text/plain" },
            })
          );
        }
      })(),
    );
  }
});

/*
 * The one notification this app sends: an evening nudge on a day with nothing
 * logged. The payload is small and non-medical on purpose — a push message
 * lands on a lock screen, so it says "you have not logged today", never a
 * weight or a calorie figure.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Macronaut", {
      body: data.body || "Anything to log today?",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "macronaut-reminder",
      // Replace rather than stack: two nudges is nagging.
      renotify: false,
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/today";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse a window that is already open rather than piling up tabs.
      for (const client of all) {
        if (client.url.includes(target) && "focus" in client) {
          return client.focus();
        }
      }
      if (all[0] && "focus" in all[0]) {
        await all[0].focus();
        return all[0].navigate?.(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// Signing out must not leave a snapshot of someone's day on the device.
self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-pages") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});
`;
}

export async function GET() {
  return new Response(source(buildVersion()), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // Always revalidate: the browser must notice a new deployment's worker.
      "cache-control": "public, max-age=0, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
