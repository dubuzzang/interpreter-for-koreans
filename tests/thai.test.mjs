// 태국어(th, v1.6.0): 언어 정보 · 번역 지시문(성별 말끝 없음) · 결과 점검 · 받아쓰기 · 소리 표기(로마자) → 한글 · 로마자 · /api/sound(가짜 AI)
// · 숫자(낱말 · 타이 숫자 · ครึ่ง) · 답장 추천 · 요약 · 자동 감지 · 표현집 · 화면 문구 · 사진 줄
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, CODES, detectLang } from '../public/js/lang.js';
import { MESSAGES, tl, defaultLang, startLangs } from '../public/js/i18n.js';
import { PHRASES, phrasesFor, phraseSound } from '../public/js/phrases.js';
import { readingFor, needsSound, hasSound } from '../public/js/reading.js';
import { thaiSoundToHangul, thaiSoundToRoman, thaiSoundStats } from '../public/js/read/th.js';
import { packOf } from '../lib/langs/index.mjs';
import { buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate, sttLanguage, MODELS } from '../lib/translate-core.mjs';
import { SOUND_SPECS, validateSound } from '../lib/sound-core.mjs';
import { numberMentions, inventsNumber, toAscii, buildSuggestMessages, cleanSuggestions, validateSuggest, cleanSummary } from '../lib/assist-core.mjs';
import { buildPhotoMessages, cleanPhoto, lineLang } from '../lib/photo-core.mjs';
import { onRequestPost as soundApi } from '../functions/api/sound.js';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const values = (text) => numberMentions(text, 'th').flatMap((m) => m.alts);
const spec = SOUND_SPECS.th;

test('태국어 언어 정보: th-TH · 모든 언어와 짝 · 브라우저 언어 · Whisper th', () => {
  const { code, native, flag, bcp47, short, script, name } = LANGS.th;
  assert.deepEqual({ code, native, flag, bcp47, short, script, name }, { code: 'th', native: 'ภาษาไทย', flag: '🇹🇭', bcp47: 'th-TH', short: 'TH', script: 'Thai', name: 'Thai' });
  for (const c of CODES.filter((x) => x !== 'th')) {
    assert.ok(validateTranslate({ text: 'สวัสดี', from: 'th', to: c }).value, `th → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'th' }).value, `${c} → th`);
  }
  assert.equal(defaultLang(['th-TH', 'en-US']), 'th');
  assert.deepEqual(startLangs({}, ['th']), { me: 'th', partner: 'ko' });
  assert.equal(sttLanguage('th'), 'th');
});

test('번역 지시문: 타이 문자로 · 성별로 갈리는 말끝(ครับ/ค่ะ) · "나"(ผม/ดิฉัน)를 넣지 않게 · 반말은 เรา', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.match(sys('ko', 'th'), /from Korean into Thai/);
  assert.match(sys('ko', 'th'), /Thai must be written in Thai script \(no romanization\)/);
  assert.match(sys('ko', 'th'), /do NOT add the gender-specific particles ครับ \/ ค่ะ \/ คะ/);
  assert.match(sys('ko', 'th'), /ผม \/ ดิฉัน/);
  assert.match(sys('ko', 'th', false), /casual, friendly Thai.*เรา/);
  assert.match(sys('ko', 'th', false), /without ครับ \/ ค่ะ \/ คะ/);
  assert.match(sys('th', 'ko'), /from Thai into Korean/);
  assert.doesNotMatch(sys('th', 'ko'), /ครับ/, '말투 규칙은 옮길 언어 것만');
  assert.equal(sys('th', 'en', true), sys('th', 'en', false));
  // 답장 추천 지시문에도 같은 말투 (상대가 태국어)
  const turns = [{ side: 'partner', from: 'th', to: 'ko', text: 'ราคาเท่าไหร่', translation: '얼마예요?' }];
  assert.match(buildSuggestMessages({ me: 'ko', partner: 'th', turns })[0].content, /Thai: Use polite Thai that fits any speaker/);
});

test('결과 점검: 타이 문자가 있어야 하고 다른 글자가 섞이면 안 됨 · 이름표 정리', () => {
  assert.ok(looksValid('อันนี้ราคาเท่าไหร่', { text: '이거 얼마예요?', from: 'ko', to: 'th' }));
  assert.ok(!looksValid('An ni ra-kha thao-rai', { text: '이거 얼마예요?', from: 'ko', to: 'th' }), '로마자만');
  assert.ok(!looksValid('ราคา いくら', { text: '이거 얼마예요?', from: 'ko', to: 'th' }), '가나가 섞임');
  assert.ok(!looksValid('ราคา Сколько', { text: 'Сколько?', from: 'ru', to: 'th' }), '키릴 문자가 남음');
  assert.ok(looksValid('How much is this?', { text: 'อันนี้ราคาเท่าไหร่', from: 'th', to: 'en' }));
  assert.ok(!looksValid('How much is ราคา?', { text: 'อันนี้ราคาเท่าไหร่', from: 'th', to: 'en' }), '타이 문자가 남음');
  assert.ok(looksValid('ราคา 150 บาท iPhone', { text: 'iPhone 150바트', from: 'ko', to: 'th' }), '상표 · 숫자는 괜찮다');
  assert.equal(cleanOutput('ภาษาไทย: ราคาเท่าไหร่'), 'ราคาเท่าไหร่');
  assert.equal(cleanOutput('คำแปล: ขอบคุณ'), 'ขอบคุณ');
  assert.equal(cleanOutput('Thai: สวัสดี'), 'สวัสดี');
});

test('받아쓰기: Whisper에 th(첫 문장 없음), 조용한 녹음에서 지어내는 태국어 영상 끝인사는 버린다', async () => {
  for (const s of ['ขอบคุณที่รับชมค่ะ', 'ขอบคุณที่ติดตามชมครับ', 'อย่าลืมกดติดตามและกดไลก์ด้วยนะครับ', 'ซับไตเติ้ลโดย Amara.org', 'แล้วพบกันใหม่ในตอนหน้า']) assert.equal(cleanTranscript(s), '', s);
  for (const s of ['ราคาเท่าไหร่ครับ', 'ขอบคุณครับ', 'แล้วพบกันใหม่นะ', 'ส่งพรุ่งนี้ได้ไหม']) assert.equal(cleanTranscript(s), s, s);
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' ราคาเท่าไหร่ ' }; } };
  const req = new Request(`${ORIGIN}/api/stt?lang=th`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '3.3.3.4' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req, env: { AI } })).json(), { text: 'ราคาเท่าไหร่' });
  assert.equal(calls[0].language, 'th');
  assert.equal(calls[0].initial_prompt, undefined);
});

test('읽는 법: 소리 표기(RTGS + j · ɔ) → 한글 — 국립국어원 대조표 · 잘 알려진 표기와 같게', () => {
  const cases = {
    'krung-thep': '끄룽텝', 'phu-ket': '푸껫', 'chiang-mai': '치앙마이', 'khɔp-khun': '컵쿤', 'sa-wat-di': '사왓디', 'tom-yam-kung': '똠얌꿍',
    'phat-tha-ya': '파타야', 'a-yut-tha-ya': '아유타야', 'khao-san': '카오산', 'jao-phra-ya': '짜오프라야', 'su-khum-wit': '수쿰윗', 'si-lom': '실롬',
    'som-tam': '솜땀', 'phat thai': '팟 타이', 'kao-li': '까올리', 'mai pen rai': '마이 뻰 라이', 'a-rɔi mak': '아러이 막', 'khɔ-thot': '커톳',
    'ngoen': '응언', 'pla': '쁠라', 'khwa': '콰', 'kwa': '꽈', 'phleng': '플렝', 'chuai duai!': '추아이 두아이!', 'muea-rai': '므아라이',
    'thao-rai': '타오라이', 'yoe': '여', 'wiat-nam': '위앗남', 'lot ra-kha nɔi dai mai': '롯 라카 너이 다이 마이',
  };
  for (const [sound, ko] of Object.entries(cases)) assert.equal(thaiSoundToHangul(sound), ko, sound);
  // 무기음 / 유기음이 갈린다 (RTGS의 ch 하나로는 จ/ช를 가를 수 없어서 จ는 j)
  assert.deepEqual(['kai', 'khai', 'tai', 'thai', 'pai', 'phai', 'jai', 'chai'].map(thaiSoundToHangul), ['까이', '카이', '따이', '타이', '빠이', '파이', '짜이', '차이']);
  // 모델이 다른 표기를 섞어도 (영어식 sawasdee · 성조 부호 · 긴 모음 겹쳐 쓰기 · or = ɔ · 대문자)
  assert.equal(thaiSoundToHangul('sawasdee khrab'), '사왓디 크랍');
  assert.equal(thaiSoundToHangul('sà-wàt-dii khráp'), '사왓디 크랍');
  assert.equal(thaiSoundToHangul('khorp-khun'), '컵쿤');
  assert.equal(thaiSoundToHangul('Krung-Thep'), '끄룽텝');
  assert.equal(thaiSoundToHangul('sawatdi, khɔpkhun'), '사왓디, 컵쿤', '하이픈 없이 붙여 써도');
  assert.equal(thaiSoundToHangul('iPhone 15 ra-kha thao-rai?'), 'iPhone 15 라카 타오라이?', '상표 · 숫자 · 구두점은 그대로');
  // 로마자: ɔ는 RTGS처럼 o, 문장 첫 글자 대문자
  assert.equal(thaiSoundToRoman('khɔp-khun mak. sa-wat-di'), 'Khop-khun mak. Sa-wat-di');
  assert.equal(thaiSoundToRoman('iPhone 15 ra-kha'), 'iPhone 15 ra-kha');
  // readingFor: 한국어 사용자 → 한글, 그 밖 → 로마자, 태국어 사용자 · 소리 표기 없음 → 생략
  assert.equal(readingFor('ขอบคุณ', 'th', 'ko', 'khɔp-khun'), '컵쿤');
  for (const v of ['en', 'tr', 'ja', 'zh', 'ru', 'ar', 'fr']) assert.equal(readingFor('ขอบคุณ', 'th', v, 'khɔp-khun'), 'Khop-khun', v);
  assert.equal(readingFor('ขอบคุณ', 'th', 'th', 'khɔp-khun'), '');
  assert.equal(readingFor('ขอบคุณ', 'th', 'ko'), '', '소리 표기를 아직 못 받았으면 비움');
  assert.ok(hasSound('th') && needsSound('th', 'ko') && needsSound('th', 'en') && !needsSound('th', 'th'));
  // 태국어 사용자에게 다른 언어는 로마자
  assert.equal(readingFor('안녕하세요', 'ko', 'th'), 'Annyeonghaseyo');
  assert.equal(readingFor('こんにちは', 'ja', 'th', 'こんにちわ'), 'Konnichiwa');
  assert.equal(readingFor('你好', 'zh', 'th', 'nǐ hǎo'), 'Nǐ hǎo');
  assert.equal(readingFor('Спасибо', 'ru', 'th'), 'Spasibo');
  assert.equal(readingFor('Hello', 'en', 'th'), '');
});

test('소리 표기 서버: 지시문 · 정리(로마자만) · 음절 수 점검', () => {
  assert.ok(spec, '/api/sound에 태국어 규칙이 있다');
  assert.equal(validateSound({ text: 'สวัสดี', lang: 'th' }).value.lang, 'th');
  assert.equal(validateSound({ text: 'hello', lang: 'th' }).code, 'unsupported_lang', '타이 문자가 없는 글');
  const sys = spec.messages('สวัสดี')[0].content;
  assert.match(sys, /RTGS/);
  assert.match(sys, /write จ as j/);
  assert.match(sys, /vowel ɔ/);
  assert.match(sys, /Hyphens between the syllables/);
  assert.match(sys, /No tone marks/);
  const clean = (raw, text = 'สวัสดี') => spec.clean(raw, text);
  assert.equal(clean('Romanization: sà-wàt-dii khráp'), 'sa-wat-dii khrap', '이름표 · 성조 부호 빼기');
  assert.equal(clean('"khɔp-khun mak"'), 'khɔp-khun mak');
  assert.equal(clean('Thai: sa-wat-di'), 'sa-wat-di');
  assert.equal(clean('sa-wat-di (สวัสดี)'), 'sa-wat-di', '덧붙인 원문 빼기');
  assert.equal(clean('kʰɔ̀ɔp kʰun'.replace(/ʰ/g, 'h')), 'khɔɔp khun');
  assert.equal(clean('sa-wat-di ๑๕๐ บาท'), '', '타이 문자가 남으면 믿지 않는다');
  assert.equal(clean('สวัสดี'), '');
  assert.equal(clean('Hello, how are you?'), '', '영어로 옮긴 답 (태국어 소리로 읽히지 않음)');
  assert.equal(clean('sa-wat-di\n\nNote: this is RTGS.'), 'sa-wat-di', '덧붙인 설명 줄');
  assert.ok(spec.matches('sa-wat-di', 'สวัสดี'));
  assert.ok(spec.matches('chuai phut cha-cha nɔi', 'ช่วยพูดช้า ๆ หน่อย'), 'ๆ는 앞 낱말을 되풀이');
  assert.ok(spec.matches('khao-phat kung 80 bat', 'ข้าวผัดกุ้ง 80 บาท'));
  assert.ok(!spec.matches('sa', 'สวัสดี ยินดีที่ได้รู้จัก ขอบคุณมาก ราคาเท่าไหร่'), '뒤를 빼먹음');
  assert.ok(!spec.matches('sa-wat-di sa-wat-di sa-wat-di sa-wat-di', 'สวัสดี'), '덧붙임');
  assert.equal(clean('Hello, nice to meet you.'), '', 'hello · to · meet 처럼 태국어 음절 같은 영어 낱말이 섞여도');
  assert.equal(clean('iPhone 15 ra-kha thao-rai', 'iPhone 15 ราคาเท่าไหร่'), 'iPhone 15 ra-kha thao-rai', '상표는 따지지 않는다');
  assert.equal(clean('Samsung ra-kha', 'Samsung ราคา'), 'Samsung ra-kha', '원문에 있는 라틴 낱말도');
  assert.equal(clean('sawasdee khrab'), 'sawasdee khrab', '영어식 표기도 받는다 (한글은 화면이 넓게 읽음)');
  assert.deepEqual(thaiSoundStats('sa-wat-di iPhone'), { words: 1, parsed: 1, syllables: 3 }, '상표는 세지 않는다');
  assert.deepEqual(thaiSoundStats('how are you'), { words: 3, parsed: 1, syllables: 2 }, 'are는 a-re로 읽혀서 서버가 흔한 영어 낱말을 따로 센다');
  assert.equal(clean('how are you'), '');
});

test('/api/sound 태국어 (가짜 AI): 쓸 수 없는 답이면 다음 모델로, 음절 수가 안 맞아도 둘 다면 처음 답이라도', async () => {
  const req = (body) => new Request(`${ORIGIN}/api/sound`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '6.6.6.6' }, body: JSON.stringify(body) });
  let calls = [];
  let AI = { run: async (model, input) => { calls.push({ model, input }); return calls.length === 1 ? { response: 'สวัสดีครับ' } : { response: 'Sa-wat-di khrap' }; } };
  let data = await (await soundApi({ request: req({ text: 'สวัสดีครับ', lang: 'th' }), env: { AI } })).json();
  assert.equal(data.sound, 'Sa-wat-di khrap');
  assert.equal(data.model, MODELS[1].id, '첫 답은 타이 문자 그대로라 다음 모델');
  assert.equal(calls[0].input.temperature, 0);
  assert.match(calls[0].input.messages[0].content, /RTGS/);
  assert.equal(calls[0].input.messages[1].content, 'สวัสดีครับ');
  assert.equal(thaiSoundToHangul(data.sound), '사왓디 크랍');
  calls = [];
  AI = { run: async () => { calls.push(1); return { response: 'sa' }; } };
  data = await (await soundApi({ request: req({ text: 'สวัสดี ยินดีที่ได้รู้จัก ขอบคุณมาก ราคาเท่าไหร่', lang: 'th' }), env: { AI } })).json();
  assert.equal(data.sound, 'sa', '둘 다 음절 수가 모자라면 처음 답');
  assert.equal(calls.length, 2);
  assert.equal((await soundApi({ request: req({ text: 'hello', lang: 'th' }), env: { AI } })).status, 400);
  const english = { run: async () => ({ response: 'Hello, nice to meet you.' }) };
  assert.equal((await soundApi({ request: req({ text: 'สวัสดี', lang: 'th' }), env: { AI: english } })).status, 502, '쓸 만한 답이 없음');
});

test('숫자: 태국어 수 낱말(띄어 쓰지 않아도) · 타이 숫자 · พันห้า · ครึ่ง · 다른 낱말 속 같은 글자는 숫자가 아님', () => {
  assert.equal(toAscii('๑๕๐ บาท'), '150 บาท');
  const cases = {
    'สองร้อยห้าสิบบาท': [250], 'ราคา ๑๕๐ บาท': [150], '150 บาท': [150], 'ซื้อสองชิ้น': [2], 'เอาสอง': [2], 'ยี่สิบเอ็ดชิ้น': [21],
    'หนึ่งร้อยห้าสิบบาท': [150], 'สามหมื่นบาท': [30000], 'สองล้านห้าแสน': [2500000], 'สิบชิ้น': [10], 'ร้อยชิ้น': [100],
    'สองกิโลครึ่ง': [2.5], 'พันครึ่ง': [1500], 'ใช้เวลาชั่วโมงครึ่ง': [1.5], '1.5 ล้านบาท': [1500000], '2 กิโลครึ่ง': [2.5], 'สองจุดห้า': [2.5],
    'สามสี่วัน': [3, 4], 'สามารถส่งได้': [], 'ไปห้างสรรพสินค้า': [], 'ห้ามสูบบุหรี่': [], 'นั่งเก้าอี้': [], 'แสนดี': [], 'ยี่ห้อนี้': [], 'สามี': [], 'สี่แยก': [], 'โกหก': [],
  };
  for (const [text, want] of Object.entries(cases)) assert.deepEqual(values(text), want, text);
  assert.deepEqual(numberMentions('พันห้า', 'th')[0].alts, [1005, 1500], 'พันห้า = 1500 (말로 줄인 것)');
  assert.deepEqual(numberMentions('หนึ่งร้อยเอ็ด', 'th')[0].alts.slice(0, 1), [101]);
  const one = numberMentions('ขอตั๋วหนึ่งใบ', 'th');
  assert.deepEqual(one, [{ alts: [1], word: true }], 'หนึ่ง은 낱말로 쓴 1');
  assert.ok(!inventsNumber('ขอตั๋วหนึ่งใบ', 'th', new Set()), '낱말로 쓴 1은 지어낸 숫자로 보지 않는다');
  assert.ok(inventsNumber('ราคาสามร้อยบาท', 'th', new Set([250])));
});

test('답장 추천 · 합의 요약: 태국어 수 낱말도 대화에 나온 숫자로 맞추고, 지어낸 숫자 · 글자가 틀린 답은 버린다', () => {
  const turns = [
    { side: 'me', from: 'ko', to: 'th', text: '단가가 얼마예요? 100개 사면요?', translation: 'ราคาต่อชิ้นเท่าไหร่ ถ้าซื้อ 100 ชิ้น' },
    { side: 'partner', from: 'th', to: 'ko', text: 'ชิ้นละสองร้อยห้าสิบบาท ถ้าซื้อร้อยชิ้นลดเหลือสองร้อยบาท ส่งภายในสามวัน', translation: '개당 250바트, 100개 사면 200바트로 깎아 드려요. 3일 안에 보내요.' },
  ];
  const v = validateSuggest({ me: 'ko', partner: 'th', turns }).value;
  const raw = JSON.stringify([
    { ko: '좋아요, 100개 살게요.', th: 'ตกลง ซื้อร้อยชิ้น' },
    { ko: '150개면 얼마예요?', th: 'ถ้าซื้อร้อยห้าสิบชิ้นราคาเท่าไหร่' },     // 150은 대화에 없음
    { ko: '개당 200바트 맞죠?', th: 'ชิ้นละ 200 บาทใช่ไหม' },
    { ko: '좋아요.', th: 'Okay' },                                             // 태국어가 아님
    { ko: '이틀 안에 보내 주세요.', th: 'ช่วยส่งภายในสองวัน' },                 // 2는 대화에 없음
  ]);
  assert.deepEqual(cleanSuggestions(raw, v), [
    { me: '좋아요, 100개 살게요.', partner: 'ตกลง ซื้อร้อยชิ้น' },
    { me: '개당 200바트 맞죠?', partner: 'ชิ้นละ 200 บาทใช่ไหม' },
  ]);
  const summary = cleanSummary({
    price: { ko: '개당 200바트', th: 'ชิ้นละสองร้อยบาท' },
    quantity: { ko: '100개', th: 'ร้อยชิ้น' },
    delivery: { ko: '', th: 'ไม่ระบุ' },
    other: { ko: '샘플 5개 무료', th: 'ตัวอย่างฟรีห้าชิ้น' },           // 지어낸 숫자 → 칸을 비운다
  }, { me: 'ko', partner: 'th', turns });
  assert.deepEqual(summary.fields.price, { me: '개당 200바트', partner: 'ชิ้นละสองร้อยบาท' });
  assert.deepEqual(summary.fields.quantity, { me: '100개', partner: 'ร้อยชิ้น' });
  assert.deepEqual(summary.fields.delivery, { me: '', partner: '' }, '"ไม่ระบุ"(명시 안 됨)는 빈칸');
  assert.deepEqual(summary.fields.other, { me: '', partner: '' });
  assert.ok(packOf('th').none.test('ไม่มี'));
});

test('자동 감지: 타이 문자가 많으면 th (상표 · 숫자가 섞여도)', () => {
  for (const s of ['ราคาเท่าไหร่', 'สวัสดีครับ', 'ขอบคุณค่ะ', 'iPhone 15 ราคาเท่าไหร่', 'ราคา ๑๕๐ บาท', 'ส่งไปเกาหลีได้ไหม']) assert.equal(detectLang(s, 'ko'), 'th', s);
  assert.equal(detectLang('Hello', 'th'), 'en');
  assert.equal(detectLang('안녕하세요', 'th'), 'ko');
  assert.equal(lineLang('ข้าวผัดกุ้ง 80 บาท', ''), 'th');
});

test('표현집: 모든 문장에 태국어 + 로마자 소리 표기 — 성별 말끝 없음, 소리 표기가 모두 태국어 음절로 읽히고 길이가 맞다', () => {
  for (const p of PHRASES) {
    assert.match(p.th, /[฀-๿]/, p.ko);
    assert.doesNotMatch(p.th, /ครับ|ค่ะ|คะ|ผม|ดิฉัน/, `성별로 갈리는 말: ${p.th}`);
    assert.doesNotMatch(p.th, /[A-Za-z가-힣]/, p.th);
    const sound = phraseSound(p, 'th');
    assert.match(sound, /^[a-zɔ -]+!?$/, `소리 표기 (소문자 · ɔ · - · 띄어쓰기): ${sound}`);
    const st = thaiSoundStats(sound);
    assert.equal(st.parsed, st.words, `모든 낱말이 태국어 음절로: ${sound}`);
    assert.ok(packOf('th').sound.matches(sound, p.th), `음절 수: ${p.th} ${sound}`);
    assert.match(readingFor(p.th, 'th', 'ko', sound), /^[가-힣 !]+$/, `한글 발음: ${sound}`);
    assert.match(readingFor(p.th, 'th', 'en', sound), /^[A-Z][a-z -]*!?$/, `로마자: ${sound}`);
  }
  const byKo = (ko) => PHRASES.find((p) => p.ko === ko);
  assert.equal(readingFor(byKo('감사합니다.').th, 'th', 'ko', byKo('감사합니다.').sound.th), '컵쿤');
  assert.equal(readingFor(byKo('안녕하세요.').th, 'th', 'ko', byKo('안녕하세요.').sound.th), '사왓디');
  assert.equal(readingFor(byKo('정말 맛있어요.').th, 'th', 'ko', byKo('정말 맛있어요.').sound.th), '아러이 막');
  assert.equal(readingFor(byKo('괜찮아요.').th, 'th', 'en', byKo('괜찮아요.').sound.th), 'Mai pen rai');
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'th', 'ko').includes('태국어를 잘 못해요.'));
  assert.ok(ko('talk', 'ko', 'th').includes('저는 태국 사람이에요.'));
  assert.ok(ko('help', 'ko', 'th').includes('태국 대사관에 연락해 주세요.'));
  assert.ok(ko('talk', 'th', 'fr').includes('저는 프랑스어를 해요.'));
  assert.equal(byKo('저는 프랑스어를 해요.').th, 'พูดภาษาฝรั่งเศสได้');
});

test('화면 문구(태국어): 타이 문자로 · ครับ/ค่ะ 없이 · 상대 안내 · 업데이트 버튼 · 말투 · 앱 정보(11개 언어)', () => {
  for (const [k, s] of Object.entries(MESSAGES.th)) {
    if (!/^[A-Za-z0-9\s.()/:·→✕×{}-]+$/.test(s)) assert.match(s, /[฀-๿]/, `th.${k}`);
    if (k !== 'set.toneHint') assert.doesNotMatch(s, /ครับ|ค่ะ|ผม|ดิฉัน/, `th.${k}`);
  }
  assert.equal(tl('th', 'mic.partnerHint'), 'กดปุ่มด้านขวาแล้วพูดภาษาไทย');
  assert.match(tl('th', 'set.updateHint'), /อัปเดต/);
  assert.match(tl('th', 'set.toneHint'), /您/);
  assert.match(tl('th', 'set.toneHint'), /ครับ\/ค่ะ/, '태국어로 옮길 때 말끝을 넣지 않는다고 알린다');
  assert.match(tl('th', 'set.about'), /11 ภาษา.*จีน.*ฝรั่งเศส/);
  assert.match(tl('th', 'set.voiceSample'), /^สวัสดี/);
  assert.match(tl('th', 'err.paused'), /\{time\}/);
  assert.equal(tl('th', 'lang.ko'), 'ภาษาเกาหลี');
  assert.equal(tl('th', 'lang.fr'), 'ภาษาฝรั่งเศส');
  assert.equal(tl('ko', 'lang.th'), '태국어');
  assert.equal(tl('th', 'talk.ariaSpeak', { lang: tl('th', 'lang.th') }), 'พูดภาษาไทย');
});

test('사진: 태국어 줄 — 줄 언어 · 로마자 읽기(한글은 화면이) · 번역 점검, 태국어 사용자에게는 태국어로 (가짜 AI 답)', () => {
  assert.match(buildPhotoMessages({ me: 'ko' }, 'x')[0].content, /Thai → romanization by sound/);
  assert.match(buildPhotoMessages({ me: 'ru' }, 'x')[0].content, /Thai → romanization/);
  assert.doesNotMatch(buildPhotoMessages({ me: 'th' }, 'x')[0].content, /Thai → romanization/, '태국어 사용자에게 태국어 읽기는 필요 없다');
  const menu = {
    lines: [
      { text: 'ข้าวผัดกุ้ง 80 บาท', lang: 'th', tr: '새우 볶음밥 80바트', read: 'khao-phat kung 80 bat' },
      { text: 'ต้มยำกุ้ง ๑๕๐ บาท', lang: 'th', tr: '똠얌꿍 150바트', read: 'tom-yam-kung 150 bat' },
      { text: 'ส้มตำ', lang: 'th', tr: '솜땀', read: 'ส้มตำ' },                         // 읽기 자리에 타이 문자
      { text: 'ผัดไทย 60 บาท', lang: 'th', tr: '팟타이 90바트', read: 'phat thai 60 bat' }, // 지어낸 가격
      { text: 'ชาเย็น', tr: '타이 아이스티', read: 'cha-yen' },                            // lang 없음 → 글자로
    ],
    summary: '태국 식당 메뉴로, 새우 볶음밥이 80바트예요.',
  };
  const ko = cleanPhoto(menu, { me: 'ko' });
  assert.deepEqual(ko.lines[0], { text: 'ข้าวผัดกุ้ง 80 บาท', lang: 'th', tr: '새우 볶음밥 80바트', read: 'khao-phat kung 80 bat' });
  assert.equal(readingFor(ko.lines[0].text, 'th', 'ko', ko.lines[0].read), '카오팟 꿍 80 밧');
  assert.equal(ko.lines[1].tr, '똠얌꿍 150바트', '타이 숫자 ๑๕๐ = 150');
  assert.equal(readingFor(ko.lines[1].text, 'th', 'ko', ko.lines[1].read), '똠얌꿍 150 밧');
  assert.equal(ko.lines[2].read, '', '타이 문자로 준 읽기는 버림');
  assert.equal(ko.lines[3].check, 'number');
  assert.equal(ko.lines[3].tr, '');
  assert.equal(ko.lines[4].lang, 'th');
  assert.equal(ko.lines[4].read, 'cha-yen');
  assert.equal(ko.summary, menu.summary);
  const en = cleanPhoto(menu, { me: 'en' });
  assert.equal(en.lines[0].read, 'khao-phat kung 80 bat');
  assert.equal(readingFor(en.lines[0].text, 'th', 'en', en.lines[0].read), 'Khao-phat kung 80 bat');
  // 태국어 사용자: 중국어 상품 페이지를 태국어로 (병음은 받고, 숫자 · 글자 점검)
  const page = cleanPhoto({
    lines: [
      { text: '原价 ¥129', lang: 'zh', tr: 'ราคาเดิม ¥129', read: 'Yuánjià ¥129' },
      { text: '买2送1', lang: 'zh', tr: 'ซื้อ 2 แถม 1' },
      { text: '限时三天', lang: 'zh', tr: 'จำกัดเวลาสามวัน', read: 'xiànshí sān tiān' },
      { text: '券后 ¥89', lang: 'zh', tr: 'หลังใช้คูปอง ¥99' },
      { text: '正品保证', lang: 'zh', tr: 'Genuine guaranteed' },
      { text: 'ข้าวผัด', lang: 'th', tr: 'ข้าวผัด', read: 'khao-phat' },
    ],
    summary: 'หน้าสินค้าจากจีน ราคาเดิม 129 หยวน',
  }, { me: 'th' });
  assert.equal(page.lines[0].tr, 'ราคาเดิม ¥129');
  assert.equal(page.lines[0].read, 'Yuánjià 129', '태국어 사용자에게 중국어는 병음');
  assert.equal(page.lines[1].tr, 'ซื้อ 2 แถม 1');
  assert.equal(page.lines[2].tr, 'จำกัดเวลาสามวัน', '三 = สาม = 3');
  assert.equal(page.lines[3].check, 'number');
  assert.equal(page.lines[4].check, 'lang', '태국어 사용자에게 영어 번역');
  assert.deepEqual(page.lines[5], { text: 'ข้าวผัด', lang: 'th', tr: '', read: '' }, '이미 내 언어');
  assert.equal(page.summary, 'หน้าสินค้าจากจีน ราคาเดิม 129 หยวน');
});

test('성별 말끝 지우기 (2026-10-12 진짜 AI가 지시와 달리 "…ได้ไหมคะ"를 붙임): 번역 · 답장 추천 모두, 낱말 속 글자 · 말끝뿐인 답은 그대로', async () => {
  const { tidyOutput } = await import('../lib/translate-core.mjs');
  const { onRequestPost: translateApi } = await import('../functions/api/translate.js');
  assert.equal(tidyOutput('ช่วยส่งตัวอย่างมาให้ก่อนได้ไหมคะ แล้วการจัดส่งใช้เวลากี่วันคะ', 'th'), 'ช่วยส่งตัวอย่างมาให้ก่อนได้ไหม แล้วการจัดส่งใช้เวลากี่วัน');
  assert.equal(tidyOutput('ขอบคุณครับ', 'th'), 'ขอบคุณ');
  assert.equal(tidyOutput('ได้ค่ะ, 200 บาทนะคะ', 'th'), 'ได้, 200 บาทนะ');
  assert.equal(tidyOutput('คะแนนดีมาก', 'th'), 'คะแนนดีมาก', '낱말 속 คะ는 그대로');
  assert.equal(tidyOutput('ค่ะ', 'th'), 'ค่ะ', '지우면 아무것도 안 남으면 그대로');
  assert.equal(tidyOutput('네, 감사합니다.', 'ko'), '네, 감사합니다.', '다른 언어는 그대로');
  const req = new Request(`${ORIGIN}/api/translate`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '5.5.5.5' }, body: JSON.stringify({ text: '샘플 먼저 보내 주실 수 있어요?', from: 'ko', to: 'th' }) });
  const AI = { run: async () => ({ response: 'ช่วยส่งตัวอย่างมาให้ก่อนได้ไหมคะ' }) };
  assert.equal((await (await translateApi({ request: req, env: { AI } })).json()).text, 'ช่วยส่งตัวอย่างมาให้ก่อนได้ไหม');
  const turns = [{ side: 'partner', from: 'th', to: 'ko', text: 'ชิ้นละ 250 บาท', translation: '개당 250바트예요.' }];
  const s = cleanSuggestions(JSON.stringify([{ ko: '좀 생각해 볼게요.', th: 'ขอคิดดูก่อนครับ' }]), { me: 'ko', partner: 'th', turns });
  assert.equal(s[0]?.partner, 'ขอคิดดูก่อน');
});
