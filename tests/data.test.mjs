import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { detectLang, LANGS, CODES, otherLangs } from '../public/js/lang.js';
import { MESSAGES } from '../public/js/i18n.js';
import { PHRASES, PHRASE_CATS, phrasesFor } from '../public/js/phrases.js';
import { render as renderSW, assetList, version, isAppPage, versionJson } from '../scripts/gen-sw.mjs';

test('언어 알아보기', () => {
  assert.equal(detectLang('안녕하세요, 반가워요'), 'ko');
  assert.equal(detectLang('Merhaba, nasılsınız?'), 'tr');
  assert.equal(detectLang('merhaba nasilsin tamam'), 'tr', '특수 글자 없이 써도 흔한 낱말로');
  assert.equal(detectLang('Where is the hotel?'), 'en');
  assert.equal(detectLang('Taksim 2', 'tr'), 'tr', '고유명사뿐이면 기본값');
  assert.equal(detectLang('I am Korean', 'tr'), 'en', '대문자 I도 영어로');
  assert.equal(detectLang('', 'ko'), 'ko');
  assert.equal(detectLang('Otobüs nerede?'), 'tr');
  assert.equal(detectLang('İstanbul havalimanı'), 'tr');
});

test('언어 정보 · 상대 쪽 문구가 모든 언어에 있다', () => {
  assert.deepEqual(CODES, ['ko', 'tr', 'en', 'ja', 'zh', 'zh-TW', 'vi', 'th', 'ru', 'ar']);
  for (const c of CODES) {
    assert.match(LANGS[c].bcp47, /^[a-z]{2}-[A-Z]{2}$/);
    for (const k of Object.keys(MESSAGES.ko)) assert.ok(MESSAGES[c][k], `${c}.${k}`);
  }
  assert.deepEqual(otherLangs('ko'), CODES.slice(1));
});

test('표현집: 모든 언어가 다 있고, 글자 체계가 맞고, 겹치지 않는다', () => {
  const cats = new Set(PHRASE_CATS.map((c) => c.id));
  const seen = new Set();
  assert.ok(PHRASES.length >= 60);
  for (const p of PHRASES) {
    assert.ok(cats.has(p.cat), p.ko);
    assert.match(p.ko, /[가-힣]/, p.ko);
    assert.doesNotMatch(p.tr, /[가-힣]/, p.tr);
    assert.doesNotMatch(p.en, /[가-힣çğışöü]/i, p.en);
    assert.ok(p.tr.trim() && p.en.trim(), p.ko);
    assert.match(p.tr, /[.!?]$/, `튀르키예어 문장 끝 부호: ${p.tr}`);
    assert.ok([].concat(p.only ?? []).every((c) => CODES.includes(c)), '상대 언어가 한국어일 때(튀르키예어·영어·일본어 사용자)를 위한 문장도 있다');
    const key = `${p.cat}|${p.ko}`;
    assert.ok(!seen.has(key), `중복: ${p.ko}`);
    seen.add(key);
  }
  for (const c of PHRASE_CATS) assert.ok(phrasesFor(c.id, 'tr').length >= 5, c.name);
  assert.ok(phrasesFor('talk', 'tr').some((p) => /튀르키예어/.test(p.ko)));
  assert.ok(!phrasesFor('talk', 'tr').some((p) => /영어를/.test(p.ko)), '상대가 튀르키예어면 "영어를 못해요"는 안 보임');
});

test('서비스 워커가 최신이고, 미리 저장할 파일이 모두 있다', () => {
  assert.equal(readFileSync('public/sw.js', 'utf8'), renderSW(), 'public/sw.js가 오래됨 — npm run build:sw');
  for (const a of assetList()) if (a !== '/') assert.ok(existsSync(`public${a}`), a);
  assert.ok(assetList().includes('/js/app.js') && assetList().includes('/icons/icon-192.png'));
  assert.ok(!assetList().some((a) => a.startsWith('/api')));
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, version(), 'package.json과 version.js 버전');
  assert.equal(readFileSync('public/version.json', 'utf8'), versionJson(), 'public/version.json이 오래됨 — npm run build:sw');
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), new RegExp(`## v${version().replace(/\./g, '\\.')} `), 'CHANGELOG에 이 버전');
  assert.match(renderSW(), /url\.pathname === '\/version\.json'/, '새 버전 확인은 서비스 워커가 가로채지 않는다');
  for (const p of ['/', '/index.html', '/talk']) assert.ok(isAppPage(p), p);
  for (const p of ['/sw.js', '/icons/icon-512.png', '/manifest.webmanifest']) assert.ok(!isAppPage(p), p);
});

test('배포 설정: Workers AI 연결 · 앱 화면 파일 · 매니페스트 아이콘', () => {
  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.match(toml, /pages_build_output_dir\s*=\s*"public"/);
  assert.match(toml, /\[ai\]\s*\nbinding\s*=\s*"AI"/);
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
  assert.equal(m.display, 'standalone');
  for (const i of m.icons) assert.ok(existsSync(`public${i.src}`), i.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  const html = readFileSync('public/index.html', 'utf8');
  for (const ref of html.match(/(?:href|src)="(\/[^"]+)"/g).map((s) => s.match(/"(.+)"/)[1])) assert.ok(existsSync(`public${ref}`), ref);
  assert.match(readFileSync('public/_headers', 'utf8'), /\/sw\.js\n\s+Cache-Control: no-cache/);
  assert.match(readFileSync('public/_headers', 'utf8'), /\/version\.json\n\s+Cache-Control: no-cache/);
});

test('업데이트 버튼: HTML 안에 있어 예전 앱 코드에서도 동작하고, 앱 코드가 지금 버전을 알린다', () => {
  const html = readFileSync('public/index.html', 'utf8');
  assert.match(html, /fetch\('\/version\.json', \{ cache: 'no-store' \}\)/);
  assert.match(html, /id = 'update-banner'/);
  assert.match(html, /getAttribute\('data-version'\)/);
  assert.match(html, /caches\.delete/);
  assert.match(html, /location\.reload\(\)/);
  // 예전 앱 코드(v1.0.0)가 찾는 요소들이 그대로 있어야 새 HTML + 예전 코드도 뜬다
  for (const id of ['main', 'pair', 'tabbar', 'gear']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(readFileSync('public/js/app.js', 'utf8'), /dataset\.version = VERSION/);
});
