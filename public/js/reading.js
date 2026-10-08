// 읽는 법 표시: 튀르키예어 → 한글 발음 (한국 사용자가 직접 말해 볼 수 있게) · 한국어 → 로마자 (상대가 읽어 볼 수 있게)
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

/** 화면에 같이 보일 읽는 법: 튀르키예어는 한글로(내가 한국어 사용자면), 한국어는 로마자로(상대가 볼 때) */
export function readingFor(text, lang, viewer = 'ko') {
  if (lang === 'tr' && viewer === 'ko') return trToHangul(text);
  if (lang === 'ko' && viewer !== 'ko') return koToRoman(text);
  return '';
}
