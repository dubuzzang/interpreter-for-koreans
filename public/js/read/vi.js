// 베트남어 읽는 법 — 한국어 사용자에게 한글 발음 (국립국어원 외래어 표기법 「베트남어 자모와 한글 대조표」와 표기 세칙).
// 라틴 문자라 다른 사용자에게는 로마자를 따로 적지 않고(roman 없음), 글에서 바로 만들어 서버 소리 표기도 필요 없다(sound: false).
//   Hà Nội → 하노이 · Hồ Chí Minh → 호찌민 · Nha Trang → 냐짱 · Phú Quốc → 푸꾸옥 · phở → 퍼 · cảm ơn → 깜 언
//   x는 대조표대로 ㅆ (xin chào → 씬 짜오 — 흔히 쓰는 '신짜오'와 다름), s는 ㅅ. 성조는 적지 않는다.
// 표기 세칙: nh는 뒤 모음과 합치고(냐) 끝에서는 ㄴ, a 뒤면 '아인'(Thanh → 타인) · qu + a → 꽈(Quang → 꽝) · y는 뒤 모음과 합침(yên → 옌) ·
// 낱말 가운데 모음 앞 l은 ㄹㄹ(Đà Lạt → 달랏, 사람 이름은 빼고).
// 베트남어는 한 낱말이 한 음절이다 — 음절이 여럿인 낱말(iPhone · taxi · Samsung)은 외래어라 그대로 둔다.
// 대문자로 시작하는 낱말이 이어지면 한 이름으로 붙여 쓰고(Hà Nội → 하노이), 그 밖은 낱말마다 띄어 쓴다.

const TONES = /[̣̀́̃̉]/g; // 성조 부호 (글자 모양을 바꾸는 ˆ ˘ ̛ 는 남긴다)
const VOWELS = 'aăâeêioôơuưy';
const isVowel = (c) => Boolean(c) && VOWELS.includes(c);
const ONSETS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'qu', 'th', 'tr', 'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];
const CODAS = ['ng', 'nh', 'ch', 'c', 'm', 'n', 'p', 't'];
// 첫소리 → 한글 첫소리 번호 (ㄱ0 ㄲ1 ㄴ2 ㄷ3 ㄸ4 ㄹ5 ㅁ6 ㅂ7 ㅃ8 ㅅ9 ㅆ10 ㅇ11 ㅈ12 ㅉ13 ㅋ15 ㅌ16 ㅍ17 ㅎ18)
const INI = { b: 7, c: 1, k: 1, ch: 13, d: 12, gi: 12, đ: 3, g: 0, gh: 0, h: 18, kh: 15, l: 5, m: 6, n: 2, p: 8, ph: 17, r: 5, s: 9, t: 4, th: 16, tr: 13, v: 7, x: 10 };
// 모음 → 한글 가운뎃소리 번호 (ㅏ0 ㅐ1 ㅓ4 ㅔ5 ㅗ8 ㅜ13 ㅡ18 ㅣ20)
const VOW = { a: 0, ă: 0, â: 4, e: 1, ê: 5, i: 20, y: 20, o: 8, ô: 8, ơ: 4, u: 13, ư: 18 };
const Y_GLIDE = { 0: 2, 4: 6, 8: 12, 13: 17, 1: 3, 5: 7, 20: 20 }; // ㅏ→ㅑ ㅓ→ㅕ ㅗ→ㅛ ㅜ→ㅠ ㅐ→ㅒ ㅔ→ㅖ (ㅡ는 없음)
// 끝소리 → 받침 번호 (ㄱ1 ㄴ4 ㅁ16 ㅂ17 ㅅ19 ㅇ21)
const FIN = { c: 1, ch: 1, m: 16, n: 4, nh: 4, ng: 21, p: 17, t: 19 };
const RIEUL = 8;
const syl = ([L, V, T = 0]) => String.fromCharCode(0xac00 + (L * 21 + V) * 28 + T);
// 사람 이름으로 보는 성 (이름 가운데 l은 ㄹㄹ로 적지 않는다: Nguyễn Thị Lan → 응우옌티란)
const SURNAMES = new Set('nguyễn trần lê phạm hoàng huỳnh phan vũ võ đặng bùi đỗ hồ ngô dương lý'.split(' '));

/** 성조를 뗀 소문자 낱말 → 음절 [{ onset, vowels, coda }]. 베트남어 음절로 못 나누면 null */
function parse(w) {
  const out = [];
  let i = 0;
  while (i < w.length) {
    const onset = ONSETS.find((o) => w.startsWith(o, i)) || '';
    // gi 뒤에 모음이 없으면 i가 모음 (gì → 지, gìn → 진)
    i += onset === 'gi' && !isVowel(w[i + 2]) ? 1 : onset.length;
    let j = i;
    while (isVowel(w[j])) j++;
    if (j === i) return null;
    let coda = CODAS.find((c) => w.startsWith(c, j)) || '';
    if (isVowel(w[j + coda.length])) coda = ''; // 뒤에 모음이 오면 다음 음절의 첫소리
    out.push({ onset, vowels: w.slice(i, j), coda });
    i = j + coda.length;
  }
  return out;
}

/** 음절 하나 → 한글 */
function hangulOf({ onset, vowels, coda }) {
  const v = [...vowels];
  const beats = v.map((c) => VOW[c]);
  // 받침 없는 이중 모음 ia · ya · ua · ưa 의 a는 '어' (kia → 끼어, mua → 무어, chưa → 쯔어)
  if (v.length >= 2 && v.at(-1) === 'a' && 'iyuư'.includes(v.at(-2))) beats[beats.length - 1] = 4;
  // y는 뒤 모음과 합쳐 한 음절로 (yên → 옌, Nguyễn → 응우옌)
  for (let k = v.length - 2; k >= 0; k--) if (v[k] === 'y' && Y_GLIDE[beats[k + 1]] != null) beats.splice(k, 2, Y_GLIDE[beats[k + 1]]);
  const out = [];
  let rest = beats;
  if (onset === 'nh') {                                  // nh는 뒤 모음과 합친다 (nha → 냐, nhơn → 년), ư 앞은 '니'
    if (Y_GLIDE[rest[0]] != null) { out.push([2, Y_GLIDE[rest[0]]]); rest = rest.slice(1); } else out.push([2, 20]);
  } else if (onset === 'qu') {                           // qu + a → 꽈, 그 밖은 꾸 (Quốc → 꾸옥)
    if (rest[0] === 0 && 'aă'.includes(v[0])) { out.push([1, 9]); rest = rest.slice(1); } else out.push([1, 13]);
  } else if (onset === 'ng' || onset === 'ngh') {
    out.push([11, 18, 21]);                              // 응 (Nguyễn → 응우옌, Ngô → 응오)
  } else if (onset) {
    out.push([INI[onset], rest[0]]); rest = rest.slice(1);
  }
  for (const b of rest) out.push([11, b]);
  if (coda === 'nh' && 'aă'.includes(v.at(-1))) out.push([11, 20, FIN.nh]); // anh → 아인 (Thanh → 타인)
  else if (coda) out[out.length - 1][2] = FIN[coda];
  return out.map(syl).join('');
}

/** 낱말 하나 → { text, ok(한글로 바꿨나), name(대문자로 시작), l(l로 시작), surname } */
function word(raw) {
  const lower = raw.toLowerCase();
  const plain = lower.normalize('NFD').replace(TONES, '').normalize('NFC');
  const syls = /^[a-zăâđêôơư]+$/.test(plain) ? parse(plain) : null;
  if (!syls || syls.length !== 1) return { text: raw, ok: false };
  return { text: hangulOf(syls[0]), ok: true, name: /^\p{Lu}\p{Ll}*$/u.test(raw), l: plain[0] === 'l', surname: SURNAMES.has(lower) };
}

const endsOpen = (s) => { const c = s.charCodeAt(s.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 === 0; };

/** 베트남어 글 → 한글 발음 (구두점 · 숫자 · 외래어는 그대로). 예) Xin chào → 씬 짜오, Hà Nội → 하노이 */
export function viToHangul(text) {
  if (!text) return '';
  const parts = String(text).normalize('NFC').split(/([^\p{L}]+)/u);
  const words = parts.map((p, k) => (k % 2 ? null : word(p)));
  let out = '';
  let head = null; // 지금 이름 덩이의 첫 낱말
  for (let k = 0; k < parts.length; k++) {
    if (k % 2 === 0) { head ??= words[k]; out += words[k].text; continue; }
    const prev = words[k - 1], next = words[k + 1];
    if (parts[k] === ' ' && prev.ok && prev.name && next?.ok && next.name) {
      // 대문자 낱말이 이어지면 한 이름 (Hà Nội → 하노이), 가운데 모음 앞 l은 ㄹㄹ (Đà Lạt → 달랏)
      if (next.l && !head.surname && endsOpen(out)) out = out.slice(0, -1) + String.fromCharCode(out.charCodeAt(out.length - 1) + RIEUL);
      continue;
    }
    out += parts[k];
    head = null;
  }
  return out;
}

export default {
  sound: false,
  hangul: (text) => viToHangul(text),
  roman: null,
};
