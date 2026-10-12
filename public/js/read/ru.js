// 러시아어 읽는 법 — 키릴 문자는 글자대로 읽혀서 서버 없이 화면에서 바로 만든다 (sound: false)
// 한글: 국립국어원 「러시아어 자모와 한글 대조표」 · 표기 세칙 (외래어 표기법):
//   모음 앞 자음은 초성으로 (е는 자음 뒤 '에', 어두 · 모음 뒤 '예', ё · я · ю는 요 · 야 · 유 — 표트르 · 마트료시카),
//   п т к б в г д ф는 무성 자음 앞에서 받침(ㅂ ㅅ ㄱ — 차이콥스키 · 하바롭스크 · 로팟킨), 유성 자음 앞 · 어말은 '으'를 붙이고
//   (어말 б в г는 소리대로 프 · 프 · 크 — 고르바초프 · 페테르부르크, д는 드 — 노브고로드), з ж는 무성 자음 앞 · 어말에서 스 · 시 (캅카스),
//   с 스 · х 흐 · ц 츠 · ч 치 · ш щ 시(모음 앞 샤 셰 시 쇼 슈 — 보르시 · 흐루쇼프), р 르(рь 리 — 이고리 · 고리키),
//   모음 앞 л은 ㄹㄹ(블라디보스토크 · 발랄라이카), 자음 앞 · 어말 л м н은 받침, й는 '이'(-ий · -ый는 '이' 하나 — 차이콥스키),
//   тс(ц로 소리 남)는 츠(이르쿠츠크), 같은 자음이 겹치면 하나로(м н л은 받침 + 초성 — 안나), -вств-의 소리 안 나는 в는 뺀다(즈드라스트부이테).
//   모음 약화(хорошо 하라쇼)는 적지 않는다 (호로쇼). 관용 표기: Санкт → 상트(상트페테르부르크).
// 로마자: 흔히 쓰는 영어식 (Spasibo · Zdravstvuyte · Moskva · borshch) — е는 어두 · 모음 뒤에서 ye, й y, ы y, х kh, ц ts, ь ъ는 적지 않음.

const VOWEL = { а: [0, 0], я: [2, 2], э: [5, 5], е: [5, 7], ё: [12, 12], о: [8, 8], у: [13, 13], ю: [17, 17], и: [20, 20], ы: [20, 20] }; // [자음 뒤, 홀로]
const INITIAL = { б: 7, в: 7, г: 0, д: 3, ж: 12, з: 12, к: 15, л: 5, м: 6, н: 2, п: 17, р: 5, с: 9, т: 16, ф: 17, х: 18, ц: 14, ч: 14, ш: 9, щ: 9 };
const VOICELESS = new Set('пфктшщсхцч');
const PLAIN = { 2: 0, 7: 5, 12: 8, 17: 13 };   // ж з ц ч 뒤: 야 → 아 (Korean ㅈ · ㅊ 뒤 이중 모음은 단모음으로)
const YOTATED = { 0: 2, 5: 7, 8: 12, 13: 17 }; // ш щ 뒤 · й 뒤: 아 → 야 (샤 · 셰 · 쇼 · 슈)
const EU = 18, I = 20, B = 17, S = 19, G = 1, M = 16, N = 4, R = 8; // ㅡ ㅣ · 받침 ㅂ ㅅ ㄱ ㅁ ㄴ ㄹ
const SIGN = new Set(['ь', 'ъ']);
const EXCEPT = { санкт: '상트' };
const ONE = { в: '브', к: '크', с: '스' }; // 다음 낱말에 붙여 읽는 한 글자 전치사
const compose = ({ L, V, T }) => String.fromCharCode(0xac00 + (L * 21 + V) * 28 + T);

/** 키릴 낱말 하나(하이픈 없는) → 한글 */
function ruWordHangul(raw) {
  let w = raw.toLowerCase().replace(/і/g, 'и').replace(/ї/g, 'йи').replace(/є/g, 'е').replace(/ґ/g, 'г');
  if (EXCEPT[w]) return EXCEPT[w];
  if (ONE[w]) return ONE[w];
  w = w.replace(/вств/g, 'ств').replace(/ть?с/g, 'ц').replace(/([бвгджзкпрстфхцчшщ])\1/g, '$1');
  const out = [];
  const last = () => out[out.length - 1];
  const epi = (L, V = EU) => out.push({ L, V, T: 0, epi: true });
  let onset = null; // 다음 모음에 붙을 자음
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (c in VOWEL) {
      const [vc, vs] = VOWEL[c];
      if (onset) {
        let v = vc;
        if (onset.kind === 'plain') v = PLAIN[v] ?? v;
        if (onset.kind === 'yot') v = YOTATED[v] ?? v;
        out.push({ L: onset.L, V: v, T: 0 });
        onset = null;
      } else out.push({ L: 11, V: vs, T: 0 });
      continue;
    }
    if (SIGN.has(c)) continue;
    if (c === 'й') {
      const n = w[i + 1];
      if (n in VOWEL) { out.push({ L: 11, V: YOTATED[VOWEL[n][0]] ?? VOWEL[n][0], T: 0 }); i++; continue; } // йо → 요
      if (!(last() && last().V === I && !last().T)) out.push({ L: 11, V: I, T: 0 });                     // ай → 아이 (ий → 이)
      continue;
    }
    if (!(c in INITIAL)) continue;
    const sign = SIGN.has(w[i + 1]) ? w[i + 1] : '';
    const after = sign ? w[i + 2] : w[i + 1];
    // 모음 앞: 초성 (л은 앞 음절 받침 ㄹ도), ь · ъ 뒤 모음은 '이 · 으' + 요 · 야 · 예 (타티야나)
    if (after in VOWEL) {
      if (c === 'л' && last() && !last().T) last().T = R;
      if (sign) { epi(INITIAL[c], sign === 'ь' ? I : EU); i++; continue; }
      onset = { L: INITIAL[c], kind: 'шщ'.includes(c) ? 'yot' : 'жзцч'.includes(c) ? 'plain' : '' };
      continue;
    }
    const voiceless = VOICELESS.has(after);
    const end = !after;
    const prev = last();
    const coda = (T) => { if (prev && !prev.T && !prev.epi) { prev.T = T; return true; } return false; };
    switch (c) {
      case 'б': case 'в': case 'п': case 'ф':
        if (voiceless && coda(B)) break;
        epi(c === 'б' || c === 'в' ? (voiceless || end ? 17 : 7) : 17); break;
      case 'г': case 'к':
        if (voiceless && coda(G)) break;
        epi(c === 'г' && !voiceless && !end ? 0 : 15); break;
      case 'д': case 'т':
        if (voiceless && coda(S)) break;
        epi(c === 'д' && !voiceless ? 3 : 16); break;
      case 'ж': case 'з': if (voiceless || end) epi(9, c === 'ж' ? I : EU); else epi(12); break;
      case 'с': epi(9); break;
      case 'х': epi(18); break;
      case 'ц': epi(14); break;
      case 'ч': epi(14, I); break;
      case 'ш': case 'щ': epi(9, I); break;
      case 'м': if (prev && !prev.T) prev.T = M; else epi(6); break; // 옴스크 · 페름 (르 + ㅁ)
      case 'н': if (prev && !prev.T) prev.T = N; else epi(2); break;
      case 'л': if (prev && !prev.T) prev.T = R; else epi(5); break;
      case 'р': epi(5, sign === 'ь' ? I : EU); break;
      default: break;
    }
    if (sign) i++;
  }
  return out.map(compose).join('');
}

const WORD = /[А-ЯЁІЇЄҐа-яёіїєґ]+(?:-[А-ЯЁІЇЄҐа-яёіїєґ]+)*/g;
/** 러시아어 글 → 한글 발음 (구두점 · 숫자 · 라틴 문자는 그대로, 하이픈으로 이은 낱말은 붙여서 — 상트페테르부르크) */
export function ruToHangul(text) {
  return String(text ?? '').replace(WORD, (w) => w.split('-').map(ruWordHangul).join(''));
}

// ---------- 로마자 ----------
const ROMAN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};
const VOWELS = new Set('аеёиоуыэюяіїє');
/** 러시아어 글 → 로마자 (대문자는 그대로 · 어두 · 모음 뒤 е는 ye, ж ч ш щ ц 뒤 ё는 o). 예) Спасибо → Spasibo, Ельцин → Yeltsin */
export function ruToRoman(text) {
  const s = String(text ?? '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const lo = ch.toLowerCase();
    if (!(lo in ROMAN)) { out += ch; continue; }
    const prev = (s[i - 1] || '').toLowerCase();
    let r = ROMAN[lo];
    if (lo === 'е' && (!(prev in ROMAN) || VOWELS.has(prev) || prev === 'ь' || prev === 'ъ')) r = 'ye';
    if (lo === 'ё' && 'жчшщц'.includes(prev) && prev) r = 'o';
    if (ch !== lo && r) {
      const nextUpper = /[А-ЯЁІЇЄҐ]/.test(s[i + 1] || '') || (/[А-ЯЁІЇЄҐ]/.test(s[i - 1] || '') && !/[а-яё]/.test(s[i + 1] || ''));
      r = nextUpper ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
    }
    out += r;
  }
  return out;
}

// reading.js READERS가 쓴다: hangul → 한국어 사용자 · roman → 그 밖의 사용자 (서버 소리 표기 없이 글에서 바로)
export default {
  sound: false,
  hangul: (text) => ruToHangul(text),
  roman: (text) => ruToRoman(text),
};
