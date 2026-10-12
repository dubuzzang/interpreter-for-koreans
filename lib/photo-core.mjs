// 사진 번역 서버 핵심 (/api/photo · /api/photo-summary, v1.5.0): 그림 검사 · 지시문 · 답 정리(지어내기 거르기)
// 그림은 Workers AI로 보내 읽기만 하고 어디에도 저장하지 않는다.
// 모델: 2026-10-12 실제 그림(타오바오 영상 프레임 · 샤오홍슈 사진 · 메뉴판 · 긴 상세 이미지)으로 견줘 고름 — README "사진 번역 엔진"
import { CODES, LANG_NAMES, cleanOutput, cleanPinyin, cleanKana } from './translate-core.mjs';
import { numberMentions, inventsNumber, parseCjkNumber, parseJsonLoose } from './assist-core.mjs';
import { pinyinSyllableCount, hanCount } from '../public/js/pinyin.js';
import { detectLang, LANGS, isChinese, hanStyle } from '../public/js/lang.js';
import { SCRIPT_RE } from './text.mjs';
import { packOf } from './langs/index.mjs';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 화면은 긴 변 1,600px JPEG로 줄여 보낸다 (보통 0.2~0.6MB)
export const MAX_PHOTO_SIDE = 2048;
export const MIN_PHOTO_SIDE = 16;
export const MAX_PARTS = 8;                      // 긴 그림은 화면이 겹치게 잘라 차례로 보낸다
export const MAX_LINES = 80;
export const MAX_LINE_TEXT = 400;
export const PHOTO_MAX_TOKENS = 2400;
export const PHOTO_RATE = { name: 'photo', limit: 12, windowMs: 60_000 }; // 번역(40번/분)과 따로, 낮게 — 긴 그림 8조각 + 요약 1번이 들어가게
export const MAX_SUMMARY_LINES = 120;
export const MAX_SUMMARY_INPUT = 3000;

/**
 * 모델 (2026-10-12 같은 지시문 · 그림 9장 비교):
 * Gemma 4 26B — 메뉴 가격 · 중국어 잔글씨까지 거의 정확, 글자 없는 사진은 빈 답, 한 장 5~30뉴런 → 기본이자 하나뿐.
 * Mistral Small 3.1 — 가격은 맞지만 간체를 번체로 읽거나 오독이 있고 한 장 20~120뉴런. v1.5.x에서는 예비였지만
 *   무료 요금제(하루 10,000뉴런)에서 한 장에 4~6배를 써서 v1.6.0에서 끔 — 기본 모델이 안 되면 "잠시 뒤 다시 해 주세요".
 *   (번역의 예비 모델 순서 translate-core MODELS는 그대로)
 * Qwen 3.8은 가장 정확하지만 한 장 70~340뉴런 · 최대 37초, Llama 4 Scout은 메뉴 가격을 다른 줄과 뒤바꿔서 쓰지 않는다.
 */
export const CAPACITY_RETRY_MS = 800;  // 기본 모델이 "Capacity temporarily exceeded(3040)"이면 잠깐 쉬고 한 번 더 (측정 31번 중 2번)
export const PHOTO_MODELS = [
  { id: '@cf/google/gemma-4-26b-a4b-it', extra: { chat_template_kwargs: { enable_thinking: false } }, timeoutMs: 45000 },
];

const nameOf = (c) => LANG_NAMES[c].replace('Simplified ', '');
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const KANA = /[ぁ-ゖァ-ヺ]/;        // ・ ー 는 중국어 글에도 나와서 뺀다
const HAN = /[㐀-䶿一-鿿]/;

// ---------- 요청 검사 ----------
/** 주소의 ?me=ko&part=1&parts=3 */
export function photoParams(url) {
  const q = new URL(url).searchParams;
  const me = q.get('me');
  if (!CODES.includes(me)) return { error: '지원하지 않는 언어예요.', code: 'unsupported_lang' };
  const parts = q.has('parts') ? Number(q.get('parts')) : 1;
  const part = q.has('part') ? Number(q.get('part')) : 1;
  if (![part, parts].every(Number.isInteger) || parts < 1 || parts > MAX_PARTS || part < 1 || part > parts) {
    return { error: '요청 형식이 올바르지 않아요.', code: 'bad_request' };
  }
  return { value: { me, part, parts } };
}

/** 그림 머리에서 형식과 크기 읽기 (JPEG · PNG · WebP). 모르는 형식이면 null — content-type은 믿지 않는다 */
export function imageInfo(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const u16 = (i) => (b[i] << 8) | b[i + 1];
  const u32 = (i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const le16 = (i) => b[i] | (b[i + 1] << 8);
  const le24 = (i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'image/jpeg', width: u16(i + 7), height: u16(i + 5) };
      i += 2 + u16(i + 2);
    }
    return null;
  }
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
    return { type: 'image/png', width: u32(16), height: u32(20) };
  }
  const str = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length >= 30 && str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
    const chunk = str(12, 4);
    if (chunk === 'VP8 ') return { type: 'image/webp', width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
    if (chunk === 'VP8L') return { type: 'image/webp', width: 1 + (((b[22] & 0x3f) << 8) | b[21]), height: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + le24(24), height: 1 + le24(27) };
  }
  return null;
}

/** 그림 검사 → { value: { type, width, height } } 또는 { status, error, code } */
export function checkImage(bytes) {
  const size = bytes?.byteLength ?? 0;
  if (size > MAX_PHOTO_BYTES) return { status: 413, error: '사진이 너무 커요.', code: 'photo_too_big', max: MAX_PHOTO_BYTES };
  const info = size >= 32 ? imageInfo(bytes) : null;
  if (!info) return { status: 415, error: '사진 형식을 읽을 수 없어요. (JPEG · PNG · WebP)', code: 'bad_image' };
  const { width, height } = info;
  if (Math.min(width, height) < MIN_PHOTO_SIDE) return { status: 415, error: '사진이 너무 작아요.', code: 'bad_image' };
  if (Math.max(width, height) > MAX_PHOTO_SIDE) return { status: 413, error: '사진이 너무 커요.', code: 'photo_too_big', max: MAX_PHOTO_BYTES };
  return { value: info };
}

// ---------- 지시문 ----------
/**
 * 읽는 법은 그 글자를 못 읽는 사람에게만 (중국어 사용자에게 병음 · 일본어 사용자에게 히라가나는 안 받는다).
 * v1.6.0 언어는 lib/langs/<code>.mjs 의 photoRead (예: 태국어 → 로마자)
 */
const readRules = (me) => [
  !isChinese(me) ? 'Chinese → Hanyu Pinyin with tone marks, one syllable for each Chinese character (e.g. "Qǐng xiān fā yàngpǐn")' : null,
  me !== 'ja' ? 'Japanese → the reading in hiragana, spaces between words (e.g. "なまびーる ちゅう")' : null,
  ...CODES.filter((c) => c !== me && packOf(c).photoRead).map((c) => packOf(c).photoRead),
].filter(Boolean);

export function buildPhotoMessages({ me, part = 1, parts = 1 }, dataUrl) {
  const M = nameOf(me);
  const reads = readRules(me);
  const shape = `{"lines":[{"text":"…","lang":"…","tr":"…"${reads.length ? ',"read":"…"' : ''}}],"summary":"…"}`;
  const lines = [
    `You read the text in a photo for a ${M} speaker who is shopping or eating abroad (menus, product packages, Taobao/1688 product pages, signs, labels).`,
    `Transcribe the text that is clearly visible in the image and translate each item into ${M}.`,
    'Rules:',
    '- "text": copy the text EXACTLY as printed, in its original language and script (Simplified Chinese stays Simplified, Traditional stays Traditional). Never translate, correct, complete or guess it.',
    '- Only text you can actually see. NEVER invent words, prices, numbers, brand names or menu items. Leave out text that is too small, blurry or cut off to read with certainty.',
    // 메뉴 가격을 한 줄씩 밀려 붙이는 일이 있었다(2026-10-12, 설명 줄이 낀 튀르키예어 메뉴 4번 중 2번) → 같은 줄일 때만 붙이고, 모르면 따로
    '- One item per line or text block, in reading order (top to bottom, left to right). For menus and price lists, read row by row: put an item together with the price printed on the SAME row (follow the alignment or dotted line). A small description printed under an item is its own item. If you are not sure which item a price belongs to, write the price as its own item.',
    '- Skip decorative background letters, watermarks and logos that are not words.',
    '- "lang": ISO 639-1 code of the item text (zh, ja, ko, en, tr, vi, th, ru, ar, …); use "zh-TW" for Traditional Chinese.',
    `- "tr": natural ${M} translation of the item. Keep numbers, prices, currency symbols, units, sizes, model numbers and brand names exactly as written. Do not convert currencies or add explanations. If the item is already ${M}, copy it.`,
    reads.length ? `- "read": ${reads.join('; ')}. Leave it out for other languages.` : null,
    `- "summary": one short ${M} sentence: what this is (menu, package, product page, sign …) and its main point. Only facts from the text; no numbers or prices that are not in the image.`,
    parts > 1 ? `- This image is part ${part} of ${parts} of one tall image that was cut into overlapping parts. Skip lines that are cut off at the top or bottom edge.` : null,
    '- If there is no readable text, output {"lines":[],"summary":""}.',
    `- Output ONLY compact JSON on one line, no code fence: ${shape}`,
  ].filter(Boolean);
  return [
    { role: 'system', content: lines.join('\n') },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: `Read the text in this image and translate it into ${M}.` }] },
  ];
}

// ---------- 답 정리 · 지어내기 거르기 ----------
const oneLine = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const normKey = (s) => String(s).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

/** 같은 조각이 끝없이 되풀이되는 줄 (모델이 같은 말을 반복할 때) */
export function isLoop(s) {
  const str = String(s ?? '');
  if (str.length < 20) return false;
  const m = str.match(/(.{1,16}?)\1{4,}/su);
  return Boolean(m && m[0].length >= Math.max(20, str.length * 0.4));
}

/**
 * 원문에 엉뚱한 글자가 끼었나: 한자 · 가나 · 한글 줄에 타이 · 아랍 · 키릴 · 데바나가리 · 히브리 문자가 조금 섞임
 * (2026-10-12 실제로 "土豆切丝泡น้ำ" — 泡水의 水를 타이어로 씀). 그리스 문자는 β-折叠처럼 성분 이름에 흔해서 뺀다
 */
const RARE_SCRIPT = /[฀-๿؀-ۿݐ-ݿЀ-ӿऀ-ॿ֐-׿]/gu;
export function oddScript(text) {
  const s = String(text ?? '');
  const rare = (s.match(RARE_SCRIPT) || []).length;
  if (!rare || !/[가-힣ぁ-ゖァ-ヺ㐀-䶿一-鿿]/.test(s)) return false;
  return rare / (s.match(/\p{L}/gu) || []).length < 0.5;
}

/** 줄 언어: 글자 체계로 먼저 가르고, 한자만 있거나 라틴 문자면 모델이 준 lang을 참고. 글자가 없으면 null (사진의 주 언어로 채움) */
const LANG_ALIAS = {
  cn: 'zh', 'zh-cn': 'zh', 'zh-hans': 'zh', 'zh-sg': 'zh', 'zh-tw': 'zh-tw', 'zh-hant': 'zh-tw', 'zh-hk': 'zh-tw', 'zh-mo': 'zh-tw', tw: 'zh-tw',
  jp: 'ja', kr: 'ko', 'en-us': 'en', 'en-gb': 'en', tur: 'tr', vn: 'vi', 'vi-vn': 'vi', 'fr-fr': 'fr', 'fr-ca': 'fr', 'th-th': 'th', 'ru-ru': 'ru',
};
/** 그 글자 체계를 쓰는 언어가 여럿일 때 모델의 lang을 믿을 것 (키릴: 우크라이나어 등 · 아랍 문자: 페르시아어 등) */
const SCRIPT_LANG = [['Thai', 'th'], ['Cyrl', 'ru'], ['Arab', 'ar']];
export function lineLang(text, hint) {
  const raw = String(hint ?? '').toLowerCase().replace(/_/g, '-');
  const h = LANG_ALIAS[raw] || (raw.startsWith('zh-') ? 'zh' : raw.slice(0, 3));
  const s = String(text);
  if (HANGUL.test(s)) return 'ko';
  if (KANA.test(s)) return 'ja';
  if (HAN.test(s)) {
    if (h === 'ja') return 'ja';
    const { hans, hant } = hanStyle(s); // 간체 · 번체는 글자로 (모델이 zh라고 해도 번체 글자가 많으면 번체)
    return hant > hans ? 'zh-TW' : hans > hant ? 'zh' : h === 'zh-tw' ? 'zh-TW' : 'zh';
  }
  for (const [script, code] of SCRIPT_LANG) {
    if (!SCRIPT_RE[script].test(s)) continue;
    return /^[a-z]{2,3}$/.test(h) && h !== code && !CODES.includes(h) ? h : code; // 다른 언어면 읽어 주기는 안 됨
  }
  if (/\p{Script=Latin}/u.test(s)) {
    if (CODES.includes(h) && LANGS[h].script === 'Latn') return h; // 튀르키예어 · 영어 · 베트남어 · 프랑스어
    if (/^[a-z]{2,3}$/.test(h) && !CODES.includes(h)) return h; // 다른 라틴 문자 언어 (de · fr …): 읽어 주기는 안 됨
    const d = detectLang(s, 'en');
    return LANGS[d]?.script === 'Latn' ? d : 'en';
  }
  if (/\p{L}/u.test(s)) return /^[a-z]{2,3}$/.test(h) && !CODES.includes(h) ? h : 'other'; // 그 밖의 문자 (데바나가리 · 히브리 문자 등)
  return null;
}

/** 번역이 내 언어 글자로 쓰였나: 글자의 1/3 이상이 내 언어 글자 (상표 · 등록 번호 같은 원문 글자는 섞여도 된다) */
const SCRIPT_OF = { Hang: HANGUL, Jpan: /[ぁ-ゖァ-ヺ一-鿿㐀-䶿々]/, Hans: HAN, Hant: HAN, Latn: SCRIPT_RE.Latn, Thai: SCRIPT_RE.Thai, Cyrl: SCRIPT_RE.Cyrl, Arab: SCRIPT_RE.Arab };
const SCRIPT = Object.fromEntries(CODES.map((c) => [c, SCRIPT_OF[LANGS[c].script]]));
// 그 언어만 쓰는 글자 덩이 — 원문에 없는 덩이가 다른 언어 번역에 끼면 엉뚱한 언어 (예: 한국어 요약에 "メイクアップ")
const OWN_RUNS = [[/[ぁ-ゖァ-ヺ]+/g, 'Jpan'], [/[가-힣]+/g, 'Hang'], [/[฀-๿]+/g, 'Thai'], [/[Ѐ-ӿ]+/g, 'Cyrl'], [/[؀-ۿ]+/g, 'Arab']];
export function inMyScript(text, me, sources = '') {
  const s = String(text);
  const letters = s.match(/\p{L}/gu) || [];
  if (!letters.length) return true;
  const mine = letters.filter((c) => SCRIPT[me].test(c)).length;
  if (mine / letters.length < 1 / 3) return false;
  for (const [re, script] of OWN_RUNS) {
    if (LANGS[me].script === script) continue;
    for (const run of s.match(re) || []) if (!String(sources).includes(run)) return false;
  }
  return true;
}

/**
 * 원문에 나온 숫자 값 (넉넉하게): 보통 숫자 찾기 + 세는 말 없는 한자 숫자(三重 · 一合 · 三大) + 한 글자씩.
 * 번역에서 "3중 · 3대"로 옮겨도 지어낸 숫자로 보지 않게
 */
export function sourceNumbers(text, lang) {
  const set = new Set();
  const s = String(text ?? '');
  for (const normalize of [true, false]) for (const m of numberMentions(s, lang, { normalize })) m.alts.forEach((v) => set.add(v));
  for (const run of s.match(/[零〇一二两兩三四五六七八九十百千万萬亿億]+/g) || []) {
    parseCjkNumber(run).forEach((v) => set.add(v));
    for (const c of run) parseCjkNumber(c).forEach((v) => set.add(v));
  }
  for (const m of numberMentions(s, 'ko')) m.alts.forEach((v) => set.add(v)); // 원문이 한국어가 아니어도 (한국어 상품명 등)
  return set;
}

/** 읽는 법 검사 — 기존 규칙(병음: cleanPinyin + 음절 수, 일본어: 히라가나만)에 사진 글에 흔한 숫자 · 괄호를 더 허용 */
export function cleanRead(read, text, lang) {
  const r = oneLine(read).replace(/[「」『』【】《》〈〉]/g, '"').replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[¥￥$€₺£₩#&*+=/／·・~〜_|\\<>@^`{}[\]]/g, ' ').replace(/\s+/g, ' ').trim(); // 가격 · 기호는 읽기에서 빼고 본다
  if (!r) return '';
  if (isChinese(lang)) {
    const p = cleanPinyin(r);
    if (!p) return '';
    const syl = pinyinSyllableCount(p), han = hanCount(text);
    const digits = (String(text).match(/[0-9０-９]/g) || []).length; // "1勺"을 yī sháo로 읽은 것까지
    return han && syl >= han && syl <= han + digits * 3 ? p : '';
  }
  if (lang === 'ja') {
    const k = r.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[（(]/g, ' (').replace(/[）)]/g, ') ').replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^[ぁ-ゖー、。？！?!・ ()0-9,.〜~:]+$/.test(k) && /[ぁ-ゖ]/.test(k)) return k;
    return cleanKana(r);
  }
  const spec = packOf(lang).sound; // v1.6.0 언어 (태국어 · 아랍어 로마자 등): /api/sound 와 같은 정리 · 검사
  if (spec && packOf(lang).photoRead) {
    const s = spec.clean(r, text);
    return s && (!spec.matches || spec.matches(s, text)) ? s : '';
  }
  return '';
}
/** 사진 줄의 읽는 법(소리 표기)을 받는 언어인가 — 그 사람이 그 글자를 못 읽을 때만 (readRules와 같은 기준) */
const readsFor = (lang, me) => (isChinese(lang) ? !isChinese(me) : lang === 'ja' ? me !== 'ja' : Boolean(packOf(lang).photoRead) && lang !== me);

/** 모델 답에서 줄 목록 꺼내기. 잘린 JSON(답 길이 상한)이면 끝까지 온 줄만 건진다. 못 읽으면 null */
export function parsePhotoJson(raw) {
  const s = String(raw ?? '');
  let data = parseJsonLoose(s);
  if (Array.isArray(data)) data = { lines: data };
  if (data && typeof data === 'object') {
    const lines = [data.lines, data.items, data.texts, data.text_lines].find(Array.isArray);
    if (lines) return { lines, summary: data.summary ?? data.description ?? '', truncated: false };
    if ('summary' in data && Object.keys(data).length <= 2) return { lines: [], summary: data.summary, truncated: false };
  }
  const objects = [...s.matchAll(/\{[^{}]*"text"\s*:\s*"(?:[^"\\]|\\.)*"[^{}]*\}/g)].map((m) => { try { return JSON.parse(m[0]); } catch { return null; } }).filter(Boolean);
  if (objects.length) return { lines: objects, summary: '', truncated: true };
  return null;
}

/**
 * 사진 답 정리 → { lines: [{ text, lang, tr, read, check? }], summary, notes } · JSON이 아니면 null (photo_failed).
 * - 빈 줄 · 되풀이(한 줄 안 · 같은 줄 3번째부터) 빼기, 줄 수 · 길이 상한
 * - 번역: 내 언어 글자가 아니거나(엉뚱한 언어) 원문에 없는 숫자가 있으면 번역을 비우고 check 표시 — 원문은 남긴다
 * - 요약: 엉뚱한 언어 · 글에 없는 숫자 · 되풀이면 비움. 읽은 줄이 없으면 요약도 없음 (글자 없는 사진에 지어낸 요약 막기)
 */
export function cleanPhoto(raw, { me }) {
  const parsed = typeof raw === 'object' && raw && Array.isArray(raw.lines) ? { truncated: false, ...raw } : parsePhotoJson(raw);
  if (!parsed) return null;
  const notes = { loops: 0, repeats: 0, wrongLang: 0, numbers: 0, oddScript: 0, cut: 0, truncated: parsed.truncated };
  const seen = new Map();
  const lines = [];
  const sources = parsed.lines.map((it) => oneLine(typeof it === 'string' ? it : it?.text ?? it?.original)).join('\n');
  for (const item of parsed.lines) {
    const it = typeof item === 'string' ? { text: item } : item && typeof item === 'object' ? item : null;
    if (!it) continue;
    let text = oneLine(it.text ?? it.original ?? it.source);
    let tr = oneLine(it.tr ?? it.translation);
    if (!text) continue;
    if (isLoop(text)) { notes.loops++; continue; }
    if (isLoop(tr)) { notes.loops++; tr = ''; }
    if (text.length > MAX_LINE_TEXT) text = `${text.slice(0, MAX_LINE_TEXT)}…`;
    if (tr.length > MAX_LINE_TEXT * 2) tr = `${tr.slice(0, MAX_LINE_TEXT * 2)}…`;
    const key = normKey(text) || text;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 2) { notes.repeats++; continue; }
    if (lines.length >= MAX_LINES) { notes.cut++; continue; }
    lines.push({ text, hint: it.lang, tr, read: it.read ?? it.reading ?? it.pinyin ?? it.kana ?? '' });
  }
  // 글자 없는 줄(가격만 등)은 사진의 주 언어로
  const counts = {};
  for (const l of lines) { l.lang = lineLang(l.text, l.hint); if (l.lang) counts[l.lang] = (counts[l.lang] || 0) + 1; }
  const main = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
  const out = lines.map(({ text, lang, tr, read }) => {
    const L = lang || main;
    const line = { text, lang: L, tr: '', read: '' };
    if (oddScript(text)) { notes.oddScript++; line.check = 'script'; } // 원문을 잘못 읽었을 수 있다 — 줄은 두고 화면이 알린다
    if (L === me) return line; // 이미 내 언어
    if (tr && normKey(tr) !== normKey(text)) {
      if (!inMyScript(tr, me, sources)) { notes.wrongLang++; line.check ||= 'lang'; }
      else if (inventsNumber(tr, me, sourceNumbers(text, L))) { notes.numbers++; line.check ||= 'number'; }
      else line.tr = tr;
    }
    if (readsFor(L, me)) line.read = cleanRead(read, text, L);
    return line;
  });
  let summary = out.length ? oneLine(parsed.summary) : '';
  if (summary) {
    const allowed = new Set();
    for (const l of out) {
      sourceNumbers(l.text, l.lang).forEach((v) => allowed.add(v));
      for (const m of numberMentions(l.tr, me)) m.alts.forEach((v) => allowed.add(v));
    }
    if (isLoop(summary) || !inMyScript(summary, me, sources) || inventsNumber(summary, me, allowed)) summary = '';
    else if (summary.length > 200) summary = `${summary.slice(0, 200)}…`;
  }
  return { lines: out, summary, notes };
}

// ---------- 긴 그림 요약 (조각을 합친 뒤 한 번) ----------
/** /api/photo-summary 본문: { me, lines: [{ text, tr }] } */
export function validatePhotoSummary(body) {
  if (!body || typeof body !== 'object') return { error: '요청 형식이 올바르지 않아요.', code: 'bad_request' };
  const me = String(body.me ?? '');
  if (!CODES.includes(me)) return { error: '지원하지 않는 언어예요.', code: 'unsupported_lang' };
  const lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, MAX_SUMMARY_LINES)
    .map((l) => ({ text: oneLine(l?.text).slice(0, MAX_LINE_TEXT), tr: oneLine(l?.tr).slice(0, MAX_LINE_TEXT) }))
    .filter((l) => l.text);
  if (!lines.length) return { error: '요약할 글이 없어요.', code: 'empty' };
  return { value: { me, lines } };
}

export function buildPhotoSummaryMessages({ me, lines }) {
  const M = nameOf(me);
  let body = '';
  for (const l of lines) {
    const row = l.tr && l.tr !== l.text ? `${l.text} = ${l.tr}` : l.text;
    if (body.length + row.length > MAX_SUMMARY_INPUT) break;
    body += `${row}\n`;
  }
  return [
    {
      role: 'system',
      content: [
        `These lines were read from one long photo (often a product detail page or a menu), in order. Some have a ${M} translation after "=".`,
        `Write ONE short ${M} sentence: what this is and its main point.`,
        '- Use only facts from the lines. Never add numbers or prices that are not in the lines.',
        `- Output ONLY the ${M} sentence.`,
      ].join('\n'),
    },
    { role: 'user', content: body.trim() },
  ];
}

export function cleanPhotoSummary(raw, { me, lines }) {
  const s = oneLine(cleanOutput(raw).split('\n')[0]);
  if (!s || isLoop(s)) return '';
  const sources = lines.map((l) => l.text).join('\n');
  const allowed = new Set();
  for (const l of lines) {
    const lang = lineLang(l.text) || me;
    sourceNumbers(l.text, lang).forEach((v) => allowed.add(v));
    for (const m of numberMentions(l.tr, me)) m.alts.forEach((v) => allowed.add(v));
  }
  if (!inMyScript(s, me, sources) || inventsNumber(s, me, allowed)) return '';
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}
