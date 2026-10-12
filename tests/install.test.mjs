// 안드로이드 앱(APK · TWA, v1.4.1): assetlinks · 내려받기 파일 · 헤더 · 서비스 워커 · 설치 안내 (기기 · 브라우저 알아보기)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { render as renderSW, assetList, isAppPage } from '../scripts/gen-sw.mjs';
import { APP_ORIGIN, INSTALL_URL, APK_PATH, APK_NAME, platform, inAppBrowser, iosOtherBrowser, safariLink, chromeLink } from '../public/js/install.js';
import { MESSAGES } from '../public/js/i18n.js';

const APK = `public${APK_PATH}`;
const links = () => JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
const twa = () => JSON.parse(readFileSync('android/twa-manifest.json', 'utf8'));
const colonHex = (hex) => hex.toUpperCase().match(/../g).join(':');

/** 압축 파일(APK)의 끝 목록(EOCD) 위치 */
function eocd(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) return i;
  throw new Error('zip 끝 목록 없음');
}

/** APK 서명 블록(v2)의 첫 서명 인증서 SHA-256 — apksigner verify --print-certs 의 "certificate SHA-256 digest" 와 같은 값 */
function apkCertSha256(buf) {
  const cd = buf.readUInt32LE(eocd(buf) + 16);
  assert.equal(buf.toString('latin1', cd - 16, cd), 'APK Sig Block 42', 'APK 서명 블록(v2 이상) 없음');
  const size = Number(buf.readBigUInt64LE(cd - 24));
  const lp = (o) => [o + 4, buf.readUInt32LE(o)]; // [내용 시작, 길이] — 길이가 앞에 붙은 칸
  for (let p = cd - size; p < cd - 24;) {
    const len = Number(buf.readBigUInt64LE(p));
    if (buf.readUInt32LE(p + 8) === 0x7109871a) { // v2 서명
      const [signers] = lp(p + 12);
      const [signer] = lp(signers);
      const [signed] = lp(signer);
      const [digests, digestsLen] = lp(signed);
      const [certs] = lp(digests + digestsLen);
      const [cert, certLen] = lp(certs);
      return createHash('sha256').update(buf.subarray(cert, cert + certLen)).digest('hex');
    }
    p += 8 + len;
  }
  throw new Error('v2 서명 없음');
}

/** APK 안의 파일 하나 (압축 풀어서) */
function apkEntry(buf, name) {
  const end = eocd(buf);
  let p = buf.readUInt32LE(end + 16);
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    const nameLen = buf.readUInt16LE(p + 28);
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const method = buf.readUInt16LE(p + 10);
      const local = buf.readUInt32LE(p + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + buf.readUInt32LE(p + 20));
      return method === 8 ? inflateRawSync(data) : data;
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return null;
}

test('assetlinks.json: Merhaba · Hello 와 같은 형식, 패키지 · 지문이 TWA 설정 · 안내서와 같다', () => {
  const l = links();
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(l[0].target.namespace, 'android_app');
  assert.equal(l[0].target.package_name, 'io.github.dubuzzang.tercuman');
  assert.equal(l[0].target.package_name, twa().packageId);
  assert.equal(l[0].target.sha256_cert_fingerprints.length, 1);
  assert.match(l[0].target.sha256_cert_fingerprints[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.ok(readFileSync('android/README.md', 'utf8').includes(l[0].target.sha256_cert_fingerprints[0]), 'android/README.md 의 지문');
});

test('TWA 설정: 사이트 주소 · 매니페스트 시작 주소 · 색 · 아이콘, 서명 키는 저장소 밖', () => {
  const m = twa();
  const wm = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(`https://${m.host}`, APP_ORIGIN);
  assert.equal(m.startUrl, wm.start_url);
  assert.equal(m.launcherName, wm.short_name);
  assert.equal(m.themeColor.toLowerCase(), wm.theme_color.toLowerCase());
  assert.equal(m.backgroundColor.toLowerCase(), wm.background_color.toLowerCase());
  assert.equal(m.display, wm.display);
  assert.equal(m.orientation, wm.orientation);
  assert.equal(m.iconUrl, `${APP_ORIGIN}/icons/icon-512.png`);
  assert.equal(m.maskableIconUrl, `${APP_ORIGIN}/icons/maskable-512.png`);
  assert.ok(existsSync('public/icons/icon-512.png') && existsSync('public/icons/maskable-512.png'));
  assert.ok(Number.isInteger(m.appVersionCode) && m.appVersionCode >= 1);
  assert.match(m.appVersionName, /^\d+\.\d+\.\d+$/);
  assert.equal(m.signingKey.alias, 'tercuman');
  assert.match(m.signingKey.path, /keys[\\/]tercuman[\\/]tercuman\.keystore$/);
  const ignore = readFileSync('.gitignore', 'utf8').split('\n').map((s) => s.trim());
  for (const p of ['*.keystore', '*.jks', 'password.txt']) assert.ok(ignore.includes(p), `.gitignore: ${p} (키는 저장소에 넣지 않는다)`);
});

test('내려받기 APK: 있고, 크기가 알맞고, 서명 인증서가 assetlinks 지문과 같고, 패키지 이름이 맞다', () => {
  assert.ok(existsSync(APK), `${APK} 없음 — android/README.md`);
  const buf = readFileSync(APK);
  assert.ok(buf.length > 500_000 && buf.length < 10_000_000, `크기 ${buf.length}`);
  assert.equal(APK_NAME, APK_PATH.split('/').pop());
  assert.equal(colonHex(apkCertSha256(buf)), links()[0].target.sha256_cert_fingerprints[0], 'APK 서명 키와 assetlinks 지문이 다르면 주소창이 보인다');
  const manifest = apkEntry(buf, 'AndroidManifest.xml');
  assert.ok(manifest, 'AndroidManifest.xml');
  assert.ok(manifest.includes(Buffer.from(twa().packageId, 'utf16le')), '패키지 이름');
  // 사이트 주소 · 시작 주소는 build.gradle 의 resValue → resources.arsc (UTF-8)
  const res = apkEntry(buf, 'resources.arsc');
  assert.ok(res.includes(Buffer.from(`https://${twa().host}${twa().startUrl}`)), '시작 주소(launchUrl)');
});

test('_headers: assetlinks 는 JSON, APK 는 그 파일에만 APK 형식 · 내려받기 (Hello v1.0.2: /download/* 로 넓히지 않는다)', () => {
  const hd = readFileSync('public/_headers', 'utf8');
  assert.match(hd, /\/\.well-known\/assetlinks\.json\n\s+Content-Type: application\/json\n\s+Access-Control-Allow-Origin: \*/);
  assert.match(hd, new RegExp(`${APK_PATH.replace(/[./]/g, '\\$&')}\\n\\s+Content-Type: application/vnd\\.android\\.package-archive\\n\\s+Content-Disposition: attachment; filename="${APK_NAME.replace('.', '\\.')}"`));
  assert.ok(!/\/download\/\*/.test(hd), '/download/* 규칙은 모든 파일에 APK 형식을 붙인다');
});

test('서비스 워커: APK 를 미리 저장하지 않고, 파일 주소를 앱 화면으로 바꾸지 않는다 (Hello v1.0.2)', () => {
  assert.ok(!assetList().some((a) => a.startsWith('/download') || a.startsWith('/.well-known') || a.endsWith('.apk')), '미리 저장 목록에 APK 없음');
  for (const p of [APK_PATH, '/.well-known/assetlinks.json']) assert.ok(!isAppPage(p), p);
  const sw = renderSW();
  assert.match(sw, /url\.pathname\.startsWith\('\/download\/'\) \|\| url\.pathname\.startsWith\('\/\.well-known\/'\)\) return;/);
  // 가로채지 않는 줄이 응답 만들기(respondWith)보다 먼저
  assert.ok(sw.indexOf("startsWith('/download/')") < sw.indexOf('e.respondWith'));
  assert.equal(readFileSync('public/sw.js', 'utf8'), sw, 'public/sw.js가 오래됨 — npm run build:sw');
});

test('기기 · 브라우저 알아보기: 아이폰은 사파리에서만, 크롬 · 네이버 · 카카오톡이면 사파리로 · 안드로이드 앱 안 브라우저는 크롬으로 (Hello v1.0.3)', () => {
  const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  const safari = [
    `${ios} Version/18.0 Mobile/15E148 Safari/604.1`,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', // 아이패드
  ];
  const other = {
    chrome: `${ios} CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1`,
    firefox: `${ios} FxiOS/131.0 Mobile/15E148 Safari/605.1.15`,
    edge: `${ios} Version/18.0 EdgiOS/129.0.2792.84 Mobile/15E148 Safari/605.1.15`,
    whale: `${ios} Version/18.0 Whale/3.10.0.0 Mobile/15E148 Safari/604.1`,
    naver: `${ios} Mobile/15E148 NAVER(inapp; search; 2000; 12.8.5; 15PRO)`,
    kakao: `${ios} Mobile/15E148 KAKAOTALK 10.8.5`,
    webview: `${ios} Mobile/15E148`,
  };
  for (const ua of safari) {
    assert.equal(platform(ua, 5), 'ios', ua);
    assert.equal(iosOtherBrowser(ua), false, ua);
    assert.equal(inAppBrowser(ua), null, ua);
  }
  for (const [name, ua] of Object.entries(other)) {
    assert.equal(platform(ua, 5), 'ios', name);
    assert.equal(iosOtherBrowser(ua), true, name);
  }
  assert.equal(platform(safari[1], 0), 'desktop', '터치가 없는 Mac 은 PC');
  assert.equal(inAppBrowser(other.kakao), 'kakao');
  assert.equal(inAppBrowser(other.naver), 'naver');
  assert.equal(safariLink(INSTALL_URL, null), 'x-safari-https://interpreter-for-koreans.pages.dev/#/install');
  assert.equal(safariLink(INSTALL_URL, 'kakao'), `kakaotalk://web/openExternal?url=${encodeURIComponent(INSTALL_URL)}`);

  const android = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko)';
  assert.equal(platform(`${android} Chrome/129.0.0.0 Mobile Safari/537.36`), 'android');
  assert.equal(inAppBrowser(`${android} Chrome/129.0.0.0 Mobile Safari/537.36`), null, '크롬 · 안드로이드 앱(TWA)은 앱 안 브라우저가 아니다');
  assert.equal(inAppBrowser(`${android} Chrome/129.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.8.5`), 'kakao');
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.8.5)'), 'naver');
  assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36'), 'other', '그 밖의 앱 안 웹뷰');
  assert.equal(chromeLink(INSTALL_URL, 'other'), 'intent://interpreter-for-koreans.pages.dev/#/install#Intent;scheme=https;package=com.android.chrome;end');
  assert.equal(chromeLink(INSTALL_URL, 'kakao'), `kakaotalk://web/openExternal?url=${encodeURIComponent(INSTALL_URL)}`);
  assert.equal(platform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 0), 'desktop');
});

test('설정의 "앱 설치": 설치 화면(#/install)으로 가고, 다섯 언어로 APK · "출처를 알 수 없는 앱" · 홈 화면에 추가를 안내한다', () => {
  assert.match(readFileSync('public/js/views/settings.js', 'utf8'), /installCard\(\)/);
  assert.match(readFileSync('public/js/app.js', 'utf8'), /const VIEWS = \{[^}]*\binstall\b[^}]*\}/);
  const view = readFileSync('public/js/views/install.js', 'utf8');
  assert.match(view, /href: '#\/install'/);
  assert.match(view, /href: APK_PATH, download: APK_NAME/, 'APK 는 download 속성으로 바로 받는다');
  const want = {
    ko: [/출처를 알 수 없는 앱/, /홈 화면에 추가/, /Safari/],
    tr: [/Bilinmeyen uygulamalar/, /Ana Ekrana Ekle/, /Safari/],
    en: [/unknown apps/, /Add to Home Screen/, /Safari/],
    ja: [/提供元不明のアプリ/, /ホーム画面に追加/, /Safari/],
    zh: [/安装未知应用/, /添加到主屏幕/, /Safari/],
  };
  for (const [c, res] of Object.entries(want)) {
    const all = [MESSAGES[c]['install.hintAndroid'], MESSAGES[c]['install.a3'], MESSAGES[c]['install.i3'], MESSAGES[c]['install.i1']].join(' ');
    for (const re of res) assert.match(all, re, `${c}: ${re}`);
    assert.match(MESSAGES[c]['install.apk'], /APK/);
  }
  assert.ok(!('set.install' in MESSAGES.ko), '예전 한 줄 안내는 카드로 바뀜');
});
