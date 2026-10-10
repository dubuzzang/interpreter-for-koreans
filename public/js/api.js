// 서버 API: 번역 · 음성 인식 (Cloudflare Workers AI)
import { t, uiLang, MESSAGES } from './i18n.js';

const cache = new Map();

/**
 * 서버 오류 → 고른 언어 문장. 서버는 한국어 문장(error)과 함께 오류 코드(code)를 보낸다.
 * 코드를 모르면 한국어 화면에서는 서버 문장, 다른 언어에서는 "서버 오류 (상태)"
 */
export function serverError(data, status, kind = 'translate') {
  const code = data?.code === 'failed' && kind === 'stt' ? 'stt_failed' : data?.code;
  if (code && MESSAGES.ko[`err.${code}`]) return t(`err.${code}`, { retry: data.retry ?? '', max: data.max ?? 1000 });
  return (uiLang() === 'ko' && data?.error) || t('err.server', { status });
}

async function call(url, init, timeoutMs, kind) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(serverError(data, res.status, kind));
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

/** 일본어 → 히라가나 읽기 (한글 발음 · 로마자를 보여 주려고). 실패해도 번역은 그대로라 빈 값 */
const kanaCache = new Map();
export async function kana(text) {
  const t = String(text).trim();
  if (!t) return '';
  if (kanaCache.has(t)) return kanaCache.get(t);
  try {
    const data = await call('/api/kana', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t }) }, 20000);
    kanaCache.set(t, data.kana || '');
    return data.kana || '';
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
