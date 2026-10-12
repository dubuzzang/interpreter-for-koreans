// 내 표현(v1.4.0): 자주 쓰는 문장 — 표현집에서 ☆ 한 것 · 직접 쓴 것. 이 기기에만 저장 (인터넷 없이도 보이고 읽어 준다)
// 설정·기록(tercuman.v1)과 따로 저장해서 예전 데이터는 건드리지 않는다.
// 항목: { id, ref?: 표현집 문장 열쇠(분류|한국어), orig: 처음 쓴 언어, label: 이름(내 배송 주소 등),
//        texts: { 언어: 글 }, sound: { ja: 히라가나 읽기, zh: 병음 }, manual: { 언어: 직접 고친 번역 }, at }
// 다른 언어 글은 필요할 때(상대 언어 · 내 언어가 바뀌었을 때) orig 글에서 번역해 채운다 — 화면(views/phrases.js)이 한다.
import { CODES } from './lang.js';

export const MINE_KEY = 'tercuman.mine.v1';
export const MAX_MINE = 200;
export const MAX_MINE_TEXT = 500;
export const MAX_LABEL = 40;

const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clean = (s, n) => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);

/** 표현집 문장의 열쇠 (분류|한국어 — 표현집 시험이 겹치지 않음을 확인한다) */
export const phraseRef = (p) => `${p.cat}|${p.ko}`;

function valid(x) {
  return x && typeof x === 'object' && typeof x.id === 'string' && x.texts && typeof x.texts === 'object'
    && CODES.includes(x.orig) && typeof x.texts[x.orig] === 'string' && x.texts[x.orig].trim();
}
const normalize = (x) => ({ label: '', sound: {}, manual: {}, at: 0, ...x });

export function loadMine(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(MINE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(valid).map(normalize) : [];
  } catch { return []; }
}
export function saveMine(list, storage = globalThis.localStorage) {
  try { storage?.setItem(MINE_KEY, JSON.stringify(list.slice(0, MAX_MINE))); return true; } catch { return false; }
}

/** 표현집 문장 → 내 표현 (다섯 언어 글과 읽기를 그대로 가져와서 번역이 필요 없다) */
export function fromPhrase(p) {
  const texts = {};
  for (const c of CODES) if (p[c]) texts[c] = p[c];
  const sound = {};
  if (p.jaKana) sound.ja = p.jaKana;
  if (p.zhPinyin) sound.zh = p.zhPinyin;
  return { id: newId(), ref: phraseRef(p), orig: 'ko', label: '', texts, sound, manual: {}, at: Date.now() };
}
export const isStarred = (list, p) => list.some((x) => x.ref === phraseRef(p));
/** 별표: 있으면 빼고, 없으면 맨 뒤에 */
export const toggleStar = (list, p) => (isStarred(list, p) ? list.filter((x) => x.ref !== phraseRef(p)) : [...list, fromPhrase(p)]);

/**
 * 사진 번역(v1.5.0)에서 읽은 줄 → 내 표현. 원문(사진 언어)이 처음 글이고, 내 언어 번역 · 읽기(병음 · 히라가나)를 같이 넣는다.
 * 사진 언어가 다섯 언어가 아니면 번역(내 언어)을 처음 글로.
 */
export const photoRef = (line) => `photo|${line.lang}|${line.text}`;
export function fromPhotoLine(line, me) {
  const known = CODES.includes(line.lang);
  const orig = known ? line.lang : me;
  const texts = known ? { [line.lang]: clean(line.text, MAX_MINE_TEXT) } : { [me]: clean(line.tr || line.text, MAX_MINE_TEXT) };
  if (known && line.tr && line.lang !== me) texts[me] = clean(line.tr, MAX_MINE_TEXT);
  const sound = known && line.read && (line.lang === 'ja' || line.lang === 'zh') ? { [line.lang]: line.read } : {};
  return { id: newId(), ref: photoRef(line), orig, label: '', texts, sound, manual: {}, at: Date.now() };
}
export const hasPhotoLine = (list, line) => list.some((x) => x.ref === photoRef(line));
/** 사진 줄 별표: 있으면 빼고, 없으면 맨 앞에 (직접 쓴 문장처럼 새것이 위로) */
export const togglePhotoLine = (list, line, me) => (hasPhotoLine(list, line) ? list.filter((x) => x.ref !== photoRef(line)) : [fromPhotoLine(line, me), ...list]);

/** 직접 쓴 문장 (lang = 쓴 언어 = 그때 내 언어) */
export function createItem({ text, lang, label = '' }) {
  return { id: newId(), orig: lang, label: clean(label, MAX_LABEL), texts: { [lang]: clean(text, MAX_MINE_TEXT) }, sound: {}, manual: {}, at: Date.now() };
}

/** 내 쪽에 보일 글: 내 언어 글, 아직 없으면 처음 쓴 글 */
export const myText = (item, me) => item.texts[me] || item.texts[item.orig] || '';
export const myLang = (item, me) => (item.texts[me] ? me : item.orig);
/** 상대에게 보일(읽어 줄) 글 — 없으면 '' (번역을 아직 못 받음) */
export const sayText = (item, partner) => item.texts[partner] || '';
/** 번역해서 채워야 할 언어 (내 언어 · 상대 언어 중 없는 것) */
export const missingLangs = (item, me, partner) => [partner, me].filter((l, i, a) => a.indexOf(l) === i && !item.texts[l]);

export const withText = (item, lang, text) => ({ ...item, texts: { ...item.texts, [lang]: text } });
export const withSound = (item, lang, sound) => ({ ...item, sound: { ...item.sound, [lang]: sound } });

/**
 * 고치기. mine = 내 말(내 언어), say = 상대에게 보일 말(상대 언어), label = 이름.
 * - 내 말을 바꾸면: 내 말이 새 원문이 되고 다른 언어 번역은 지운다 (상대 말을 같이 고쳤으면 그것만 남김)
 * - 상대 말만 바꾸면: 그 번역을 직접 고친 것으로 둔다 (비우면 다시 번역)
 * - 표현집에서 온 문장도 글을 고치면 내 문장이 된다 (별표와 연결이 끊김)
 */
export function editItem(item, { me, partner, mine, say, label }) {
  const next = { ...item, texts: { ...item.texts }, sound: { ...item.sound }, manual: { ...item.manual } };
  if (label !== undefined) next.label = clean(label, MAX_LABEL);
  const newMine = clean(mine ?? myText(item, me), MAX_MINE_TEXT);
  const newSay = clean(say ?? sayText(item, partner), MAX_MINE_TEXT);
  const mineChanged = Boolean(newMine) && newMine !== myText(item, me);
  const sayChanged = partner !== me && newSay !== sayText(item, partner);
  if (mineChanged) {
    next.orig = me; next.texts = { [me]: newMine }; next.sound = {}; next.manual = {};
    delete next.ref;
  }
  if (sayChanged) {
    delete next.ref;
    delete next.sound[partner];
    if (newSay) { next.texts[partner] = newSay; next.manual[partner] = true; } else { delete next.texts[partner]; delete next.manual[partner]; }
  }
  return next;
}

export const removeItem = (list, id) => list.filter((x) => x.id !== id);
export const replaceItem = (list, item) => list.map((x) => (x.id === item.id ? item : x));
/** 순서 바꾸기: dir -1 = 위로, +1 = 아래로 (끝이면 그대로) */
export function moveItem(list, id, dir) {
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
