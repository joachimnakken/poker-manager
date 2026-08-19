/*
 * The player app's service worker.
 *
 * Two jobs: make the app installable (Chrome only offers installation to sites with a
 * fetch handler), and keep the shell usable when the wifi at someone's house drops.
 *
 * It is deliberately narrow. Tournament state is polled every couple of seconds and a
 * stale clock or a knockout that already happened is worse than no app at all, so
 * /api is never touched. Bump VERSION to retire the old caches on deploy.
 */
const VERSION = "v1";
const STATIC_CACHE = `poker-static-${VERSION}`;
const PAGE_CACHE = `poker-pages-${VERSION}`;

self.addEventListener("install", (event) => {
  // The player app is one screen; pre-caching its entry means a cold, offline launch
  // still shows something rather than the browser's error page.
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(["/play", "/rankings"]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Writes, other origins, and anything live are none of our business.
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Build output is content-hashed, so it can never go stale: serve it from cache and
  // only reach the network the first time.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else — pages and icons — is network-first, so a deploy lands immediately
  // and the cache is only a fallback for a dropped connection.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) {
          return hit;
        }
        if (request.mode === "navigate") {
          const shell = await caches.match("/play");
          if (shell) {
            return shell;
          }
        }
        return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
      }),
  );
});
