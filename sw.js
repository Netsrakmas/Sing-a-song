/* Sing-a-Song service worker — offline-capable, but never stale.

   The whole app is index.html, so caching that document cache-first pinned
   players to whatever build they first visited: the worker answered from its
   own cache and never asked the network, and the browser only reinstalls a
   worker when sw.js itself changes byte-for-byte. Deploys silently never
   arrived. The document is therefore network-first now, with the cache as the
   offline fallback. Static assets stay cache-first — they rarely change, and
   bumping CACHE below invalidates them when they do. */
const CACHE = "sing-a-song-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isDocument = req => {
  if (req.mode === "navigate") return true;
  const p = new URL(req.url).pathname;
  return p.endsWith("/") || p.endsWith("/index.html");
};

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  if (isDocument(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    ).catch(() => caches.match("./index.html"))
  );
});
