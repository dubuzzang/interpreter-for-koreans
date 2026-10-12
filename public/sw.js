/* Tercüman 서비스 워커 — scripts/gen-sw.mjs가 만든 파일 (직접 고치지 마세요) */
const VERSION = '1.4.1';
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
  "/js/i18n.js",
  "/js/install.js",
  "/js/lang.js",
  "/js/mine.js",
  "/js/phrases.js",
  "/js/pinyin.js",
  "/js/reading.js",
  "/js/share.js",
  "/js/speech.js",
  "/js/store.js",
  "/js/ui.js",
  "/js/version.js",
  "/js/views/history.js",
  "/js/views/install.js",
  "/js/views/langmenu.js",
  "/js/views/langpicker.js",
  "/js/views/phrases.js",
  "/js/views/settings.js",
  "/js/views/share.js",
  "/js/views/talk.js",
  "/js/views/text.js",
  "/manifest.webmanifest"
];

function isAppPage(pathname) {
  return !/\.[a-z0-9]+$/i.test(pathname) || /\/index\.html$/.test(pathname);
}

// 새 버전은 받자마자 적용 대기 없이 넘어간다. 열려 있는 화면은 "업데이트" 버튼(index.html)을 누르면 새로 고쳐진다
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
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
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/version.json') return; // 번역·음성 인식·새 버전 확인은 늘 서버로
  if (url.pathname.startsWith('/download/') || url.pathname.startsWith('/.well-known/')) return; // 앱 설치 파일(APK)·앱 연결 확인은 저장하지 않고 그대로 받게
  if (req.mode === 'navigate') {
    if (!isAppPage(url.pathname)) return;
    e.respondWith(fetch(req).catch(async () => (await caches.match('/', { cacheName: CACHE })) || Response.error()));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
