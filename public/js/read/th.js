// 태국어 읽는 법 — 타이 문자는 규칙만으로 읽기 어려워서(숨은 모음 · 낱말 사이 띄어쓰기 없음) 서버(/api/sound)의 모델이 로마자 소리 표기를 주고,
// 화면이 그것으로 한글 발음(한국어 사용자) · 로마자(그 밖의 사용자)를 만든다. 표현집은 소리 표기를 미리 넣어 둔다 (phrases/th.js).
//
// 로마자 방식 (서버 지시문 lib/langs/th.mjs · 표현집 · 사진 읽기가 같이 쓴다): 태국 왕립 학술원 표기(RTGS)에서 둘을 바꿈 —
//   จ → j : RTGS는 จ(무기음)와 ฉ ช(유기음)를 둘 다 ch로 써서 한글 ㅉ/ㅊ을 가를 수 없다
//   모음 ɔ (ขอ · ร้อน · เกาะ) → ɔ : RTGS는 โ(o)와 같은 o로 써서 컵쿤/콥쿤을 가를 수 없다
//   그 밖은 RTGS 그대로: 무기음 k t p · 유기음 kh th ph ch, 모음 a i u e o ae ue oe ia uea ua, 성조 · 긴 모음 표시 없음.
//   음절은 -, 낱말은 띄어 쓴다: สวัสดี sa-wat-di · ขอบคุณ khɔp-khun · ต้มยำกุ้ง tom-yam-kung · เชียงใหม่ chiang-mai
// 한글은 국립국어원 「타이어 자모와 한글 대조표」: 무기음 ㄲ ㄸ ㅃ ㅉ · 유기음 ㅋ ㅌ ㅍ ㅊ, 끝소리 k t p → ㄱ ㅅ ㅂ, 모음 사이 l → ㄹㄹ
//   (끄룽텝 · 푸껫 · 치앙마이 · 사왓디 · 똠얌꿍 · 까올리). 대조표는 RTGS의 o 하나로 ɔ까지 '오'로 적지만, 여기서는 ɔ · oe를 '어'로
//   (컵쿤 · 아러이 · 응언 — 흔히 쓰는 표기이고 소리에 가깝다). 같은 자리 무기음 끝소리 + 유기음 첫소리(phat-tha-ya)는 끝소리를 적지 않는다
//   (파타야 · 아유타야). 성조는 적지 않는다.
// 모델이 다른 표기(sawasdee · khrab · dii · ɛ · ə · ʉ · 성조 부호)를 섞어 써도 읽을 수 있게 넓게 받는다.

const A = 0, AE = 1, EO = 4, E = 5, O = 8, U = 13, EU = 18, I = 20; // 중성
const CODA = { k: 1, n: 4, l: 8, m: 16, p: 17, t: 19, ng: 21 };    // 받침

// 첫소리: L 초성 · pre 겹자음의 앞 자음(+으, preL이면 +을) · glide 반모음(y · w) · ng 응
const ONSET = {
  '': { L: 11 }, k: { L: 1 }, g: { L: 1 }, kh: { L: 15 }, ng: { L: 11, ng: true }, j: { L: 13 }, c: { L: 13 }, ch: { L: 14 },
  s: { L: 9 }, y: { L: 11, glide: 'y' }, d: { L: 3 }, t: { L: 4 }, dt: { L: 4 }, th: { L: 16 }, n: { L: 2 }, b: { L: 7 },
  p: { L: 8 }, bp: { L: 8 }, ph: { L: 17 }, f: { L: 17 }, m: { L: 6 }, r: { L: 5 }, l: { L: 5 }, w: { L: 11, glide: 'w' }, h: { L: 18 },
  kr: { L: 5, pre: 1 }, gr: { L: 5, pre: 1 }, khr: { L: 5, pre: 15 }, pr: { L: 5, pre: 8 }, phr: { L: 5, pre: 17 }, tr: { L: 5, pre: 4 },
  thr: { L: 5, pre: 16 }, br: { L: 5, pre: 7 }, dr: { L: 5, pre: 3 }, fr: { L: 5, pre: 17 },
  kl: { L: 5, pre: 1, preL: true }, gl: { L: 5, pre: 1, preL: true }, khl: { L: 5, pre: 15, preL: true }, pl: { L: 5, pre: 8, preL: true },
  phl: { L: 5, pre: 17, preL: true }, bl: { L: 5, pre: 7, preL: true }, fl: { L: 5, pre: 17, preL: true },
  kw: { L: 1, glide: 'w' }, khw: { L: 15, glide: 'w' },
};
// 표준 표기 밖의 첫소리(g · c · dt · bp · br …)는 조금 덜 고른다
const ONSET_COST = { g: 1, c: 1, dt: 1, bp: 1, gr: 1, gl: 1, br: 1, dr: 1, fr: 1, bl: 1, fl: 1 };

// 모음(끝 반모음 포함) → 한글 모음들. 뒤 반모음이 있는 것은 받침을 받지 않는다
const NUCLEUS = {
  a: [A], i: [I], u: [U], e: [E], o: [O], 'ɔ': [EO], ae: [AE], ue: [EU], oe: [EO], ia: [I, A], ua: [U, A], uea: [EU, A],
  ai: [A, I], ao: [A, O], ui: [U, I], oi: [O, I], 'ɔi': [EO, I], oei: [EO, I], uai: [U, A, I], ueai: [EU, A, I], iao: [I, A, O],
  eo: [E, O], aeo: [AE, O], io: [I, O], iu: [I, U],
  // 다른 표기: 겹쳐 쓴 긴 모음(ee · oo는 영어식 i · u), eu = ue, w · y로 쓴 끝 반모음, 영어식 or = ɔ
  aa: [A], ii: [I], uu: [U], ee: [I], oo: [U], 'ɔɔ': [EO], eu: [EU], eua: [EU, A], aw: [A, O], ay: [A, I], aai: [A, I], aao: [A, O],
  ew: [E, O], aew: [AE, O], iw: [I, U], oy: [O, I], uy: [U, I], iaw: [I, A, O], uay: [U, A, I], oey: [EO, I], 'ɔy': [EO, I], or: [EO],
};
const OPEN = new Set(['ai', 'ao', 'ui', 'oi', 'ɔi', 'oei', 'uai', 'ueai', 'iao', 'eo', 'aeo', 'io', 'iu', 'aw', 'ay', 'aai', 'aao', 'ew', 'aew', 'iw', 'oy', 'uy', 'iaw', 'uay', 'oey', 'ɔy']);
const NUCLEUS_COST = { aa: 1, ii: 1, uu: 1, ee: 1, oo: 1, 'ɔɔ': 1, eu: 1, eua: 1, aw: 1, ay: 1, aai: 1, aao: 1, ew: 1, aew: 1, iw: 1, oy: 1, uy: 1, iaw: 1, uay: 1, oey: 1, 'ɔy': 1, or: 1 };
// 끝소리 [표기, 소리, 덜 고르는 정도] — 글자대로 쓴 끝소리(d s j ch b g l r f)도 받는다
const CODAS = [['ng', 'ng', 0], ['k', 'k', 0], ['t', 't', 0], ['p', 'p', 0], ['n', 'n', 0], ['m', 'm', 0],
  ['ch', 't', 1], ['d', 't', 1], ['s', 't', 1], ['j', 't', 1], ['c', 't', 1], ['b', 'p', 1], ['g', 'k', 1], ['f', 'p', 1], ['l', 'n', 1], ['r', 'n', 2]];
const ONSET_KEYS = Object.keys(ONSET).sort((a, b) => b.length - a.length);
const NUCLEUS_KEYS = Object.keys(NUCLEUS).sort((a, b) => b.length - a.length);
const VOWEL_START = /^[aeiouɔ]/;

/** 모델 표기 정리: 성조 · 장음 부호 빼기, ɛ → ae · ə(ɤ) → oe · ʉ → ue · ŋ → ng, 타이 숫자 → 0-9 */
export function normalizeThaiRoman(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
    .replace(/ɛ/g, 'ae').replace(/Ɛ/g, 'Ae').replace(/[əɤ]/g, 'oe').replace(/Ə/g, 'Oe').replace(/ʉ/g, 'ue').replace(/ŋ/g, 'ng').replace(/[ːˑ]/g, '')
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
}

/** 한 덩이(하이픈 사이)를 음절로: 가능한 나누기 중 덜 어색한 것 (첫소리 없는 음절 · 다른 표기는 비싸게). 못 읽으면 null */
function parsePiece(w) {
  const memo = new Map();
  const go = (i) => {
    if (i === w.length) return { cost: 0, syls: [] };
    if (memo.has(i)) return memo.get(i);
    let best = null;
    for (const on of ONSET_KEYS) {
      if (!w.startsWith(on, i)) continue;
      const j = i + on.length;
      for (const nu of NUCLEUS_KEYS) {
        if (!w.startsWith(nu, j)) continue;
        const k = j + nu.length;
        if (nu === 'or' && VOWEL_START.test(w.slice(k))) continue; // o-ra 는 o + r 첫소리
        const opts = [['', null, 0]];
        if (!OPEN.has(nu)) for (const c of CODAS) if (w.startsWith(c[0], k)) opts.push(c);
        for (const [c, coda, cc] of opts) {
          const rest = go(k + c.length);
          if (!rest) continue;
          const cost = rest.cost + cc + (ONSET_COST[on] || 0) + (NUCLEUS_COST[nu] || 0) + (on === '' && i > 0 ? 3 : 0);
          if (!best || cost < best.cost) best = { cost, syls: [{ on, nu, coda }, ...rest.syls] };
        }
      }
    }
    memo.set(i, best);
    return best;
  };
  return go(0);
}

const WORD = /[A-Za-zɔƆ]+(?:['’-][A-Za-zɔƆ]+)*/g;
const BRAND = (w) => w.split(/['’-]/).some((p) => /[A-ZƆ]/.test(p.slice(1))); // iPhone · ATM: 가운데 대문자
/** 소리 표기 낱말 하나 → { syls, cost } (cost: 표준 밖 표기 · 첫소리 없는 가운데 음절이 많을수록 큼). 상표 · 약자 · 못 읽으면 null */
function parseWord(word) {
  if (BRAND(word)) return null;
  const syls = [];
  let cost = 0;
  for (const piece of String(word).toLowerCase().split(/['’-]/)) {
    const r = piece ? parsePiece(piece) : null;
    if (!r) return null;
    syls.push(...r.syls);
    cost += r.cost;
  }
  return { syls, cost };
}
/** 소리 표기 낱말 하나 → 음절 목록 (못 읽으면 null) */
export const thaiWordSyllables = (word) => parseWord(word)?.syls ?? null;

/**
 * 소리 표기 점검 (서버가 모델 답을 볼 때): words = 따져 볼 낱말 수(상표 · 원문 source에 그대로 있는 라틴 낱말은 빼고),
 * parsed = 태국어 소리로 자연스럽게 읽힌 낱말 수(음절마다 표준 밖 표기가 하나 이하 — 영어 how · are · you는 안 읽힘), syllables = 그 음절 수
 */
export function thaiSoundStats(sound, source = '') {
  const own = new Set((String(source).match(/[A-Za-z]+/g) || []).map((w) => w.toLowerCase()));
  let words = 0, parsed = 0, syllables = 0;
  for (const w of normalizeThaiRoman(sound).match(WORD) || []) {
    if (BRAND(w) || own.has(w.toLowerCase())) continue;
    words++;
    const r = parseWord(w);
    if (r && r.cost <= r.syls.length) { parsed++; syllables += r.syls.length; }
  }
  return { words, parsed, syllables };
}

const YV = { [A]: 2, [AE]: 3, [EO]: 6, [E]: 7, [O]: 12, [U]: 17 };              // y + 모음 → ㅑ ㅒ ㅕ ㅖ ㅛ ㅠ
const WV = { [A]: 9, [AE]: 10, [EO]: 14, [O]: 14, [E]: 15, [I]: 16 };            // w + 모음 → ㅘ ㅙ ㅝ ㅞ ㅟ
const ASPIRATED = { t: /^th/, k: /^kh/, p: /^ph/ };                               // 같은 자리 유기음 첫소리
const compose = ({ L, V, T }) => String.fromCharCode(0xac00 + (L * 21 + V) * 28 + T);

function wordHangul(syls) {
  const out = [];
  syls.forEach((s, idx) => {
    const on = ONSET[s.on];
    const prev = syls[idx - 1];
    if (prev && ASPIRATED[prev.coda]?.test(s.on)) out[out.length - 1].T = 0; // phat-tha-ya → 파타야
    if (on.ng) out.push({ L: 11, V: EU, T: CODA.ng });                       // ng → 응
    if (on.pre != null) out.push({ L: on.pre, V: EU, T: on.preL ? CODA.l : 0 }); // kr → 끄ㄹ · kl → 끌ㄹ
    else if (s.on === 'l' && out.length && !out.at(-1).T) out.at(-1).T = CODA.l; // 모음 사이 l → ㄹㄹ (까올리)
    NUCLEUS[s.nu].forEach((v, k) => {
      let V = v;
      if (!k && on.glide === 'y') V = YV[v] ?? v;
      if (!k && on.glide === 'w') V = WV[v] ?? v;
      out.push({ L: k ? 11 : on.L, V, T: 0 });
    });
    if (s.coda) out.at(-1).T = CODA[s.coda];
  });
  return out.map(compose).join('');
}

/** 소리 표기 → 한글 발음 (낱말 띄어쓰기 · 구두점 · 숫자는 그대로, 태국어 소리가 아닌 낱말도 그대로). 예) khɔp-khun mak → 컵쿤 막 */
export function thaiSoundToHangul(sound) {
  return normalizeThaiRoman(sound).replace(WORD, (w) => {
    const syls = thaiWordSyllables(w);
    return syls ? wordHangul(syls) : w;
  });
}

/** 화면에 보일 로마자: ɔ는 RTGS처럼 o로, 문장 첫 글자는 대문자 (khɔp-khun mak → Khop-khun mak, iPhone은 그대로) */
export function thaiSoundToRoman(sound) {
  return normalizeThaiRoman(sound).replace(/ɔ/g, 'o').replace(/Ɔ/g, 'O').replace(/\s+/g, ' ').trim()
    .replace(/(^|[.!?]\s+)(\p{Ll})(?![\p{L}'’-]*\p{Lu})/gu, (_, a, b) => a + b.toUpperCase());
}

// reading.js READERS가 쓴다: hangul(text, sound) → 한국어 사용자 · roman(text, sound) → 그 밖의 사용자 (sound = 서버 소리 표기)
export default {
  sound: true,
  hangul: (text, sound) => thaiSoundToHangul(sound),
  roman: (text, sound) => thaiSoundToRoman(sound),
};
