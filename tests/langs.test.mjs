// v1.6.0 언어 11개 공통 틀 (추가지시 2로 프랑스어까지): 언어마다 같은 자리(화면 글자 · 표현집 · 읽는 법 · 서버 정보)가 다 있고, 글 방향 · 언어 고르기가 맞다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LANGS, CODES, isRtl, dirOf, codeOfTag, isChinese, detectLang } from '../public/js/lang.js';
import { MESSAGES, defaultLang } from '../public/js/i18n.js';
import { PHRASES, EXTRA_PHRASES, phrasesFor, phraseSound } from '../public/js/phrases.js';
import { READERS, readingFor, needsSound, hasSound } from '../public/js/reading.js';
import { PACKS } from '../lib/langs/index.mjs';
import { SOUND_SPECS, validateSound } from '../lib/sound-core.mjs';
import { LANG_NAMES, REGISTER, SCRIPT_RULE, buildMessages, looksValid, sttLanguage } from '../lib/translate-core.mjs';
import { numberMentions, wrongScript, toAscii } from '../lib/assist-core.mjs';
import { lineLang, inMyScript } from '../lib/photo-core.mjs';
import { onRequestPost as soundApi } from '../functions/api/sound.js';
import { _resetBuckets } from '../lib/guard.mjs';

const NEW = ['zh-TW', 'vi', 'th', 'ru', 'ar', 'fr'];

test('언어 11개: 정보가 다 있고, 코드 · 이름 · 글자 체계 · 글 방향', () => {
  assert.deepEqual(CODES, ['ko', 'tr', 'en', 'ja', 'zh', 'zh-TW', 'vi', 'th', 'ru', 'ar', 'fr']);
  for (const c of CODES) {
    const L = LANGS[c];
    assert.equal(L.code, c);
    for (const k of ['native', 'flag', 'bcp47', 'short', 'name', 'script']) assert.ok(L[k], `${c}.${k}`);
    assert.equal(LANG_NAMES[c], L.name);
    assert.ok(REGISTER[c]?.length === 2, `${c} 말투`);
  }
  assert.equal(new Set(CODES.map((c) => LANGS[c].short)).size, CODES.length, '🌐 버튼의 짧은 이름이 겹치지 않는다');
  assert.ok(isRtl('ar') && dirOf('ar') === 'rtl');
  for (const c of CODES.filter((x) => x !== 'ar')) assert.equal(dirOf(c), 'ltr', c);
  assert.equal(dirOf('xx'), 'ltr');
  assert.ok(isChinese('zh') && isChinese('zh-TW') && !isChinese('ja'));
});

test('브라우저 언어 → 앱 언어: 번체(대만 · 홍콩 · Hant)는 zh-TW, 새 언어들', () => {
  const cases = {
    'zh-TW': 'zh-TW', zh_TW: 'zh-TW', 'zh-HK': 'zh-TW', 'zh-Hant': 'zh-TW', 'zh-Hant-TW': 'zh-TW', 'zh-MO': 'zh-TW',
    'zh-CN': 'zh', zh: 'zh', 'zh-Hans': 'zh', 'zh-SG': 'zh',
    'vi-VN': 'vi', vi: 'vi', 'th-TH': 'th', 'ru-RU': 'ru', 'ru-KZ': 'ru', 'ar-EG': 'ar', 'ar-SA': 'ar', ar: 'ar', 'fr-FR': 'fr', 'fr-CA': 'fr', 'de-DE': null, '': null,
  };
  for (const [tag, want] of Object.entries(cases)) assert.equal(codeOfTag(tag), want, tag);
  assert.equal(defaultLang(['de', 'ar-EG', 'en']), 'ar');
  assert.equal(defaultLang(['th-TH']), 'th');
});

test('화면 글자: 언어마다 사전 파일이 있고, 언어 이름 11개 · 쉬는 안내(err.paused)가 다 있다', () => {
  for (const c of CODES) {
    assert.ok(existsSync(`public/js/i18n/${c}.js`), `i18n/${c}.js`);
    for (const l of CODES) assert.ok(MESSAGES[c][`lang.${l}`], `${c} 사전의 lang.${l}`);
    assert.match(MESSAGES[c]['err.paused'], /\{time\}/, `${c} err.paused`);
  }
  // 상대 안내 · 목소리 들어 보기 문장은 그 언어로
  for (const c of CODES) assert.ok(MESSAGES[c]['mic.partnerHint'] && MESSAGES[c]['set.voiceSample'], c);
});

test('표현집: 새 언어 묶음은 표현집 문장 열쇠와 정확히 맞고(빠짐 · 남는 열쇠 없음), 모든 짝에서 문장이 보인다', () => {
  const refs = new Set(PHRASES.map((p) => `${p.cat}|${p.ko}`));
  assert.equal(refs.size, PHRASES.length, '문장 열쇠가 겹치지 않는다');
  for (const code of NEW) {
    const pack = EXTRA_PHRASES[code];
    assert.ok(pack, code);
    for (const k of Object.keys(pack)) assert.ok(refs.has(k), `${code}: 표현집에 없는 열쇠 ${k}`);
    for (const p of PHRASES) {
      assert.ok(typeof p[code] === 'string' && p[code].trim(), `${code}: ${p.ko}`);
      assert.equal(p[code], p[code].trim());
    }
  }
  for (const me of CODES) for (const partner of CODES.filter((c) => c !== me)) {
    for (const cat of ['greet', 'talk', 'food', 'shop', 'order', 'move', 'stay', 'help']) {
      const list = phrasesFor(cat, partner, me);
      assert.ok(list.length >= 5, `${me}→${partner} ${cat}`);
      for (const p of list) assert.ok(p[me] && p[partner], `${me}→${partner} ${p.ko}`);
    }
    // 나를 소개하는 문장은 언어마다 하나씩 (영어 사용자는 여러 나라라 없음), 상대가 그 언어면 "○○어를 잘 못해요"
    if (me !== 'en') assert.equal(phrasesFor('talk', partner, me).filter((p) => p.me).length, 1, `${me} 소개 문장`);
    if (me !== 'en') assert.ok(phrasesFor('talk', me, partner).some((p) => p.only && [].concat(p.only).includes(me)), `상대가 ${me}일 때 "잘 못해요"`);
  }
  // 소리 표기가 서버를 거치는 언어는 표현집에 미리 넣어 둔다 (인터넷 없이 읽는 법)
  for (const p of PHRASES) for (const c of CODES) if (hasSound(c) && READERS[c].hangul) assert.ok(phraseSound(p, c), `${c} 소리 표기: ${p.ko}`);
});

test('읽는 법: 언어마다 같은 길 — 한국어 사용자에게 한글, 그 밖에는 로마자, 간체↔번체 · 같은 언어는 생략', () => {
  for (const c of CODES) assert.ok(READERS[c], c);
  assert.equal(readingFor('你好', 'zh-TW', 'zh', 'nǐ hǎo'), '', '간체 사용자에게 번체는 생략');
  assert.equal(readingFor('你好', 'zh', 'zh-TW', 'nǐ hǎo'), '');
  assert.equal(readingFor('你好', 'zh-TW', 'ko', 'nǐ hǎo'), '니 하오\nNǐ hǎo', '한국어 사용자: 번체도 한글 발음 + 병음');
  assert.equal(readingFor('你好', 'zh-TW', 'en', 'nǐ hǎo'), 'Nǐ hǎo');
  assert.equal(readingFor('안녕하세요', 'ko', 'ar'), 'Annyeonghaseyo', '아랍어 사용자에게 한국어는 로마자');
  assert.equal(readingFor('안녕하세요', 'ko', 'vi'), 'Annyeonghaseyo');
  assert.equal(readingFor('Hello', 'en', 'th'), '', '라틴 문자 언어는 로마자를 따로 적지 않는다');
  assert.ok(needsSound('zh-TW', 'ko') && !needsSound('zh-TW', 'zh') && !needsSound('tr', 'ko'));
  for (const c of CODES) if (READERS[c].sound) assert.ok(SOUND_SPECS[c], `${c}: 화면이 소리 표기를 부르면 서버 규칙이 있어야 한다`);
});

test('/api/sound: 언어마다 소리 표기 (가짜 AI), 모르는 언어 · 글자가 틀린 글은 400', async () => {
  _resetBuckets();
  const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
  const req = (body) => new Request(`${ORIGIN}/api/sound`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify(body) });
  const AI = { run: async (model, input) => ({ response: /Hanyu Pinyin/.test(input.messages[0].content) ? 'Zhège duōshao qián?' : 'これわ いくら ですか' }) };
  let data = await (await soundApi({ request: req({ text: '這個多少錢？', lang: 'zh-TW' }), env: { AI } })).json();
  assert.equal(data.sound, 'Zhège duōshao qián?');
  data = await (await soundApi({ request: req({ text: 'これはいくらですか', lang: 'ja' }), env: { AI } })).json();
  assert.equal(data.sound, 'これわ いくら ですか');
  assert.equal((await soundApi({ request: req({ text: 'hello', lang: 'zh' }), env: { AI } })).status, 400);
  assert.equal((await soundApi({ request: req({ text: 'x', lang: 'xx' }), env: { AI } })).status, 400);
  assert.equal(validateSound({ text: '這個', lang: 'zh-TW' }).value.lang, 'zh-TW');
  // 번체 병음은 대만 보통화 읽기로
  assert.match(SOUND_SPECS['zh-TW'].messages('這個')[0].content, /Taiwan/);
});

test('번역 지시문 · 결과 점검: 옮길 언어의 글자 규칙만, 새 언어 글자 체계', () => {
  const sys = (from, to) => buildMessages({ text: 'x', from, to })[0].content;
  assert.match(sys('ko', 'zh-TW'), /from Korean into Traditional Chinese/);
  assert.match(sys('ko', 'zh-TW'), /Traditional Chinese characters/);
  assert.doesNotMatch(sys('ko', 'zh-TW'), /never Traditional/, '간체 규칙이 섞이지 않는다');
  for (const c of NEW) assert.ok(SCRIPT_RULE[c], `${c} 글자 규칙`);
  assert.ok(looksValid('Cái này bao nhiêu tiền?', { text: '이거 얼마예요?', from: 'ko', to: 'vi' }));
  assert.ok(!looksValid('이거 얼마예요?', { text: 'Cái này bao nhiêu tiền?', from: 'vi', to: 'th' }), '타이 문자가 없음');
  assert.ok(looksValid('Сколько это стоит?', { text: '이거 얼마예요?', from: 'ko', to: 'ru' }));
  assert.ok(!looksValid('Skolko eto stoit?', { text: '이거 얼마예요?', from: 'ko', to: 'ru' }), '로마자만');
  assert.ok(!looksValid('How much is Сколько?', { text: 'Сколько это стоит?', from: 'ru', to: 'en' }), '키릴 문자가 남음');
  assert.ok(looksValid('كم سعر هذا؟', { text: 'How much is this?', from: 'en', to: 'ar' }));
  assert.ok(looksValid('ราคาเท่าไหร่', { text: '얼마예요?', from: 'ko', to: 'th' }));
  assert.ok(!looksValid('ราคา 얼마', { text: '얼마예요?', from: 'ko', to: 'th' }), '한글이 남음');
  assert.equal(sttLanguage('zh-TW'), 'zh', 'Whisper에는 zh');
  assert.equal(sttLanguage('vi'), 'vi');
});

test('숫자: 타이 숫자 · 아랍 숫자도 보통 숫자로 읽는다, 글자 체계 점검', () => {
  assert.equal(toAscii('๑๕๐ บาท'), '150 บาท');
  assert.equal(toAscii('٢٥٠ ريال'), '250 ريال');
  assert.equal(toAscii('۱۲'), '12');
  assert.equal(toAscii('١٢٫٥'), '12.5');
  assert.deepEqual(numberMentions('ราคา ๑๕๐ บาท', 'th').map((m) => m.alts[0]), [150]);
  assert.deepEqual(numberMentions('السعر ٢٥٠ ريال', 'ar').map((m) => m.alts[0]), [250]);
  assert.ok(numberMentions('一百五十塊', 'zh-TW').some((m) => m.alts.includes(150)), '번체 중국어도 한자 숫자');
  assert.ok(wrongScript('ราคา 얼마', 'th') && !wrongScript('ราคา 150 THB', 'th'));
  assert.ok(wrongScript('Привет 你好', 'ru') && !wrongScript('Привет iPhone', 'ru'));
  assert.ok(!wrongScript('مرحبا', 'ar') && wrongScript('مرحبا 안녕', 'ar'));
  assert.ok(!wrongScript('這個', 'zh-TW') && wrongScript('這個 です', 'zh-TW'));
});

test('사진: 줄 언어를 글자 체계로 (타이 · 키릴 · 아랍 · 번체 · 베트남어), 내 언어 글자 점검', () => {
  assert.equal(lineLang('ข้าวผัดกุ้ง 80 บาท', 'th'), 'th');
  assert.equal(lineLang('ข้าวผัดกุ้ง', ''), 'th');
  assert.equal(lineLang('Борщ 350 ₽', 'ru'), 'ru');
  assert.equal(lineLang('Борщ', 'uk'), 'uk', '다른 키릴 문자 언어는 모델 말대로 (읽어 주기 안 됨)');
  assert.equal(lineLang('شاورما دجاج', 'ar'), 'ar');
  assert.equal(lineLang('چلو کباب', 'fa'), 'fa');
  assert.equal(lineLang('牛肉麵', 'zh-TW'), 'zh-TW');
  assert.equal(lineLang('牛肉麵', 'zh-Hant'), 'zh-TW');
  assert.equal(lineLang('牛肉面', 'zh'), 'zh');
  assert.equal(lineLang('Phở bò tái 65.000đ', 'vi'), 'vi');
  assert.equal(lineLang('Phở bò tái', ''), 'vi', '베트남어 글자로');
  assert.equal(lineLang('Crème brûlée 8,50 €', 'fr'), 'fr');
  assert.equal(lineLang('Café crème', ''), 'fr', '프랑스어 글자로');
  assert.ok(inMyScript('Phở bò', 'vi') && inMyScript('ข้าวผัด', 'th') && inMyScript('Борщ', 'ru') && inMyScript('شاورما', 'ar'));
  assert.ok(!inMyScript('Shawarma', 'ar'), '아랍어 사용자에게 라틴 문자 번역');
  assert.ok(!inMyScript('Борщ メイク', 'ru', 'Borscht'), '원문에 없는 가나');
});

test('서버 언어 정보 파일: 새 언어마다 있고, translate-core 등을 가져오지 않는다 (고리 방지)', () => {
  for (const c of NEW) {
    assert.ok(PACKS[c], c);
    const src = readFileSync(`lib/langs/${c}.mjs`, 'utf8');
    assert.doesNotMatch(src, /from '\.\.\/(translate|assist|photo|sound)-core\.mjs'/, `${c}: 고리`);
    assert.ok(existsSync(`public/js/phrases/${c}.js`), `phrases/${c}.js`);
  }
  for (const c of ['vi', 'th', 'ru', 'ar', 'fr']) assert.ok(existsSync(`public/js/read/${c}.js`), `read/${c}.js`);
});

test('글 방향(RTL): CSS는 논리 속성(왼쪽 · 오른쪽 대신 시작 · 끝)으로, 아랍어 글꼴 · 번체 글꼴 · 태국어 줄바꿈', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  const physical = css.split('\n').filter((l) => /(margin|padding)-(left|right)|text-align: (left|right)|border-(top|bottom)-(left|right)-radius/.test(l));
  assert.deepEqual(physical, [], '아랍어 화면에서 뒤집히지 않는 속성');
  assert.match(css, /:lang\(ar\) \{ font-family:/);
  assert.ok(css.indexOf(':lang(zh-TW)') > css.indexOf(':lang(zh)'), '번체 글꼴이 간체 뒤에');
  assert.match(css, /:lang\(th\) \{[^}]*word-break: normal/);
  assert.match(css, /\.seg\.langs \{ display: grid/);
  const app = readFileSync('public/js/app.js', 'utf8');
  assert.match(app, /documentElement\.dir = dirOf\(me\)/, '화면 언어가 아랍어면 dir="rtl"');
  assert.match(readFileSync('public/js/ui.js', 'utf8'), /dir: dirOf\(attrs\.lang\)/, 'lang 속성이 있는 글은 그 언어 방향');
  assert.equal(detectLang('مرحبا كيف حالك؟'), 'ar');
  assert.equal(detectLang('Здравствуйте, сколько стоит?'), 'ru');
  assert.equal(detectLang('สวัสดีครับ ราคาเท่าไหร่'), 'th');
  assert.equal(detectLang('Xin chào, cái này bao nhiêu tiền?'), 'vi');
  assert.equal(detectLang('Hünkâr Beğendi'), 'tr', 'â는 튀르키예어에도 있어서 베트남어로 보지 않는다');
  assert.equal(detectLang("Bonjour, c'est combien ?"), 'fr');
  assert.equal(detectLang('Ça coûte combien ?'), 'fr', 'ç는 튀르키예어에도 있지만 프랑스어 낱말로');
  assert.equal(detectLang('Je voudrais l’addition, s’il vous plaît.'), 'fr');
  assert.equal(detectLang('Çay lütfen'), 'tr');
  assert.equal(detectLang('Where is the hotel?'), 'en');
});
