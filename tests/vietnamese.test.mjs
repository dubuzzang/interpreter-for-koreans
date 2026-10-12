// 베트남어(vi, v1.6.0): 언어 정보 · 번역 지시문 · 결과 점검 · 받아쓰기 · 한글 발음 · 숫자 · 자동 감지 · 표현집 · 화면 문구 · 사진 줄 · 목소리
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate, sttLanguage, STT_PROMPT } from '../lib/translate-core.mjs';
import { numberMentions, allowedNumbers, inventsNumber, cleanSuggestions, cleanSummary } from '../lib/assist-core.mjs';
import { lineLang, cleanPhoto, buildPhotoMessages } from '../lib/photo-core.mjs';
import { validateSound } from '../lib/sound-core.mjs';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { readingFor, needsSound, hasSound } from '../public/js/reading.js';
import { viToHangul } from '../public/js/read/vi.js';
import { LANGS, CODES, detectLang } from '../public/js/lang.js';
import { MESSAGES, tl, defaultLang, startLangs } from '../public/js/i18n.js';
import { PHRASES, phrasesFor, phraseSound } from '../public/js/phrases.js';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const values = (text, lang = 'vi') => numberMentions(text, lang).flatMap((m) => m.alts);
const VI_MARKS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

test('베트남어 언어 정보: vi (vi-VN) · 모든 언어와 짝 · 베트남어 브라우저는 베트남어 화면', () => {
  const { code, native, flag, bcp47, short, script } = LANGS.vi;
  assert.deepEqual({ code, native, flag, bcp47, short, script }, { code: 'vi', native: 'Tiếng Việt', flag: '🇻🇳', bcp47: 'vi-VN', short: 'VI', script: 'Latn' });
  for (const c of CODES.filter((x) => x !== 'vi')) {
    assert.ok(validateTranslate({ text: 'Xin chào', from: 'vi', to: c }).value, `vi → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'vi' }).value, `${c} → vi`);
  }
  assert.equal(defaultLang(['vi-VN', 'en']), 'vi');
  assert.deepEqual(startLangs({}, ['vi']), { me: 'vi', partner: 'ko' });
});

test('번역 지시문: 베트남어 부호 · 성조 규칙, 말투(공손: tôi · ạ / 편한 말: mình)', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.match(sys('ko', 'vi'), /from Korean into Vietnamese/);
  assert.match(sys('ko', 'vi'), /all diacritics and tone marks/);
  assert.match(sys('ko', 'vi'), /polite, natural Vietnamese.*tôi.*ạ/);
  assert.match(sys('ko', 'vi', false), /casual Vietnamese.*mình/);
  assert.notEqual(sys('ko', 'vi', true), sys('ko', 'vi', false));
  assert.match(sys('vi', 'ko'), /from Vietnamese into Korean/);
  assert.doesNotMatch(sys('vi', 'ko'), /tone marks/, '옮길 언어의 규칙만');
});

test('베트남어 결과 점검: 부호가 없는 긴 글은 다음 모델로, 짧은 답(OK · 이름 · 상표)은 봐준다', () => {
  const to = (out, text = '이거 얼마예요?') => looksValid(out, { text, from: 'ko', to: 'vi' });
  assert.ok(to('Cái này bao nhiêu tiền?'));
  assert.ok(to('Vâng.'));
  assert.ok(to('OK'), '짧은 답');
  assert.ok(to('iPhone 15 Pro', '아이폰 15 프로'), '상표');
  assert.ok(!to('Cai nay bao nhieu tien?'), '부호를 뺀 베트남어');
  assert.ok(!to('How much is this one?'), '영어로 옮김');
  assert.ok(!to('Cái này 얼마'), '한글이 남음');
  assert.ok(!to('这个多少钱'), '한자');
  assert.ok(looksValid('이거 얼마예요?', { text: 'Cái này bao nhiêu tiền?', from: 'vi', to: 'ko' }));
  assert.ok(looksValid('How much is this?', { text: 'Cái này bao nhiêu tiền?', from: 'vi', to: 'en' }));
  assert.ok(!looksValid('Cái này bao nhiêu tiền?', { text: 'Cái này bao nhiêu tiền?', from: 'vi', to: 'en' }), '원문 그대로');
  assert.equal(cleanOutput('Tiếng Việt: Xin chào'), 'Xin chào');
  assert.equal(cleanOutput('Vietnamese: Xin chào'), 'Xin chào');
  assert.equal(cleanOutput('Bản dịch: Cảm ơn bạn'), 'Cảm ơn bạn');
});

test('받아쓰기: Whisper에 vi (첫 문장 없음), 베트남어 유튜브 끝인사 · 구독 부탁은 버린다', async () => {
  assert.equal(sttLanguage('vi'), 'vi');
  assert.equal(STT_PROMPT.vi, undefined);
  for (const s of [
    'Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn',
    'Các bạn hãy đăng ký cho kênh lalaschool Để không bỏ lỡ những video hấp dẫn',
    'Cảm ơn các bạn đã theo dõi.', 'Hẹn gặp lại các bạn trong những video tiếp theo.', 'Hãy đăng ký kênh để ủng hộ mình nhé!',
  ]) assert.equal(cleanTranscript(s), '', s);
  for (const s of ['Cảm ơn.', 'Cảm ơn bạn, tôi lấy hai cái.', 'Cái này bao nhiêu tiền?']) assert.equal(cleanTranscript(s), s);
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' Cái này bao nhiêu tiền? ' }; } };
  const req = new Request(`${ORIGIN}/api/stt?lang=vi`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '3.3.3.5' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req, env: { AI } })).json(), { text: 'Cái này bao nhiêu tiền?' });
  assert.equal(calls[0].language, 'vi');
  assert.equal(calls[0].initial_prompt, undefined);
});

test('베트남어 → 한글 발음: 국립국어원 「베트남어 자모와 한글 대조표」 (잘 알려진 표기와 같게)', () => {
  const cases = {
    'Hà Nội': '하노이', 'Hồ Chí Minh': '호찌민', 'Đà Nẵng': '다낭', phở: '퍼', 'cảm ơn': '깜 언', 'Nha Trang': '냐짱', 'Phú Quốc': '푸꾸옥',
    'Việt Nam': '비엣남', Huế: '후에', 'Hội An': '호이안', 'Hải Phòng': '하이퐁', 'Cần Thơ': '껀터', 'Vũng Tàu': '붕따우', 'Sa Pa': '사빠',
    'Mũi Né': '무이내', 'Bình Dương': '빈즈엉', 'Biên Hòa': '비엔호아', 'Ninh Bình': '닌빈', 'Điện Biên Phủ': '디엔비엔푸', 'Tây Ninh': '떠이닌',
    'Hưng Yên': '흥옌', 'Lâm Đồng': '럼동', 'Sóc Trăng': '속짱', 'Ngô Đình Diệm': '응오딘지엠', 'Nghệ An': '응에안',
    // 표기 세칙: nh (냐 · 끝은 ㄴ, a 뒤 '아인') · qu + a → 꽈 · y + 모음 → 한 음절 · 가운데 l → ㄹㄹ (사람 이름 빼고)
    'Thanh Hóa': '타인호아', 'Khánh Hòa': '카인호아', 'Quy Nhơn': '꾸이년', Quang: '꽝', quyên: '꾸옌', Nguyễn: '응우옌', yên: '옌',
    'Đà Lạt': '달랏', 'Hạ Long': '할롱', 'Gia Lai': '잘라이', 'Vĩnh Long': '빈롱', 'Nguyễn Thị Lan': '응우옌티란',
    // x도 s도 ㅅ (흔히 쓰는 '신 짜오' — v1.6.1에서 대조표의 ㅆ 대신)
    'xin chào': '신 짜오', 'Xin chào, cái này bao nhiêu tiền?': '신 짜오, 까이 나이 바오 니에우 띠엔?', 'Sài Gòn': '사이곤',
    'bánh mì': '바인 미', 'bún chả': '분 짜', 'cà phê sữa đá': '까 페 스어 다', 'không': '콩', 'người': '응으어이', 'được': '드억', 'tôi': '또이',
    gì: '지', giúp: '줍', 'nhé': '냬', 'nhiều': '니에우', 'Nhật': '녓', 'uống': '우옹', 'Hoàng': '호앙', 'Huỳnh': '후인', 'đẹp': '댑', 'sách': '삭',
    // 숫자 · 외래어 · 구두점은 그대로, 대문자 글도
    'Mật khẩu Wi-Fi là gì?': '멋 커우 Wi-Fi 라 지?', 'iPhone 15 giá 25.000.000đ': 'iPhone 15 자 25.000.000đ', 'PHỞ BÒ TÁI': '퍼 보 따이', 'taxi Grab': 'taxi Grab',
  };
  for (const [vi, ko] of Object.entries(cases)) assert.equal(viToHangul(vi), ko, vi);
  assert.equal(viToHangul(''), '');
  assert.equal(viToHangul('Xin chào'), '신 짜오', '성조 부호가 따로 붙은 글(NFD)도');
});

test('읽는 법: 한국어 사용자에게 베트남어는 한글 발음 (서버 없이), 다른 사용자에게는 적지 않음, 베트남어 사용자에게는 로마자 · 병음', () => {
  assert.equal(readingFor('Xin chào', 'vi', 'ko'), '신 짜오');
  assert.equal(readingFor('Cảm ơn', 'vi', 'ko', ''), '깜 언', '소리 표기가 필요 없다');
  for (const v of ['tr', 'en', 'ja', 'zh', 'zh-TW', 'th', 'ru', 'ar', 'fr']) assert.equal(readingFor('Xin chào', 'vi', v), '', v);
  assert.equal(readingFor('Xin chào', 'vi', 'vi'), '');
  assert.ok(!hasSound('vi') && !needsSound('vi', 'ko'));
  assert.equal(validateSound({ text: 'Xin chào', lang: 'vi' }).code, 'unsupported_lang', '/api/sound는 부르지 않는다');
  // 베트남어 사용자에게
  assert.equal(readingFor('안녕하세요', 'ko', 'vi'), 'Annyeonghaseyo');
  assert.equal(readingFor('你好', 'zh', 'vi', 'nǐ hǎo'), 'Nǐ hǎo');
  assert.equal(readingFor('駅はどこですか？', 'ja', 'vi', 'えきわ どこ ですか？'), 'Ekiwa doko desuka?');
  assert.equal(readingFor('Merhaba', 'tr', 'vi'), '', '라틴 문자 언어는 적지 않음');
  assert.ok(needsSound('zh', 'vi') && needsSound('ja', 'vi'));
});

test('숫자: 베트남어 낱말 수 (hai mươi lăm · năm trăm nghìn · một triệu hai · rưỡi · lẻ) · 50k · 25.000đ · 1 triệu 2', () => {
  const cases = {
    'hai mươi lăm nghìn': [25000], 'năm trăm nghìn đồng': [500000], 'chín mươi chín nghìn': [99000], 'bốn mươi tư': [44], 'mười lăm': [15],
    'hai mốt': [21], 'ba trăm hai': [302, 320], 'một triệu hai': [1000002, 1200000], 'một trăm lẻ năm': [105], 'hai triệu rưỡi': [2500000],
    'trăm rưỡi': [150], 'một tiếng rưỡi': [1.5], 'hai chục cái': [20], 'một nghìn không trăm năm mươi': [1050], 'hai ba ngày': [23, 2, 3],
    'Mua hai cái thì bao nhiêu?': [2], 'năm cái': [5],
    // 숫자가 아닌 것: năm = 해, ba = 아빠, một chút = 조금, mốt = 모레
    'năm nay': [], 'hai năm': [2], 'mười năm': [10], 'năm 2025': [2025], 'ba tôi': [], 'một chút': [], 'ngày mốt': [],
    // 아라비아 숫자 + 단위 낱말
    '50k': [50000], '25.000đ': [25000], '1 triệu 2': [1200000], '1tr2': [1200000], '500 nghìn': [500000], '2 triệu rưỡi': [2500000],
    '1,5 triệu': [1500000], '1 tiếng rưỡi': [1.5], '3 trăm 2': [320], '2 nghìn 5 cái': [2000, 5], '2.500.000 đồng': [2500000], '14,5': [14.5],
  };
  for (const [s, want] of Object.entries(cases)) assert.deepEqual(values(s), want, s);
  // 낱말로 쓴 1(một)은 관사처럼 흔해서 지어낸 숫자로 치지 않는다
  assert.ok(numberMentions('Cho tôi một vé.', 'vi').every((m) => m.word && m.alts.every((v) => v === 1)));
  const allowed = allowedNumbers([{ side: 'partner', from: 'vi', to: 'ko', text: 'Cái này 1.200.000đ.', translation: '이거 120만 동이에요.' }]);
  assert.ok(!inventsNumber('Một triệu hai được không?', 'vi', allowed), '1.200.000 = một triệu hai');
  assert.ok(!inventsNumber('1tr2 nhé', 'vi', allowed));
  assert.ok(inventsNumber('Một triệu được không?', 'vi', allowed), '대화에 없는 100만');
  assert.ok(!inventsNumber('Cho tôi một cái.', 'vi', allowed), 'một = 하나 (관사처럼)');
});

test('답장 추천 · 요약: 베트남어 판매자와의 대화에서 지어낸 숫자 · 부호 없는 답은 뺀다, "Không có"는 빈칸', () => {
  const turns = [
    { side: 'me', from: 'ko', to: 'vi', text: '이거 얼마예요?', translation: 'Cái này bao nhiêu tiền?' },
    { side: 'partner', from: 'vi', to: 'ko', text: 'Hai trăm năm mươi nghìn, mua hai cái thì bốn trăm rưỡi.', translation: '25만 동이고, 두 개 사면 45만 동이에요.' },
  ];
  const raw = JSON.stringify([
    { ko: '두 개에 45만 동이면 살게요.', vi: 'Hai cái 450 nghìn thì tôi lấy.' },
    { ko: '40만 동에 주세요.', vi: 'Bán cho tôi 400 nghìn nhé.' },
    { ko: '좀 깎아 주세요.', vi: 'Bot cho toi mot chut nhe ban oi.' },
    { ko: '조금만 깎아 주실 수 있어요?', vi: 'Bớt cho tôi một chút được không?' },
  ]);
  const out = cleanSuggestions(raw, { me: 'ko', partner: 'vi', turns });
  assert.deepEqual(out.map((s) => s.partner), ['Hai cái 450 nghìn thì tôi lấy.', 'Bớt cho tôi một chút được không?'], '40만은 지어낸 숫자, 부호 없는 답은 뺀다');
  const sum = cleanSummary({ price: { ko: '개당 25만 동', vi: '250.000đ một cái' }, quantity: { ko: '2개', vi: 'hai cái' }, delivery: { ko: '없음', vi: 'Không có' }, other: { ko: '', vi: 'Chưa rõ' } }, { me: 'ko', partner: 'vi', turns });
  assert.deepEqual(sum.fields.price, { me: '개당 25만 동', partner: '250.000đ một cái' });
  assert.deepEqual(sum.fields.quantity, { me: '2개', partner: 'hai cái' });
  assert.deepEqual(sum.fields.delivery, { me: '', partner: '' });
  assert.deepEqual(sum.fields.other, { me: '', partner: '' });
});

test('자동 감지: 베트남어 글자 · 흔한 낱말(부호 없이 써도) → vi, 튀르키예어 · 영어 · 프랑스어는 그대로', () => {
  for (const s of ['Xin chào, cái này bao nhiêu tiền?', 'Xin chào', 'Chào bạn', 'Cảm ơn', 'Bánh mì', 'Cà phê', 'Tôi tên là Minh', 'Phở bò', 'xin chao', 'cam on', 'bao nhieu tien', 'khong duoc'])
    assert.equal(detectLang(s, 'ko'), 'vi', s);
  const keep = {
    'Merhaba, nasılsınız?': 'tr', 'merhaba nasilsin tamam': 'tr', 'Hünkâr Beğendi': 'tr', 'Çay lütfen': 'tr', 'Where is the hotel?': 'en', 'I am Korean': 'en',
    Hello: 'en', 'Can I pay by card?': 'en', 'Café crème': 'fr', "Bonjour, c'est combien ?": 'fr', 'Je voudrais l’addition, s’il vous plaît.': 'fr', 'Et toi ?': 'fr',
  };
  for (const [s, want] of Object.entries(keep)) assert.equal(detectLang(s, 'ko'), want, s);
  assert.equal(detectLang('Taksim 2', 'tr'), 'tr', '고유명사뿐이면 기본값');
  assert.equal(detectLang('Grab 2', 'vi'), 'vi', '모르는 낱말뿐이면 기본값');
  assert.equal(detectLang('Kia', 'ko'), 'ko', '낱말 하나로는 정하지 않는다');
});

test('표현집: 모든 문장에 베트남어 — 베트남어 부호, 한국어 사용자에게 한글 발음(인터넷 없이), 베트남 사용자 문장', () => {
  for (const p of PHRASES) {
    const s = p.vi;
    assert.match(s, VI_MARKS, `베트남어 부호: ${s}`);
    assert.match(s, /[.?!]$/, `문장 끝: ${s}`);
    assert.doesNotMatch(s, /[぀-ヿ一-鿿가-힣]/, s);
    assert.notEqual(s, p.en, `영어 사본: ${s}`);
    assert.equal(phraseSound(p, 'vi'), '', '소리 표기 없음 (화면이 글에서 만든다)');
    const read = readingFor(s, 'vi', 'ko');
    assert.match(read, /[가-힣]/, s);
    assert.doesNotMatch(read.replace('Wi-Fi', ''), /[A-Za-zÀ-ỹ]/, `한글로 다 바뀌지 않음: ${s} → ${read}`);
  }
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'ko', 'vi').includes('저는 베트남 사람이에요.'));
  assert.ok(ko('talk', 'vi', 'ko').includes('베트남어를 잘 못해요.'));
  assert.ok(ko('help', 'ko', 'vi').includes('베트남 대사관에 연락해 주세요.'));
  assert.ok(!ko('help', 'ko', 'vi').some((s) => /한국 대사관|저희 나라/.test(s)));
  const by = (cat) => phrasesFor(cat, 'vi', 'ko').map((p) => p.vi).join(' ');
  for (const w of ['bao nhiêu tiền', 'Đắt quá', 'Bớt']) assert.ok(by('shop').includes(w), w);
  for (const w of ['Đơn giá', 'tối thiểu', 'hàng mẫu', 'phí vận chuyển', 'mã vận đơn', 'hóa đơn', 'hoàn tiền', 'Hàn Quốc']) assert.ok(by('order').includes(w), w);
  assert.equal(readingFor('Cái này bao nhiêu tiền?', 'vi', 'ko'), '까이 나이 바오 니에우 띠엔?');
});

test('화면 문구(베트남어): 영어 사본이 아닌 베트남어로, 상대 안내 · 업데이트 버튼 · 말투 안내 · 언어 이름', () => {
  const vi = MESSAGES.vi;
  const sameAsEnglish = Object.keys(vi).filter((k) => vi[k] === MESSAGES.en[k]);
  assert.deepEqual(sameAsEnglish.sort(), ['app.menu', 'install.android', 'install.ios', 'set.rateValue'], '영어와 같은 것은 상표 · 기호뿐');
  for (const [k, s] of Object.entries(vi)) {
    if ((s.match(/\p{L}+/gu) || []).length >= 3) assert.match(s, VI_MARKS, `vi.${k}`);
    assert.doesNotMatch(s.replace(/[가-힣]+ → /, '').replace(/こんにちは|你好|您\/你|вы\/ты/g, ''), /[぀-ヿ一-鿿Ѐ-ӿ]/, `vi.${k}`);
  }
  assert.equal(tl('vi', 'lang.vi'), 'Tiếng Việt');
  assert.equal(tl('vi', 'lang.ko'), 'Tiếng Hàn');
  assert.match(tl('vi', 'mic.partnerHint'), /tiếng Việt/);
  assert.ok(tl('vi', 'set.updateHint').includes('Cập nhật'), 'index.html 업데이트 알림 버튼 이름');
  assert.match(tl('vi', 'set.toneHint'), /您/);
  assert.match(tl('vi', 'set.about'), /Trung/);
  assert.match(tl('vi', 'err.paused', { time: '09:00' }), /09:00/);
  assert.equal(tl('vi', 'talk.ariaSpeak', { lang: tl('vi', 'lang.ko') }), 'Nói Tiếng Hàn');
  assert.equal(tl('ko', 'lang.vi'), '베트남어');
});

test('사진: 베트남어 줄 (글자 · 낱말로), 한국어 사용자에게 한글 발음은 화면이 만들고 지어낸 가격은 거른다, 베트남어 사용자 번역', () => {
  assert.equal(lineLang('Phở bò tái 65.000đ', 'vi'), 'vi');
  assert.equal(lineLang('Bánh mì thịt 25k', ''), 'vi');
  assert.equal(lineLang('Cà phê sữa đá', ''), 'vi');
  assert.equal(lineLang('Xin chào', 'en'), 'en', '모델이 준 앱 언어는 믿는다');
  const menu = cleanPhoto({
    lines: [
      { text: 'Phở bò tái 65.000đ', lang: 'vi', tr: '소고기 쌀국수(레어) 65,000동' },
      { text: 'Bánh mì thịt 25k', tr: '고기 반미 25,000동' },
      { text: 'Cà phê sữa đá', lang: 'vi', tr: '연유 아이스커피' },
      { text: 'Bún chả 50.000đ', lang: 'vi', tr: '분짜 70,000동' },
    ],
    summary: '베트남 식당 메뉴로, 쌀국수가 65,000동이에요.',
  }, { me: 'ko' });
  assert.deepEqual(menu.lines.map((l) => l.lang), ['vi', 'vi', 'vi', 'vi']);
  assert.equal(menu.lines[0].tr, '소고기 쌀국수(레어) 65,000동', '65.000đ = 65,000');
  assert.equal(menu.lines[1].tr, '고기 반미 25,000동', '25k = 25,000');
  assert.equal(menu.lines[3].tr, '', '원문에 없는 가격');
  assert.equal(menu.lines[3].check, 'number');
  assert.ok(menu.lines.every((l) => l.read === ''), '베트남어 읽는 법은 서버에서 받지 않는다');
  assert.equal(readingFor(menu.lines[0].text, 'vi', 'ko', menu.lines[0].read), '퍼 보 따이 65.000đ');
  assert.equal(menu.summary, '베트남 식당 메뉴로, 쌀국수가 65,000동이에요.');
  // 베트남어 사용자가 중국 · 한국 · 일본 메뉴를 찍음
  const vi = cleanPhoto({
    lines: [
      { text: '牛肉面 25元', lang: 'zh', tr: 'Mì bò 25 tệ', read: 'niúròumiàn 25 yuán' },
      { text: '김치찌개 9,000원', lang: 'ko', tr: 'Canh kim chi 9.000 won' },
      { text: '生ビール 580円', lang: 'ja', tr: 'Bia tươi 580 yên', read: 'なまびーる 580えん' },
      { text: '辣', lang: 'zh', tr: '매워요' },
    ],
    summary: 'Thực đơn nhà hàng châu Á.',
  }, { me: 'vi' });
  assert.equal(vi.lines[0].tr, 'Mì bò 25 tệ');
  assert.equal(vi.lines[0].read, 'niúròumiàn 25 yuán', '베트남어 사용자에게 중국어는 병음');
  assert.equal(vi.lines[1].tr, 'Canh kim chi 9.000 won', '9,000 = 9.000');
  assert.equal(vi.lines[2].read, 'なまびーる 580えん');
  assert.equal(vi.lines[3].tr, '');
  assert.equal(vi.lines[3].check, 'lang', '베트남어 사용자에게 한국어 번역');
  assert.equal(vi.summary, 'Thực đơn nhà hàng châu Á.');
  assert.equal(cleanPhoto({ lines: [{ text: '辣', tr: 'Cay' }], summary: '매운 음식 메뉴' }, { me: 'vi' }).summary, '', '요약이 베트남어가 아님');
  const sys = buildPhotoMessages({ me: 'vi' }, 'x')[0].content;
  assert.match(sys, /translate each item into Vietnamese/);
  assert.match(sys, /Hanyu Pinyin/);
});

test('목소리: 베트남어 목소리만, 좋은 목소리(HoaiMy · NamMinh · Google) 먼저 (가짜 목소리 목록) · 받아쓰기 vi-VN', async () => {
  const VOICES = [
    { lang: 'vi-VN', name: 'Linh', voiceURI: 'linh' },
    { lang: 'en-US', name: 'Samantha', voiceURI: 'en' },
    { lang: 'vi_VN', name: 'Microsoft HoaiMy Online (Natural)', voiceURI: 'hoaimy' },
    { lang: 'vi', name: 'Tiếng Việt', voiceURI: 'vi-plain' },
  ];
  globalThis.window = { speechSynthesis: { getVoices: () => VOICES, addEventListener() {} } };
  const { voicesFor } = await import('../public/js/speech.js');
  const list = voicesFor('vi').map((v) => v.voiceURI);
  assert.equal(list[0], 'hoaimy', '좋은 목소리 먼저');
  assert.deepEqual(list.slice(1), ['linh', 'vi-plain'], 'vi-VN이 vi보다 먼저');
  assert.equal(LANGS.vi.bcp47, 'vi-VN', '브라우저 음성 인식 언어');
});
