// 공유 글 만들기 (v1.4.0): 고른 말들을 원문 + 번역 한 묶음 글로 — 시각 · 말한 쪽, (사용자가 확인한) 합의 내용 요약.
// 화면(views/share.js)과 시험이 같이 쓰도록 DOM 없이: 문구 · 시각 · 국기는 함수로 받는다.
// 받는 사람(판매자 등)도 읽을 수 있게 제목과 요약 항목 이름은 두 언어로 (단가 · 单价), 말한 쪽은 국기로 구별한다.
// 아랍어(오른쪽에서 왼쪽)가 섞이면 방향 표시(LRM U+200E · RLM U+200F)를 넣는다 (v1.6.0): 카카오톡 · 메일 같은 일반 글은 줄마다
// 첫 글자로 방향을 정하므로 — 줄 첫머리에 그 줄의 방향(원문 · 번역 줄은 그 언어, 나머지는 내 언어), 끼워 넣은 글 · 국기 뒤에 다시 줄 방향을 둬서
// 숫자 · 괄호 · 날짜가 앞 글에 딸려 가지 않게. 번역 줄의 화살표는 오른쪽→왼쪽 줄에서 ←. 아랍어가 없으면 글자 그대로.
import { isRtl } from './lang.js';

const LRM = '‎', RLM = '‏';

export const SUMMARY_FIELDS = ['price', 'quantity', 'delivery', 'other'];

/** 고른 말들에서 상대 언어 (내 언어가 아닌 것 중 가장 많이 나온 것) */
export function otherLang(items, me, fallback) {
  const count = new Map();
  for (const it of items) for (const l of [it.from, it.to]) if (l && l !== me) count.set(l, (count.get(l) || 0) + 1);
  let best = fallback, n = 0;
  for (const [l, c] of count) if (c > n) { best = l; n = c; }
  return best;
}

/** 요약에 채운 칸이 있나 */
export const hasSummary = (fields) => Boolean(fields) && SUMMARY_FIELDS.some((f) => fields[f]?.me?.trim() || fields[f]?.partner?.trim());

/**
 * items: [{ side: me|partner|text (지금 '나' 기준), from, to, text, translation, at }] — 시간 순으로 정렬해서 쓴다
 * o: { me, other, tl(lang, key, vars), time(at), date(at), flag(lang), summary?: { price: { me, partner }, … } }
 */
export function buildShareText(items, o) {
  const list = items.filter((x) => x && x.text && x.translation).slice().sort((a, b) => a.at - b.at);
  const bidi = [o.me, o.other, ...list.flatMap((x) => [x.from, x.to])].some(isRtl);
  const mark = (code) => (!bidi ? '' : isRtl(code) ? RLM : LRM);
  const base = mark(o.me);           // 제목 · 머리 줄 · 말한 쪽 줄은 내 언어 방향
  const seg = (s) => `${s}${base}`;  // 끼워 넣은 글 뒤에 줄 방향을 다시
  const both = (key) => {
    const a = o.tl(o.me, key), b = o.tl(o.other, key);
    return o.other && o.other !== o.me && a !== b ? `${seg(a)} · ${seg(b)}` : seg(a);
  };
  const who = (it) => o.tl(o.me, it.side === 'me' ? 'talk.me' : it.side === 'partner' ? 'talk.partner' : 'hist.text');
  const dates = [...new Set(list.map((x) => o.date(x.at)))];
  const lines = [`${base}Tercüman · ${both('share.heading')}${dates.length === 1 ? ` · ${dates[0]}` : ''}`];

  if (hasSummary(o.summary)) {
    lines.push('', `${base}■ ${both('share.agreed')}`);
    for (const f of SUMMARY_FIELDS) {
      const v = o.summary[f] || {};
      const vals = [v.me, v.partner].map((s) => String(s ?? '').trim()).filter(Boolean);
      if (vals.length) lines.push(`${base}· ${both(`share.${f}`)}: ${[...new Set(vals)].map(seg).join(' / ')}`);
    }
  }

  lines.push('', `${base}■ ${both('share.talk')} (${list.length})`);
  let lastDate = null;
  for (const it of list) {
    const d = o.date(it.at);
    if (dates.length > 1 && d !== lastDate) lines.push('', `${base}— ${d} —`);
    lastDate = d;
    const to = mark(it.to);
    lines.push('', `${base}[${o.time(it.at)}] ${o.flag(it.from)}${base} ${who(it)}`, `${mark(it.from)}${it.text.trim()}`,
      `${to}${bidi && isRtl(it.to) ? '←' : '→'} ${o.flag(it.to)}${to} ${it.translation.trim()}`);
  }
  return lines.join('\n');
}
