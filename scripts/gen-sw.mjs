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

/** 미리 저장할 앱 화면 파일 — download/(APK, 크기가 큼) · .well-known 은 넣지 않는다 */
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
`;
}

/** 지금 배포된 버전 (업데이트 버튼이 이것과 열려 있는 화면의 버전을 비교한다) */
export const versionJson = () => `${JSON.stringify({ version: version() })}\n`;

if (process.argv[1] && process.argv[1].endsWith('gen-sw.mjs')) {
  writeFileSync(join(PUB, 'sw.js'), render());
  writeFileSync(join(PUB, 'version.json'), versionJson());
  console.log(`public/sw.js · version.json 생성: v${version()}, 파일 ${assetList().length}개`);
}
