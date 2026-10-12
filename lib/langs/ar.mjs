// 아랍어 — 서버 쪽 정보 (번역 지시문 · 결과 점검 · 받아쓰기 · 숫자 읽기 · 소리 표기 · 사진 읽는 법)
// 말투: 방언이 아닌 쉬운 현대 표준 아랍어(فصحى) — 상대가 어느 나라 사람인지 모르고(걸프 · 이집트 · 레반트 · 마그레브 방언은 서로 많이 다르다),
// 표준어는 어느 나라에서나 읽히고 기기 목소리도 표준어를 잘 읽는다. 상대 성별을 모르므로 성별이 드러나지 않는 말(هل يمكن… · الرجاء + 동명사)을 먼저,
// 어쩔 수 없으면 표준어의 기본인 남성 단수로.
// 소리 표기 로마자 방식 · 한글 · 다듬은 로마자는 public/js/read/ar.js (화면과 같이 쓴다)
import { cleanOutput } from '../text.mjs';
import { normRoman, arabicWordCount, romanWordCount } from '../../public/js/read/ar.js';

const AR_LETTER = /[ء-يٱ-ۓ]/;
// 페르시아어 · 우르두어에만 쓰는 글자 (아랍어로 옮겨 달랬는데 이것이 나오면 다른 언어로 쓴 것)
const PERSIAN_URDU = /[پچژگٹڈڑںے]/;

// ---------- 숫자 ----------
/** 숫자를 찾기 쉽게: 모음 부호 · 늘임표 빼기, 알리프 · 야 · 타 마르부타 모양 하나로, 아랍 숫자 → 보통 숫자 */
export const normArabic = (s) => String(s ?? '')
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
  .replace(/(?<=\d)٫(?=\d)/g, '.').replace(/(?<=\d)٬(?=\d)/g, ',');

// 수 낱말 (normArabic 모양): kind — unit(0~9) · ten(10, 앞 unit과 붙으면 11~19) · teen · tens · hundred(100, 앞 unit과 곱함) · hundreds · scale · dual
const NUM = {};
const def = (kind, value, words, extra = {}) => { for (const w of words.split(' ')) NUM[normArabic(w)] = { kind, value, ...extra }; };
def('unit', 0, 'صفر');
def('unit', 1, 'واحد واحدة أحد إحدى');
def('unit', 2, 'اثنان اثنين اثنتان اثنتين اثنا اثني اثنتا اثنتي اتنين ثنتين', { day: true }); // يوم الاثنين = 월요일
def('unit', 3, 'ثلاثة ثلاث تلاتة تلات');
def('unit', 4, 'أربعة أربع');
def('unit', 5, 'خمسة خمس');
def('unit', 6, 'ستة ست');
def('unit', 7, 'سبعة سبع');
def('unit', 8, 'ثمانية ثماني ثمان تمانية');
def('unit', 9, 'تسعة تسع');
def('ten', 10, 'عشرة عشر');
// 이집트 · 레반트 입말의 한 낱말 십몇
[[11, 'حداشر'], [12, 'اتناشر طناشر'], [13, 'تلتاشر'], [14, 'أربعتاشر'], [15, 'خمستاشر'], [16, 'ستاشر'], [17, 'سبعتاشر'], [18, 'تمنتاشر'], [19, 'تسعتاشر']]
  .forEach(([v, w]) => def('teen', v, w));
[[20, 'عشرون عشرين'], [30, 'ثلاثون ثلاثين تلاتين'], [40, 'أربعون أربعين'], [50, 'خمسون خمسين'], [60, 'ستون ستين'], [70, 'سبعون سبعين'], [80, 'ثمانون ثمانين تمانين'], [90, 'تسعون تسعين']]
  .forEach(([v, w]) => def('tens', v, w));
def('hundred', 100, 'مائة مئة مية');
[[200, 'مائتان مائتين مئتان مئتين ميتين'], [300, 'ثلاثمائة ثلاثمئة تلاتمية'], [400, 'أربعمائة أربعمئة'], [500, 'خمسمائة خمسمئة خمسمية'],
  [600, 'ستمائة ستمئة'], [700, 'سبعمائة سبعمئة'], [800, 'ثمانمائة ثمانمئة ثمانيمائة'], [900, 'تسعمائة تسعمئة']].forEach(([v, w]) => def('hundreds', v, w));
def('scale', 1000, 'ألف آلاف ألاف');
def('scale', 1000, 'ألفان ألفين', { dual: true });
def('scale', 1e6, 'مليون ملايين');
def('scale', 1e6, 'مليونان مليونين', { dual: true });
// 쌍수(둘): 숫자 낱말 없이 '둘'을 말한다 — يومين = 이틀, ريالين = 2리얄
def('dual', 2, 'يومين يومان ساعتين ساعتان أسبوعين أسبوعان شهرين شهران سنتين سنتان ليلتين ليلتان مرتين مرتان قطعتين قطعتان حبتين حبتان علبتين علبتان كيلوين ريالين ريالان دولارين دولاران درهمين درهمان دينارين ديناران جنيهين جنيهان شخصين شخصان');

const PREFIX = ['و', 'ف', 'ب', 'ل', 'ك', 'ال', 'لل', 'وال', 'بال', 'فال', 'كال', 'وب', 'ول', 'وبال', 'ولل'];
/** 낱말 → 수 정보 (앞에 붙은 و · ب · ال … 은 떼어 본다. و로 이어졌으면 joined) */
function lookup(tok) {
  if (NUM[tok]) return NUM[tok];
  for (const pre of PREFIX) {
    const rest = tok.slice(pre.length);
    if (tok.startsWith(pre) && rest.length >= 3 && NUM[rest]) return { ...NUM[rest], joined: pre[0] === 'و' };
  }
  return null;
}

/** 앞 덩어리에 이어지는 수 낱말인가 (خمسة وعشرون = 25 · مائة وخمسون = 150 · ثلاثة آلاف = 3000 · خمسة عشر = 15) */
function joins(run, w) {
  if (w.kind === 'dual' || run.last === 'dual') return false;
  if (w.joined) {
    if (run.last === 'unit' && w.kind === 'tens') return true;
    if ((run.last === 'hundred' || run.last === 'hundreds') && ['unit', 'ten', 'teen', 'tens'].includes(w.kind)) return true;
    if (run.last === 'scale') return w.kind !== 'scale' || w.value < run.scale;
    return false;
  }
  if (run.last === 'unit' && (w.kind === 'ten' || w.kind === 'hundred')) return true;
  return w.kind === 'scale' && run.last !== 'scale';
}

function add(run, w) {
  if (w.kind === 'hundred' && run.last === 'unit' && !w.joined) run.section *= 100;      // ثلاث مائة = 300
  else if (w.kind === 'scale') {
    run.total += (run.section || (w.dual ? 2 : 1)) * w.value;
    run.section = 0;
    run.scale = w.value;
  } else run.section += w.value;
  run.last = w.kind;
}

// في المئة · بالمئة (퍼센트)의 مئة는 100이 아니다
const PERCENT = /(?:في\s?|ب)(?:ال)?(?:مائه|مئه|ميه)(?![ء-ي])/g;

/** 낱말로 쓴 수 덩어리 [{ start, end, value }] (normArabic 한 글에서) */
function wordRuns(t) {
  const out = [];
  let run = null, prev = '', lastEnd = 0;
  const close = () => { if (run) out.push({ start: run.start, end: run.end, value: Math.round((run.total + run.section) * 1000) / 1000 }); run = null; };
  for (const m of t.matchAll(/[ء-ي]+/g)) {
    if (run && !/^\s*$/.test(t.slice(lastEnd, m.index))) close();
    lastEnd = m.index + m[0].length;
    const w = lookup(m[0]);
    if (!w || (w.day && prev === 'يوم')) { close(); prev = m[0]; continue; }
    if (run && !joins(run, w)) close();
    run ??= { start: m.index, total: 0, section: 0, last: null, scale: 0 };
    add(run, w);
    run.end = lastEnd;
    prev = m[0];
  }
  close();
  return out;
}

const num = (n) => (/^\d{1,3}(?:,\d{3})+$/.test(n) ? Number(n.replace(/,/g, '')) : Number(n.replace(',', '.')));
const round = (x) => Math.round(x * 1000) / 1000;
const HALF = '(?:\\s+([\\u0621-\\u064A]+))?\\s+و\\s?(نصف|نص|ربع)(?![\\u0621-\\u064A])';
const plusHalf = (v, h) => round(v + (h === 'ربع' ? 0.25 : 0.5));

/**
 * 숫자로 바꿔 읽기 (numberMentions가 먼저 부른다): 15 ألف = 15000 · 1.5 مليون · أربعة عشر ونصف = 14.5 · 14 ريال ونصف = 14.5 ريال · وربع = .25.
 * 숫자 찾기에만 쓰는 글이라 모음 부호를 빼고 글자 모양을 하나로 맞춘 글을 돌려준다
 */
export function arDecimals(text) {
  let t = normArabic(text).replace(PERCENT, ' ');
  t = t.replace(/(\d+(?:[.,]\d+)*)\s*(الف|الاف|مليون|ملايين)(?![ء-ي])/g, (m, n, w) => String(round(num(n) * (w[0] === 'م' ? 1e6 : 1e3))));
  for (const r of wordRuns(t).reverse()) {
    const m = t.slice(r.end).match(new RegExp(`^${HALF}`));
    if (m && !(m[1] && lookup(m[1]))) t = `${t.slice(0, r.start)}${plusHalf(r.value, m[2])}${m[1] ? ` ${m[1]}` : ''}${t.slice(r.end + m[0].length)}`;
  }
  return t.replace(new RegExp(`(\\d+(?:[.,]\\d+)?)${HALF}`, 'g'), (m, n, unit, h) => `${plusHalf(num(n), h)}${unit ? ` ${unit}` : ''}`);
}

/** 낱말로 쓴 수 (아라비아 숫자 · 아랍 숫자 ٠١٢ 는 assist-core가 읽는다) — 낱말로 쓴 1(واحد · أحد)도 word: true */
export function arNumbers(text) {
  const t = normArabic(text).replace(PERCENT, ' ');
  const out = wordRuns(t).map((r) => ({ alts: [r.value], word: true }));
  for (const m of t.matchAll(/(?:^|[^ء-ي])(?:[وب]?ال)?نصف(?![ء-ي])/g)) out.push({ alts: [0.5], word: true }); // نصف كيلو
  return out;
}

// ---------- 소리 표기 (/api/sound · 사진 읽는 법) ----------
const ROMAN_LABEL = /^\s*(?:romanization|romanisation|transliteration|pronunciation|reading|latin)\s*[:：-]\s*/i;
/** 모델 답 → 로마자 소리 표기 (아랍 문자 · 다른 문자가 섞였거나 모음이 없으면 빈 값) */
export function cleanArabicSound(raw, text = '') {
  const lines = cleanOutput(raw, text).split('\n').map((x) => x.trim()).filter(Boolean);
  let s = String(text).includes('\n') ? lines.join(' ') : lines[0] || '';
  s = normRoman(cleanOutput(s.replace(ROMAN_LABEL, '')));
  if (/[^\P{L}\p{Script=Latin}]/u.test(s.replace(/[ʿʾ]/g, ''))) return ''; // 라틴 문자가 아닌 글자 (아랍 문자를 그대로 돌려줌 등)
  if (!/[aeiouāīūēō]/i.test(s)) return '';
  return s;
}
/** 낱말 수가 대충 맞나 (모델이 문장 뒷부분을 빼먹었거나 설명을 덧붙였는지) */
export const arabicSoundMatches = (sound, text) => {
  const a = arabicWordCount(text), r = romanWordCount(sound);
  return a > 0 && r >= Math.max(1, Math.floor(a * 0.6)) && r <= a * 2 + 1;
};

export default {
  register: [
    'Use polite, simple Modern Standard Arabic (فصحى) that is understood in every Arab country — no dialect. The listener\'s gender is unknown: prefer wording that does not show it (هل يمكن…، الرجاء + verbal noun, لو سمحت); if you must choose, use the masculine singular.',
    'Use simple, friendly Modern Standard Arabic — no dialect. The listener\'s gender is unknown: prefer wording that does not show it; if you must choose, use the masculine singular.',
  ],
  script: 'Arabic must be written in Arabic script without full vowel marks (tashkeel) and without romanization. Write numbers with the same digits as the original (15, not ١٥).',
  /** 아랍 글자가 (원문에 없는) 라틴 글자보다 많아야 하고, 페르시아어 · 우르두어 글자가 없어야 */
  valid(out, { text }) {
    if (PERSIAN_URDU.test(out) && !PERSIAN_URDU.test(text)) return false;
    const latin = (out.match(/\p{Script=Latin}+/gu) || []).filter((w) => !String(text).includes(w)).join('').length;
    const arab = (out.match(/[ء-يٱ-ۓ]/g) || []).length;
    return arab >= latin;
  },
  // Whisper가 조용한 녹음에서 지어내는 아랍어 자막 문장 (유튜브 자막 끝인사 · 번역자 이름)
  hallucinations: [
    /نانسي\s*قنقر/, /^(?:ال)?ترجمة\s*[:：]?\s*(?:نانسي|وتدقيق|بواسطة)/, /^تم\s+(?:ال)?ترجمة/,
    /^(?:لا\s+تنس(?:وا|ى)?\s+(?:ال)?اشتراك|اشترك(?:وا)?\s+(?:في|ب)\s*(?:ال)?قناة)/,
    /^شكرا[ً]?\s+(?:لكم\s+)?(?:على\s*(?:ال)?|لل?)(?:مشاهدة|متابعة)/, /^[[(]?\s*موسيقى\s*[\])]?\.?$/,
  ],
  decimals: arDecimals,
  numbers: arNumbers,
  // 요약 칸의 "없음"
  none: /^(?:لا\s?يوجد|لا\s?شيء|غير\s?محدد[ةه]?|غير\s?معروف[ةه]?|غير\s?مذكور[ةه]?|لم\s?ي(?:ُ)?ذكر|لا\s?ينطبق|بدون|لا)\.?$/,
  sound: {
    validate: (text) => (AR_LETTER.test(text) ? null : { error: '아랍어 글이 아니에요.', code: 'bad_request' }),
    messages: (text) => [
      {
        role: 'system',
        content: [
          'Write how the Arabic text is pronounced, in Latin letters with all the vowels (romanization), as it is read aloud in Modern Standard Arabic.',
          'Rules:',
          '- Vowels: a i u, long ā ī ū, diphthongs ay aw. Write every vowel you pronounce, also the short vowels that Arabic script does not show.',
          '- Consonants: b t th j ḥ kh d dh r z s sh ṣ ḍ ṭ ẓ gh f q k l m n h w y, ʿ for ع and ʾ for hamza inside a word. Write a doubled consonant (shadda) twice: Muḥammad.',
          '- The article al- with a hyphen, assimilated before sun letters: al-qamar, ash-shams, as-salām.',
          '- No case ending on the last word of a sentence (pause form).',
          '- One romanized word for each Arabic word, in the same order. Keep numbers as digits (١٥ → 15) and keep , . ? !',
          '- Output ONLY the romanization, nothing else.',
          'Examples: مرحبا → marḥabā · شكرا → shukran · السلام عليكم → as-salāmu ʿalaykum · كم سعر هذا؟ → kam siʿru hādhā?',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ],
    clean: cleanArabicSound,
    matches: arabicSoundMatches,
  },
  photoRead: 'Arabic → romanization with all vowels (ā ī ū, sh kh gh th dh, ḥ ṣ ḍ ṭ ẓ, ʿ for ع, doubled consonants twice, al- with a hyphen), e.g. "shāwarmā dajāj"',
};
