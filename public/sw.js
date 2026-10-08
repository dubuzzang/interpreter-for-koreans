/* Tercüman 서비스 워커 — scripts/gen-sw.mjs가 만든 파일 (직접 고치지 마세요) */
const VERSION = '1.0.0';
const CACHE = `tercuman-${VERSION}`;
const ASSETS = [
  "/",
  "/css/app.css",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
  "/icons/maskable-512.png",
  "/js/api.js",
  "/js/app.js",
  "/js/lang.js",
  "/js/phrases.js",
  "/js/reading.js",
  "/js/speech.js",
  "/js/store.js",
  "/js/ui.js",
  "/js/version.js",
  "/js/views/history.js",
  "/js/views/langpicker.js",
  "/js/views/phrases.js",
  "/js/views/settings.js",
  "/js/views/talk.js",
  "/js/views/text.js",
  "/manifest.webmanifest"
];

function isAppPage(pathname) {
  return !/\.[a-z0-9]+$/i.test(pathname) || /\/index\.html$/.test(pathname);
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('tercuman-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return; // 번역·음성 인식은 늘 서버로
  if (req.mode === 'navigate') {
    if (!isAppPage(url.pathname)) return;
    e.respondWith(fetch(req).catch(async () => (await caches.match('/', { cacheName: CACHE })) || Response.error()));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
