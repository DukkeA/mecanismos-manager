const CACHE = "mecanismos-static-v2";
const STATIC = ["/offline.html", "/brand/logo.png", "/brand/monogram.png", "/icons/favicon.png", "/icons/apple-touch-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("mecanismos-static-") && key !== CACHE).map(key => caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  // Never cache authenticated HTML, customer data, server actions or API responses.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(()=>caches.match("/offline.html")));
  } else if (STATIC.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
