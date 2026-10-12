// 대화 도우미 서버 핵심: 답장 추천(/api/suggest) · 합의 내용 요약(/api/summary)
// 둘 다 AI가 숫자(가격 · 수량 · 날짜)를 지어내면 안 된다 — 대화에 나온 숫자만 허용하는 검사를 여기서 한다.
import { CODES, LANG_NAMES, REGISTER, cleanOutput, looksValid } from './translate-core.mjs';
import { SCRIPT_RE } from './text.mjs';
import { packOf } from './langs/index.mjs';

export const MAX_SUGGEST_TURNS = 4;     // 추천에 보낼 최근 대화 (토큰을 아끼려고 짧게)
export const MAX_SUMMARY_TURNS = 40;    // 요약에 보낼 대화
export const MAX_TURN_TEXT = 300;
export const SUGGEST_MAX_TOKENS = 320;
export const SUMMARY_MAX_TOKENS = 420;
export const SUMMARY_FIELDS = ['price', 'quantity', 'delivery', 'other'];
const MAX_SUGGESTION = 160;
const MAX_FIELD = 160;

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const nameOf = (c) => LANG_NAMES[c].replace('Simplified ', '');

// ---------- 숫자 찾기 ----------
// 글에 나온 숫자를 값으로: 아라비아 숫자(전각 · 타이 숫자 ๑๒๓ · 아랍 숫자 ٠١٢ 포함 · 1,000 · 1.5 · 15万) · 한자 숫자(十五 · 一百五 · 两千) ·
// 한국어(백 개 · 두 개 · 이틀) · 튀르키예어(yüz elli) · 영어(two hundred) · 일본어(ふたつ) · v1.6.0 언어는 lib/langs/<code>.mjs numbers.
// 낱말로 쓴 1(a · bir · 한 · 一 …)은 관사처럼 흔해서, 추천·요약 쪽에서는 숫자로 치지 않는다 (대화 쪽에는 넣어 둔다).

const round = (x) => Math.round(x * 1000) / 1000;
// 다른 숫자 글자 → 보통 숫자: 전각 ０-９ · 타이 ๐-๙ · 아랍 ٠-٩ · 페르시아식 ۰-۹, 아랍 소수점 ٫ → . · 아랍 천 단위 ٬ → ,
// (중국어 쉼표 "，"는 문장 부호라 그대로 둔다: 15，20 = 15와 20)
const DIGIT_ZERO = [0xff10, 0x0e50, 0x0660, 0x06f0];
export const toAscii = (s) => String(s)
  .replace(/[０-９๐-๙٠-٩۰-۹]/g, (c) => { const n = c.charCodeAt(0); return String(n - DIGIT_ZERO.find((z) => n >= z && n <= z + 9)); })
  .replace(/(?<=\d)٫(?=\d)/g, '.').replace(/(?<=\d)٬(?=\d)/g, ',');
/** 한자로 숫자를 쓰는 언어 (간체 · 번체 중국어 · 일본어) */
const CJK_LANGS = new Set(['zh', 'zh-TW', 'ja']);
const BIG_AFTER = { 万: 1e4, 萬: 1e4, 亿: 1e8, 億: 1e8, 千: 1e3, 百: 100, 만: 1e4, 천: 1e3, 백: 100, 억: 1e8, k: 1e3, K: 1e3, bin: 1e3 };

function digitMentions(text) {
  const out = [];
  const s = toAscii(text);
  for (const m of s.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const tok = m[0];
    const alts = new Set();
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(tok)) alts.add(Number(tok.replace(/[.,]/g, ''))); // 1,000 · 1.000(튀르키예어) = 천
    else if (/^\d+(?:[.,]\d+)?$/.test(tok)) alts.add(Number(tok.replace(',', '.')));     // 15 · 1.5 · 1,5
    else for (const part of tok.split(/[.,]/)) alts.add(Number(part));
    // 15万 · 3천 · 2k · 2 bin → 곱한 값도
    const after = s.slice(m.index + tok.length).match(/^\s?(万|萬|亿|億|千|百|만|천|백|억|k\b|K\b|bin\b)/);
    if (after) for (const v of [...alts]) alts.add(v * BIG_AFTER[after[1]]);
    out.push({ alts: [...alts].map(round), word: false });
  }
  return out;
}

// 한자 숫자 (중국어 · 일본어)
const CJK_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 俩: 2, 倆: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CJK_UNIT = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 };
const CJK_BIG = { 万: 1e4, 萬: 1e4, 亿: 1e8, 億: 1e8 };
const CJK_RUN = /[零〇一二两兩俩倆三四五六七八九十拾百佰千仟万萬亿億]+/g;
// 한 글자짜리는 뒤에 세는 말이 올 때만 숫자로 (百货 · 五金 · 三思 같은 낱말을 숫자로 보지 않게)
const CJK_COUNTER = /^[个個件块塊元圆圓毛角分天日号號月年周週星期箱包盒台双雙只隻条條张張瓶套米斤克吨噸次人位名回时時点點折成倍岁歲歳つ円枚本间間ヶか所份批款码碼公小kKgG%％]/;

/** 한자 숫자 → 값들 (一百五는 105와 150 둘 다: 말로는 150) */
export function parseCjkNumber(s) {
  let total = 0, section = 0, num = 0, prevDigit = false, lastUnit = 0, afterUnit = false;
  for (const c of s) {
    if (c in CJK_DIGIT) {
      num = prevDigit ? num * 10 + CJK_DIGIT[c] : CJK_DIGIT[c];
      prevDigit = true;
    } else if (c in CJK_UNIT) {
      section += (num || 1) * CJK_UNIT[c];
      lastUnit = CJK_UNIT[c]; num = 0; prevDigit = false; afterUnit = true; continue;
    } else if (c in CJK_BIG) {
      total += (section + num || 1) * CJK_BIG[c];
      lastUnit = CJK_BIG[c]; section = 0; num = 0; prevDigit = false; afterUnit = true; continue;
    }
    if (c !== '零' && c !== '〇') continue;
    afterUnit = false; // 一百零五: 0이 끼면 줄임말이 아니다
  }
  const plain = total + section + num;
  const alts = [plain];
  if (afterUnit && num && lastUnit >= 100 && num < 10) alts.push(total + section + num * (lastUnit / 10)); // 一百五 → 150, 两万五 → 25000
  return alts;
}

function cjkMentions(text) {
  const s = String(text)
    .replace(/百分之/g, '')            // 百分之十五 → 十五 (%)
    .replace(/[千公]克|千米|公里|公斤/g, (w) => ` ${w.slice(-1)} `) // 五千克 = 5kg (5000 아님)
    .replace(/(?<![零〇一二两三四五六七八九])十分(?![钟鐘])/g, '  ') // 十分: 매우(중국어) · 충분히(일본어) — 五十分(50분)은 그대로
    .replace(/万一|萬一|万が一|千万(?![元块塊个個件台箱人])|千萬(?![元塊個件台箱人])/g, '  ');
  const out = [];
  for (const m of s.matchAll(CJK_RUN)) {
    const tok = m[0];
    const before = s[m.index - 1] || '';
    if (before === '第') continue;                 // 第二 (차례)
    if (/[0-9０-９.,]/.test(before)) continue;     // 15万 · 3千: 앞 숫자와 한 덩어리 (digitMentions가 센다)
    const next = s.slice(m.index + tok.length);
    if (tok.length === 1 && !CJK_COUNTER.test(next.trimStart())) continue;
    const alts = parseCjkNumber(tok);
    if (/^[一二两三四五六七八九]{2}$/.test(tok)) alts.push(CJK_DIGIT[tok[0]], CJK_DIGIT[tok[1]]); // 四五天 = 4~5일
    out.push({ alts: alts.map(round), word: true });
  }
  return out;
}

// 한국어
const KO_TENS = { 열: 10, 스무: 20, 스물: 20, 서른: 30, 마흔: 40, 쉰: 50, 예순: 60, 일흔: 70, 여든: 80, 아흔: 90 };
const KO_ONES = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 석: 3, 넷: 4, 네: 4, 넉: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };
const KO_DAYS = { 하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 이레: 7, 여드레: 8, 아흐레: 9, 열흘: 10, 보름: 15 };
// 고유어 수(두 개 · 세 명)에 붙는 세는 말. "네 배송" · "네 주문" · "네 장소"처럼 대답 "네" 뒤에 오는 흔한 낱말은 빼 둔다
const KO_NATIVE_COUNTER = `(?:${[
  '개(?!인|선|월|발|봉|념|성|국)', '명(?!함|확|령|품|단|의)', '사람', '병(?!원)', '잔(?!금|액)', '장(?!소|점|님|난|마|사|기)', '벌(?!써|금|레)', '켤레',
  '대(?!박|답|해|신|로|략|표|부|금|충|기|만|한|화)', '권(?!한|리)', '마리', '박스', '상자', '봉지', '묶음', '팩', '세트', '살(?!짝|펴|려|아)', '시간',
  '달(?!러|라|려)', '주(?!문|소|세|시|말|의|요|로|신|인|간|셔|실|십|면|고)', '번(?!호|역|째)', '가지(?!고)', '군데', '배(?!송|달|터|우|고|려)',
].join('|')})`;
// 한자어 수(백 개 · 만 원 · 삼십 일)에 붙는 세는 말
const KO_SINO_COUNTER = '(?:개|명|원|위안|달러|엔|리라|일(?!정|본|단|반|부|상|요|이|기)|주(?!문|소|세|시)|개월|년|박스|상자|장|벌|켤레|대|병|퍼센트|프로|%|킬로|kg|그램|미터|번|시|분|세트|팩|배(?!송|달))';
const KO_NATIVE = new RegExp(`(^|[^가-힣0-9０-９])(${Object.keys(KO_TENS).join('|')})?(${Object.keys(KO_ONES).join('|')})?\\s?${KO_NATIVE_COUNTER}`, 'g');
const KO_SINO_DIGIT = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const KO_SINO_UNIT = { 십: 10, 백: 100, 천: 1000 };
const KO_SINO_BIG = { 만: 1e4, 억: 1e8 };
const KO_SINO = new RegExp(`(^|[^가-힣0-9０-９.,])([일이삼사오육칠팔구십백천만억]*[십백천만억][일이삼사오육칠팔구십백천만억]*)\\s?${KO_SINO_COUNTER}`, 'g');

function parseSinoKorean(s) {
  let total = 0, section = 0, num = 0;
  for (const c of s) {
    if (c in KO_SINO_DIGIT) num = KO_SINO_DIGIT[c];
    else if (c in KO_SINO_UNIT) { section += (num || 1) * KO_SINO_UNIT[c]; num = 0; }
    else if (c in KO_SINO_BIG) { total += (section + num || 1) * KO_SINO_BIG[c]; section = 0; num = 0; }
  }
  return total + section + num;
}

function koMentions(text) {
  const s = String(text).replace(/만일|만약/g, '  '); // 만일(혹시)
  const out = [];
  for (const m of s.matchAll(KO_NATIVE)) {
    if (!m[2] && !m[3]) continue;
    out.push({ alts: [(KO_TENS[m[2]] || 0) + (KO_ONES[m[3]] || 0)], word: true });
  }
  for (const m of s.matchAll(KO_SINO)) out.push({ alts: [parseSinoKorean(m[2])], word: true });
  for (const m of s.matchAll(new RegExp(`(^|[^가-힣])(${Object.keys(KO_DAYS).join('|')})`, 'g'))) out.push({ alts: [KO_DAYS[m[2]]], word: true });
  return out;
}

// 튀르키예어 · 영어: 수 낱말이 이어진 덩어리 (yüz elli = 150, two hundred and fifty = 250)
const TR_WORDS = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90 };
const TR_SCALE = { yüz: 100, bin: 1000, milyon: 1e6 };
const EN_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, dozen: 12,
};
const EN_SCALE = { hundred: 100, thousand: 1000, million: 1e6 };

function wordRunMentions(words, ones, scales, joiners) {
  const out = [];
  let run = null;
  const flush = () => {
    if (run && run.n) out.push({ alts: [run.total + run.section], word: true });
    run = null;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // 반: on dört buçuk · fourteen and a half
    if (run && w === 'buçuk') { run.section += 0.5; continue; }
    if (run && w === 'and' && words[i + 1] === 'a' && words[i + 2] === 'half') { run.section += 0.5; i += 2; continue; }
    if (w in ones || w in scales || (w === 'a' && words[i + 1] in scales)) {
      run ??= { total: 0, section: 0, n: 0 };
      run.n++;
      if (w === 'a') run.section += 1;
      else if (w in ones) run.section += ones[w];
      else if (scales[w] === 100) run.section = (run.section || 1) * 100;
      else { run.total += (run.section || 1) * scales[w]; run.section = 0; }
    } else if (run && joiners.has(w) && (words[i + 1] in ones || words[i + 1] in scales)) {
      continue;
    } else flush();
  }
  flush();
  return out;
}

const trWords = (s) => String(s).toLocaleLowerCase('tr-TR').match(/[a-zçğıöşü]+/g) || [];
const enWords = (s) => String(s).toLowerCase().match(/[a-z]+/g) || [];

const JA_KANA = { ふたつ: 2, みっつ: 3, よっつ: 4, いつつ: 5, むっつ: 6, ななつ: 7, やっつ: 8, ここのつ: 9, ふつか: 2, みっか: 3, よっか: 4, とおか: 10 };

// 소수로 읽는 말을 먼저 숫자로 바꿔 둔다: 十四块五 = 14.5(块 뒤 한 자리 = 角) · 三块半 = 3.5 · 十四点五 = 14.5 ·
// 튀르키예어 on dört buçuk / 14 buçuk = 14.5 · 영어 fourteen and a half = 14.5
const CJK_NUM = '[零〇一二两兩俩三四五六七八九十百千万萬0-9０-９.]+';
const CJK_ONE = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const cjkValue = (n) => (/^[0-9０-９.]+$/.test(n) ? Number(toAscii(n)) : parseCjkNumber(n).at(-1));
const digitOf = (c) => (c in CJK_ONE ? CJK_ONE[c] : Number(toAscii(c)));
function normalizeDecimals(s, lang) {
  if (packOf(lang).decimals) s = packOf(lang).decimals(s);
  if (CJK_LANGS.has(lang)) {
    return s
      // 块 뒤 한 자리가 수량(5元3个 = 5위안에 3개)일 때는 빼려고 뒤에 세는 말이 오면 바꾸지 않는다
      .replace(new RegExp(`(${CJK_NUM})\\s*([块塊元])\\s*([零〇一二两三四五六七八九0-9０-９])(?![十百千万0-9０-９个個件箱包盒天号號人次位只隻条條张張瓶套])[毛角]?(?:([一二三四五六七八九0-9])分)?`, 'g'),
        (m, n, unit, j, f) => `${round(cjkValue(n) + digitOf(j) / 10 + (f ? digitOf(f) / 100 : 0))}${unit}`)
      .replace(new RegExp(`(${CJK_NUM})\\s*([块塊元个個天])半`, 'g'), (m, n, unit) => `${cjkValue(n) + 0.5}${unit}`)
      .replace(new RegExp(`(${CJK_NUM})[点點]([零〇一二三四五六七八九]+)(?![十分钟鐘])`, 'g'), (m, n, d) => `${cjkValue(n)}.${[...d].map(digitOf).join('')}`); // 번체 十四點五
  }
  if (lang === 'tr') {
    s = s.replace(/(\d+)\s+buçuk/gi, (m, d) => String(Number(d) + 0.5));
  }
  return s;
}

/** 글(lang 언어)에 나온 숫자들: [{ alts: [가능한 값…], word: 낱말로 썼나 }]. normalize: 소수로 읽는 말(十四块五 등)을 먼저 바꿀지 */
export function numberMentions(text, lang, { normalize = true } = {}) {
  const s = normalize ? normalizeDecimals(String(text ?? ''), lang) : String(text ?? '');
  if (!s) return [];
  const out = digitMentions(s);
  if (CJK_LANGS.has(lang)) out.push(...cjkMentions(s));
  if (lang === 'ja') for (const [w, v] of Object.entries(JA_KANA)) if (s.includes(w)) out.push({ alts: [v], word: true });
  if (lang === 'ko') out.push(...koMentions(s));
  if (lang === 'tr') out.push(...wordRunMentions(trWords(s), TR_WORDS, TR_SCALE, new Set()));
  if (lang === 'en') out.push(...wordRunMentions(enWords(s), EN_WORDS, EN_SCALE, new Set(['and'])));
  if (packOf(lang).numbers) out.push(...packOf(lang).numbers(s).map((m) => ({ ...m, alts: m.alts.map(round) })));
  return out;
}

/** 대화에 나온 숫자 값 모음 (원문과 번역 모두, 소수로 바꿔 읽은 값과 그대로 읽은 값 둘 다 — 대화 쪽은 넉넉하게) */
export function allowedNumbers(turns) {
  const set = new Set();
  for (const t of turns) {
    for (const [text, lang] of [[t.text, t.from], [t.translation, t.to]]) {
      for (const normalize of [true, false]) for (const m of numberMentions(text, lang, { normalize })) m.alts.forEach((v) => set.add(v));
    }
  }
  return set;
}

/** 대화에 없는 숫자를 지어냈나 (낱말로 쓴 1은 빼고) */
export function inventsNumber(text, lang, allowed) {
  return numberMentions(text, lang).some((m) => !(m.word && m.alts.every((v) => v === 1)) && !m.alts.some((v) => allowed.has(v)));
}

/** 빈칸 · 채울 자리 (○○개 · ___ · XX · [가격]) */
export const PLACEHOLDER = /[○◯●□■＿]|〇〇|ㅇㅇ|_{2,}|\b[xX]{2,}\b|\[[^\]]*\]|\{[^}]*\}|<[^>]*>/;

// ---------- 요청 검사 ----------
function cleanTurns(list, max) {
  if (!Array.isArray(list)) return [];
  return list.slice(-max)
    .filter((t) => t && ['me', 'partner'].includes(t.side) && CODES.includes(t.from) && String(t.text ?? '').trim())
    .map((t) => ({
      side: t.side,
      from: t.from,
      to: CODES.includes(t.to) ? t.to : t.from,
      text: clip(t.text, MAX_TURN_TEXT),
      translation: clip(t.translation, MAX_TURN_TEXT),
    }));
}

function validatePair(body) {
  if (!body || typeof body !== 'object') return { error: '요청 형식이 올바르지 않아요.', code: 'bad_request' };
  const me = String(body.me ?? ''), partner = String(body.partner ?? '');
  if (!CODES.includes(me) || !CODES.includes(partner) || me === partner) return { error: '지원하지 않는 언어예요.', code: 'unsupported_lang' };
  return { me, partner };
}

/** /api/suggest 본문: { me, partner, formal, turns: [{ side: me|partner, from, to, text, translation }] } — 마지막 말은 상대 말 */
export function validateSuggest(body) {
  const pair = validatePair(body);
  if (pair.error) return pair;
  const turns = cleanTurns(body.turns, MAX_SUGGEST_TURNS);
  if (!turns.length || turns.at(-1).side !== 'partner') return { error: '답할 상대 말이 없어요.', code: 'empty' };
  return { value: { ...pair, turns, formal: body.formal !== false } };
}

/** /api/summary 본문: { me, partner, turns } */
export function validateSummary(body) {
  const pair = validatePair(body);
  if (pair.error) return pair;
  const turns = cleanTurns(body.turns, MAX_SUMMARY_TURNS);
  if (!turns.length) return { error: '요약할 대화가 없어요.', code: 'empty' };
  return { value: { ...pair, turns } };
}

function conversationLines(turns, me) {
  return turns.map((t) => {
    const who = t.side === 'me' ? `Me (${nameOf(me)} speaker)` : 'Other person';
    const trans = t.translation && t.to !== t.from ? `  (= ${t.translation})` : '';
    return `[${who}, ${nameOf(t.from)}] ${t.text}${trans}`;
  }).join('\n');
}

// ---------- 답장 추천 ----------
export function buildSuggestMessages({ me, partner, turns, formal = true }) {
  const M = nameOf(me), P = nameOf(partner);
  const example = JSON.stringify([{ [me]: `<${M}>`, [partner]: `<${P}>` }]);
  const lines = [
    `You help a ${M} speaker reply in a live conversation with a ${P} speaker, often a seller (bargaining, ordering, shipping).`,
    `Suggest 3 short replies the ${M} speaker could say next to the other person's LAST message.`,
    'Rules:',
    `- Each reply: one short spoken sentence (at most 12 words) in natural ${P}, plus its meaning in ${M}.`,
    '- Make the 3 replies different, e.g. accept or agree, ask a useful follow-up question, decline or negotiate.',
    '- NEVER invent numbers (price, quantity, date, time, size, discount). Only use numbers that were said in the conversation, written with digits.',
    '- If a reply would need a number nobody said, make it a question instead (e.g. "What is the price if I order more?"). Never write blanks or placeholders like ○○, ___, XX or [price].',
    `- ${P}: ${REGISTER[partner][formal ? 0 : 1]}`,
    `- ${M}: ${REGISTER[me][formal ? 0 : 1]}`,
    `- Output ONLY a JSON array, no other text: ${example} — "${me}" is ${M}, "${partner}" is ${P}.`,
  ];
  return [
    { role: 'system', content: lines.join('\n') },
    { role: 'user', content: `Conversation (oldest first):\n${conversationLines(turns, me)}` },
  ];
}

/** 모델 답에서 JSON 꺼내기 (코드 울타리 · 앞뒤 설명 · 끝 쉼표가 붙어 와도) */
export function parseJsonLoose(raw) {
  let s = String(raw ?? '').replace(/<\/?(?:think|reasoning)>[\s\S]*?(?:<\/(?:think|reasoning)>|$)/gi, '').replace(/```(?:json)?/gi, '').trim();
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (end <= start) return null;
  s = s.slice(start, end + 1);
  for (const candidate of [s, s.replace(/,\s*([\]}])/g, '$1')]) {
    try { return JSON.parse(candidate); } catch { /* 다음 */ }
  }
  return null;
}

const cleanLine = (s, max) => {
  const out = cleanOutput(typeof s === 'string' ? s : '').split('\n')[0].trim();
  return out.length > max ? '' : out;
};
const norm = (s) => String(s).toLowerCase().replace(/[\s\p{P}]/gu, '');

/** 추천 답 정리: 두 언어 다 있고, 글자가 맞고, 빈칸·지어낸 숫자가 없고, 겹치지 않는 것만 (최대 3개) */
export function cleanSuggestions(raw, { me, partner, turns }) {
  let data = typeof raw === 'string' ? parseJsonLoose(raw) : raw;
  if (data && !Array.isArray(data) && typeof data === 'object') data = data.suggestions || data.replies || Object.values(data).find(Array.isArray) || null;
  if (!Array.isArray(data)) return [];
  const allowed = allowedNumbers(turns);
  const last = norm(turns.at(-1)?.text || '');
  const seen = new Set();
  const out = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const mine = cleanLine(item[me] ?? item.me, MAX_SUGGESTION);
    const say = cleanLine(item[partner] ?? item.partner, MAX_SUGGESTION);
    if (!mine || !say) continue;
    if (!looksValid(say, { text: mine, from: me, to: partner }) || !looksValid(mine, { text: say, from: partner, to: me })) continue;
    if (PLACEHOLDER.test(mine) || PLACEHOLDER.test(say)) continue;
    if (inventsNumber(say, partner, allowed) || inventsNumber(mine, me, allowed)) continue;
    const key = norm(say);
    if (!key || seen.has(key) || key === last) continue;
    seen.add(key);
    out.push({ me: mine, partner: say });
    if (out.length === 3) break;
  }
  return out;
}

// ---------- 합의 내용 요약 ----------
export function buildSummaryMessages({ me, partner, turns }) {
  const M = nameOf(me), P = nameOf(partner);
  const empty = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f, { [me]: '', [partner]: '' }]));
  const lines = [
    `Summarize what was agreed in this conversation between a ${M} speaker ("Me", usually the buyer) and a ${P} speaker (usually the seller).`,
    'Fields:',
    '- price: unit price (price per item), with currency',
    '- quantity: how many items',
    '- delivery: shipping or delivery date / how many days',
    '- other: other agreed conditions (shipping cost, samples, payment, packaging, invoice…), very short',
    'Rules:',
    '- Use ONLY what was said in the conversation. If a field was not mentioned, leave it empty "".',
    '- If a value changed during the conversation, use the latest one that both sides accepted.',
    '- NEVER calculate or invent numbers (no totals). Copy numbers exactly, written with digits.',
    `- Keep each value short (a few words). Write each value in ${M} under "${me}" and in ${P} under "${partner}".`,
    `- Output ONLY JSON, no other text: ${JSON.stringify(empty)}`,
  ];
  return [
    { role: 'system', content: lines.join('\n') },
    { role: 'user', content: `Conversation (oldest first):\n${conversationLines(turns, me)}` },
  ];
}

/**
 * 그 언어에 나올 리 없는 글자가 섞였나 (요약 칸은 "100"처럼 숫자만일 수도 있어서, 있어야 할 글자 대신 없어야 할 글자를 본다).
 * 라틴 문자(상표 · 단위)는 어느 언어에나 섞일 수 있어서 보지 않는다
 */
const OWN_SCRIPTS = { ko: ['Hang'], ja: ['Kana', 'Han'], zh: ['Han'], 'zh-TW': ['Han'], th: ['Thai'], ru: ['Cyrl'], ar: ['Arab'] };
const CHECKED = ['Hang', 'Kana', 'Han', 'Thai', 'Cyrl', 'Arab'];
export function wrongScript(text, lang) {
  const s = String(text);
  const own = OWN_SCRIPTS[lang] || [];
  return CHECKED.some((sc) => !own.includes(sc) && SCRIPT_RE[sc].test(s));
}

const NONE = /^(?:-+|n\/?a|none|null|unknown|없음|미정|无|未知|なし|不明|yok|belirsiz)$/i;
const isNone = (s, lang) => NONE.test(s) || Boolean(packOf(lang).none?.test(s));

/**
 * 요약 정리 → { fields: { price: { me, partner }, quantity, delivery, other }, filled }.
 * 값마다 글자가 맞는지, 대화에 없는 숫자가 없는지 본다 — 어긋나면 그 칸(두 언어 모두)을 비운다 (지어낸 값보다 빈칸이 낫다)
 */
export function cleanSummary(raw, { me, partner, turns }) {
  const data = typeof raw === 'string' ? parseJsonLoose(raw) : raw;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const allowed = allowedNumbers(turns);
  const fields = {};
  let filled = 0;
  for (const f of SUMMARY_FIELDS) {
    const v = data[f] && typeof data[f] === 'object' ? data[f] : {};
    let mine = cleanLine(v[me] ?? v.me, MAX_FIELD);
    let say = cleanLine(v[partner] ?? v.partner, MAX_FIELD);
    if (isNone(mine, me)) mine = '';
    if (isNone(say, partner)) say = '';
    const bad = (text, lang) => PLACEHOLDER.test(text) || wrongScript(text, lang) || inventsNumber(text, lang, allowed);
    if ((mine && bad(mine, me)) || (say && bad(say, partner))) { mine = ''; say = ''; }
    fields[f] = { me: mine, partner: say };
    if (mine || say) filled++;
  }
  return { fields, filled };
}
