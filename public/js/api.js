// 서버 API: 번역 · 음성 인식 (Cloudflare Workers AI)
const cache = new Map();

async function call(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('응답이 늦어요. 인터넷 연결을 확인하고 다시 해 주세요.');
    if (!navigator.onLine) throw new Error('인터넷에 연결되어 있지 않아요. 번역은 인터넷이 필요해요 (표현집은 그냥 돼요).');
    if (e instanceof TypeError) throw new Error('서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.');
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

/** 녹음 → 글 (브라우저 음성 인식이 없을 때) */
export async function transcribe(blob, lang) {
  const data = await call(`/api/stt?lang=${encodeURIComponent(lang)}`, {
    method: 'POST',
    headers: { 'content-type': blob.type || 'application/octet-stream' },
    body: blob,
  }, 40000);
  return data.text || '';
}
