// public/sw.js 만들기: 앱 화면 파일을 미리 저장(인터넷 없이도 표현집·기록은 됨). 사용: npm run build:sw
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUB = join(ROOT, 'public');
const list = (dir) => readdirSync(join(PUB, dir)).flatMap((f) => {
  const p = `${dir}/${f}`;
  return statSync(join(PUB, p)).isDirectory() ? list(p) : [p];
});

export function assetList() {
  return ['/', '/manifest.webmanifest', ...list('css').map((p) => `/${p}`), ...list('js').map((p) => `/${p}`), ...list('icons').map((p) => `/${p}`)].sort();
}
export function version() {
  return readFileSync(join(PUB, 'js/version.js'), 'utf8').match(/VERSION = '([^']+)'/)[1];
}
/** 페이지 열기 중 앱 화면으로 열 주소 (그 밖의 파일 주소는 그대로 받게) */
export function isAppPage(pathname) {
  return !/\.[a-z0-9]+$/i.test(pathname) || /\/index\.html$/.test(pathname);
}

export function render() {
  return `/* Tercüman 서비스 워커 — scripts/gen-sw.mjs가 만든 파일 (직접 고치지 마세요) */
const VERSION = '${version()}';
const CACHE = \`tercuman-\${VERSION}\`;
const ASSETS = ${JSON.stringify(assetList(), null, 2)};

${isAppPage.toString()}

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
`;
}

if (process.argv[1] && process.argv[1].endsWith('gen-sw.mjs')) {
  writeFileSync(join(PUB, 'sw.js'), render());
  console.log(`public/sw.js 생성: v${version()}, 파일 ${assetList().length}개`);
}
