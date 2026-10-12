// 프랑스어 — 서버 쪽 정보 (추가지시 2): 번역 지시문(vous · tu) · 결과 점검 · 받아쓰기 · 숫자 읽기 · 요약 칸 "없음"
// 읽는 법(한글 발음)은 화면에서 규칙으로 만든다 (public/js/read/fr.js) — 서버 소리 표기 · 사진 읽는 법은 없다 (라틴 문자)

// ---------- 결과 점검 ----------
const EN_FN = new Set('the a an is are was were this that these those it you i we they my your our with from for of to and or what where when how which can could would should will please thank thanks yes no'.split(' '));
const FR_FN = new Set('le la les un une des du de et est je tu il elle nous vous ils elles sont pas ne que qui où quoi combien merci bonjour oui non avec pour dans sur ce cette ces au aux mon ma mes votre vos très bien aussi'.split(' '));
const frWords = (s) => String(s).toLowerCase().replace(/[’']/g, ' ').match(/[a-zàâçéèêëîïôûùüÿœ]+/g) || [];

// ---------- 숫자 ----------
const UNIT = { zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9 };
const TEEN = { onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
const TENS = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, septante: 70, huitante: 80, octante: 80, nonante: 90 };
const SCALE = { mille: 1000, mil: 1000, million: 1e6, millions: 1e6, milliard: 1e9, milliards: 1e9 };
const kindOf = (w) => (w in UNIT ? 'unit' : w === 'dix' ? 'ten' : w in TEEN ? 'teen' : w in TENS ? 'tens' : w === 'cent' || w === 'cents' ? 'hundred' : w in SCALE ? 'scale' : null);
const valueOf = (w) => UNIT[w] ?? TEEN[w] ?? TENS[w] ?? SCALE[w] ?? (w === 'dix' ? 10 : 100);

/** 앞 덩어리에 이어지는 수 낱말인가 (vingt-et-un · soixante-dix · quatre-vingts · deux cent cinquante · cinq mille) */
function joins(run, kind, w, viaEt) {
  const last = run.last;
  if (viaEt) return (last === 'tens') && (w === 'un' || w === 'une' || w === 'onze'); // vingt et un · soixante et onze
  if (kind === 'scale') return last !== 'scale';                        // 숫자 + mille · million
  if (kind === 'hundred') return ['unit'].includes(last) || last === 'scale';
  if (last === 'scale') return true;                                    // cinq mille deux
  if (last === 'hundred') return true;                                  // cent vingt · deux cent cinq
  if (last === 'tens') return kind === 'unit' || ((run.lastWord === 'soixante' || run.lastWord === 'vingt' || run.lastWord === 'vingts') && (kind === 'ten' || kind === 'teen'));
  if (last === 'ten') return kind === 'unit' && valueOf(w) >= 7;         // dix-sept · dix-huit · dix-neuf
  if (last === 'unit') return w === 'vingt' || w === 'vingts' ? run.lastWord === 'quatre' : false; // quatre-vingts
  return false;
}

function add(run, kind, w) {
  const v = valueOf(w);
  if ((w === 'vingt' || w === 'vingts') && run.last === 'unit' && run.lastWord === 'quatre') run.section += 80 - 4; // quatre-vingts = 80
  else if (kind === 'hundred') run.section = (run.last === 'unit' ? run.section - run.lastValue + run.lastValue * 100 : run.section + 100);
  else if (kind === 'scale') { run.total += (run.section || 1) * v; run.section = 0; run.scale = v; }
  else run.section += v;
  run.last = kind; run.lastWord = w; run.lastValue = v;
}

// pour cent (퍼센트)의 cent는 100이 아니다 · neuf = 새것(tout neuf · à neuf · comme neuf)
const PERCENT = /\bpour\s?cent\b|\bpourcent\b/g;
const NEUF_NEW = new Set(['tout', 'toute', 'comme', 'état', 'à']);

/** 낱말로 쓴 수 덩어리 [{ start, end, value }] (소문자 글에서, 붙임표 · 띄어쓰기 · et 로 이어진 것) */
function wordRuns(t) {
  const out = [];
  let run = null, lastEnd = 0, prev = '', pendingEt = false;
  const close = () => { if (run) out.push({ start: run.start, end: run.end, value: run.total + run.section }); run = null; pendingEt = false; };
  for (const m of t.matchAll(/[a-zàâçéèêëîïôûùüÿœ]+/g)) {
    const w = m[0];
    const gap = t.slice(lastEnd, m.index);
    if (run && !/^[\s-]*$/.test(gap)) close();
    lastEnd = m.index + w.length;
    if (run && w === 'et' && !pendingEt) { pendingEt = true; prev = w; continue; }
    const kind = kindOf(w);
    if (!kind || (w === 'neuf' && NEUF_NEW.has(prev))) { close(); prev = w; continue; }
    if (run && !joins(run, kind, w, pendingEt)) close();
    pendingEt = false;
    run ??= { start: m.index, total: 0, section: 0, last: null, lastWord: '', lastValue: 0, scale: 0 };
    add(run, kind, w);
    run.end = lastEnd;
    prev = w;
  }
  close();
  return out;
}

const round = (x) => Math.round(x * 1000) / 1000;
const HALF = '(?:\\s+([a-zàâçéèêëîïôûùüÿœ€$£]+))?\\s+et\\s+(demie?|quart)\\b';
const plusHalf = (v, h) => round(v + (h === 'quart' ? 0.25 : 0.5));

/**
 * 숫자로 바꿔 읽기 (numberMentions가 먼저 부른다): 1 000 € · 1 000 (좁은 빈칸) = 1000 · 14,50 = 14.5 (프랑스어는 쉼표가 소수점) ·
 * 15 mille = 15000 · quatorze euros et demi = 14.5 · 2 heures et quart = 2.25
 */
export function frDecimals(text) {
  let t = String(text ?? '').toLowerCase().replace(/[  ]/g, ' ').replace(PERCENT, ' ');
  t = t.replace(/\b(\d{1,3})((?: \d{3})+)(?!\d)/g, (m, a, b) => a + b.replace(/ /g, ''));          // 1 000 → 1000
  t = t.replace(/\b(\d+),(\d+)\b/g, (m, a, b) => String(Number(`${a}.${b}`)));                      // 14,50 → 14.5
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*(mille|millions?|milliards?)\b/g, (m, n, w) => String(round(Number(n) * SCALE[w])));
  for (const r of wordRuns(t).reverse()) {
    const m = t.slice(r.end).match(new RegExp(`^${HALF}`));
    if (m && !(m[1] && kindOf(m[1]))) t = `${t.slice(0, r.start)}${plusHalf(r.value, m[2])}${m[1] ? ` ${m[1]}` : ''}${t.slice(r.end + m[0].length)}`;
  }
  t = t.replace(new RegExp(`(\\d+(?:\\.\\d+)?)${HALF}`, 'g'), (m, n, unit, h) => `${plusHalf(Number(n), h)}${unit ? ` ${unit}` : ''}`);
  // 말로 하는 값: quatorze euros cinquante = 14.5 € (유로 뒤 100 아래 수는 센트)
  const nums = [...wordRuns(t), ...[...t.matchAll(/\d+(?:\.\d+)?/g)].map((x) => ({ start: x.index, end: x.index + x[0].length, value: Number(x[0]) }))]
    .sort((a, b) => a.start - b.start);
  for (let k = nums.length - 2; k >= 0; k--) {
    const a = nums[k], b = nums[k + 1];
    if (/^\s+euros?\s+$/.test(t.slice(a.end, b.start)) && Number.isInteger(a.value) && Number.isInteger(b.value) && b.value < 100) {
      t = `${t.slice(0, a.start)}${round(a.value + b.value / 100)} euros${t.slice(b.end)}`;
    }
  }
  return t;
}

/** 낱말로 쓴 수 (아라비아 숫자는 assist-core가 읽는다) — un · une 은 낱말로 쓴 1 (word: true) */
export function frNumbers(text) {
  const t = String(text ?? '').toLowerCase().replace(PERCENT, ' ');
  const out = wordRuns(t).map((r) => ({ alts: [round(r.value)], word: true }));
  for (const m of t.matchAll(/\bdemie?s?\b/g)) if (!/et\s+$/.test(t.slice(0, m.index))) out.push({ alts: [0.5], word: true }); // une demi-heure
  return out;
}

export default {
  register: [
    'Use polite, natural French as spoken in France, with "vous".',
    'Use casual, natural French between friends, with "tu".',
  ],
  script: 'French must use correct French accents (é, è, ê, à, ç, …).',
  /** 영어로 답했으면(영어 기능어만 있고 프랑스어 기능어가 없음) 다음 모델로 */
  valid(out) {
    const words = frWords(out);
    const en = words.filter((w) => EN_FN.has(w)).length, fr = words.filter((w) => FR_FN.has(w)).length;
    return !(en >= 2 && fr === 0);
  },
  // Whisper가 조용한 녹음에서 지어내는 프랑스어 자막 문장
  hallucinations: [
    /^sous-titr(?:es|age)\b/i, /communauté d['’]amara/i, /^merci d['’]avoir regardé/i, /^merci de (?:votre|m['’]avoir) (?:attention|regardé)/i,
    /^(?:n['’]oubliez pas de vous |)abonnez-vous\b/i, /^n['’]oubliez pas de (?:vous abonner|liker)/i, /^à bientôt pour (?:une |la )?(?:nouvelle |prochaine )?vidéo/i,
  ],
  decimals: frDecimals,
  numbers: frNumbers,
  // 요약 칸의 "없음"
  none: /^(?:aucun(?:e)?|rien|néant|inconnu(?:e)?|non (?:précisé|mentionné|indiqué|défini)e?|pas (?:précisé|mentionné|indiqué)e?|non)\.?$/i,
};
