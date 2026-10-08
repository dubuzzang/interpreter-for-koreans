// API 보호: 이 앱 화면에서 온 요청만 · 너무 잦은 요청 제한 (공개 주소의 무료 AI 사용량을 남이 쓰지 못하게)

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** 브라우저는 POST에 Origin을 붙인다. 같은 주소(또는 내 PC 개발 서버)에서 온 것만 받는다 */
export function checkOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return json({ error: '이 앱 화면에서만 쓸 수 있어요.' }, 403);
  let host;
  try { host = new URL(origin).host; } catch { return json({ error: '이 앱 화면에서만 쓸 수 있어요.' }, 403); }
  const self = new URL(request.url).host;
  if (host === self || (LOCAL.test(host) && LOCAL.test(self))) return null;
  return json({ error: '이 앱 화면에서만 쓸 수 있어요.' }, 403);
}

const buckets = new Map();
/** 접속 주소(IP)마다 window 안에 limit번까지 (서버 인스턴스마다 따로 세는 최선의 제한) */
export function rateLimit(request, name, limit, windowMs, now = Date.now()) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'local';
  const key = `${name}:${ip}`;
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retry = Math.ceil((windowMs - (now - hits[0])) / 1000);
    return json({ error: `요청이 너무 잦아요. ${retry}초 뒤에 다시 해 주세요.` }, 429, { 'retry-after': String(retry) });
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return null;
}

export const _resetBuckets = () => buckets.clear();
