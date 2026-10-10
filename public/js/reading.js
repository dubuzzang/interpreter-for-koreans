// 읽는 법 표시 — 보는 사람이 읽을 수 있는 글자로:
// 한국어 사용자에게 튀르키예어·일본어 → 한글 발음, 튀르키예어·영어·일본어 사용자에게 한국어 → 로마자,
// 튀르키예어·영어 사용자에게 일본어 → 로마자. 라틴 문자 언어끼리는 적지 않는다.
// 튀르키예어 규칙은 Merhaba(한국인을 위한 튀르키예어) 앱의 변환기와 같다.

const trLower = (s) => String(s ?? '').normalize('NFC').toLocaleLowerCase('tr-TR').replace(/̇/g, '');

// ---------- 튀르키예어 → 한글 ----------
const VOWELS = 'aeıioöuü';
const V = { a: 0, e: 5, ı: 18, i: 20, o: 8, ö: 11, u: 13, ü: 16 };
const VY = { a: 2, e: 7, i: 20, o: 12, ö: 12, u: 17, ü: 17 };
const VSH = { a: 2, e: 7, i: 20, ı: 20, o: 12, u: 17, ö: 11, ü: 16 };
const L = { b: 7, c: 12, ç: 14, d: 3, f: 17, g: 0, ğ: 11, h: 18, j: 12, k: 15, l: 5, m: 6, n: 2, p: 17, r: 5, s: 9, ş: 9, t: 16, v: 7, y: 11, z: 12 };
const T = { k: 1, n: 4, ng: 21, l: 8, m: 16, p: 17, t: 19 };
const compose = (o) => String.fromCharCode(0xac00 + (o.L * 21 + o.V) * 28 + o.T);

function trWord(raw) {
  const s = trLower(raw).replace(/[’'`]/g, '').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
  const chars = [...s];
  if (chars.some((c) => !(c in L) && !VOWELS.includes(c))) return raw;
  const vIdx = [];
  chars.forEach((c, i) => { if (VOWELS.includes(c)) vIdx.push(i); });
  if (!vIdx.length) return raw;
  const syls = [];
  vIdx.forEach((vi, k) => {
    const from = k === 0 ? 0 : vIdx[k - 1] + 1;
    const cluster = chars.slice(from, vi);
    let onset = cluster;
    if (k > 0) {
      const codaCount = cluster.length >= 4 ? 2 : Math.max(0, cluster.length - 1);
      syls[k - 1].coda.push(...cluster.slice(0, codaCount));
      onset = cluster.slice(codaCount);
    }
    syls.push({ onset, v: chars[vi], coda: [] });
  });
  syls[syls.length - 1].coda.push(...chars.slice(vIdx[vIdx.length - 1] + 1));
  const out = [];
  const push = (Li, Vi, ep = false) => { out.push({ L: Li, V: Vi, T: 0, ep }); return out[out.length - 1]; };
  const epenthetic = (c) => {
    if (c === 'ğ') return;
    if (c === 'y') { push(11, 20, true); return; }
    push(L[c], 'şçcj'.includes(c) ? 20 : 18, true);
  };
  syls.forEach((sy, k) => {
    const next = syls[k + 1];
    const onset = sy.onset;
    onset.slice(0, -1).forEach(epenthetic);
    const c = onset[onset.length - 1];
    let Li, Vi;
    if (!c || c === 'ğ') { Li = 11; Vi = V[sy.v]; }
    else if (c === 'y') {
      if (sy.v === 'ı') { push(11, 20); Li = 11; Vi = 18; } else { Li = 11; Vi = VY[sy.v]; }
    } else if (c === 'ş') { Li = 9; Vi = VSH[sy.v]; }
    else { Li = L[c]; Vi = V[sy.v]; }
    if (c === 'l' && out.length && out[out.length - 1].T === 0) out[out.length - 1].T = T.l;
    push(Li, Vi);
    const nextOnset = next ? next.onset[0] : null;
    sy.coda.forEach((cc, ci) => {
      const cur = out[out.length - 1];
      const followed = ci < sy.coda.length - 1 ? sy.coda[ci + 1] : nextOnset;
      if (cc === 'ğ') return;
      if (cur.T === 0 && cc === 'n') { cur.T = followed === 'k' || followed === 'g' ? T.ng : T.n; return; }
      if (cur.T === 0 && cc === 'm') { cur.T = T.m; return; }
      if (cur.T === 0 && cc === 'l') { cur.T = T.l; return; }
      if ('kpt'.includes(cc) && ci === 0 && cur.T === 0 && !cur.ep) {
        const wordFinal = !next && sy.coda.length === 1;
        if (wordFinal || followed === cc) { cur.T = T[cc]; return; }
      }
      if (ci === sy.coda.length - 1 && followed === cc) return;
      epenthetic(cc);
    });
  });
  return out.map(compose).join('');
}

/** 튀르키예어 문장 → 한글 발음 (구두점·숫자는 그대로) */
export function trToHangul(text) {
  if (!text) return '';
  return String(text)
    .split(/([^A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû’'`]+)/)
    .map((tok) => (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tok) ? trWord(tok) : tok))
    .join('');
}

// ---------- 한국어 → 로마자 (국어의 로마자 표기법, 자주 나는 소리 바뀜 포함) ----------
const RI = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RV = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
// 받침: [끝소리(뒤에 자음·끝), 뒤에 모음이 오면 넘어가는 소리]
const RF = [['', ''], ['k', 'g'], ['k', 'kk'], ['k', 'ks'], ['n', 'n'], ['n', 'nj'], ['n', 'n'], ['t', 'd'], ['l', 'r'], ['k', 'lg'], ['m', 'lm'], ['l', 'lb'], ['l', 'ls'], ['l', 'lt'], ['p', 'lp'], ['l', 'r'], ['m', 'm'], ['p', 'b'], ['p', 'ps'], ['t', 's'], ['t', 'ss'], ['ng', 'ng'], ['t', 'j'], ['t', 'ch'], ['k', 'k'], ['t', 't'], ['p', 'p'], ['t', '']];

function decompose(ch) {
  const c = ch.charCodeAt(0) - 0xac00;
  if (c < 0 || c > 11171) return null;
  return { i: Math.floor(c / 588), v: Math.floor((c % 588) / 28), f: c % 28 };
}

function koWord(word) {
  const syl = [...word].map(decompose);
  if (syl.some((s) => !s)) return null;
  let out = '';
  syl.forEach((s, k) => {
    const next = syl[k + 1];
    let init = RI[s.i];
    const prev = syl[k - 1];
    // 앞 받침이 넘어온 경우(연음)는 초성 ㅇ 자리에 이미 붙였다
    if (prev && prev.f && s.i === 11 && prev.f !== 21) init = '';
    // ㄹ 받침 뒤 ㄹ → l (설날 → seollal), ㄴ 받침 뒤 ㄹ → l (신라 → silla 근사)
    if (prev && s.i === 5 && (prev.f === 8 || prev.f === 4)) init = 'l';
    if (prev && s.i === 2 && prev.f === 8) init = 'l'; // ㄹ 받침 뒤 ㄴ → l (설날 → seollal)
    // ㅎ 받침 뒤 ㄱ·ㄷ·ㅈ → 거센소리 (좋다 → jota)
    if (prev && prev.f === 27 && [0, 3, 12].includes(s.i)) init = { 0: 'k', 3: 't', 12: 'ch' }[s.i];
    out += init + RV[s.v];
    if (!s.f) return;
    const [coda, carry] = RF[s.f];
    if (next && next.i === 11 && s.f !== 21) { out += carry; return; } // 연음
    if (next && (next.i === 2 || next.i === 6)) { // 콧소리되기: ㄱ·ㄷ·ㅂ 계열 + ㄴ·ㅁ
      out += ({ k: 'ng', t: 'n', p: 'm' })[coda] || coda;
      return;
    }
    if (next && next.i === 5 && s.f === 4) { out += 'l'; return; } // ㄴ+ㄹ → ll
    if (next && next.i === 5 && s.f === 8) { out += 'l'; return; }
    if (s.f === 27 && next && [0, 3, 12].includes(next.i)) return; // ㅎ은 뒤 소리에 합쳐짐
    out += coda;
  });
  return out;
}

/** 한국어 문장 → 로마자 (단어 사이 띄어쓰기·구두점 유지) */
export function koToRoman(text) {
  if (!text) return '';
  const res = String(text).replace(/[가-힣]+/g, (w) => koWord(w) ?? w);
  return res.replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

// ---------- 일본어(히라가나 읽기) → 한글 발음 ----------
// 일본어 한글 표기 관례: 낱말 첫머리 か·た행은 예사소리(곤니치와, 도코), 가운데는 거센소리(이타다키마스),
// っ → ㅅ받침(깃푸), ん → ㄴ받침(문장 끝은 ㅇ: 스미마셍), 장음(ー, 오·우단 뒤 う)은 적지 않는다(도쿄).
const JA = {
  あ: '아', い: '이', う: '우', え: '에', お: '오',
  か: ['카', '가'], き: ['키', '기'], く: ['쿠', '구'], け: ['케', '게'], こ: ['코', '고'],
  が: '가', ぎ: '기', ぐ: '구', げ: '게', ご: '고',
  さ: '사', し: '시', す: '스', せ: '세', そ: '소',
  ざ: '자', じ: '지', ず: '즈', ぜ: '제', ぞ: '조',
  た: ['타', '다'], ち: ['치', '지'], つ: '츠', て: ['테', '데'], と: ['토', '도'],
  だ: '다', ぢ: '지', づ: '즈', で: '데', ど: '도',
  な: '나', に: '니', ぬ: '누', ね: '네', の: '노',
  は: '하', ひ: '히', ふ: '후', へ: '헤', ほ: '호',
  ば: '바', び: '비', ぶ: '부', べ: '베', ぼ: '보',
  ぱ: '파', ぴ: '피', ぷ: '푸', ぺ: '페', ぽ: '포',
  ま: '마', み: '미', む: '무', め: '메', も: '모',
  や: '야', ゆ: '유', よ: '요',
  ら: '라', り: '리', る: '루', れ: '레', ろ: '로',
  わ: '와', ゐ: '이', ゑ: '에', を: '오', ゔ: '부',
  ぁ: '아', ぃ: '이', ぅ: '우', ぇ: '에', ぉ: '오', ゃ: '야', ゅ: '유', ょ: '요', ゎ: '와',
};
// 작은 ゃゅょ가 붙는 소리 [ゃ, ゅ, ょ] (첫머리가 다르면 [가운데, 첫머리])
const YOON = {
  き: [['캬', '갸'], ['큐', '규'], ['쿄', '교']], ぎ: ['갸', '규', '교'], し: ['샤', '슈', '쇼'], じ: ['자', '주', '조'],
  ち: [['차', '자'], ['추', '주'], ['초', '조']], ぢ: ['자', '주', '조'], に: ['냐', '뉴', '뇨'], ひ: ['햐', '휴', '효'],
  び: ['뱌', '뷰', '뵤'], ぴ: ['퍄', '퓨', '표'], み: ['먀', '뮤', '묘'], り: ['랴', '류', '료'],
};
// 외래어의 작은 모음 (てぃ → 티 …)
const SMALL = {
  てぃ: '티', でぃ: '디', とぅ: '투', どぅ: '두', ふぁ: '파', ふぃ: '피', ふぇ: '페', ふぉ: '포', うぃ: '위', うぇ: '웨', うぉ: '워',
  しぇ: '셰', じぇ: '제', ちぇ: ['체', '제'], つぁ: '차', ゔぁ: '바', ゔぃ: '비', ゔぇ: '베', ゔぉ: '보', いぇ: '예',
};
const PUNCT = { '。': '.', '、': ',', '？': '?', '！': '!', '・': ' ' };
const LONG_AFTER = new Set([8, 12, 13, 17, 18]); // ㅗ ㅛ ㅜ ㅠ ㅡ 뒤의 う는 장음
const pick = (v, initial) => (Array.isArray(v) ? v[initial ? 1 : 0] : v);
const vowelOf = (syl) => Math.floor(((syl.charCodeAt(0) - 0xac00) % 588) / 28);
const withFinal = (syl, t) => ((syl.charCodeAt(0) - 0xac00) % 28 ? syl : String.fromCharCode(syl.charCodeAt(0) + t));

function jaWord(word, utteranceEnd) {
  const out = [];
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], next = chars[i + 1];
    const initial = out.length === 0;
    if (c === 'ー') continue;
    if (c === 'っ') { if (out.length) out[out.length - 1] = withFinal(out.at(-1), 19); continue; }
    if (c === 'ん') {
      if (!out.length) { out.push('응'); continue; }
      const end = i === chars.length - 1 && utteranceEnd;
      out[out.length - 1] = withFinal(out.at(-1), end ? 21 : 4);
      continue;
    }
    if (c === 'う' && out.length && LONG_AFTER.has(vowelOf(out.at(-1)))) continue;
    if (next && 'ゃゅょ'.includes(next) && YOON[c]) { out.push(pick(YOON[c]['ゃゅょ'.indexOf(next)], initial)); i++; continue; }
    if (next && SMALL[c + next]) { out.push(pick(SMALL[c + next], initial)); i++; continue; }
    if (JA[c]) out.push(pick(JA[c], initial));
    else out.push(c);
  }
  return out.join('');
}

/** 히라가나(가타카나) 읽기 → 한글 발음. 예) こんにちわ → 곤니치와, すみません → 스미마셍 */
export function jaKanaToHangul(kana) {
  if (!kana) return '';
  const s = String(kana).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const parts = s.split(/([\s。、？！・?!,.]+)/);
  return parts.map((p, k) => {
    if (!p) return '';
    if (/^[\s。、？！・?!,.]+$/.test(p)) return [...p].map((c) => PUNCT[c] ?? c).join('');
    const after = parts.slice(k + 1).join('');
    const utteranceEnd = !after.trim() || /^[。？！?!.]/.test(after.trimStart());
    return jaWord(p, utteranceEnd);
  }).join('');
}

// ---------- 일본어(히라가나 읽기) → 로마자 (헵번식, 장음은 ā·ō·ū) ----------
const ROMA = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ゔ: 'vu', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};
// 작은 ゃゅょ가 붙는 소리의 앞부분 (きゃ → kya, しゃ → sha)
const YOON_R = { き: 'ky', ぎ: 'gy', し: 'sh', じ: 'j', ち: 'ch', ぢ: 'j', に: 'ny', ひ: 'hy', び: 'by', ぴ: 'py', み: 'my', り: 'ry' };
const SMALL_R = {
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du', ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che', つぁ: 'tsa', ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo', いぇ: 'ye',
};
const MACRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const PUNCT_R = { '。': '.', '、': ',', '？': '?', '！': '!', '・': ' ', '　': ' ' };

function jaWordRoman(word) {
  const out = [];   // 소리마디별 로마자
  let geminate = false; // っ: 다음 소리의 첫 자음을 겹친다
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], next = chars[i + 1];
    const last = out.at(-1) || '';
    const lastV = last.slice(-1);
    if (c === 'っ') { geminate = true; continue; }
    if (c === 'ー') { if (MACRON[lastV]) out[out.length - 1] = last.slice(0, -1) + MACRON[lastV]; continue; }
    // 장음: おう · おお → ō, うう → ū, ああ → ā, ええ → ē (いい · えい는 그대로)
    if ((c === 'う' && (lastV === 'o' || lastV === 'u')) || (c === 'お' && lastV === 'o') || (c === 'あ' && lastV === 'a') || (c === 'え' && lastV === 'e')) {
      out[out.length - 1] = last.slice(0, -1) + MACRON[lastV];
      continue;
    }
    let syl;
    if (next && 'ゃゅょ'.includes(next) && YOON_R[c]) { syl = YOON_R[c] + ROMA[next].slice(1); i++; }
    else if (next && SMALL_R[c + next]) { syl = SMALL_R[c + next]; i++; }
    else if (c === 'ん') syl = 'n';
    else syl = ROMA[c] ?? c;
    if (geminate) { syl = (syl.startsWith('ch') ? 't' : /^[a-z]/.test(syl) && !/^[aeiou]/.test(syl) ? syl[0] : '') + syl; geminate = false; }
    // ん 뒤에 모음·y가 오면 n' (きんえん → kin'en)
    if (last === 'n' && /^[aeiouy]/.test(syl)) out[out.length - 1] = "n'";
    out.push(syl);
  }
  return out.join('');
}

/** 히라가나(가타카나) 읽기 → 로마자. 예) こんにちわ → Konnichiwa, ありがとう ございます → Arigatō gozaimasu */
export function jaKanaToRomaji(kana) {
  if (!kana) return '';
  const s = String(kana).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const res = s.split(/([\s。、？！・?!,.]+)/)
    .map((p) => (/^[\s。、？！・?!,.]+$/.test(p) ? [...p].map((c) => PUNCT_R[c] ?? c).join('') : jaWordRoman(p)))
    .join('');
  return res.replace(/(^|[.!?]\s+)([a-zāīūēō])/g, (_, a, b) => a + b.toUpperCase());
}

/**
 * 화면에 같이 보일 읽는 법 — 그 글을 보는 사람(viewer)이 읽을 수 있는 글자로, 필요할 때만:
 * - 한국어 사용자: 튀르키예어 → 한글 발음, 일본어 → 한글 발음 (서버에서 받은 히라가나 읽기 kana가 있어야)
 * - 튀르키예어·영어 사용자: 한국어 → 로마자, 일본어 → 로마자 (kana가 있어야). 튀르키예어↔영어는 적지 않음
 * - 일본어 사용자: 한국어 → 로마자. 튀르키예어·영어는 적지 않음 (가타카나 표기는 정확하게 만들기 어려워서)
 */
export function readingFor(text, lang, viewer = 'ko', kana = '') {
  if (lang === viewer) return '';
  if (viewer === 'ko') {
    if (lang === 'tr') return trToHangul(text);
    if (lang === 'ja') return kana ? jaKanaToHangul(kana) : '';
    return '';
  }
  if (lang === 'ko') return koToRoman(text);
  if (lang === 'ja') return kana ? jaKanaToRomaji(kana) : '';
  return '';
}

/** 이 사람에게 일본어 읽는 법을 보이려면 서버에서 히라가나 읽기를 받아야 하나 */
export const needsKana = (lang, viewer) => lang === 'ja' && viewer !== 'ja';
