// 언어 설정(v1.2.0): 네 언어 문구 사전 · 기본 언어 결정 · 언어 바꾸기 · 기록 쪽 가르기 · 읽는 법 규칙 · 서버 오류 코드
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGES, t, tl, setUiLang, uiLang, langName, defaultLang, startLangs, pickLanguage, defaultPartner } from '../public/js/i18n.js';
import { CODES, sideFor } from '../public/js/lang.js';
import { readingFor, needsKana, jaKanaToRomaji, koToRoman, trToHangul, jaKanaToHangul } from '../public/js/reading.js';
import { PHRASES, PHRASE_CATS, phrasesFor } from '../public/js/phrases.js';
import { serverError } from '../public/js/api.js';
import { buildMessages, aiError, validateTranslate, validateKana } from '../lib/translate-core.mjs';
import { rateLimit, checkOrigin, _resetBuckets } from '../lib/guard.mjs';

afterEach(() => { setUiLang('ko'); _resetBuckets(); });

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : /\.m?js$/.test(f) ? [p] : [];
});
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');

test('문구 사전: 다섯 언어의 키가 모두 같고, 빈 문구가 없고, 채울 자리·굵게 표시가 같다', () => {
  assert.deepEqual(Object.keys(MESSAGES), CODES);
  const keys = Object.keys(MESSAGES.ko).sort();
  assert.ok(keys.length > 150, `문구 ${keys.length}개`);
  for (const c of CODES) {
    assert.deepEqual(Object.keys(MESSAGES[c]).sort(), keys, `${c} 사전의 키`);
    for (const k of keys) {
      const s = MESSAGES[c][k];
      assert.equal(typeof s, 'string', `${c}.${k}`);
      assert.ok(s.trim(), `빈 문구: ${c}.${k}`);
      assert.equal(s, s.trim(), `앞뒤 공백: ${c}.${k}`);
      assert.equal(vars(s), vars(MESSAGES.ko[k]), `채울 자리 {…}: ${c}.${k}`);
      assert.equal(s.split('*').length, MESSAGES.ko[k].split('*').length, `*굵게*: ${c}.${k}`);
    }
  }
});

test('문구 사전: 각 언어는 제 글자로 (튀르키예어 글자 · 일본어 가나), 언어 이름 · 상대 안내는 그 언어로', () => {
  const tr = Object.values(MESSAGES.tr).join(' ');
  assert.match(tr, /[çğıöşü]/, '튀르키예어 문구에 튀르키예어 글자');
  // 일본어 문구는 (OK 같은 라틴 문자 말고는) 가나·한자로 쓴다
  for (const [k, s] of Object.entries(MESSAGES.ja)) if (!/^[A-Za-z0-9\s.()/:·→✕×{}-]+$/.test(s)) assert.match(s, /[ぁ-ゖァ-ヺ一-鿿]/, `ja.${k}`);
  assert.equal(tl('tr', 'lang.ko'), 'Korece');
  assert.equal(tl('en', 'lang.tr'), 'Turkish');
  assert.equal(tl('ja', 'lang.en'), '英語');
  assert.equal(tl('ko', 'lang.ja'), '일본어');
  assert.match(tl('tr', 'mic.partnerHint'), /Türkçe/);
  assert.match(tl('ja', 'mic.partnerHint'), /日本語/);
  // 튀르키예어는 siz 말투, 일본어는 です·ます
  assert.match(tl('tr', 'talk.noMic'), /yazın/);
  assert.match(tl('ja', 'talk.noMic'), /ください|ません/);
});

test('고른 언어로 문구를 고르고, {자리}를 채운다', () => {
  assert.equal(uiLang(), 'ko');
  assert.equal(t('tab.talk'), '대화');
  setUiLang('tr');
  assert.equal(t('tab.talk'), 'Sohbet');
  assert.equal(t('talk.ariaSpeak', { lang: langName('ko') }), 'Korece konuşun');
  setUiLang('ja');
  assert.equal(t('hist.count', { n: 3 }), '3件 · この端末にだけ保存');
  setUiLang('xx');
  assert.equal(uiLang(), 'ja', '모르는 언어는 무시');
  assert.equal(tl('en', 'no.such.key'), 'no.such.key');
});

test('화면 코드가 쓰는 문구 키는 모두 사전에 있고, 화면 코드에 한국어 문장을 직접 쓰지 않는다', () => {
  const KEY = /'((?:app|tab|lang|mic|common|talk|text|phrases|cat|hist|set|pair|ui|err|suggest|mine|share|install|photo)\.[A-Za-z0-9_]+)'/g;
  // 언어 자료(사전 i18n/ · 표현집 phrases/ · 읽는 법 read/)는 빼고 본다
  const ui = files('public/js').filter((f) => !/[\\/](i18n|reading|phrases|lang)\.js$/.test(f) && !/[\\/](i18n|phrases|read)[\\/]/.test(f));
  assert.ok(ui.length >= 12);
  let used = 0;
  for (const f of ui) {
    const src = stripComments(readFileSync(f, 'utf8'));
    for (const [, k] of src.matchAll(KEY)) { used++; assert.ok(k in MESSAGES.ko, `${f}: 사전에 없는 키 ${k}`); }
    assert.doesNotMatch(src, /[가-힣]/, `${f}: 한국어 문장은 i18n.js로`);
  }
  assert.ok(used > 120, `쓰는 키 ${used}곳`);
  for (const c of PHRASE_CATS) assert.ok(`cat.${c.id}` in MESSAGES.ko, `분류 이름 cat.${c.id}`);
  for (const c of CODES) assert.ok(`lang.${c}` in MESSAGES.ko);
});

test('서버 오류 코드마다 네 언어 문장이 있고, 화면은 오류 코드로 고른 언어 문장을 보여 준다', () => {
  const codes = new Set();
  for (const f of [...files('lib'), ...files('functions')]) for (const [, c] of readFileSync(f, 'utf8').matchAll(/code: '([a-z_]+)'/g)) codes.add(c);
  for (const c of ['quota', 'timeout', 'busy', 'failed', 'forbidden', 'rate_limited', 'empty', 'unsupported_lang']) assert.ok(codes.has(c), c);
  for (const c of codes) for (const l of CODES) assert.ok(MESSAGES[l][`err.${c}`], `${l}: err.${c}`);

  assert.equal(aiError(new Error('4006 daily free allocation')).code, 'quota');
  assert.equal(aiError(new Error('weird'), '음성 인식').code, 'failed');
  assert.equal(validateTranslate({ text: '', from: 'ko', to: 'tr' }).code, 'empty');
  assert.equal(validateTranslate({ text: 'x', from: 'ko', to: 'xx' }).code, 'unsupported_lang');
  assert.equal(validateKana({ text: 'hello' }).code, 'not_japanese');

  setUiLang('tr');
  assert.equal(serverError({ error: '오늘 무료 번역 한도를 다 썼어요.', code: 'quota' }, 503), MESSAGES.tr['err.quota']);
  assert.equal(serverError({ code: 'rate_limited', retry: 12 }, 429), 'Çok sık istek gönderildi. 12 saniye sonra tekrar deneyin.');
  assert.equal(serverError({ code: 'failed' }, 502, 'stt'), MESSAGES.tr['err.stt_failed'], '음성 인식 실패는 음성 인식 문장으로');
  assert.equal(serverError({ error: '알 수 없는 한국어 오류' }, 500), 'Sunucu hatası (500)', '모르는 오류는 한국어 문장 대신');
  setUiLang('ko');
  assert.equal(serverError({ error: '알 수 없는 한국어 오류' }, 500), '알 수 없는 한국어 오류', '한국어 화면에서는 서버 문장 그대로');
  assert.equal(serverError({}, 500), '서버 오류 (500)');
});

test('요청 제한 · 출처 확인 응답에도 오류 코드 (기다릴 초 포함)', async () => {
  const req = new Request('https://interpreter-for-koreans.pages.dev/api/translate', { method: 'POST', headers: { 'cf-connecting-ip': '7.7.7.7' } });
  for (let i = 0; i < 2; i++) assert.equal(rateLimit(req, 'x', 2, 60000, 1000 + i), null);
  const body = await rateLimit(req, 'x', 2, 60000, 2000).json();
  assert.equal(body.code, 'rate_limited');
  assert.ok(body.retry > 0);
  assert.equal((await checkOrigin(req).json()).code, 'forbidden');
});

test('처음 쓰는 사람의 기본 언어: 브라우저 언어 중 네 언어에 드는 것, 없으면 영어', () => {
  assert.equal(defaultLang(['tr-TR', 'en-US']), 'tr');
  assert.equal(defaultLang(['ko-KR']), 'ko');
  assert.equal(defaultLang(['ja']), 'ja');
  assert.equal(defaultLang(['EN-gb']), 'en');
  assert.equal(defaultLang(['de-DE', 'ja-JP', 'en']), 'ja', '앞에서부터 처음 맞는 것');
  assert.equal(defaultLang(['zh_CN', 'ko']), 'zh', '중국어 (v1.3.0)');
  assert.equal(defaultLang(['de-DE', 'fr']), 'en', '네 언어가 아니면 영어');
  assert.equal(defaultLang([]), 'en');
  assert.equal(defaultLang(undefined), 'en');
  assert.equal(defaultPartner('ko'), 'tr');
  for (const c of ['tr', 'en', 'ja']) assert.equal(defaultPartner(c), 'ko');
});

test('앱을 열 때의 언어: 처음이면 브라우저 언어, 이미 쓰던 사람(설정·기록 있음)은 한국어 그대로', () => {
  assert.deepEqual(startLangs({}, ['tr-TR']), { me: 'tr', partner: 'ko' });
  assert.deepEqual(startLangs({}, ['ja-JP']), { me: 'ja', partner: 'ko' });
  assert.deepEqual(startLangs({}, ['ko-KR']), { me: 'ko', partner: 'tr' });
  assert.deepEqual(startLangs({}, ['fr-FR']), { me: 'en', partner: 'ko' });
  assert.deepEqual(startLangs({ history: [] }, ['en-US']), { me: 'en', partner: 'ko' }, '빈 기록은 처음과 같다');
  // 이미 쓰던 사람: 브라우저가 다른 언어여도 저장된 그대로 (예전 버전 저장값은 me: ko)
  assert.deepEqual(startLangs({ settings: { me: 'ko', partner: 'en' } }, ['ja-JP']), { me: 'ko', partner: 'en' });
  assert.deepEqual(startLangs({ settings: { me: 'ko', partner: 'ja' }, history: [{ side: 'me' }] }, ['tr']), { me: 'ko', partner: 'ja' });
  assert.deepEqual(startLangs({ history: [{ side: 'me', from: 'ko', to: 'tr' }] }, ['tr']), { me: 'ko', partner: 'tr' }, '기록만 있어도 쓰던 사람');
  assert.deepEqual(startLangs({ settings: { theme: 'dark' } }, ['en']), { me: 'ko', partner: 'tr' }, '언어 설정이 없으면 한국어');
  assert.deepEqual(startLangs({ settings: { me: 'tr', partner: 'ko' } }, ['ko']), { me: 'tr', partner: 'ko' }, '골라 둔 언어 그대로');
  assert.deepEqual(startLangs({ settings: { me: 'xx', partner: 'xx' } }, ['tr']), { me: 'ko', partner: 'tr' }, '잘못된 값은 고친다');
  assert.deepEqual(startLangs({ settings: { me: 'en', partner: 'en' } }, []), { me: 'en', partner: 'ko' }, '나와 상대가 같으면 고친다');
});

test('언어 바꾸기: 상대 언어가 새 내 언어와 같아지면 서로 바꾼다', () => {
  assert.deepEqual(pickLanguage({ me: 'ko', partner: 'tr' }, 'tr'), { me: 'tr', partner: 'ko' });
  assert.deepEqual(pickLanguage({ me: 'ko', partner: 'tr' }, 'en'), { me: 'en', partner: 'tr' });
  assert.deepEqual(pickLanguage({ me: 'ja', partner: 'ko' }, 'ko'), { me: 'ko', partner: 'ja' });
  assert.deepEqual(pickLanguage({ me: 'ko', partner: 'tr' }, 'ko'), { me: 'ko', partner: 'tr' }, '같은 언어');
  assert.deepEqual(pickLanguage({ me: 'ko', partner: 'tr' }, 'xx'), { me: 'ko', partner: 'tr' }, '모르는 언어');
  for (const me of CODES) for (const partner of CODES.filter((c) => c !== me)) for (const c of CODES) {
    const r = pickLanguage({ me, partner }, c);
    assert.notEqual(r.me, r.partner, `${me}/${partner} → ${c}`);
    assert.equal(r.me, c);
  }
});

test('기록 항목의 나·상대: 언어 정보가 없으면 한국어로 보고, 내 언어를 바꾸면 말한 언어로 다시 가른다', () => {
  const old = { side: 'me', from: 'ko', to: 'tr' }; // v1.1.0 기록 (me 없음)
  assert.equal(sideFor(old, 'ko'), 'me');
  assert.equal(sideFor({ side: 'partner', from: 'tr', to: 'ko' }, 'ko'), 'partner');
  assert.equal(sideFor(old, 'tr'), 'partner', '튀르키예어로 바꾸면 한국어로 말한 쪽은 상대');
  assert.equal(sideFor({ side: 'partner', from: 'tr', to: 'ko' }, 'tr'), 'me');
  assert.equal(sideFor({ side: 'me', from: 'en', to: 'ko', me: 'en' }, 'en'), 'me');
  assert.equal(sideFor({ side: 'me', from: 'en', to: 'ko', me: 'en' }, 'ko'), 'partner');
  assert.equal(sideFor({ side: 'text', from: 'ko', to: 'en' }, 'ja'), 'text');
});

test('읽는 법: 보는 사람이 읽을 수 있는 글자로 (한국어 → 한글 · 그 밖 → 로마자, 라틴 문자끼리는 생략)', () => {
  const kana = 'えきわ どこ ですか？';
  const cases = [
    // [글, 글 언어, 보는 사람, 기대]
    ['Merhaba', 'tr', 'ko', '메르하바'],
    ['駅はどこですか？', 'ja', 'ko', '에키와 도코 데스카?'],
    ['Hello', 'en', 'ko', ''],
    ['안녕하세요', 'ko', 'ko', ''],
    ['안녕하세요', 'ko', 'tr', 'Annyeonghaseyo'],
    ['駅はどこですか？', 'ja', 'tr', 'Ekiwa doko desuka?'],
    ['Hello', 'en', 'tr', ''],
    ['안녕하세요', 'ko', 'en', 'Annyeonghaseyo'],
    ['駅はどこですか？', 'ja', 'en', 'Ekiwa doko desuka?'],
    ['Merhaba', 'tr', 'en', ''],
    ['안녕하세요', 'ko', 'ja', 'Annyeonghaseyo'],
    ['Merhaba', 'tr', 'ja', ''],
    ['Hello', 'en', 'ja', ''],
    ['駅はどこですか？', 'ja', 'ja', ''],
  ];
  for (const [text, lang, viewer, want] of cases) assert.equal(readingFor(text, lang, viewer, kana), want, `${lang} → ${viewer}`);
  assert.equal(readingFor('駅はどこですか？', 'ja', 'en'), '', '히라가나 읽기를 아직 못 받았으면 비움');
  assert.equal(readingFor('Merhaba', 'tr', 'ko'), trToHangul('Merhaba'));
  assert.equal(readingFor('감사합니다.', 'ko', 'en'), koToRoman('감사합니다.'));
  assert.equal(readingFor('x', 'ja', 'ko', 'こんにちわ'), jaKanaToHangul('こんにちわ'));
  for (const v of ['ko', 'tr', 'en']) assert.ok(needsKana('ja', v), `일본어 읽기가 필요: ${v}`);
  assert.ok(!needsKana('ja', 'ja') && !needsKana('ko', 'tr') && !needsKana('tr', 'ko'));
});

test('일본어 읽기 → 로마자 (헵번식: っ 겹자음 · ん · 장음 ā ō ū · 요음)', () => {
  const cases = {
    'こんにちわ': 'Konnichiwa', 'ありがとう ございます': 'Arigatō gozaimasu', 'すみません': 'Sumimasen',
    'きっぷお いちまい ください': 'Kippuo ichimai kudasai', 'まっちゃ': 'Matcha', 'とうきょう': 'Tōkyō',
    'めにゅーお いただけますか？': 'Menyūo itadakemasuka?', 'きんえん': "Kin'en", 'せんよう': "Sen'yō",
    'わいふぁい': 'Waifai', 'チケット': 'Chiketto', 'おおきい': 'Ōkii', 'いいえ': 'Iie', 'えいご': 'Eigo',
    'じゅうしょ': 'Jūsho', 'しちゃく': 'Shichaku', 'ぴーなっつ': 'Pīnattsu', 'はい。 いいえ。': 'Hai. Iie.',
  };
  for (const [kana, roman] of Object.entries(cases)) assert.equal(jaKanaToRomaji(kana), roman, kana);
  assert.equal(jaKanaToRomaji(''), '');
  for (const p of PHRASES) assert.match(jaKanaToRomaji(p.jaKana), /^[A-Za-zāīūēō' ]+$/, `표현집 읽기: ${p.jaKana}`);
});

test('표현집: 내 언어에 맞는 문장 ("저는 ○○ 사람이에요"·대사관은 그 언어 사용자에게만), 상대가 한국어면 "한국어를 잘 못해요"', () => {
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'tr', 'ko').includes('저는 한국 사람이에요.'));
  assert.ok(!ko('talk', 'ko', 'tr').includes('저는 한국 사람이에요.'), '튀르키예어 사용자에게 "저는 한국 사람이에요"는 안 보임');
  assert.ok(ko('talk', 'ko', 'tr').includes('저는 튀르키예 사람이에요.'));
  assert.ok(ko('talk', 'ko', 'ja').includes('저는 일본 사람이에요.'));
  assert.ok(ko('talk', 'ko', 'tr').includes('한국어를 잘 못해요.'));
  assert.ok(!ko('talk', 'tr', 'ko').includes('한국어를 잘 못해요.'));
  assert.ok(ko('help', 'ko', 'en').includes('저희 나라 대사관에 연락해 주세요.'));
  assert.ok(!ko('help', 'ko', 'en').some((s) => /한국 대사관/.test(s)));
  for (const me of CODES) for (const partner of CODES.filter((c) => c !== me)) for (const c of PHRASE_CATS) {
    const list = phrasesFor(c.id, partner, me);
    assert.ok(list.length >= 5, `${me}→${partner} ${c.id}`);
    for (const p of list) assert.ok(p[me] && p[partner]);
  }
  for (const p of PHRASES) assert.ok([].concat(p.me ?? []).every((c) => CODES.includes(c)));
});

test('말투는 번역되는 쪽 언어에만 (영어는 영향 없음)', () => {
  const sys = (from, to, formal) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.equal(sys('ko', 'en', true), sys('ko', 'en', false), '영어로 옮길 때는 말투 설정과 상관없다');
  assert.doesNotMatch(sys('ja', 'en', true), /siz|반말|존댓말|です/);
  assert.match(sys('en', 'tr', true), /siz/);
  assert.doesNotMatch(sys('en', 'tr', true), /반말|존댓말|です/);
  assert.match(sys('tr', 'ko', false), /반말/);
  assert.match(sys('tr', 'ko', true), /존댓말/);
  assert.match(sys('en', 'ja', true), /です・ます/);
  assert.match(sys('ko', 'ja', false), /タメ口/);
  assert.doesNotMatch(sys('ko', 'ja', false), /siz|sen"/);
  assert.match(sys('tr', 'en', true), /from Turkish into English/);
  assert.doesNotMatch(sys('tr', 'en', true), /Korean user/i, '한국어 사용자 전제 없음');
});

test('index.html: 언어 버튼은 오른쪽 끝(설정 뒤)에 숨겨 두고, 업데이트 알림은 저장된 언어로', () => {
  const html = readFileSync('public/index.html', 'utf8');
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(header.indexOf('id="gear"') < header.indexOf('id="lang"'), '설정 버튼 다음(오른쪽 끝)');
  assert.match(header, /<button id="lang" class="lang-btn"[^>]* hidden><\/button>/, '예전 앱 코드에서는 숨은 채로');
  const block = html.match(/var TEXT = \{([\s\S]*?)\};/)[1];
  for (const c of CODES) {
    const row = block.match(new RegExp(`'?${c}'?: \\[([^\\]]+)\\]`));
    assert.ok(row, `업데이트 알림 ${c}`);
    assert.equal(row[1].split("', '").length, 5, `${c} 문구 5개`);
  }
  assert.match(html, /localStorage\.getItem\('tercuman\.v1'\)/);
  assert.match(html, /navigator\.languages/);
  assert.match(html, /return 'en';/, '네 언어가 아니면 영어');
  // 알림의 "업데이트" 버튼 이름과 설정 화면 안내가 같은 말
  for (const c of CODES) assert.ok(MESSAGES[c]['set.updateHint'].includes(block.match(new RegExp(`'?${c}'?: \\[[^\\]]*?'[^']*', '[^']*', '([^']*)'`))[1]), `${c} 업데이트 버튼 이름`);
});

test('CSS: 좁은 화면에서도 위 막대가 넘치지 않게 (앱 이름 글자 숨김 · 언어 짝 버튼 줄어듦)', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /@media \(max-width: 419px\) \{ \.brand span \{ display: none; \}/);
  assert.match(css, /\.lang-btn \{[^}]*flex: none/);
  assert.match(css, /\.lang-btn\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.pair \{[^}]*min-width: 0/);
});
