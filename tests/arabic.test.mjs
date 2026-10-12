// 아랍어(v1.6.0): 언어 정보 · 번역 지시문 · 결과 점검 · 받아쓰기 · 읽는 법(로마자 → 한글) · /api/sound · 숫자 · 자동 감지 ·
// 표현집 · 화면 문구 · 사진 줄 · 오른쪽→왼쪽(RTL) 화면(공유 글 방향 표시 · CSS · h()의 dir · 화살표) · 목소리
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGS, CODES, detectLang, isRtl } from '../public/js/lang.js';
import { MESSAGES, tl, setUiLang, defaultLang, startLangs } from '../public/js/i18n.js';
import { readingFor, needsSound, hasSound, READERS } from '../public/js/reading.js';
import { arToHangul, arRoman, normRoman, arabicWordCount, romanWordCount } from '../public/js/read/ar.js';
import { PHRASES, phrasesFor, phraseSound } from '../public/js/phrases.js';
import { buildShareText } from '../public/js/share.js';
import { lineText, allText } from '../public/js/photo.js';
import { arrow, fmtDate, h } from '../public/js/ui.js';
import { buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate, sttLanguage } from '../lib/translate-core.mjs';
import { numberMentions, cleanSuggestions, cleanSummary, validateSuggest, validateSummary, toAscii } from '../lib/assist-core.mjs';
import { cleanPhoto, buildPhotoMessages, cleanRead, lineLang } from '../lib/photo-core.mjs';
import { SOUND_SPECS, validateSound } from '../lib/sound-core.mjs';
import ar, { cleanArabicSound, arabicSoundMatches } from '../lib/langs/ar.mjs';
import { onRequestPost as soundApi } from '../functions/api/sound.js';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';

beforeEach(() => { _resetBuckets(); setUiLang('ko'); });
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const post = (path, body, ip = '5.5.5.5') => new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
const fakeAI = (fn) => ({ calls: [], async run(model, input) { this.calls.push({ model, input }); return fn(model, input, this.calls.length); } });
const values = (text, lang = 'ar') => numberMentions(text, lang).flatMap((m) => m.alts[0]).sort((a, b) => a - b);
const RLM = '‏', LRM = '‎';

test('아랍어 언어 정보: ar-SA · 아랍 문자 · 오른쪽에서 왼쪽 · 모든 언어와 짝', () => {
  const { code, native, flag, bcp47, short, script, dir } = LANGS.ar;
  assert.deepEqual({ code, native, flag, bcp47, short, script, dir }, { code: 'ar', native: 'العربية', flag: '🇸🇦', bcp47: 'ar-SA', short: 'AR', script: 'Arab', dir: 'rtl' });
  assert.ok(isRtl('ar') && CODES.filter((c) => c !== 'ar').every((c) => !isRtl(c)));
  for (const c of CODES.filter((x) => x !== 'ar')) {
    assert.ok(validateTranslate({ text: 'مرحبا', from: 'ar', to: c }).value, `ar → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'ar' }).value, `${c} → ar`);
  }
  assert.equal(defaultLang(['ar-EG', 'en']), 'ar');
  assert.equal(defaultLang(['ar-MA']), 'ar', '어느 아랍 나라든');
  assert.deepEqual(startLangs({}, ['ar-SA']), { me: 'ar', partner: 'ko' });
});

test('번역 지시문: 쉬운 표준 아랍어(방언 아님) · 성별을 모르는 2인칭 · 아랍 문자 · 숫자 그대로', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  const s = sys('ko', 'ar');
  assert.match(s, /from Korean into Arabic/);
  assert.match(s, /Modern Standard Arabic/);
  assert.match(s, /no dialect/);
  assert.match(s, /gender is unknown/);
  assert.match(s, /masculine singular/);
  assert.match(s, /Arabic script without full vowel marks/);
  assert.match(s, /15, not ١٥/);
  assert.notEqual(sys('ko', 'ar', true), sys('ko', 'ar', false), '말투 설정이 아랍어에 반영된다');
  assert.match(sys('ko', 'ar', false), /friendly Modern Standard Arabic/);
  assert.match(sys('ar', 'ko'), /from Arabic into Korean/);
  assert.match(sys('ar', 'ko'), /존댓말/);
  assert.doesNotMatch(sys('ar', 'ko'), /Modern Standard Arabic/, '아랍어 말투는 아랍어로 옮길 때만');
  assert.doesNotMatch(sys('en', 'zh'), /Arabic script/, '글자 규칙은 옮길 언어 것만');
});

test('아랍어 결과 점검: 아랍 문자 · 페르시아어 글자 아님 · 원문에 없는 라틴 글자가 더 많으면 다음 모델로', () => {
  assert.ok(looksValid('كم سعر هذا؟', { text: '이거 얼마예요?', from: 'ko', to: 'ar' }));
  assert.ok(!looksValid('kam siʿru hādhā?', { text: '이거 얼마예요?', from: 'ko', to: 'ar' }), '로마자만');
  assert.ok(!looksValid('این چند است؟', { text: '이거 얼마예요?', from: 'ko', to: 'ar' }), '페르시아어 (چ)');
  assert.ok(!looksValid('The price is 15 riyal يا صديقي', { text: '15리얄이에요', from: 'ko', to: 'ar' }), '영어가 대부분');
  assert.ok(looksValid('هل يتوفر iPhone 15 Pro Max؟', { text: 'iPhone 15 Pro Max 재고 있어요?', from: 'ko', to: 'ar' }), '원문의 상표는 그대로 둬도 된다');
  assert.ok(!looksValid('كم 얼마', { text: '얼마예요?', from: 'ko', to: 'ar' }), '한글이 남음');
  assert.ok(!looksValid('얼마 كم', { text: 'كم السعر؟', from: 'ar', to: 'ko' }), '한국어로 옮겼는데 아랍 문자가 남음');
  assert.ok(looksValid('얼마예요?', { text: 'كم السعر؟', from: 'ar', to: 'ko' }));
  assert.equal(cleanOutput('العربية: مرحبا بك'), 'مرحبا بك');
  assert.equal(cleanOutput('Arabic: شكرا'), 'شكرا');
});

test('받아쓰기: Whisper에 ar, 무음에서 지어내는 아랍어 자막 문장은 버린다', async () => {
  for (const s of ['ترجمة نانسي قنقر', 'اشتركوا في القناة', 'شكرا للمشاهدة', 'شكراً على المشاهدة', 'لا تنسوا الاشتراك في القناة', 'موسيقى', '[موسيقى]', 'تم الترجمة بواسطة فريق'])
    assert.equal(cleanTranscript(s), '', s);
  for (const s of ['بكم هذا؟', 'السلام عليكم', 'شكرا جزيلا', 'الترجمة ممتازة']) assert.equal(cleanTranscript(s), s, s);
  assert.equal(sttLanguage('ar'), 'ar');
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' بكم هذا؟ ' }; } };
  const req = new Request(`${ORIGIN}/api/stt?lang=ar`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '6.6.6.6' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req, env: { AI } })).json(), { text: 'بكم هذا؟' });
  assert.equal(calls[0].language, 'ar');
  assert.equal(calls[0].initial_prompt, undefined);
});

test('읽는 법: 아랍어 로마자 → 한글 (국립국어원 원칙 · 잘 알려진 표기)', () => {
  const cases = {
    'marḥabā': '마르하바', shukran: '슈크란', 'as-salāmu ʿalaykum': '앗살라무 알라이쿰', 'al-qāhira': '알카히라', dubayy: '두바이',
    'Muḥammad': '무함마드', 'allāh': '알라', 'inshāʾallāh': '인샤알라', 'ḥalāl': '할랄', 'ramaḍān': '라마단', 'qaṭar': '카타르',
    'baghdād': '바그다드', 'ʿabdullāh': '압둘라', 'ḥabībī': '하비비', 'yallā': '얄라', 'ahlan wa-sahlan': '아흘란 와사흘란',
    'naʿam': '나암', 'saʿūdiyya': '사우디야', 'riyāḍ': '리야드', 'abū ẓabī': '아부 다비', 'khālid': '칼리드', 'al-ʿarabiyya': '알아라비야',
    'shāwarmā': '샤와르마', 'ḥummuṣ': '훔무스', 'ʿarab': '아랍', 'kitāb': '키타브', 'masjid': '마스지드', 'dimashq': '디마시크',
    'kam siʿru hādhā?': '캄 시루 하다?', 'law samaḥt.': '라우 사마흐트.', 'kam as-si\'r? 15 riyāl': '캄 앗시르? 15 리얄',
    'Dubai': '두바이', 'salaam': '살람', 'sheikh': '셰이크', 'sirr': '시르',
  };
  for (const [roman, ko] of Object.entries(cases)) assert.equal(arToHangul(roman), ko, roman);
  assert.equal(arToHangul(''), '');
  // 한국어 사용자가 아닌 사람에게는 다듬은 로마자 (밑점 · 첫머리 아인을 떼고, 문장 첫 글자는 대문자)
  assert.equal(arRoman('as-salāmu ʿalaykum'), 'As-salāmu alaykum');
  assert.equal(arRoman('kam siʿru hādhā?'), 'Kam si’ru hādhā?');
  assert.equal(arRoman('muḥammad. ṣabāḥ al-khayr'), 'Muhammad. Sabāh al-khayr');
  // 읽는 법 길: 서버 소리 표기가 있어야 하고, 한국어 사용자 → 한글 · 그 밖 → 로마자 · 아랍어 사용자에게는 없음
  assert.ok(READERS.ar.sound && hasSound('ar'));
  assert.equal(readingFor('مرحبا', 'ar', 'ko', 'marḥabā'), '마르하바');
  for (const v of ['en', 'tr', 'ja', 'zh', 'fr']) assert.equal(readingFor('مرحبا', 'ar', v, 'marḥabā'), 'Marhabā', v);
  assert.equal(readingFor('مرحبا', 'ar', 'ar', 'marḥabā'), '');
  assert.equal(readingFor('مرحبا', 'ar', 'ko'), '', '소리 표기를 아직 못 받았으면 비움');
  assert.ok(needsSound('ar', 'ko') && needsSound('ar', 'en') && !needsSound('ar', 'ar'));
  // 아랍어 사용자에게 다른 언어는 로마자 (한국어 · 일본어 · 중국어), 라틴 문자 언어는 적지 않음
  assert.equal(readingFor('안녕하세요', 'ko', 'ar'), 'Annyeonghaseyo');
  assert.equal(readingFor('你好', 'zh', 'ar', 'nǐ hǎo'), 'Nǐ hǎo');
  assert.equal(readingFor('Bonjour', 'fr', 'ar'), '');
});

test('/api/sound 아랍어: 로마자 지시문 · 정리 · 낱말 수가 모자라면 다음 모델 · 아랍 문자를 그대로 돌려주면 버림 (가짜 AI)', async () => {
  const spec = SOUND_SPECS.ar;
  assert.ok(spec, '서버 규칙');
  const sys = spec.messages('كم سعر هذا؟')[0].content;
  assert.match(sys, /romanization/);
  assert.match(sys, /ā ī ū/);
  assert.match(sys, /ʿ for ع/);
  assert.match(sys, /as-salāmu ʿalaykum/);
  assert.equal(spec.messages('كم سعر هذا؟')[1].content, 'كم سعر هذا؟', '원문은 사용자 메시지로만');
  // 정리: 이름표 · 따옴표 · 아랍 문장 부호 · 아랍 숫자 · 아포스트로피
  assert.equal(cleanArabicSound('Romanization: "Kam siʿru hādhā؟"'), 'Kam siʿru hādhā?');
  assert.equal(cleanArabicSound("kam as-si'r ١٥ riyāl"), 'kam as-siʾr 15 riyāl');
  assert.equal(cleanArabicSound('كم سعر هذا؟'), '', '아랍 문자를 그대로');
  assert.equal(cleanArabicSound('kam 얼마'), '', '다른 글자');
  assert.equal(cleanArabicSound('15'), '', '모음 없음');
  assert.equal(normRoman('ʻafwan’ ، naʿam ؟'), 'ʿafwanʾ, naʿam?');
  assert.ok(arabicSoundMatches('ar-rajāʾ irsāl raqm at-tatabbuʿ al-yawm', 'الرجاء إرسال رقم التتبع اليوم'));
  assert.ok(!arabicSoundMatches('ar-rajāʾ', 'الرجاء إرسال رقم التتبع اليوم'), '뒷부분을 빼먹음');
  assert.equal(arabicWordCount('بكم هذا؟ 15 ريال'), 3);
  assert.equal(romanWordCount('bikam hādhā? 15 riyāl'), 3);

  const text = 'الرجاء إرسال رقم التتبع اليوم';
  let AI = fakeAI((m, input, n) => ({ response: n === 1 ? 'ar-rajāʾ' : 'Romanization: ar-rajāʾ irsāl raqm at-tatabbuʿ al-yawm' }));
  let data = await (await soundApi({ request: post('/api/sound', { text, lang: 'ar' }), env: { AI } })).json();
  assert.equal(data.sound, 'ar-rajāʾ irsāl raqm at-tatabbuʿ al-yawm');
  assert.equal(AI.calls.length, 2, '첫 답은 낱말이 모자라 다음 모델로');
  assert.equal(AI.calls[0].input.temperature, 0);
  assert.equal(arToHangul(data.sound), '아라자 이르살 라큼 앗타탑부 알야움');
  AI = fakeAI(() => ({ response: 'الرجاء إرسال' }));
  assert.equal((await soundApi({ request: post('/api/sound', { text, lang: 'ar' }), env: { AI } })).status, 502, '쓸 만한 답이 없음');
  assert.equal((await soundApi({ request: post('/api/sound', { text: 'hello', lang: 'ar' }), env: { AI } })).status, 400, '아랍어 글이 아님');
  assert.equal(validateSound({ text: 'مرحبا', lang: 'ar' }).value.lang, 'ar');
});

test('숫자: 아랍어 수 낱말 · 아랍 숫자 · 소수(ونصف) · 천 · 쌍수 · 퍼센트', () => {
  assert.equal(toAscii('١٢٫٥ ريال'), '12.5 ريال');
  const cases = [
    ['السعر خمسة عشر ريالًا', [15]], ['خمسة وعشرون قطعة', [25]], ['واحد وعشرين', [21]], ['مائة وخمسون', [150]], ['مئة وخمسين ريال', [150]],
    ['ثلاثة آلاف', [3000]], ['ألف وخمسمائة', [1500]], ['ألفين', [2000]], ['عشرين ألف', [20000]], ['ثلاث مائة', [300]], ['مائة ألف', [100000]],
    ['أربعة عشر ونصف', [14.5]], ['14 ونصف', [14.5]], ['١٤ ونصف', [14.5]], ['خمسة ريالات ونصف', [5.5]], ['ساعتين وربع', [2.25]],
    ['١٢٫٥ ريال', [12.5]], ['15 ألف', [15000]], ['1.5 مليون', [1500000]], ['مليون', [1000000]],
    ['خمسة عشر في المئة', [15]], ['خمسة أو ستة أيام', [5, 6]], ['خمسة وستة', [5, 6]], ['التوصيل خلال يومين', [2]], ['نصف كيلو', [0.5]],
    ['اتنين', [2]], ['خمستاشر', [15]], ['بخمسين ريال', [50]], ['بالألف', [1000]], ['والعشرين', [20]],
    ['يوم الاثنين', []], ['لست متأكدا', []], ['في منتصف الطريق', []], ['شكرا جزيلا', []],
    ['خَمْسَةَ عَشَرَ', [15]], ['ثلاثه', [3]],
  ];
  for (const [text, want] of cases) assert.deepEqual(values(text), want, text);
  assert.deepEqual(numberMentions('واحد', 'ar'), [{ alts: [1], word: true }], '낱말로 쓴 1');
  assert.deepEqual(numberMentions('أربعة عشر ونصف', 'ar', { normalize: false }).map((m) => m.alts[0]), [14], '소수로 바꾸지 않으면 14 (대화 쪽은 둘 다)');
});

test('답장 추천 · 합의 요약: 아랍어로 쓴 지어낸 숫자는 버리고, 대화에 나온 숫자는 남긴다', () => {
  // 한국어 사용자 ↔ 아랍어 판매자
  const turns = [{ side: 'partner', from: 'ar', to: 'ko', text: 'سعر القطعة خمسة عشر ريالًا، والتوصيل خلال ثلاثة أيام.', translation: '개당 15리얄이고, 배송은 3일 걸려요.' }];
  const v = validateSuggest({ me: 'ko', partner: 'ar', turns }).value;
  const raw = JSON.stringify([
    { ko: '좋아요, 15리얄로 할게요.', ar: 'حسنًا، موافق على خمسة عشر ريالًا.' },
    { ko: '12리얄로 해 주세요.', ar: 'هل يمكن بـ 12 ريالًا؟' },
    { ko: '이틀 안에 보내 주세요.', ar: 'الرجاء الإرسال خلال يومين.' },
    { ko: '배송은 3일이면 괜찮아요.', ar: 'التوصيل خلال ثلاثة أيام مناسب.' },
    { ko: '스무 개 주문할게요.', ar: 'سأطلب عشرين قطعة.' },
  ]);
  assert.deepEqual(cleanSuggestions(raw, v).map((s) => s.partner), ['حسنًا، موافق على خمسة عشر ريالًا.', 'التوصيل خلال ثلاثة أيام مناسب.']);
  // 아랍어 사용자 ↔ 한국어 판매자
  const t2 = [{ side: 'partner', from: 'ko', to: 'ar', text: '개당 15위안이에요.', translation: 'سعر القطعة 15 يوانًا.' }];
  const v2 = validateSuggest({ me: 'ar', partner: 'ko', turns: t2 }).value;
  const raw2 = [
    { ar: 'هل يمكن خصم إلى عشرة يوانات؟', ko: '10위안으로 깎아 줄 수 있어요?' },
    { ar: 'موافق، خمسة عشر يوانًا مناسب.', ko: '좋아요, 15위안이면 괜찮아요.' },
  ];
  assert.deepEqual(cleanSuggestions(raw2, v2), [{ me: 'موافق، خمسة عشر يوانًا مناسب.', partner: '좋아요, 15위안이면 괜찮아요.' }]);
  // 요약 (아랍어 사용자): 숫자 낱말도 대화와 맞춰 보고, "لا يوجد"는 빈칸, 합계를 지어낸 칸은 비운다
  const s = validateSummary({ me: 'ar', partner: 'ko', turns: [
    { side: 'partner', from: 'ko', to: 'ar', text: '개당 15위안이고 100개부터 팔아요.', translation: 'سعر القطعة 15 يوانًا، والحد الأدنى 100 قطعة.' },
    { side: 'me', from: 'ar', to: 'ko', text: 'حسنًا، أطلب مئة قطعة.', translation: '좋아요, 100개 주문할게요.' },
  ] }).value;
  const out = cleanSummary({
    price: { ar: 'خمسة عشر يوانًا للقطعة', ko: '개당 15위안' },
    quantity: { ar: 'مئة قطعة', ko: '100개' },
    delivery: { ar: 'لا يوجد', ko: '없음' },
    other: { ar: 'الإجمالي 1500 يوان', ko: '총 1500위안' },
  }, s);
  assert.deepEqual(out.fields, {
    price: { me: 'خمسة عشر يوانًا للقطعة', partner: '개당 15위안' },
    quantity: { me: 'مئة قطعة', partner: '100개' },
    delivery: { me: '', partner: '' },
    other: { me: '', partner: '' },
  });
  for (const n of ['لا يوجد', 'غير محدد', 'لم يذكر', 'لا شيء']) assert.match(n, ar.none, n);
});

test('자동 감지: 아랍 문자 → 아랍어 (상표 · 숫자가 섞여도)', () => {
  for (const s of ['مرحبا', 'بكم هذا؟', 'كم سعر Samsung Galaxy S24؟', 'هل يوجد iPhone 15 Pro Max بلون أزرق؟', 'سعر iPhone 15 Pro Max', 'السعر ٢٥٠ ريال'])
    assert.equal(detectLang(s, 'ko'), 'ar', s);
  assert.equal(detectLang('Where is the hotel?', 'ko'), 'en');
  assert.equal(detectLang('안녕하세요', 'ar'), 'ko');
  assert.equal(detectLang('123', 'ar'), 'ar', '글자가 없으면 기본값');
});

test('표현집: 모든 문장에 아랍어 + 로마자, 로마자는 한글로 다 바뀌고, 성별이 드러나지 않는 말', () => {
  for (const p of PHRASES) {
    assert.match(p.ar, /[ء-ي]/, p.ko);
    assert.match(p.ar, /[.؟!]$/, `문장 끝: ${p.ar}`);
    const sound = phraseSound(p, 'ar');
    assert.ok(sound, `로마자: ${p.ko}`);
    assert.doesNotMatch(sound, /[؀-ۿ]/, sound);
    assert.ok(arabicSoundMatches(sound, p.ar), `낱말 수: ${p.ar} / ${sound}`);
    const ko = arToHangul(sound);
    assert.doesNotMatch(ko, /[A-Za-zāīūʿʾ]/, `한글로 다 바뀜: ${sound} → ${ko}`);
    assert.match(ko, /[가-힣]/);
  }
  const by = (k) => PHRASES.find((p) => p.ko === k);
  assert.equal(readingFor(by('안녕하세요.').ar, 'ar', 'ko', phraseSound(by('안녕하세요.'), 'ar')), '앗살라무 알라이쿰.');
  assert.equal(readingFor(by('감사합니다.').ar, 'ar', 'ko', phraseSound(by('감사합니다.'), 'ar')), '슈크란.');
  assert.equal(readingFor(by('감사합니다.').ar, 'ar', 'en', phraseSound(by('감사합니다.'), 'ar')), 'Shukran.');
  // 내 소개는 성별이 없는 꼴 (كوري/كورية 대신 "한국에서 왔어요")
  assert.equal(by('저는 한국 사람이에요.').ar, 'أنا من كوريا.');
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'ko', 'ar').includes('저는 아랍어를 해요.'));
  assert.ok(!ko('talk', 'ko', 'ar').includes('저는 한국 사람이에요.'));
  assert.ok(ko('talk', 'ar', 'ko').includes('아랍어를 잘 못해요.'));
  assert.ok(ko('help', 'ko', 'ar').includes('저희 나라 대사관에 연락해 주세요.'));
  const shop = phrasesFor('shop', 'ar', 'ko').map((p) => p.ar).join(' ');
  for (const w of ['بكم', 'غال', 'تخفيض', 'لون', 'مقاس']) assert.ok(shop.includes(w), w);
});

test('화면 문구(아랍어): 아랍 문자로 · 업데이트 버튼 · 말투 안내 · 앱 정보 · 상대 안내(오른쪽 버튼) · 국기 화살표', () => {
  for (const [k, s] of Object.entries(MESSAGES.ar)) {
    if (!/^[A-Za-z0-9\s.()/:·→←✕×{}%-]+$/.test(s)) assert.match(s, /[ء-ي]/, `ar.${k}`);
    if (k !== 'set.readingHint') assert.doesNotMatch(s, /[가-힣]/, `한국어가 남음: ar.${k}`);
  }
  assert.doesNotMatch(Object.values(MESSAGES.ar).join(' '), /\b(?:Settings|Translate|Phrases|History|Speak|Copy|Close)\b/, '영어 사본이 남지 않음');
  assert.match(tl('ar', 'set.updateHint'), /تحديث/);
  assert.match(tl('ar', 'set.toneHint'), /您/);
  assert.match(tl('ar', 'set.about'), /الصين/);
  assert.match(tl('ar', 'set.about'), /11/);
  assert.match(tl('ar', 'err.paused'), /\{time\}/);
  assert.match(tl('ar', 'mic.partnerHint'), /بالعربية/);
  assert.match(tl('ar', 'mic.partnerHint'), /الأيمن/, '상대(아랍어 사용자) 버튼은 오른쪽 (마이크 줄은 늘 왼쪽 = 나)');
  assert.ok(tl('ar', 'talk.emptyHow').indexOf('اليسار') < tl('ar', 'talk.emptyHow').indexOf('اليمين'), '내 버튼 왼쪽 · 상대 오른쪽');
  assert.match(tl('ar', 'set.voiceSample'), /مرحب/);
  assert.equal(tl('ar', 'lang.ko'), 'الكورية');
  assert.equal(tl('ar', 'lang.fr'), 'الفرنسية');
  assert.equal(tl('ko', 'lang.ar'), '아랍어');
  // 표현 안내의 국기 화살표: 오른쪽→왼쪽 화살표 ←, 국기 사이에 RLM
  const note = tl('ar', 'phrases.note', { me: '🇸🇦', partner: '🇰🇷', lang: 'الكورية' });
  assert.ok(note.startsWith(`🇸🇦${RLM} ← ${RLM}🇰🇷 `), note);
  assert.equal(tl('ar', 'talk.ariaSpeak', { lang: tl('ar', 'lang.ar') }), 'التحدث باللغة العربية');
});

test('사진: 아랍어 줄(줄 언어 · 로마자 읽기 · 번역 숫자 검사)과 아랍어 사용자에게 아랍어 번역 (가짜 AI 답)', () => {
  const sysKo = buildPhotoMessages({ me: 'ko' }, 'x')[0].content;
  assert.match(sysKo, /Arabic → romanization/);
  const sysAr = buildPhotoMessages({ me: 'ar' }, 'x');
  assert.match(sysAr[0].content, /for an? Arabic speaker/);
  assert.doesNotMatch(sysAr[0].content, /Arabic → romanization/, '아랍어 사용자에게 아랍어 읽기는 필요 없다');
  assert.match(sysAr[0].content, /Hanyu Pinyin/);
  assert.match(sysAr[1].content[1].text, /translate it into Arabic/);
  assert.equal(lineLang('شاورما دجاج 25 ريال', 'ar'), 'ar');

  const ko = cleanPhoto({
    lines: [
      { text: 'شاورما دجاج', lang: 'ar', tr: '치킨 샤와르마', read: 'shāwarmā dajāj' },
      { text: '٢٥ ريال', tr: '25리얄' },
      { text: 'فلافل', lang: 'ar', tr: '팔라펠 30리얄', read: 'falāfil' },
      { text: 'عصير برتقال طازج 12 ريال', lang: 'ar', tr: '생 오렌지 주스 12리얄', read: 'ʿaṣīr burtuqāl ṭāzij 12 riyāl' },
      { text: 'كنافة', lang: 'ar', tr: '쿠나파', read: 'كنافة' },
    ],
    summary: '아랍 음식점 메뉴판이에요.',
  }, { me: 'ko' });
  assert.deepEqual(ko.lines[0], { text: 'شاورما دجاج', lang: 'ar', tr: '치킨 샤와르마', read: 'shāwarmā dajāj' });
  assert.equal(readingFor(ko.lines[0].text, 'ar', 'ko', ko.lines[0].read), '샤와르마 다자즈');
  assert.deepEqual([ko.lines[1].lang, ko.lines[1].tr], ['ar', '25리얄'], '아랍 숫자 ٢٥ = 25 · 가격만 있는 줄은 사진의 주 언어');
  assert.deepEqual([ko.lines[2].tr, ko.lines[2].check], ['', 'number'], '원문에 없는 30');
  assert.equal(ko.lines[3].read, 'ʿaṣīr burtuqāl ṭāzij 12 riyāl');
  assert.equal(ko.lines[4].read, '', '읽기 자리에 아랍 문자');
  assert.equal(ko.summary, '아랍 음식점 메뉴판이에요.');
  assert.equal(cleanRead('shāwarmā', 'شاورما دجاج لحم بقر', 'ar'), '', '낱말 수가 모자람');

  const arUser = cleanPhoto({
    lines: [
      { text: '牛肉面 ¥25', lang: 'zh', tr: 'نودلز باللحم ¥25', read: 'niúròu miàn' },
      { text: 'Café crème 3,50 €', lang: 'fr', tr: 'قهوة بالكريمة 3,50 €' },
      { text: 'Cheeseburger', lang: 'en', tr: 'Cheeseburger with fries' },
      { text: 'قهوة عربية', lang: 'ar', tr: 'قهوة عربية' },
      { text: '烤鸡 ¥38', lang: 'zh', tr: 'دجاج مشوي ¥45' },
    ],
    summary: 'قائمة طعام في مقهى.',
  }, { me: 'ar' });
  assert.deepEqual(arUser.lines[0], { text: '牛肉面 ¥25', lang: 'zh', tr: 'نودلز باللحم ¥25', read: 'niúròu miàn' });
  assert.deepEqual([arUser.lines[1].lang, arUser.lines[1].tr, arUser.lines[1].read], ['fr', 'قهوة بالكريمة 3,50 €', '']);
  assert.deepEqual([arUser.lines[2].tr, arUser.lines[2].check], ['', 'lang'], '아랍어 사용자에게 영어 번역');
  assert.deepEqual([arUser.lines[3].lang, arUser.lines[3].tr], ['ar', ''], '이미 내 언어');
  assert.deepEqual([arUser.lines[4].tr, arUser.lines[4].check], ['', 'number']);
  assert.equal(arUser.summary, 'قائمة طعام في مقهى.');
  assert.equal(cleanPhoto({ lines: [{ text: 'Café', lang: 'fr', tr: 'قهوة' }], summary: 'A cafe menu.' }, { me: 'ar' }).summary, '', '요약이 아랍어가 아님');
});

test('RTL 공유 글: 아랍어가 섞이면 줄마다 방향 표시(LRM · RLM) · 번역 화살표 ← · 숫자가 앞 글에 딸려 가지 않게, 없으면 그대로', () => {
  const D1 = new Date(2026, 9, 12, 14, 3).getTime();
  const fmt = { tl, time: () => '14:03', date: () => '10/12', flag: (l) => LANGS[l].flag };
  const items = [
    { id: 'a', side: 'me', from: 'ko', to: 'ar', text: '단가가 얼마예요?', translation: 'كم سعر القطعة؟', at: D1 },
    { id: 'b', side: 'partner', from: 'ar', to: 'ko', text: 'iPhone 15 بسعر 3500 ريال.', translation: 'iPhone 15는 3500리얄이에요.', at: D1 + 60_000 },
  ];
  const lines = buildShareText(items, { ...fmt, me: 'ko', other: 'ar' }).split('\n');
  assert.deepEqual(lines, [
    `${LRM}Tercüman · 대화 기록${LRM} · سجل المحادثة${LRM} · 10/12`,
    '',
    `${LRM}■ 대화${LRM} · المحادثة${LRM} (2)`,
    '',
    `${LRM}[14:03] 🇰🇷${LRM} 나`,
    `${LRM}단가가 얼마예요?`,
    `${RLM}← 🇸🇦${RLM} كم سعر القطعة؟`,
    '',
    `${LRM}[14:03] 🇸🇦${LRM} 상대`,
    `${RLM}iPhone 15 بسعر 3500 ريال.`,
    `${LRM}→ 🇰🇷${LRM} iPhone 15는 3500리얄이에요.`,
  ]);
  // 아랍어 사용자: 머리 줄은 오른쪽→왼쪽, 한국어 원문 줄은 왼쪽→오른쪽, 요약 값 뒤에도 RLM
  const summary = { price: { me: '15 ريال للقطعة', partner: '개당 15리얄' }, quantity: { me: '', partner: '' }, delivery: { me: '', partner: '' }, other: { me: '', partner: '' } };
  const arLines = buildShareText(items.map((x) => ({ ...x, side: x.side === 'me' ? 'partner' : 'me' })), { ...fmt, me: 'ar', other: 'ko', summary }).split('\n');
  assert.equal(arLines[0], `${RLM}Tercüman · سجل المحادثة${RLM} · 대화 기록${RLM} · 10/12`);
  assert.equal(arLines[3], `${RLM}· سعر الوحدة${RLM} · 단가${RLM}: 15 ريال للقطعة${RLM} / 개당 15리얄${RLM}`);
  assert.ok(arLines.includes(`${RLM}[14:03] 🇰🇷${RLM} الطرف الآخر`));
  assert.ok(arLines.includes(`${LRM}단가가 얼마예요?`));
  for (const l of arLines.filter(Boolean)) assert.match(l, /^[‎‏]/, `줄마다 방향: ${l}`);
  // 방향 표시를 빼면 예전 글과 같다 (화살표만 ←)
  const plain = buildShareText(items, { ...fmt, me: 'ko', other: 'ar' }).replace(/[‎‏]/g, '');
  assert.match(plain, /\n← 🇸🇦 كم سعر القطعة؟\n/);
  // 아랍어가 없으면 방향 표시 없이 그대로
  const zh = buildShareText([{ ...items[0], to: 'zh', translation: '单价是多少？' }], { ...fmt, me: 'ko', other: 'zh' });
  assert.doesNotMatch(zh, /[‎‏←]/);
  // 사진 줄 복사 · 공유: 아랍어 줄 앞에 RLM (상표로 시작해도 오른쪽부터)
  assert.equal(lineText({ text: 'iPhone 15 بسعر 3500 ريال', lang: 'ar', tr: 'iPhone 15 3500리얄' }), `${RLM}iPhone 15 بسعر 3500 ريال\niPhone 15 3500리얄`);
  assert.equal(lineText({ text: '牛肉面', lang: 'zh', tr: 'نودلز باللحم' }), `牛肉面\n${RLM}نودلز باللحم`);
  assert.equal(allText([{ text: '牛肉面', lang: 'zh', tr: 'نودلز' }], 'قائمة طعام'), `${RLM}قائمة طعام\n\n牛肉面\n${RLM}نودلز`);
});

test('RTL 화면: 화살표 도우미 · 양력 날짜 · h()의 dir (lang → 방향, 직접 준 dir 우선)', () => {
  assert.equal(arrow('🇸🇦', '🇰🇷'), '🇸🇦 → 🇰🇷');
  setUiLang('ar');
  assert.equal(arrow('🇸🇦', '🇰🇷'), `🇸🇦${RLM} ← ${RLM}🇰🇷`);
  assert.match(fmtDate(new Date(2026, 9, 12).getTime()), /أكتوبر/, '이슬람력이 아니라 양력');
  setUiLang('ko');
  // DOM 없이 h()가 단 속성만 본다
  const made = [];
  globalThis.document = { createElement: (tag) => { const el = { tag, attrs: {}, style: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, append() {} }; made.push(el); return el; } };
  try {
    assert.equal(h('div', { lang: 'ar' }).attrs.dir, 'rtl');
    assert.equal(h('div', { lang: 'ko' }).attrs.dir, 'ltr');
    assert.equal(h('div', { lang: 'ar', dir: 'auto' }).attrs.dir, 'auto');
    assert.equal(h('div', { lang: 'xx' }).attrs.dir, undefined, '모르는 언어는 방향을 달지 않는다');
    assert.equal(h('textarea', { class: 'text-area' }).attrs.dir, undefined, '언어를 모르는 입력칸 → CSS plaintext');
  } finally { delete globalThis.document; }
});

test('RTL CSS · 화면 코드: 마이크 줄은 늘 왼쪽 = 나, 읽는 법은 아랍어 글 밑에 맞춤, 모르는 언어 칸은 줄마다 방향, 아이콘 뒤집기', () => {
  const css = readFileSync('public/css/app.css', 'utf8');
  assert.match(css, /\.controls \{[^}]*direction: ltr/);
  assert.match(css, /\.b-reading \{[^}]*direction: ltr/);
  assert.match(css, /\[dir="rtl"\] \+ \.b-reading, \[dir="rtl"\] > \.b-reading, \[dir="rtl"\] \+ \.tip-reading \{ text-align: end; \}/);
  assert.match(css, /\.text-area:not\(\[dir\]\), \.type-input:not\(\[dir\]\), \.photo-orig:not\(\[dir\]\), \.mine-label, \.share-preview \{ unicode-bidi: plaintext; \}/);
  assert.match(css, /\[dir="rtl"\] \.ic-text svg/);
  const src = (f) => readFileSync(`public/js/${f}`, 'utf8');
  assert.match(src('views/talk.js'), /class: 'mic-text', lang \}/, '마이크 버튼 글은 그 언어 방향');
  assert.match(src('views/langmenu.js'), /h\('span', \{ lang: c \}, LANGS\[c\]\.native\)/, '🌐 메뉴: lang은 이름에만');
  assert.doesNotMatch(src('views/langmenu.js'), /role: 'menuitemradio', lang: c/);
  assert.match(src('app.js'), /h\('span', \{ lang: partner \}, LANGS\[partner\]\.native\)/, '위 막대 언어 짝: 국기는 바꾸기 아이콘 옆');
  for (const f of ['views/text.js', 'views/history.js', 'views/share.js']) {
    assert.match(src(f), /arrow\(/, `${f}: 화살표 도우미`);
    assert.doesNotMatch(src(f), /\} → \$\{/, `${f}: 화살표를 직접 쓰지 않는다`);
  }
});

test('목소리: 아랍어는 ar-* 어느 지역 목소리든 쓰고(사우디 목소리 먼저), 다른 언어 목소리는 안 쓴다', async () => {
  const voices = [
    { lang: 'en-US', name: 'Samantha', voiceURI: 'en' },
    { lang: 'ar-EG', name: 'Microsoft Salma Online (Natural)', voiceURI: 'eg' },
    { lang: 'ar-SA', name: 'Microsoft Hamed Online (Natural)', voiceURI: 'sa' },
    { lang: 'ar_AE', name: 'Arabic UAE', voiceURI: 'ae' },
    { lang: 'fa-IR', name: 'Dariush', voiceURI: 'fa' },
    { lang: 'ar', name: 'Arabic', voiceURI: 'ar' },
  ];
  globalThis.window = { speechSynthesis: { getVoices: () => voices, addEventListener() {} } };
  try {
    const { voicesFor, hasVoice } = await import('../public/js/speech.js');
    const list = voicesFor('ar').map((v) => v.voiceURI);
    assert.deepEqual(list.slice(0, 2), ['sa', 'eg'], '좋은 목소리 중 사우디(ar-SA) 먼저');
    assert.deepEqual([...list].sort(), ['ae', 'ar', 'eg', 'sa'], '어느 아랍 지역이든, 페르시아어 · 영어는 빼고');
    assert.ok(hasVoice('ar'));
  } finally { delete globalThis.window; }
});
