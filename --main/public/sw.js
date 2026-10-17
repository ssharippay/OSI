const ROOT = new URL("./", self.location.href).href;
const CACHE = "uykomek-" + new URL(ROOT).pathname + "-v7";
const local = (path) => new URL(path, ROOT).href;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(
        [
          "./",
          "manifest.webmanifest",
          "icon.svg",
          "icon-192.png",
          "icon-512.png",
          "icon-maskable.png",
        ].map(local),
      );
      const html = await (await cache.match(ROOT)).text();
      const assets = [...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css))"/g)]
        .map((match) => new URL(match[1], ROOT).href)
        .filter((url) => url.startsWith(ROOT));
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("uykomek-" + new URL(ROOT).pathname + "-") &&
                key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API responses, protected files or user-specific navigation.
  if (url.pathname.startsWith("/api/") || url.searchParams.get("mode") === "work" && event.request.mode !== "navigate") return;
  if (event.request.method !== "GET" || !event.request.url.startsWith(ROOT))
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !url.pathname.startsWith("/api/") && !url.search) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      })
      .catch(
        async () =>
          (await caches.match(event.request)) ||
          (event.request.mode === "navigate"
            ? await caches.match(ROOT)
            : undefined) ||
          Response.error(),
      ),
  );
});

self.addEventListener("message", event => {
 if(event.data?.type === "privacy-version") event.ports[0]?.postMessage({privacyVersion:7});
});
