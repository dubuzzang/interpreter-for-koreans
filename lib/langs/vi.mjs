// 베트남어 — 서버 쪽 정보 (v1.6.0): 말투 · 글자 규칙 · 결과 점검 · Whisper가 지어내는 말 · 숫자 읽기 · 요약의 "없음"
// 읽는 법(한글 발음)은 화면이 글에서 바로 만든다 (public/js/read/vi.js) — 서버 소리 표기는 없다.
// Whisper 첫 문장(sttPrompt)은 넣지 않는다: 베트남어는 글자 체계를 기울일 필요가 없고, 조용할 때 그 문장을 받아쓰는 일이 있어서

/** 베트남어 글자 (성조 · 모음 부호 · đ) */
const VI_MARKS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu;
const round = (x) => Math.round(x * 1000) / 1000;
const words = (s) => String(s).normalize('NFC').toLowerCase().match(/\p{L}+|\d+(?:[.,]\d+)*|[^\s\p{L}\d]/gu) || [];

// ---------- 숫자 (낱말로 쓴 수: hai mươi lăm = 25 · năm trăm nghìn = 500000 · một triệu hai = 1200000) ----------
const ONES = { không: 0, một: 1, mốt: 1, hai: 2, ba: 3, bốn: 4, tư: 4, năm: 5, lăm: 5, nhăm: 5, sáu: 6, bảy: 7, bẩy: 7, tám: 8, chín: 9 };
const SCALE = { trăm: 100, nghìn: 1e3, ngàn: 1e3, triệu: 1e6, tỷ: 1e9, tỉ: 1e9 };
const AFTER_ONLY = new Set(['mốt', 'tư', 'lăm', 'nhăm']); // 다른 수 뒤에서만 수 (mốt = 유행 · 모레, tư = 사적인)
const ZERO = new Set(['lẻ', 'linh']);                       // một trăm lẻ năm = 105
const HALF = new Set(['rưỡi', 'rưởi']);                     // hai triệu rưỡi = 2500000 · một tiếng rưỡi = 1.5
// 홑 숫자 뒤에 와야 숫자로 보는 세는 말 · 단위 (ba tôi = 우리 아빠, ba cái = 세 개)
const COUNTER = new Set('cái chiếc con người ngày đêm tuần tháng năm giờ tiếng phút giây lần hộp thùng bao túi gói chai lon ly cốc bát tô đĩa phần suất đôi bộ cặp cuốn quyển tờ cây mét cân ký kí kg lít gam tấn đồng đ vnđ vnd k đô usd tệ yên won bạt tuổi lô kiện cỡ size món phòng vé tầng km cm ml mươi chục'.split(' '));
const isScale = (w) => w in SCALE;

/** 그 자리 낱말이 수의 한 조각인가 (앞 낱말 last · 뒤 낱말 next를 보고: hai năm = 2년, năm trăm = 500) */
function numberWord(w, last, next) {
  if (isScale(w) || w === 'chục' || w === 'mười') return true;
  if (w === 'mươi') return last in ONES;
  if (ZERO.has(w)) return isScale(last) && next in ONES;
  if (HALF.has(w)) return isScale(last) || last in ONES;
  if (!(w in ONES)) return false;
  if (w === 'không') return next === 'trăm' && isScale(last);
  if (AFTER_ONLY.has(w)) return last === 'mươi' || last === 'mười' || isScale(last) || (last in ONES && !AFTER_ONLY.has(last));
  if (w === 'năm') {
    if (isScale(last) || ZERO.has(last)) return true;
    if (last) return false;                                  // hai năm (2년) · mười năm (10년)
    return isScale(next) || next === 'mươi' || next === 'chục' || HALF.has(next) || COUNTER.has(next);
  }
  return !(last in ONES) || (!AFTER_ONLY.has(last) && last !== 'không'); // hai ba = 23 (2~3)
}

/** 낱말 수 덩어리 하나를 값으로: { value, alts } */
function runValue(run) {
  let total = 0, group = 0, digit = null, big = 0, lastScale = 0;
  const alts = [];
  for (let k = 0; k < run.length; k++) {
    const w = run[k], prev = run[k - 1];
    if (w in ONES) {
      if (digit !== null) { group += digit * 10; if (!AFTER_ONLY.has(w)) alts.push(digit, ONES[w]); } // hai ba · hai mốt
      digit = ONES[w];
    } else if (w === 'mười') { group += 10; digit = null; }
    else if (w === 'mươi' || w === 'chục') { group += (digit ?? 1) * 10; digit = null; }
    else if (w === 'trăm') { group += (digit ?? 1) * 100; digit = null; lastScale = 100; }
    else if (isScale(w)) {
      const S = SCALE[w], v = group + (digit ?? 0);
      if (big && S > big) total = (total + v) * S; else total += (v || 1) * S;
      group = 0; digit = null; lastScale = S; big = Math.max(big, S);
    } else if (HALF.has(w)) {
      if (isScale(prev)) group += SCALE[prev] / 2; else group += 0.5;
    }
  }
  const value = total + group + (digit ?? 0);
  // 큰 단위 바로 뒤 홑 숫자는 그 아래 자리 (một triệu hai = 1200000, ba trăm hai = 320) — lẻ/linh이 있으면 그대로 (một trăm lẻ hai = 102)
  if (digit !== null && isScale(run.at(-2))) alts.unshift(total + group + digit * lastScale / 10);
  return { value, alts };
}

/** 낱말로 쓴 수들 → [{ alts, word: true }] (아라비아 숫자는 assist-core가 읽는다) */
export function viNumbers(text) {
  const t = words(text);
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (!numberWord(t[i], '', t[i + 1])) continue;
    const run = [t[i]];
    let j = i + 1;
    for (; j < t.length && numberWord(t[j], t[j - 1], t[j + 1]) && !(t[j] in ONES && t[j - 1] in ONES && t[j - 2] in ONES); j++) {
      run.push(t[j]);
      if (HALF.has(t[j])) { j++; break; }
    }
    i = j - 1;
    // 홑 숫자만 있는 덩어리는 뒤에 세는 말이 올 때만 (ba tôi = 우리 아빠, một chút = 조금)
    if (run.every((w) => w in ONES && !AFTER_ONLY.has(w)) && !COUNTER.has(t[j] ?? '')) continue;
    let { value, alts } = runValue(run);
    // một tiếng rưỡi · hai cân rưỡi: 단위 뒤의 rưỡi = 0.5
    if (COUNTER.has(t[j] ?? '') && HALF.has(t[j + 1] ?? '')) value += 0.5;
    out.push({ alts: [...new Set([value, ...alts])].map(round), word: true });
  }
  return out;
}

// ---------- 숫자 + 단위 낱말을 먼저 숫자로 (1 triệu 2 = 1200000 · 1tr2 · 500 nghìn · 2 triệu rưỡi · 1,5 triệu · 1 tiếng rưỡi = 1.5) ----------
const D_SCALE = { tỷ: 1e9, tỉ: 1e9, triệu: 1e6, tr: 1e6, nghìn: 1e3, ngàn: 1e3, k: 1e3, trăm: 100 };
const TAIL = ['một', 'mốt', 'hai', 'ba', 'bốn', 'tư', 'năm', 'lăm', 'sáu', 'bảy', 'bẩy', 'tám', 'chín'];
const SCALED = new RegExp(`(\\d+(?:[.,]\\d+)*)\\s*(${Object.keys(D_SCALE).join('|')})(?![\\p{L}])(?:\\s*(\\d|${TAIL.join('|')}|rưỡi|rưởi)(?![\\p{L}\\d]))?`, 'giu');
const UNIT_HALF = /(\d+)\s*(tiếng|giờ|cân|ký|kí|kg|lít|mét|năm|tháng|tuần|ngày)\s+(?:rưỡi|rưởi)(?![\p{L}])/giu;
const COUNTER_NEXT = /^\s*(\p{L}+)/u;
/** 1.000 · 1,5 → 값 (세 자리 묶음이면 천 단위 점 · 쉼표, 아니면 소수점) */
const numOf = (s) => (/^\d{1,3}(?:[.,]\d{3})+$/.test(s) ? Number(s.replace(/[.,]/g, '')) : Number(s.replace(',', '.')));

export function viDecimals(text) {
  return String(text).normalize('NFC')
    .replace(SCALED, (m, n, scale, tail, offset, all) => {
      const S = D_SCALE[scale.toLowerCase()];
      let v = numOf(n) * S;
      // 뒤에 세는 말이 오면 홑 숫자는 그 수량 (2 nghìn 5 cái = 2000 · 다섯 개) → 단위만 바꾼다
      const following = (all.slice(offset + m.length).match(COUNTER_NEXT) || [])[1]?.toLowerCase();
      // (50k một ly: k 뒤의 낱말 숫자도 수량)
      const quantity = COUNTER.has(following ?? '') || (scale.toLowerCase() === 'k' && !/^\d$/.test(tail ?? '0'));
      if (tail && quantity && !/^rư/i.test(tail)) return `${round(v)} ${m.slice(m.toLowerCase().lastIndexOf(tail.toLowerCase()))}`;
      if (tail) v += /^rư/i.test(tail) ? S / 2 : (/^\d$/.test(tail) ? Number(tail) : ONES[tail.toLowerCase()]) * S / 10;
      return String(round(v));
    })
    .replace(UNIT_HALF, (m, n, unit) => `${Number(n) + 0.5} ${unit}`);
}

export default {
  register: [
    'Use polite, natural Vietnamese (tôi for "I"; bạn for "you", or anh/chị when clear from context; add "ạ" or "vui lòng" where natural).',
    'Use casual Vietnamese between friends (mình / bạn, no "ạ").',
  ],
  script: 'Vietnamese must use the Vietnamese alphabet with all diacritics and tone marks (never write it without accents).',
  /** 베트남어로 옮겼나: 부호가 하나도 없는 긴 글은 다른 언어(또는 부호를 뺀 글) — 짧은 답(OK · 이름 · 상표)은 봐준다 */
  valid: (out) => VI_MARKS.test(out) || (String(out).match(/\p{L}+/gu) || []).length < 4,
  // Whisper가 조용한 녹음에서 지어내는 베트남어 자막 문장 (유튜브 끝인사 · 구독 부탁)
  hallucinations: [
    /ghiền mì gõ/i, /lalaschool/i, /để không bỏ lỡ (những|các) video/i, /^(các bạn )?(hãy |nhớ )*(đăng ký|subscribe)( cho)? kênh/i,
    /^hãy (subscribe|đăng ký|like)/i, /^cảm ơn (các bạn|mọi người|quý vị) đã (theo dõi|xem|lắng nghe)/i,
    /^hẹn gặp lại (các bạn )?trong (những|các) (video|tập)/i, /^phụ đề (được thực hiện )?bởi/i, /^chúc (các bạn|mọi người) xem video vui vẻ/i,
  ],
  decimals: viDecimals,
  numbers: viNumbers,
  none: /^(?:không|không có|không rõ|chưa có|chưa rõ|chưa xác định|không xác định|chưa thỏa thuận|chưa thống nhất|chưa đề cập|không đề cập)\.?$/i,
};
