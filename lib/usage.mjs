// 무료 요금제 안전장치 (v1.6.0): Workers AI 하루(UTC) 사용량(뉴런)을 D1에 더해 두고, 문턱을 넘으면 부가 기능을 UTC 0시까지 쉰다.
// 무료 요금제는 하루 10,000뉴런을 넘으면 UTC 0시(한국 오전 9시)까지 계정의 Workers AI가 4006으로 멈춰 번역까지 멈춘다.
// - 세기: 모든 AI 호출은 runAI로 — 답이 오면 뉴런을 어림해 waitUntil로 D1에 더한다 (응답을 늦추지 않게)
// - 쉬기: 오늘 센 값이 문턱(USAGE_PAUSE_NEURONS, 기본 7,000) 이상이면 답장 추천 · 합의 요약 · 사진 · 사진 요약은 AI를 부르지 않고 'paused'.
//   번역 · 읽는 법 · 받아쓰기는 계속 된다 (세기도 계속)
// - 저장소는 D1 (무료 쓰기 하루 10만 줄). KV는 무료 쓰기가 하루 1,000번이라 요청마다 쓰면 안 된다
// - D1이 없거나 오류면 세기 · 쉬기 모두 조용히 건너뛴다 (번역을 막지 않는다)
// - 주의: 개발 · 시험(wrangler dev는 내 PC의 D1에 센다, 대시보드 · 다른 앱의 AI 호출)도 같은 계정 한도를 쓰지만 여기서는 못 센다
//   → 실서비스 카운터는 실제보다 적게 셀 수 있어서 문턱을 한도의 70%로 낮게 잡았다
import { json } from './guard.mjs';

export const DEFAULT_PAUSE_NEURONS = 7000;
export const CACHE_MS = 30_000; // 오늘 사용량을 인스턴스 메모리에 들고 있는 시간 (D1 읽기 줄이기)

/**
 * 모델별 뉴런 단가 (1,000뉴런 = $0.011). in · out: 입력 · 출력 토큰 하나에 뉴런, perMinute: 오디오 1분에 뉴런.
 * 근거: 2026-10 앞 세션 실측과 Cloudflare Workers AI 가격표. 어림이 실제보다 작게 나오지 않게 조금 올려 잡는다.
 */
export const NEURON_RATES = {
  '@cf/google/gemma-4-26b-a4b-it': { in: 0.0091, out: 0.0273 },              // 실측 약 0.009 · 0.027 (그림 한 장 ≈ 입력 280토큰)
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { in: 0.0267, out: 0.205 },    // 가격표 약 26,700 · 205,000뉴런 / 100만 토큰
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { in: 0.032, out: 0.0505 }, // 가격표 약 32,000 · 50,500뉴런 / 100만 토큰
  '@cf/openai/whisper-large-v3-turbo': { perMinute: 46.7 },                   // 가격표 약 46.6뉴런 / 오디오 1분
};
/** 표에 없는 모델: 표에서 가장 비싼 값으로 */
const UNKNOWN_RATE = { in: 0.032, out: 0.205 };
const IMAGE_TOKENS = 600;          // 토큰 수를 못 받았을 때 그림 한 장 입력 어림 (Gemma 실측 약 280의 두 배)
const DEFAULT_OUT_TOKENS = 1024;   // max_tokens가 없을 때 출력 어림
const AUDIO_BYTES_PER_SEC = 4000;  // 오디오 길이를 못 받았을 때: 32kbps로 보고 길이 어림 (브라우저 녹음은 보통 64~128kbps → 넉넉)

const num = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Number(v) : NaN);
const ok = (v) => Number.isFinite(v) && v >= 0;

/** 입력 글자 수로 입력 토큰 어림: 글자 하나 = 토큰 하나 (영어는 보통 4글자에 1토큰 → 넉넉), 그림은 장마다 IMAGE_TOKENS */
function promptGuess(input) {
  let chars = 0, images = 0;
  const parts = (content) => (typeof content === 'string' ? [content] : Array.isArray(content) ? content : []);
  for (const m of Array.isArray(input?.messages) ? input.messages : []) {
    for (const p of parts(m?.content)) {
      if (typeof p === 'string') chars += p.length;
      else if (p?.type === 'image_url' || p?.type === 'image' || p?.image_url) images++;
      else chars += String(p?.text ?? '').length;
    }
    chars += 8; // 대화 틀 (역할 표시 등)
  }
  if (typeof input?.prompt === 'string') chars += input.prompt.length;
  return chars + images * IMAGE_TOKENS;
}

/** 오디오 길이(초): Whisper 답의 transcription_info.duration → 마지막 조각 끝 → 보낸 바이트로 어림 */
function audioSeconds(input, result) {
  const d = num(result?.transcription_info?.duration);
  if (ok(d) && d > 0) return d;
  const end = Math.max(0, ...(Array.isArray(result?.segments) ? result.segments.map((s) => num(s?.end)).filter(ok) : []));
  if (end > 0) return end;
  const audio = input?.audio;
  const bytes = typeof audio === 'string' ? audio.length * 0.75 : audio?.byteLength ?? audio?.length ?? 0;
  return bytes / AUDIO_BYTES_PER_SEC;
}

/**
 * AI 호출 한 번에 쓴 뉴런: 답에 뉴런이 있으면 그것, 없으면 토큰 수 × 모델 단가,
 * 토큰 수도 없으면 입력 글자 수 · max_tokens로 넉넉하게. Whisper는 오디오 길이 × 1분 단가
 */
export function neuronsOf(model, input, result) {
  const direct = num(result?.usage?.neurons);
  if (ok(direct)) return direct;
  const rate = NEURON_RATES[model] || UNKNOWN_RATE;
  if (rate.perMinute) return (Math.max(1, audioSeconds(input, result)) / 60) * rate.perMinute;
  const u = result?.usage || {};
  let pin = num(u.prompt_tokens ?? u.input_tokens), pout = num(u.completion_tokens ?? u.output_tokens);
  const total = num(u.total_tokens);
  if (!ok(pin) && !ok(pout) && ok(total)) return total * Math.max(rate.in, rate.out); // 합만 있으면 비싼 쪽으로
  if (!ok(pin)) pin = promptGuess(input);
  if (!ok(pout)) pout = num(input?.max_tokens) > 0 ? num(input.max_tokens) : DEFAULT_OUT_TOKENS;
  return pin * rate.in + pout * rate.out;
}

// ---------- 날짜 (Workers AI 무료 한도는 UTC 하루 단위) ----------
/** UTC 날짜 'YYYY-MM-DD' (D1 표의 열쇠, SQLite date('now')와 같은 모양) */
export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
/** 다음 UTC 0시 (한국 오전 9시) ISO 글 */
export function nextUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

/** 쉬는 문턱 (뉴런). 환경 변수 USAGE_PAUSE_NEURONS로 바꾼다 (0이면 늘 쉼 — 실서비스 확인용), 잘못된 값이면 기본값 */
export function pauseLimit(env) {
  const n = num(env?.USAGE_PAUSE_NEURONS);
  return ok(n) ? n : DEFAULT_PAUSE_NEURONS;
}

// ---------- D1 ----------
// 하루 한 줄 (day = UTC 'YYYY-MM-DD'). 더할 때는 열쇠가 아닌 neurons · calls만 바뀌어 쓰는 줄이 하나 (D1 무료 쓰기 하루 10만 줄).
// 표는 처음 쓸 때 코드가 만든다 (migrations 적용 단계 없이 배포만으로 — "no such table"이면 만들고 한 번 더)
export const USAGE_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS ai_usage (day TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0)';
const ADD_SQL = 'INSERT INTO ai_usage (day, neurons, calls) VALUES (?1, ?2, 1) ON CONFLICT(day) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1 RETURNING neurons';
const GET_SQL = 'SELECT neurons FROM ai_usage WHERE day = ?1';
const noTable = (e) => /no such table/i.test(String(e?.message ?? e));

let seen = { day: '', neurons: 0, at: -Infinity }; // 이 인스턴스가 마지막으로 안 오늘 사용량
export const _resetUsage = () => { seen = { day: '', neurons: 0, at: -Infinity }; };

/**
 * 오늘(UTC) 쓴 뉴런. D1이 없거나 못 읽으면 null (= 모름 → 쉬지 않음). 같은 날 CACHE_MS 안에 읽은 값이 있으면 그것.
 * 새로 읽으면 D1 값을 그대로 쓴다 — 운영자가 D1 값을 고쳐 내리면(확인용으로 올렸다 되돌림 등) 30초 안에 풀리게 (2026-10-12 실서비스에서 찾음)
 */
export async function usedToday(env, now = Date.now()) {
  const db = env?.USAGE_DB;
  if (!db) return null;
  const day = utcDay(now);
  if (seen.day === day && now - seen.at < CACHE_MS) return seen.neurons;
  try {
    const row = await db.prepare(GET_SQL).bind(day).first();
    const n = num(row?.neurons);
    seen = { day, neurons: ok(n) ? n : 0, at: now };
    return seen.neurons;
  } catch (e) {
    if (noTable(e)) { seen = { day, neurons: 0, at: now }; return 0; } // 아직 한 번도 안 셈
    return seen.day === day ? seen.neurons : null;
  }
}

/** 오늘 사용량에 더하기 (실패해도 조용히). 돌려받은 합으로 메모리 값도 새로 */
export async function addUsage(env, neurons, now = Date.now()) {
  const db = env?.USAGE_DB;
  if (!db || !(neurons > 0)) return;
  const day = utcDay(now);
  const n = Math.ceil(neurons * 1000) / 1000;
  const add = () => db.prepare(ADD_SQL).bind(day, n).first();
  let row;
  try {
    try { row = await add(); } catch (e) {
      if (!noTable(e)) throw e;
      await db.prepare(USAGE_TABLE_SQL).run();
      row = await add();
    }
  } catch { return; }
  const total = num(row?.neurons);
  if (ok(total)) seen = { day, neurons: total, at: now }; // D1이 돌려준 합이 기준
  else if (seen.day === day) seen.neurons += n;
}

/**
 * Workers AI 부르기 + 쓴 뉴런 세기. 함수들은 env.AI.run 대신 이것을 쓴다.
 * 세기는 waitUntil에 맡겨 응답을 늦추지 않고, 호출하는 쪽이 시간 초과로 포기해도 AI가 나중에 답하면 센다
 */
export function runAI(env, waitUntil, model, input) {
  const run = env.AI.run(model, input);
  if (!env.USAGE_DB) return run;
  const count = Promise.resolve(run).then((result) => addUsage(env, neuronsOf(model, input, result))).catch(() => {});
  try { waitUntil?.(count); } catch { /* waitUntil이 없거나 못 쓰면 그냥 둔다 */ }
  return run;
}

// ---------- 쉬기 ----------
/**
 * 오늘 사용량이 문턱 이상이면 "오늘은 쉼" 응답 (503, code 'paused', until = 다음 UTC 0시), 아니면 null.
 * 답장 추천 · 합의 요약 · 사진 · 사진 요약이 AI를 부르기 전에 확인한다. 화면은 until을 그 사람 지역 시각으로 보여 준다
 */
export async function pausedResponse(env, now = Date.now()) {
  const used = await usedToday(env, now);
  if (used === null || used < pauseLimit(env)) return null;
  const until = nextUtcMidnight(now);
  const retry = Math.max(1, Math.ceil((Date.parse(until) - now) / 1000));
  return json({ error: '오늘은 사용량이 많아 이 기능을 쉬어요. 한국 시각 오전 9시(UTC 0시)에 다시 돼요.', code: 'paused', until }, 503, { 'retry-after': String(retry) });
}
