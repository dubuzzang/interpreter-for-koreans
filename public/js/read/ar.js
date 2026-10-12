// 아랍어 읽는 법 (v1.6.0): 아랍 문자는 모음 부호 없이 써서 규칙만으로는 읽을 수 없다 →
// 서버(/api/sound · lib/langs/ar.mjs)에서 모음이 든 로마자 소리 표기를 받아, 한국어 사용자에게 한글 발음 · 그 밖의 사용자에게 다듬은 로마자로.
// 표현집(phrases/ar.js)에는 같은 방식의 로마자를 미리 넣어 두어 인터넷 없이도 보인다. 서버도 이 파일의 정리 · 세기를 쓴다.
//
// 로마자 방식 (서버 지시문 · 표현집 · 사진 읽는 법이 같이 쓴다):
//   모음 a i u · 긴 모음 ā ī ū · 이중 모음 ay aw / 자음 b t th j ḥ kh d dh r z s sh ṣ ḍ ṭ ẓ gh f q k l m n h w y ·
//   ʿ(ع) · ʾ(낱말 안의 함자) / 겹자음(샷다)은 두 번(Muḥammad) / 관사 al- 은 붙임표로, 태양 문자 앞에서는 동화(as-salām)
//
// 한글: 국립국어원 외래어 표기법의 일반 원칙(받침은 ㄴ·ㄹ·ㅁ·ㅂ·ㅅ·ㅇ, 모음 앞 l은 ㄹㄹ, 끝소리 r은 '르')과 잘 알려진 표기에 맞춘다 —
//   marḥabā 마르하바 · shukran 슈크란 · as-salāmu ʿalaykum 앗살라무 알라이쿰 · al-qāhira 알카히라 · dubayy 두바이 · muḥammad 무함마드
//   · 긴 모음은 짧은 모음과 같이 (ā → ㅏ), ḥ · h → ㅎ, kh · q · k → ㅋ, gh → ㄱ, th · s · ṣ → ㅅ, dh · ẓ · d · ḍ → ㄷ, z · j → ㅈ, ʿ · ʾ → ㅇ(모음 앞)
//   · ay → 아이, aw → 아우, sh + 모음 → 샤 · 시 · 슈 · 셰 · 쇼, 낱말 끝 h는 적지 않는다(allāh 알라)
//   · 겹자음: m · n · l은 받침으로 겹쳐(무함마드 · 알라), b · f는 ㅂ받침, k · q · gh는 ㄱ받침, 그 밖은 ㅅ받침(앗살람), r · w · y · h는 한 번
//   · 짧은 모음 뒤 자음 앞 · 끝의 b는 ㅂ받침(압둘라 · 아랍), 붙임표(al-) 뒤는 소리를 이어 적지 않는다(알아라비야)

const ARABIC_LETTER = /[ء-يٱ-ۓ]/;
/** 아랍 문자 낱말 수 (소리 표기가 글과 맞는지 볼 때) */
export const arabicWordCount = (text) => (String(text).match(/[ء-يٱ-ۓً-ْـ]+/g) || []).filter((w) => ARABIC_LETTER.test(w)).length;
/** 로마자 낱말 수 (붙임표로 이은 것은 한 낱말) */
export const romanWordCount = (s) => (String(s).match(/[\p{L}ʿʾ][\p{L}\p{M}ʿʾ-]*/gu) || []).length;

const DIGITS = /[٠-٩۰-۹]/g;
const digit = (c) => String((c.charCodeAt(0) - (c >= '۰' ? 0x06f0 : 0x0660)));

/**
 * 모델 · 사람이 쓴 아랍어 로마자를 한 모양으로: 아포스트로피 여러 가지 → ʿ(아인) · ʾ(함자), 아랍 문장 부호 · 숫자 → 라틴 것, 띄어쓰기.
 * ʻ ‘ ` ´ ʽ 는 아인, ʼ ’ ' 는 함자로 본다 (읽을 때는 둘 다 모음 앞의 ㅇ이라 바뀌어도 소리는 같다)
 */
export function normRoman(raw) {
  return String(raw ?? '').normalize('NFC')
    .replace(/[ʻ‘`´ʽ]/g, 'ʿ').replace(/[ʼ’']/g, 'ʾ')
    .replace(/،/g, ',').replace(/؟/g, '?').replace(/؛/g, ';').replace(/۔/g, '.').replace(/٪/g, '%')
    .replace(/(?<=\d)٫(?=\d)/g, '.').replace(DIGITS, digit)
    .replace(/[ \t ]+/g, ' ').replace(/ ([,.?!;:])/g, '$1').trim();
}

// ---------- 로마자 → 한글 ----------
// 첫소리 번호 (ㄱ0 ㄴ2 ㄷ3 ㄹ5 ㅁ6 ㅂ7 ㅅ9 ㅇ11 ㅈ12 ㅊ14 ㅋ15 ㅌ16 ㅍ17 ㅎ18)
const ONSET = {
  b: 7, t: 16, th: 9, j: 12, h: 18, kh: 15, d: 3, dh: 3, r: 5, z: 12, s: 9, sh: 9, gh: 0, f: 17, q: 15, k: 15,
  l: 5, m: 6, n: 2, p: 17, v: 7, g: 0, ch: 14, c: 15, x: 15, Q: 11, w: 11, y: 11,
};
// 모음 번호 (ㅏ0 ㅔ5 ㅗ8 ㅜ13 ㅡ18 ㅣ20) · y/sh 뒤(ㅑ2 ㅖ7 ㅛ12 ㅠ17) · w 뒤(ㅘ9 ㅞ15 ㅝ14 ㅟ16)
const VOWEL = { a: 0, i: 20, u: 13, e: 5, o: 8 };
const Y_VOWEL = { a: 2, i: 20, u: 17, e: 7, o: 12 };
const W_VOWEL = { a: 9, i: 16, u: 13, e: 15, o: 14 };
const LONG = { ā: 'a', ī: 'i', ū: 'u', ē: 'e', ō: 'o' };
// 겹자음 앞 자음이 받침이 되는 꼴: ㅁ16 ㄴ4 ㄹ8 ㅂ17 ㄱ1 ㅅ19 (0 = 적지 않음)
const GEMINATE = { m: 16, n: 4, l: 8, b: 17, f: 17, p: 17, v: 17, k: 1, q: 1, kh: 1, g: 1, gh: 1, r: 0, w: 0, y: 0, h: 0, Q: 0 };
const DIGRAPHS = ['sh', 'kh', 'gh', 'th', 'dh', 'ch'];
// 밑점 글자 → 한글로는 같은 소리 (ẓ는 ذ처럼 ㄷ: abū ẓabī 아부다비)
const PLAIN = { ḥ: 'h', ṣ: 's', ḍ: 'd', ṭ: 't', ẓ: 'dh', ḫ: 'kh', š: 'sh', ǧ: 'j', ġ: 'gh', ṯ: 'th', ḏ: 'dh' };

/** 낱말 하나 → [{ type: 'C', c } | { type: 'V', v, long } | { type: '-' }] */
function tokens(word) {
  const s = word.toLowerCase().replace(/[ḥṣḍṭẓḫšǧġṯḏ]/g, (c) => PLAIN[c]).replace(/[ʿʾ]/g, 'Q')
    .replace(/aa/g, 'ā').replace(/ii/g, 'ī').replace(/uu/g, 'ū').replace(/ee/g, 'ē').replace(/oo/g, 'ō');
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '-') { out.push({ type: '-' }); continue; }
    if (VOWEL[c] != null) { out.push({ type: 'V', v: c, long: false }); continue; }
    if (LONG[c]) { out.push({ type: 'V', v: LONG[c], long: true }); continue; }
    const two = s.slice(i, i + 2);
    if (DIGRAPHS.includes(two)) { out.push({ type: 'C', c: two }); i++; continue; }
    if (ONSET[c] != null) out.push({ type: 'C', c });
  }
  return out;
}

const compose = (x) => String.fromCharCode(0xac00 + (x.L * 21 + x.V) * 28 + x.T);

function wordToHangul(word) {
  const toks = tokens(word);
  if (!toks.some((t) => t.type === 'V')) return null;
  const syl = [];
  const push = (L, V, extra = {}) => { syl.push({ L, V, T: 0, ...extra }); };
  const prevOf = () => syl.at(-1);
  // 이어지는 다음 토큰 (붙임표는 건너뜀)
  const after = (i) => { let j = i + 1; while (toks[j]?.type === '-') j++; return toks[j]; };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === '-') continue;
    if (t.type === 'V') { push(11, VOWEL[t.v], { long: t.long }); continue; }
    const c = t.c;
    const n1 = toks[i + 1];
    if (n1?.type === 'V') {
      // 첫소리 + 모음
      let L = ONSET[c], V = VOWEL[n1.v];
      if (c === 'y' || c === 'sh') V = Y_VOWEL[n1.v];
      if (c === 'w') V = W_VOWEL[n1.v];
      const prev = prevOf();
      // 모음 사이 l → ㄹㄹ (앞 음절에 받침이 없으면): alaykum 알라이쿰 · faḍlak 파들라크
      if (c === 'l' && prev && !prev.T) prev.T = 8;
      push(L, V, { long: n1.long });
      i++;
      continue;
    }
    // 겹자음: 같은 자음 + 모음 (붙임표를 사이에 두어도: as-salām)
    let j = i + 1;
    while (toks[j]?.type === '-') j++;
    if (toks[j]?.type === 'C' && toks[j].c === c) {
      if (toks[j + 1]?.type !== 'V') continue; // 끝의 겹자음은 한 번만 (sirr 시르)
      const prev = prevOf();
      const T = GEMINATE[c] ?? 19;
      if (prev && !prev.T && T) prev.T = T;
      i = j - 1;
      continue;
    }
    // 받침 또는 '으' 음절
    const prev = prevOf();
    const end = !after(i);
    const open = prev && !prev.T;
    if (c === 'm' && open) { prev.T = 16; continue; }
    if (c === 'n' && open) { prev.T = 4; continue; }
    if (c === 'l' && open) { prev.T = 8; continue; }
    if (c === 'Q') continue;
    if (c === 'y') { if (!(open && prev.V === 20)) push(11, 20, { off: true }); continue; }  // ay → 아이 (iy는 그대로 이)
    if (c === 'w') { if (!(open && prev.V === 13)) push(11, 13, { off: true }); continue; } // aw → 아우
    if (c === 'h' && end && open && !prev.ep) continue;                                     // 낱말 끝 h: allāh 알라
    if (c === 'b' && open && !prev.long && !prev.off && !prev.ep) { prev.T = 17; continue; } // 압둘라 · 아랍
    if (c === 'sh') { push(9, 20, { ep: true }); continue; }   // 시 (dimashq 디마시크)
    if (c === 'ch') { push(14, 20, { ep: true }); continue; }
    push(ONSET[c], 18, { ep: true });
  }
  return syl.map(compose).join('');
}

/** 아랍어 로마자 소리 표기 → 한글 발음 (낱말 사이 띄어쓰기 · 문장 부호 · 숫자는 그대로) */
export function arToHangul(roman) {
  if (!roman) return '';
  return normRoman(roman).replace(/[\p{L}ʿʾ][\p{L}\p{M}ʿʾ-]*/gu, (w) => wordToHangul(w.normalize('NFC')) ?? w);
}

// ---------- 다듬은 로마자 (한국어 사용자가 아닌 사람에게) ----------
/** 밑점은 떼고(ḥ → h), 낱말 첫머리 ʿ · ʾ 는 빼고 안쪽은 ’, 문장 첫 글자는 대문자. 긴 모음 ā ī ū 는 남긴다 */
export function arRoman(roman) {
  if (!roman) return '';
  const s = normRoman(roman)
    .replace(/[ḥṣḍṭẓḤṢḌṬẒ]/g, (c) => c.normalize('NFD')[0])
    .replace(/(^|[\s("-])[ʿʾ]/g, '$1')
    .replace(/[ʿʾ]/g, '’');
  return s.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
}

export default {
  sound: true,
  hangul: (text, sound) => arToHangul(sound),
  roman: (text, sound) => arRoman(sound),
};
