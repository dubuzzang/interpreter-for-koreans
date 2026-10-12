// 서버 API: 번역 · 음성 인식 · 읽는 법 · 답장 추천 · 합의 내용 요약 · 사진 번역 (Cloudflare Workers AI)
import { t, uiLang, MESSAGES } from './i18n.js';
import { hasSound } from './reading.js';

const cache = new Map();

/**
 * 서버 오류 → 고른 언어 문장. 서버는 한국어 문장(error)과 함께 오류 코드(code)를 보낸다.
 * 코드를 모르면 한국어 화면에서는 서버 문장, 다른 언어에서는 "서버 오류 (상태)"
 */
export function serverError(data, status, kind = 'translate') {
  const code = data?.code === 'failed' && (kind === 'stt' || kind === 'photo') ? `${kind}_failed` : data?.code;
  if (code && MESSAGES.ko[`err.${code}`]) return t(`err.${code}`, { retry: data.retry ?? '', max: data.max ?? 1000 });
  return (uiLang() === 'ko' && data?.error) || t('err.server', { status });
}

async function call(url, init, timeoutMs, kind) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(serverError(data, res.status, kind)), { code: data?.code, retry: data?.retry, status: res.status });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(t('err.slow'));
    if (!navigator.onLine) throw new Error(t('err.offline'));
    if (e instanceof TypeError) throw new Error(t('err.network'));
    throw e;
  } finally { clearTimeout(timer); }
}

/** 번역. context: 최근 대화 [{lang,text}] — 대명사·생략을 자연스럽게 옮기는 데 쓴다 */
export async function translate(text, from, to, { context = [], formal = true } = {}) {
  const t = String(text).trim();
  if (!t) return '';
  if (from === to) return t;
  const key = `${from}|${to}|${formal ? 1 : 0}|${t}`;
  if (cache.has(key)) return cache.get(key);
  const data = await call('/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: t, from, to, context: context.slice(-4), formal }),
  }, 30000);
  cache.set(key, data.text);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return data.text;
}

/**
 * 읽는 법을 만들 소리 표기 (/api/sound, v1.6.0): 일본어 → 히라가나 읽기, 중국어 → 병음, 그 밖에 서버를 거치는 언어(reading.js hasSound).
 * 화면에서 한글 발음 · 로마자 · 병음으로 바꿔 보여 준다. 실패해도 번역은 그대로라 빈 값
 */
const soundCache = new Map();
export async function sound(text, lang) {
  const t = String(text).trim();
  if (!hasSound(lang) || !t) return '';
  const key = `${lang}|${t}`;
  if (soundCache.has(key)) return soundCache.get(key);
  try {
    const data = await call('/api/sound', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t, lang }) }, 20000);
    soundCache.set(key, data.sound || '');
    return data.sound || '';
  } catch { return ''; }
}

/** 대화 한 줄 → 서버로 보낼 모양 (side는 지금 '나' 기준 me · partner) */
const turnBody = (t) => ({ side: t.side, from: t.from, to: t.to, text: t.text, translation: t.translation || '' });

/**
 * 답장 추천: 상대의 마지막 말에 내가 할 만한 답 2~3개 → [{ me: 내 언어, partner: 상대 언어 }].
 * 통역과 따로 부르고, 실패하면 오류를 던진다 (화면은 조용히 넘어간다)
 */
export async function suggestReplies({ me, partner, turns, formal = true }) {
  const data = await call('/api/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ me, partner, formal, turns: turns.slice(-4).map(turnBody) }),
  }, 20000);
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}

/** 합의 내용 요약 → { price: { me, partner }, quantity, delivery, other } (대화에 없는 칸은 빈 글) */
export async function summarize({ me, partner, turns }) {
  const data = await call('/api/summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ me, partner, turns: turns.slice(-40).map(turnBody) }),
  }, 30000);
  return data.fields || {};
}

/**
 * 사진 번역 (v1.5.0): 그림 한 장(긴 그림은 그 조각) → { lines: [{ text, lang, tr, read, check? }], summary, notes }.
 * 그림은 서버에서 읽기만 하고 저장하지 않는다. 서버는 기본 모델이 안 되면 예비 모델까지 부르므로 넉넉히 기다린다
 */
export async function readPhoto(blob, { me, part = 1, parts = 1 }) {
  const q = new URLSearchParams({ me, ...(parts > 1 ? { part, parts } : {}) });
  return call(`/api/photo?${q}`, { method: 'POST', headers: { 'content-type': blob.type || 'image/jpeg' }, body: blob }, 95000, 'photo');
}

/** 긴 그림을 조각으로 읽어 합친 뒤 전체 요약 한 줄 (실패하면 빈 글) */
export async function photoSummary({ me, lines }) {
  try {
    const data = await call('/api/photo-summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ me, lines: lines.slice(0, 120).map((l) => ({ text: l.text, tr: l.tr || '' })) }),
    }, 30000);
    return data.summary || '';
  } catch { return ''; }
}

/** 녹음 → 글 (브라우저 음성 인식이 없을 때) */
export async function transcribe(blob, lang) {
  const data = await call(`/api/stt?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    body: blob,
  }, 40000, 'stt');
  return data.text || '';
}
