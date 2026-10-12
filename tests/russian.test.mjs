// 러시아어(ru, v1.6.0): 언어 정보 · 번역 지시문(вы/ты · 성별 중립) · 결과 점검 · 받아쓰기 · 읽는 법(키릴 → 한글 · 로마자, 화면에서 바로)
// · 숫자(격 변화형 · полтора · с половиной · 15 000 ₽ · тыс.) · 답장 추천 · 요약 · 자동 감지 · 표현집 · 화면 문구 · 사진 줄
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, CODES, detectLang } from '../public/js/lang.js';
import { MESSAGES, tl, defaultLang, startLangs } from '../public/js/i18n.js';
import { PHRASES, phrasesFor, phraseSound } from '../public/js/phrases.js';
import { readingFor, needsSound, hasSound } from '../public/js/reading.js';
import { ruToHangul, ruToRoman } from '../public/js/read/ru.js';
import { packOf } from '../lib/langs/index.mjs';
import { buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate, sttLanguage } from '../lib/translate-core.mjs';
import { SOUND_SPECS } from '../lib/sound-core.mjs';
import { numberMentions, inventsNumber, buildSuggestMessages, cleanSuggestions, validateSuggest, cleanSummary } from '../lib/assist-core.mjs';
import { buildPhotoMessages, cleanPhoto, lineLang } from '../lib/photo-core.mjs';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const values = (text) => numberMentions(text, 'ru').flatMap((m) => m.alts);

test('러시아어 언어 정보: ru-RU · 모든 언어와 짝 · 브라우저 언어 · Whisper ru', () => {
  const { code, native, flag, bcp47, short, script, name } = LANGS.ru;
  assert.deepEqual({ code, native, flag, bcp47, short, script, name }, { code: 'ru', native: 'Русский', flag: '🇷🇺', bcp47: 'ru-RU', short: 'RU', script: 'Cyrl', name: 'Russian' });
  for (const c of CODES.filter((x) => x !== 'ru')) {
    assert.ok(validateTranslate({ text: 'Привет', from: 'ru', to: c }).value, `ru → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'ru' }).value, `${c} → ru`);
  }
  assert.equal(defaultLang(['ru-RU', 'en']), 'ru');
  assert.equal(defaultLang(['uk-UA', 'ru']), 'ru', '우크라이나어 브라우저라도 러시아어가 목록에 있으면');
  assert.deepEqual(startLangs({}, ['ru-KZ']), { me: 'ru', partner: 'ko' });
  assert.equal(sttLanguage('ru'), 'ru');
  assert.ok(!hasSound('ru'), '읽는 법은 화면에서 바로 (소리 표기 서버 없음)');
  assert.equal(SOUND_SPECS.ru, undefined);
});

test('번역 지시문: 키릴 문자로 · вы/ты · 말하는 사람 성별을 모르니 성별 형태(рад/рада)는 중립 표현으로', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.match(sys('ko', 'ru'), /from Korean into Russian/);
  assert.match(sys('ko', 'ru'), /Russian must be written in Cyrillic/);
  assert.match(sys('ko', 'ru'), /polite Russian with «вы»/);
  assert.match(sys('ko', 'ru'), /gender is unknown.*neutral wording/);
  assert.match(sys('ko', 'ru', false), /casual Russian with «ты»/);
  assert.match(sys('ru', 'ko'), /from Russian into Korean/);
  assert.doesNotMatch(sys('ru', 'ko'), /«вы»/, '말투 규칙은 옮길 언어 것만');
  assert.equal(sys('ru', 'en', true), sys('ru', 'en', false));
  const turns = [{ side: 'partner', from: 'ru', to: 'ko', text: 'Сколько вам нужно?', translation: '몇 개 필요하세요?' }];
  assert.match(buildSuggestMessages({ me: 'ko', partner: 'ru', turns })[0].content, /Russian: Use polite Russian with «вы»/);
});

test('결과 점검: 키릴 문자가 있어야 하고, 다른 언어로 옮길 땐 키릴 문자가 남으면 안 됨 · 이름표 정리', () => {
  assert.ok(looksValid('Сколько это стоит?', { text: '이거 얼마예요?', from: 'ko', to: 'ru' }));
  assert.ok(!looksValid('Skolko eto stoit?', { text: '이거 얼마예요?', from: 'ko', to: 'ru' }), '로마자만');
  assert.ok(!looksValid('Сколько 얼마?', { text: '이거 얼마예요?', from: 'ko', to: 'ru' }), '한글이 남음');
  assert.ok(looksValid('Цена iPhone 15 — 90 000 ₽', { text: 'iPhone 15 가격은 9만 루블', from: 'ko', to: 'ru' }));
  assert.ok(looksValid('Bu ne kadar?', { text: 'Сколько это стоит?', from: 'ru', to: 'tr' }));
  assert.ok(!looksValid('Bu ne kadar стоит?', { text: 'Сколько это стоит?', from: 'ru', to: 'tr' }), '키릴 문자가 남음');
  assert.ok(!looksValid('Сколько это стоит?', { text: 'Сколько это стоит?', from: 'ru', to: 'ko' }), '안 옮김');
  assert.equal(cleanOutput('Перевод: Спасибо'), 'Спасибо');
  assert.equal(cleanOutput('Русский: «Привет»'), 'Привет');
  assert.equal(cleanOutput('Russian: Да'), 'Да');
});

test('받아쓰기: Whisper에 ru, 조용한 녹음에서 지어내는 러시아어 자막 끝 문장(DimaTorzok 등)은 버린다', async () => {
  const junk = ['Продолжение следует...', 'Субтитры сделал DimaTorzok', 'Субтитры создавал DimaTorzok', 'Редактор субтитров А.Синецкая Корректор А.Егорова',
    'Спасибо за просмотр!', 'Подписывайтесь на канал', 'ПОДПИСЫВАЙТЕСЬ НА КАНАЛ', 'Ставьте лайки и подписывайтесь', 'Корректор А.Кулакова'];
  for (const s of junk) assert.equal(cleanTranscript(s), '', s);
  for (const s of ['Сколько это стоит?', 'Спасибо, до свидания.', 'Продолжим завтра.', 'Спасибо, я посмотрю.']) assert.equal(cleanTranscript(s), s, s);
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' Сколько стоит? ' }; } };
  const req = new Request(`${ORIGIN}/api/stt?lang=ru`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '3.3.3.5' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req, env: { AI } })).json(), { text: 'Сколько стоит?' });
  assert.equal(calls[0].language, 'ru');
  assert.equal(calls[0].initial_prompt, undefined);
});

test('읽는 법: 키릴 → 한글 — 국립국어원 「러시아어 자모와 한글 대조표」 · 잘 알려진 표기와 같게', () => {
  const cases = {
    Москва: '모스크바', спасибо: '스파시보', 'Санкт-Петербург': '상트페테르부르크', борщ: '보르시', здравствуйте: '즈드라스트부이테',
    Путин: '푸틴', Ельцин: '옐친', Горбачёв: '고르바초프', Чехов: '체호프', Пушкин: '푸시킨', Чайковский: '차이콥스키', Достоевский: '도스토옙스키',
    Толстой: '톨스토이', Владивосток: '블라디보스토크', Новосибирск: '노보시비르스크', Иркутск: '이르쿠츠크', Байкал: '바이칼', Сочи: '소치',
    Казань: '카잔', Екатеринбург: '예카테린부르크', Хабаровск: '하바롭스크', Ярославль: '야로슬라블', Татьяна: '타티야나', Наташа: '나타샤',
    Ольга: '올가', Игорь: '이고리', Горький: '고리키', Тверь: '트베리', Пермь: '페름', Омск: '옴스크', матрёшка: '마트료시카', Хрущёв: '흐루쇼프',
    'Нижний Новгород': '니즈니 노브고로드', Лужники: '루즈니키', балалайка: '발랄라이카', Калининград: '칼리닌그라드', спутник: '스푸트니크',
    Шостакович: '쇼스타코비치', Анна: '안나', Сергей: '세르게이', Дмитрий: '드미트리', Александр: '알렉산드르', Михаил: '미하일', Иван: '이반',
    Кавказ: '캅카스', Пётр: '표트르', Фёдор: '표도르', Октябрь: '옥탸브리', Лопаткин: '로팟킨', Субботник: '수보트니크', Ахматова: '아흐마토바',
    Цветаева: '츠베타예바', Ульяновск: '울리야놉스크',
  };
  for (const [ru, ko] of Object.entries(cases)) assert.equal(ruToHangul(ru), ko, ru);
  // 문장: 띄어쓰기 · 구두점 · 숫자 · 라틴 문자는 그대로
  assert.equal(ruToHangul('Сколько это стоит?'), '스콜코 에토 스토이트?');
  assert.equal(ruToHangul('Я говорю по-русски.'), '야 고보류 포루스키.');
  assert.equal(ruToHangul('iPhone 15 за 90 000 ₽'), 'iPhone 15 자 90 000 ₽');
  // 로마자: 흔히 쓰는 영어식 (어두 е → ye, ё → yo, х → kh, ц → ts, щ → shch)
  const roman = {
    Спасибо: 'Spasibo', Здравствуйте: 'Zdravstvuyte', Москва: 'Moskva', 'Санкт-Петербург': 'Sankt-Peterburg', борщ: 'borshch', Привет: 'Privet',
    'До свидания': 'Do svidaniya', Ельцин: 'Yeltsin', Пётр: 'Pyotr', Хорошо: 'Khorosho', Цветаева: 'Tsvetayeva', Чехов: 'Chekhov', 'Сколько это стоит?': 'Skolko eto stoit?',
  };
  for (const [ru, r] of Object.entries(roman)) assert.equal(ruToRoman(ru), r, ru);
  assert.equal(ruToRoman('СССР'), 'SSSR', '모두 대문자');
  // readingFor: 한국어 사용자 → 한글, 그 밖 → 로마자, 러시아어 사용자 → 생략 (소리 표기 없이 바로)
  assert.equal(readingFor('Спасибо!', 'ru', 'ko'), '스파시보!');
  for (const v of ['en', 'tr', 'ja', 'zh', 'th', 'ar', 'fr']) assert.equal(readingFor('Спасибо!', 'ru', v), 'Spasibo!', v);
  assert.equal(readingFor('Спасибо!', 'ru', 'ru'), '');
  assert.ok(!needsSound('ru', 'ko') && !needsSound('ru', 'en'));
  // 러시아어 사용자에게 다른 언어
  assert.equal(readingFor('감사합니다', 'ko', 'ru'), 'Gamsahamnida');
  assert.equal(readingFor('ขอบคุณ', 'th', 'ru', 'khɔp-khun'), 'Khop-khun');
  assert.equal(readingFor('Merhaba', 'tr', 'ru'), '');
});

test('숫자: 러시아어 수 낱말 · 격 변화형 · полтора · с половиной · 천 단위 띄어쓰기 · тыс.', () => {
  const cases = {
    'двести пятьдесят рублей': [250], 'две тысячи пятьсот': [2500], 'полторы тысячи': [1500], 'три с половиной': [3.5], '3 с половиной кг': [3.5],
    'две с половиной тысячи': [2500], '15 тыс. руб.': [15000], '15 000 ₽': [15000], '1 500 000 рублей': [1500000], '1,5 млн': [1500000], '15 тысяч рублей': [15000],
    'пятнадцати': [15], 'сто двадцать пять': [125], 'тысяча двести': [1200], 'девяносто девять': [99], 'двух': [2], 'трёх дней': [3], 'пятидесяти': [50],
    'двое': [2], 'два-три дня': [2, 3], 'сорок': [40], 'Я люблю свою семью': [], 'Привет, как дела?': [],
  };
  for (const [text, want] of Object.entries(cases)) assert.deepEqual(values(text), want, text);
  assert.deepEqual(numberMentions('один билет', 'ru'), [{ alts: [1], word: true }], 'один은 낱말로 쓴 1');
  assert.ok(!inventsNumber('Один билет, пожалуйста.', 'ru', new Set()));
  assert.ok(!inventsNumber('Одна штука.', 'ru', new Set()));
  assert.ok(inventsNumber('Цена триста рублей', 'ru', new Set([250])));
  assert.ok(!inventsNumber('Цена 15 тыс. рублей', 'ru', new Set([15000])), '15 тыс. = 15000');
});

test('답장 추천 · 합의 요약: 러시아어 수 낱말도 대화에 나온 숫자로 맞추고, 지어낸 숫자 · 글자가 틀린 답은 버린다', () => {
  const turns = [
    { side: 'me', from: 'ko', to: 'ru', text: '단가가 얼마예요? 100개 사면요?', translation: 'Какая цена за штуку? Если взять 100?' },
    { side: 'partner', from: 'ru', to: 'ko', text: 'Двести пятьдесят рублей за штуку, при заказе от ста штук — двести. Отправим через три дня.', translation: '개당 250루블, 100개부터는 200루블이에요. 3일 뒤에 보내요.' },
  ];
  const v = validateSuggest({ me: 'ko', partner: 'ru', turns }).value;
  const raw = JSON.stringify([
    { ko: '좋아요, 100개 주문할게요.', ru: 'Хорошо, закажу сто штук.' },
    { ko: '150개면요?', ru: 'А если взять сто пятьдесят?' },            // 150은 대화에 없음
    { ko: '200루블 맞죠?', ru: 'Двести рублей, верно?' },
    { ko: '좋아요.', ru: 'Okay' },                                      // 러시아어가 아님
    { ko: '이틀 안에 보내 주세요.', ru: 'Отправьте, пожалуйста, за два дня.' }, // 2는 대화에 없음
  ]);
  assert.deepEqual(cleanSuggestions(raw, v), [
    { me: '좋아요, 100개 주문할게요.', partner: 'Хорошо, закажу сто штук.' },
    { me: '200루블 맞죠?', partner: 'Двести рублей, верно?' },
  ]);
  const summary = cleanSummary({
    price: { ko: '개당 200루블', ru: '200 ₽ за штуку' },
    quantity: { ko: '100개', ru: 'сто штук' },
    delivery: { ko: '3일 뒤', ru: 'через три дня' },
    other: { ko: '', ru: 'не указано' },
  }, { me: 'ko', partner: 'ru', turns });
  assert.deepEqual(summary.fields.price, { me: '개당 200루블', partner: '200 ₽ за штуку' });
  assert.deepEqual(summary.fields.quantity, { me: '100개', partner: 'сто штук' });
  assert.deepEqual(summary.fields.delivery, { me: '3일 뒤', partner: 'через три дня' });
  assert.deepEqual(summary.fields.other, { me: '', partner: '' }, '"не указано"는 빈칸');
  const bad = cleanSummary({ price: { ko: '개당 180루블', ru: 'сто восемьдесят рублей' } }, { me: 'ko', partner: 'ru', turns });
  assert.deepEqual(bad.fields.price, { me: '', partner: '' }, '지어낸 가격은 두 언어 모두 비운다');
  assert.ok(packOf('ru').none.test('Нет'));
});

test('자동 감지: 키릴 문자가 많으면 ru (상표 · 숫자가 섞여도)', () => {
  for (const s of ['Сколько это стоит?', 'Здравствуйте', 'спасибо', 'Сколько стоит iPhone 15?', 'Можно оплатить картой?', 'ДА']) assert.equal(detectLang(s, 'ko'), 'ru', s);
  assert.equal(detectLang('iPhone 15 за 90 000 ₽?', 'ko'), 'ko', '키릴 글자가 30%가 안 되면 기본값 (상표가 대부분인 짧은 글)');
  assert.equal(detectLang('Hello', 'ru'), 'en');
  assert.equal(detectLang('Novotel 5', 'ru'), 'ru', '고유명사뿐이면 기본값');
  assert.equal(detectLang('Merhaba', 'ru'), 'tr');
  assert.equal(lineLang('Борщ 350 ₽', ''), 'ru');
});

test('표현집: 모든 문장에 러시아어 — 키릴 문자 · 문장 부호 · 성별로 갈리는 과거형 없음 · 한글 발음이 나온다', () => {
  for (const p of PHRASES) {
    assert.match(p.ru, /[А-Яа-яЁё]/, p.ko);
    assert.match(p.ru, /[.!?]$/, `문장 끝: ${p.ru}`);
    assert.doesNotMatch(p.ru, /[가-힣]/, p.ru);
    assert.doesNotMatch(p.ru, /\b(?:потерял|заблудил|понял|рад|рада|кореец|кореянка)/i, `성별로 갈리는 말: ${p.ru}`);
    assert.doesNotMatch(p.ru, /(?:^|\s)(?:ты|тебя|тебе|твой)(?:\s|[.,!?]|$)/i, `вы 말투: ${p.ru}`);
    assert.equal(phraseSound(p, 'ru'), '', '읽는 법은 글에서 바로');
    assert.match(readingFor(p.ru, 'ru', 'ko'), /^[가-힣 ,.!?—-]+(?:Wi-Fi\?)?$/, `한글 발음 (Wi-Fi 같은 라틴 낱말은 그대로): ${p.ru}`);
    assert.match(readingFor(p.ru, 'ru', 'en'), /^[A-Za-z ,.!?—'-]+$/, `로마자: ${p.ru}`);
  }
  const byKo = (ko) => PHRASES.find((p) => p.ko === ko);
  assert.equal(readingFor(byKo('감사합니다.').ru, 'ru', 'ko'), '스파시보.');
  assert.equal(readingFor(byKo('안녕하세요.').ru, 'ru', 'ko'), '즈드라스트부이테.');
  assert.equal(readingFor(byKo('이거 얼마예요?').ru, 'ru', 'en'), 'Skolko eto stoit?');
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'ru', 'ko').includes('러시아어를 잘 못해요.'));
  assert.ok(ko('talk', 'ko', 'ru').includes('저는 러시아어를 해요.'));
  assert.ok(ko('help', 'ko', 'ru').includes('저희 나라 대사관에 연락해 주세요.'));
  assert.equal(byKo('저는 프랑스어를 해요.').ru, 'Я говорю по-французски.');
  assert.equal(byKo('프랑스어를 잘 못해요.').ru, 'Я плохо говорю по-французски.');
});

test('화면 문구(러시아어): 키릴 문자로 · вы 말투 · 상대 안내 · 업데이트 버튼 · 말투 · 앱 정보(11개 언어)', () => {
  for (const [k, s] of Object.entries(MESSAGES.ru)) {
    if (!/^[A-Za-z0-9\s.()/:·→✕×{}-]+$/.test(s)) assert.match(s, /[А-Яа-яЁё]/, `ru.${k}`);
    if (k !== 'set.toneHint') assert.doesNotMatch(s, /(?:^|[\s«(])(?:ты|тебя|тебе|твой|твоя|твои)(?=[\s.,!?»)]|$)/i, `вы 말투: ru.${k}`);
  }
  assert.equal(tl('ru', 'mic.partnerHint'), 'Нажмите кнопку справа и говорите по-русски.');
  assert.match(tl('ru', 'set.updateHint'), /Обновить/);
  assert.match(tl('ru', 'set.toneHint'), /您/);
  assert.match(tl('ru', 'set.toneHint'), /вы\/ты/);
  assert.match(tl('ru', 'set.about'), /11 языков.*китайский.*французский/);
  assert.match(tl('ru', 'set.voiceSample'), /^Здравствуйте/);
  assert.match(tl('ru', 'err.paused'), /\{time\}/);
  assert.equal(tl('ru', 'lang.ko'), 'корейский');
  assert.equal(tl('ru', 'lang.fr'), 'французский');
  assert.equal(tl('ko', 'lang.ru'), '러시아어');
  assert.equal(tl('ru', 'share.translateTo', { lang: tl('ru', 'lang.ko') }), 'Перевести на корейский');
});

test('사진: 러시아어 줄 — 줄 언어 · 읽는 법은 화면이 글에서 · 번역 점검, 러시아어 사용자에게는 러시아어로 (가짜 AI 답)', () => {
  assert.doesNotMatch(buildPhotoMessages({ me: 'ko' }, 'x')[0].content, /Russian →/, '러시아어 읽기는 서버에서 받지 않는다');
  const menu = {
    lines: [
      { text: 'Борщ 350 ₽', lang: 'ru', tr: '보르시 350루블', read: 'Borshch' },
      { text: 'Пельмени — 420 ₽', lang: 'ru', tr: '펠메니 — 420루블' },
      { text: 'Блины с икрой 1 200 ₽', lang: 'ru', tr: '캐비아 블리니 1,200루블' },
      { text: 'Чай 150 ₽', lang: 'ru', tr: '차 180루블' },                    // 지어낸 가격
      { text: 'Квас', tr: '크바스' },                                        // lang 없음 → 글자로
    ],
    summary: '러시아 식당 메뉴로, 보르시가 350루블이에요.',
  };
  const ko = cleanPhoto(menu, { me: 'ko' });
  assert.deepEqual(ko.lines[0], { text: 'Борщ 350 ₽', lang: 'ru', tr: '보르시 350루블', read: '' }, '읽기는 받지 않고 화면이 만든다');
  assert.equal(readingFor(ko.lines[0].text, 'ru', 'ko', ko.lines[0].read), '보르시 350 ₽');
  assert.equal(readingFor(ko.lines[1].text, 'ru', 'en'), 'Pelmeni — 420 ₽');
  assert.equal(ko.lines[2].tr, '캐비아 블리니 1,200루블', '1 200 = 1,200');
  assert.equal(ko.lines[3].check, 'number');
  assert.equal(ko.lines[4].lang, 'ru');
  assert.equal(ko.summary, menu.summary);
  // 러시아어 사용자: 태국어 · 중국어 줄을 러시아어로 (태국어는 로마자 읽기를 받는다)
  const ru = cleanPhoto({
    lines: [
      { text: 'ข้าวผัดกุ้ง 80 บาท', lang: 'th', tr: 'Жареный рис с креветками, 80 бат', read: 'khao-phat kung 80 bat' },
      { text: '买2送1', lang: 'zh', tr: 'Купи 2 — получи 1 в подарок', read: 'mǎi èr sòng yī' },
      { text: '限时三天', lang: 'zh', tr: 'Только три дня', read: 'xiànshí sān tiān' },
      { text: '包邮', lang: 'zh', tr: 'Бесплатная доставка за пять дней' },       // 5는 원문에 없음
      { text: '正品', lang: 'zh', tr: 'Original' },                              // 러시아어가 아님
      { text: 'Борщ', lang: 'ru', tr: 'Borscht' },
    ],
    summary: 'Меню и страница товара: рис с креветками за 80 бат.',
  }, { me: 'ru' });
  assert.equal(ru.lines[0].tr, 'Жареный рис с креветками, 80 бат');
  assert.equal(ru.lines[0].read, 'khao-phat kung 80 bat');
  assert.equal(readingFor(ru.lines[0].text, 'th', 'ru', ru.lines[0].read), 'Khao-phat kung 80 bat');
  assert.equal(ru.lines[1].tr, 'Купи 2 — получи 1 в подарок');
  assert.equal(ru.lines[2].tr, 'Только три дня', '三 = три = 3');
  assert.equal(ru.lines[3].check, 'number');
  assert.equal(ru.lines[4].check, 'lang');
  assert.deepEqual(ru.lines[5], { text: 'Борщ', lang: 'ru', tr: '', read: '' }, '이미 내 언어');
  assert.equal(ru.summary, 'Меню и страница товара: рис с креветками за 80 бат.');
});
