// 무료 요금제 안전장치(v1.6.0): 뉴런 세기 · UTC 날짜 · D1 하루 한 줄 · 문턱을 넘으면 부가 기능 쉼 · D1 없음/오류는 막지 않음 ·
// 사진 예비 모델 안 부름 · 화면 안내 (가짜 AI · 가짜 D1 — 진짜 AI · D1은 쓰지 않는다)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  neuronsOf, NEURON_RATES, utcDay, nextUtcMidnight, pauseLimit, usedToday, addUsage, runAI, pausedResponse, _resetUsage,
  DEFAULT_PAUSE_NEURONS, CACHE_MS,
} from '../lib/usage.mjs';
import { onRequestPost as translate } from '../functions/api/translate.js';
import { onRequestPost as sound } from '../functions/api/sound.js';
import { onRequestPost as kana } from '../functions/api/kana.js';
import { onRequestPost as pinyin } from '../functions/api/pinyin.js';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { onRequestPost as suggest } from '../functions/api/suggest.js';
import { onRequestPost as summary } from '../functions/api/summary.js';
import { onRequestPost as photo } from '../functions/api/photo.js';
import { onRequestPost as photoSum } from '../functions/api/photo-summary.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { MODELS, STT_MODEL, buildMessages, maxTokensFor, withTimeout } from '../lib/translate-core.mjs';
import { PHOTO_MODELS, PHOTO_MAX_TOKENS, buildPhotoMessages } from '../lib/photo-core.mjs';
import { MESSAGES, setUiLang } from '../public/js/i18n.js';
import { serverError, resumeTime, suggestReplies } from '../public/js/api.js';
import { CODES } from '../public/js/lang.js';

beforeEach(() => { _resetUsage(); _resetBuckets(); setUiLang('ko'); });
afterEach(() => setUiLang('ko'));

const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const G = '@cf/google/gemma-4-26b-a4b-it';
const L = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const M = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const fakeAI = (fn) => ({ calls: [], async run(model, input) { this.calls.push({ model, input }); return fn(model, input, this.calls.length); } });

/**
 * 가짜 D1: prepare → bind → first · run · all, batch. 이 앱이 쓰는 SQL(표 만들기 · 더하기 · 읽기)만 흉내 낸다.
 * table: 표가 있나 (없으면 "no such table") · fail: 모든 호출이 오류 · rows: { 'YYYY-MM-DD': 뉴런 } · gate: 쓰기를 붙잡아 두는 약속
 */
function fakeD1({ table = true, fail = false, rows = {} } = {}) {
  const db = {
    table, fail, gate: null, log: [],
    rows: new Map(Object.entries(rows).map(([day, neurons]) => [day, { day, neurons, calls: 0 }])),
    async exec(sql, args) {
      const kind = /^\s*CREATE/i.test(sql) ? 'create' : /^\s*INSERT/i.test(sql) ? 'add' : /^\s*SELECT/i.test(sql) ? 'get' : 'other';
      db.log.push({ kind, sql, args });
      if (db.fail) throw new Error('D1_ERROR: Network connection lost.');
      if (kind === 'create') { db.table = true; return []; }
      if (!db.table) throw new Error('D1_ERROR: no such table: ai_usage: SQLITE_ERROR');
      if (kind === 'add') {
        if (db.gate) await db.gate;
        const [day, n] = args;
        const row = db.rows.get(day) || { day, neurons: 0, calls: 0 };
        row.neurons += n;
        row.calls += 1;
        db.rows.set(day, row);
        return /RETURNING/i.test(sql) ? [{ neurons: row.neurons }] : [];
      }
      if (kind === 'get') { const row = db.rows.get(args[0]); return row ? [{ neurons: row.neurons }] : []; }
      throw new Error(`가짜 D1이 모르는 SQL: ${sql}`);
    },
    prepare(sql) {
      const stmt = (args) => ({
        bind: (...a) => stmt(a),
        first: async (col) => { const r = (await db.exec(sql, args))[0] ?? null; return col && r ? r[col] : r; },
        run: async () => ({ success: true, results: await db.exec(sql, args), meta: {} }),
        all: async () => ({ success: true, results: await db.exec(sql, args), meta: {} }),
      });
      return stmt([]);
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    neurons: (day = utcDay()) => db.rows.get(day)?.neurons ?? 0,
    calls: (day = utcDay()) => db.rows.get(day)?.calls ?? 0,
    count: (kind) => db.log.filter((l) => l.kind === kind).length,
  };
  return db;
}

const req = (path, body, { ip = '3.3.3.3', type = 'application/json' } = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: { 'content-type': type, 'cf-connecting-ip': ip, origin: ORIGIN },
  body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
});
/** Pages Functions처럼 { request, env, waitUntil } 로 부르고, waitUntil에 맡긴 일(세기)까지 끝낸 뒤 돌려준다 */
async function hit(fn, path, body, env, opts) {
  const pending = [];
  const res = await fn({ request: req(path, body, opts), env, waitUntil: (p) => pending.push(p) });
  await Promise.all(pending);
  return { res, data: await res.json(), pending };
}

// 그림 머리만 있는 가짜 JPEG
function jpeg(width, height, size = 4000) {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  b.set([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00], 20);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03], 26);
  return b;
}

const TURNS = [
  { side: 'me', from: 'ko', to: 'zh', text: '단가가 얼마예요?', translation: '单价是多少？' },
  { side: 'partner', from: 'zh', to: 'ko', text: '一百个的话每个十五块。', translation: '100개면 개당 15위안이에요.' },
];
const SUGGESTIONS = '[{"ko":"좋아요, 100개 주문할게요.","zh":"好的，我订一百个。"},{"ko":"샘플을 먼저 받을 수 있어요?","zh":"可以先寄样品吗？"}]';
/** 쉬는 기능 4가지: [이름, 함수, 주소, 본문, content-type] */
const PAUSABLE = [
  ['suggest', suggest, '/api/suggest', { me: 'ko', partner: 'zh', formal: true, turns: TURNS }],
  ['summary', summary, '/api/summary', { me: 'ko', partner: 'zh', turns: TURNS }],
  ['photo', photo, '/api/photo?me=ko', jpeg(800, 800), 'image/jpeg'],
  ['photo-summary', photoSum, '/api/photo-summary', { me: 'ko', lines: [{ text: '原价 ¥129', tr: '정가 ¥129' }] }],
];
/** 쉬지 않는 기능: [이름, 함수, 주소, 본문, content-type, 가짜 AI 답, 답에서 볼 칸] */
const ALWAYS = [
  ['translate', translate, '/api/translate', { text: '안녕하세요', from: 'ko', to: 'tr' }, undefined, { response: 'Merhaba.', usage: { prompt_tokens: 240, completion_tokens: 6 } }, 'text'],
  ['sound', sound, '/api/sound', { text: '你好', lang: 'zh' }, undefined, { response: 'Nǐ hǎo', usage: { prompt_tokens: 180, completion_tokens: 5 } }, 'sound'],
  ['kana', kana, '/api/kana', { text: 'こんにちは' }, undefined, { response: 'こんにちわ', usage: { prompt_tokens: 150, completion_tokens: 5 } }, 'kana'],
  ['pinyin', pinyin, '/api/pinyin', { text: '你好' }, undefined, { response: 'Nǐ hǎo', usage: { prompt_tokens: 160, completion_tokens: 5 } }, 'pinyin'],
  ['stt', stt, '/api/stt?lang=tr', new Uint8Array(5000).fill(7), 'audio/webm', { text: 'Merhaba', transcription_info: { duration: 6 } }, 'text'],
];

// ---------- 뉴런 세기 ----------
test('뉴런 세기: 응답의 뉴런 → 토큰 × 모델 단가 → 토큰이 없으면 넉넉히 · Whisper는 오디오 길이 · 단가는 실측 · 가격표보다 작지 않게', () => {
  // 단가표: 이 앱이 부르는 모든 모델이 있고, 앞 세션 실측 · 가격표 값보다 작지 않다
  for (const m of [...MODELS.map((x) => x.id), ...PHOTO_MODELS.map((x) => x.id), STT_MODEL]) assert.ok(NEURON_RATES[m], `단가표에 ${m}`);
  const FLOOR = { [G]: [0.009, 0.027], [L]: [0.0267, 0.205], [M]: [0.032, 0.050] };
  for (const [m, [i, o]] of Object.entries(FLOOR)) assert.ok(NEURON_RATES[m].in >= i && NEURON_RATES[m].out >= o, m);
  assert.ok(NEURON_RATES[STT_MODEL].perMinute >= 46.6);

  assert.equal(neuronsOf(G, {}, { response: 'x', usage: { neurons: 20 } }), 20, '응답에 뉴런이 있으면 그것');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
  near(neuronsOf(G, {}, { response: 'x', usage: { prompt_tokens: 1000, completion_tokens: 100 } }), 1000 * NEURON_RATES[G].in + 100 * NEURON_RATES[G].out);
  near(neuronsOf(L, {}, { usage: { prompt_tokens: 300, completion_tokens: 40 } }), 300 * NEURON_RATES[L].in + 40 * NEURON_RATES[L].out);
  near(neuronsOf(M, {}, { choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 1200, completion_tokens: 500 } }), 1200 * NEURON_RATES[M].in + 500 * NEURON_RATES[M].out);
  assert.ok(neuronsOf(L, {}, { usage: { prompt_tokens: 300, completion_tokens: 40 } }) > neuronsOf(G, {}, { usage: { prompt_tokens: 300, completion_tokens: 40 } }) * 3, 'Llama 70B는 Gemma보다 몇 배 비싸다');
  near(neuronsOf(G, {}, { usage: { total_tokens: 1000 } }), 1000 * NEURON_RATES[G].out, '합만 있으면 비싼 쪽(출력) 단가로');
  assert.ok(neuronsOf('@cf/some/new-model', {}, { usage: { prompt_tokens: 100, completion_tokens: 100 } }) >= 100 * 0.032 + 100 * 0.205, '모르는 모델은 표에서 가장 비싼 값으로');

  // 토큰 수가 없으면: 입력 글자 하나 = 토큰 하나, 출력은 max_tokens (실제 토큰으로 센 값보다 작지 않게)
  const text = '이거 얼마예요? 백 개 사면 더 싸게 해 주실 수 있어요?';
  const input = { messages: buildMessages({ text, from: 'ko', to: 'zh' }), max_tokens: maxTokensFor(text), temperature: 0.2 };
  const chars = input.messages.reduce((n, m) => n + m.content.length, 0);
  const guess = neuronsOf(G, input, { response: '单价多少？' });
  assert.ok(guess >= chars * NEURON_RATES[G].in + input.max_tokens * NEURON_RATES[G].out, `어림 ${guess}`);
  assert.ok(guess >= neuronsOf(G, input, { usage: { prompt_tokens: Math.ceil(chars / 2), completion_tokens: input.max_tokens } }), '토큰으로 센 값(글자 2개에 1토큰으로 넉넉히 잡아도)보다 크다');
  // 그림: 장마다 Gemma 실측(약 280토큰)보다 많이, 한 장 어림은 실측 상한(30뉴런)보다 크게
  const photoInput = { messages: buildPhotoMessages({ me: 'ko' }, `data:image/jpeg;base64,${'A'.repeat(400_000)}`), max_tokens: PHOTO_MAX_TOKENS, temperature: 0 };
  const noImage = { ...photoInput, messages: [photoInput.messages[0], { role: 'user', content: [photoInput.messages[1].content[1]] }] };
  assert.ok(neuronsOf(G, photoInput, {}) - neuronsOf(G, noImage, {}) >= 280 * NEURON_RATES[G].in, '그림 한 장 몫');
  assert.ok(neuronsOf(G, photoInput, {}) >= 30, '사진 한 장 어림 ≥ 실측 상한 30뉴런');
  assert.ok(neuronsOf(G, photoInput, {}) < 200, 'base64 그림 글자는 세지 않는다 (몇십만 뉴런으로 부풀지 않게)');

  // Whisper: 오디오 길이 × 1분 단가 (답의 transcription_info.duration → segments 끝 → 바이트로 어림)
  near(neuronsOf(STT_MODEL, { audio: 'AAAA' }, { text: 'x', transcription_info: { duration: 30 } }), 0.5 * NEURON_RATES[STT_MODEL].perMinute);
  near(neuronsOf(STT_MODEL, { audio: 'AAAA' }, { text: 'x', segments: [{ start: 0, end: 4 }, { start: 4, end: 12 }] }), (12 / 60) * NEURON_RATES[STT_MODEL].perMinute);
  const audio15s = Buffer.alloc(240_000).toString('base64'); // 128kbps로 15초 (브라우저 녹음 보통 64~128kbps)
  assert.ok(neuronsOf(STT_MODEL, { audio: audio15s }, { text: 'x' }) >= (15 / 60) * 46.6, '길이를 모르면 바이트로 넉넉히');
  assert.ok(neuronsOf(STT_MODEL, { audio: 'AAAA' }, { text: '' }) >= 46.6 / 60, '아주 짧아도 1초 몫은 센다');
});

test('UTC 날짜: 한국 오전 9시에 날이 바뀌고, D1에는 날마다 한 줄 · 어제 쉬었어도 UTC 0시가 지나면 다시', async () => {
  assert.equal(utcDay(Date.parse('2026-10-13T08:59:59+09:00')), '2026-10-12');
  assert.equal(utcDay(Date.parse('2026-10-13T09:00:00+09:00')), '2026-10-13');
  assert.equal(nextUtcMidnight(Date.parse('2026-10-12T23:59:59.999Z')), '2026-10-13T00:00:00.000Z');
  assert.equal(nextUtcMidnight(Date.parse('2026-10-13T00:00:00Z')), '2026-10-14T00:00:00.000Z');
  assert.equal(nextUtcMidnight(Date.parse('2026-12-31T20:00:00Z')), '2027-01-01T00:00:00.000Z', '해 바뀜');
  assert.equal(nextUtcMidnight(Date.parse('2028-02-28T12:00:00Z')), '2028-02-29T00:00:00.000Z', '윤일');

  const db = fakeD1();
  await addUsage({ USAGE_DB: db }, 5, Date.parse('2026-10-12T23:59:00Z'));
  await addUsage({ USAGE_DB: db }, 7, Date.parse('2026-10-13T00:01:00Z'));
  assert.deepEqual([...db.rows.values()], [{ day: '2026-10-12', neurons: 5, calls: 1 }, { day: '2026-10-13', neurons: 7, calls: 1 }]);

  _resetUsage();
  const env = { USAGE_DB: fakeD1({ rows: { '2026-10-12': 9000 } }) };
  const late = Date.parse('2026-10-12T23:59:50Z');
  const res = await pausedResponse(env, late);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.until, '2026-10-13T00:00:00.000Z', '다시 되는 때 = 다음 UTC 0시 (한국 오전 9시)');
  assert.equal(res.headers.get('retry-after'), '10');
  assert.equal(await pausedResponse(env, late + 15_000), null, '15초 뒤 UTC 0시가 지나면 다시 (메모리 값은 어제 것이라 버린다)');
});

test('D1: 표는 처음 쓸 때 만들고, 하루 한 줄에 더하기 · 횟수 · 메모리에 30초 · 저장하는 것은 날짜와 숫자뿐', async () => {
  const db = fakeD1({ table: false });
  const env = { USAGE_DB: db };
  const now = Date.parse('2026-10-12T05:00:00Z');
  assert.equal(await usedToday(env, now), 0, '표가 아직 없으면 0');
  await addUsage(env, 2.5, now);
  await addUsage(env, 1.25, now);
  assert.equal(db.count('create'), 1, '"no such table"이면 표를 만들고 한 번 더 — 그 뒤로는 만들지 않는다');
  assert.deepEqual(db.rows.get('2026-10-12'), { day: '2026-10-12', neurons: 3.75, calls: 2 });
  assert.equal(await usedToday(env, now + 1000), 3.75, '더하고 돌려받은 합을 메모리에');
  // 다른 인스턴스가 더한 것: 30초 안에는 메모리 값, 지나면 D1에서 다시 읽는다
  db.rows.get('2026-10-12').neurons = 100;
  const reads = db.count('get');
  assert.equal(await usedToday(env, now + 5000), 3.75);
  assert.equal(db.count('get'), reads, '30초 안에는 D1을 읽지 않는다');
  assert.equal(await usedToday(env, now + CACHE_MS + 1), 100);
  // 0 · 이상한 값은 쓰지 않는다, 소수는 위로 올려 센다
  const writes = db.count('add');
  for (const n of [0, -3, NaN, undefined]) await addUsage(env, n, now);
  assert.equal(db.count('add'), writes);
  await addUsage(env, 0.00011, now + CACHE_MS + 2);
  assert.ok(Math.abs(db.rows.get('2026-10-12').neurons - 100.001) < 1e-9, '작게 세지 않게 0.001 단위로 올림');
  // 저장하는 값은 날짜 · 숫자뿐 (말 · 그림은 남기지 않는다), 표 하나 · 쓰는 SQL은 세 가지
  for (const { args } of db.log) for (const a of args) assert.ok(typeof a === 'number' || /^\d{4}-\d{2}-\d{2}$/.test(a), String(a));
  assert.deepEqual([...new Set(db.log.map((l) => l.kind))].sort(), ['add', 'create', 'get']);
  assert.match(db.log.find((l) => l.kind === 'add').sql, /ON CONFLICT\(day\) DO UPDATE SET neurons = neurons \+ excluded\.neurons, calls = calls \+ 1/);
  assert.match(db.log.find((l) => l.kind === 'create').sql, /^CREATE TABLE IF NOT EXISTS ai_usage \(day TEXT PRIMARY KEY, neurons REAL/);
});

test('runAI: 답이 오면 waitUntil로 센다 — 응답은 D1 쓰기를 기다리지 않고, 실패한 호출은 세지 않고, 시간 초과로 포기해도 늦게 온 답은 센다', async () => {
  const db = fakeD1();
  let release;
  db.gate = new Promise((r) => { release = r; });
  const AI = fakeAI(() => ({ response: 'Merhaba.', usage: { prompt_tokens: 200, completion_tokens: 10 } }));
  const pending = [];
  const res = await translate({ request: req('/api/translate', { text: '안녕하세요', from: 'ko', to: 'tr' }), env: { AI, USAGE_DB: db }, waitUntil: (p) => pending.push(p) });
  assert.equal(res.status, 200, 'D1 쓰기가 끝나기 전에 답한다');
  assert.equal((await res.json()).text, 'Merhaba.');
  assert.equal(pending.length, 1, '세기는 waitUntil에');
  assert.equal(db.neurons(), 0);
  release();
  await Promise.all(pending);
  const want = 200 * NEURON_RATES[G].in + 10 * NEURON_RATES[G].out;
  assert.ok(db.neurons() >= want && db.neurons() < want + 0.001, `${db.neurons()} ≈ ${want}`);
  assert.equal(db.calls(), 1);

  // 모델 셋이 다 실패(바쁨)하면 세지 않는다
  const busy = fakeAI(() => { throw new Error('3040: Capacity temporarily exceeded'); });
  const r2 = await hit(translate, '/api/translate', { text: '감사합니다', from: 'ko', to: 'tr' }, { AI: busy, USAGE_DB: db });
  assert.equal(r2.res.status, 503);
  assert.equal(busy.calls.length, 3);
  assert.equal(db.calls(), 1, '실패한 호출은 세지 않는다');

  // 첫 모델이 빈 답 → 다음 모델: 두 번 다 센다
  const two = fakeAI((m, i, n) => ({ response: n === 1 ? '' : 'Teşekkürler.', usage: { prompt_tokens: 200, completion_tokens: 5 } }));
  await hit(translate, '/api/translate', { text: '고마워요', from: 'ko', to: 'tr' }, { AI: two, USAGE_DB: db });
  assert.equal(db.calls(), 3, '부른 만큼 센다 (Gemma + Llama)');

  // 시간 초과로 포기한 호출도 AI가 나중에 답하면 센다 (쓴 뉴런은 쓴 것)
  const late = fakeD1();
  let answer;
  const slow = { run: () => new Promise((r) => { answer = r; }) };
  const later = [];
  await assert.rejects(withTimeout(runAI({ AI: slow, USAGE_DB: late }, (p) => later.push(p), G, { messages: [] }), 10), /timeout/);
  answer({ response: '늦은 답', usage: { prompt_tokens: 100, completion_tokens: 0 } });
  await Promise.all(later);
  assert.ok(late.neurons() > 0);

  // waitUntil이 없거나(시험 · 예전 호출) 던져도 AI 답은 그대로
  assert.deepEqual(await runAI({ AI: fakeAI(() => ({ response: 'ok' })), USAGE_DB: fakeD1() }, undefined, G, {}), { response: 'ok' });
  assert.deepEqual(await runAI({ AI: fakeAI(() => ({ response: 'ok' })), USAGE_DB: fakeD1() }, () => { throw new Error('Illegal invocation'); }, G, {}), { response: 'ok' });
});

// ---------- 쉬기 ----------
test('문턱을 넘으면 답장 추천 · 합의 요약 · 사진 · 사진 요약은 AI를 한 번도 부르지 않고 paused (503 · until = 다음 UTC 0시)', async () => {
  const db = fakeD1({ rows: { [utcDay()]: DEFAULT_PAUSE_NEURONS } });
  const AI = fakeAI(() => { throw new Error('부르면 안 됨'); });
  for (const [name, fn, path, body, type] of PAUSABLE) {
    const { res, data, pending } = await hit(fn, path, body, { AI, USAGE_DB: db }, { type });
    assert.equal(res.status, 503, name);
    assert.equal(data.code, 'paused', name);
    assert.equal(data.until, nextUtcMidnight(), name);
    assert.ok(Date.parse(data.until) > Date.now(), name);
    assert.match(data.error, /쉬어요/, name);
    assert.ok(Number(res.headers.get('retry-after')) > 0, name);
    assert.equal(res.headers.get('cache-control'), 'no-store', name);
    assert.equal(pending.length, 0, name);
  }
  assert.equal(AI.calls.length, 0, 'AI를 한 번도 부르지 않는다');
  assert.equal(db.count('add'), 0, '쓴 것이 없으니 세지도 않는다');
  assert.equal(db.count('get'), 1, '오늘 사용량은 메모리에 들고 있어 D1은 한 번만 읽는다');
});

test('문턱을 넘어도 번역 · 읽는 법(sound · kana · pinyin) · 받아쓰기는 그대로 — 세기는 계속', async () => {
  const db = fakeD1({ rows: { [utcDay()]: 9000 } });
  for (const [name, fn, path, body, type, answer, field] of ALWAYS) {
    const AI = fakeAI(() => answer);
    const before = db.neurons();
    const { res, data } = await hit(fn, path, body, { AI, USAGE_DB: db }, { type });
    assert.equal(res.status, 200, name);
    assert.ok(data[field], `${name}: ${JSON.stringify(data)}`);
    assert.equal(AI.calls.length, 1, name);
    assert.ok(db.neurons() > before, `${name}: 센다`);
  }
  assert.equal(db.calls(), ALWAYS.length);
  // 쉬는 기능은 그대로 쉰다
  const AI = fakeAI(() => ({ response: SUGGESTIONS }));
  assert.equal((await hit(suggest, ...PAUSABLE[0].slice(2, 4), { AI, USAGE_DB: db })).data.code, 'paused');
  assert.equal(AI.calls.length, 0);
});

test('문턱 바로 아래면 부가 기능도 되고 세진다 · 사진은 예비 모델(Mistral)을 부르지 않는다', async () => {
  const db = fakeD1({ rows: { [utcDay()]: DEFAULT_PAUSE_NEURONS - 0.1 } });
  const AI = fakeAI(() => ({ response: SUGGESTIONS, usage: { prompt_tokens: 600, completion_tokens: 60 } }));
  const { res, data } = await hit(suggest, '/api/suggest', PAUSABLE[0][3], { AI, USAGE_DB: db });
  assert.equal(res.status, 200);
  assert.equal(data.suggestions.length, 2);
  assert.ok(db.neurons() >= DEFAULT_PAUSE_NEURONS, '이번 추천으로 문턱을 넘었다');
  // 메모리 값도 더한 합으로 바뀌어 다음 부가 기능은 바로 쉰다 (D1을 다시 읽지 않아도)
  const reads = db.count('get');
  const next = await hit(summary, '/api/summary', PAUSABLE[1][3], { AI, USAGE_DB: db });
  assert.equal(next.data.code, 'paused');
  assert.equal(db.count('get'), reads);

  // 사진: 기본 모델이 JSON이 아닌 답이면 예비 모델 없이 photo_failed — AI는 한 번, 센 것도 한 번
  _resetUsage();
  const pdb = fakeD1();
  const pAI = fakeAI(() => ({ response: '죄송합니다. 이미지를 볼 수 없습니다.', usage: { prompt_tokens: 900, completion_tokens: 12 } }));
  const p = await hit(photo, '/api/photo?me=ko', jpeg(800, 800), { AI: pAI, USAGE_DB: pdb }, { type: 'image/jpeg' });
  assert.equal(p.res.status, 502);
  assert.equal(serverError(p.data, 502, 'photo'), MESSAGES.ko['err.photo_failed']);
  assert.deepEqual(pAI.calls.map((c) => c.model), [G]);
  assert.ok(!pAI.calls.some((c) => /mistral/.test(c.model)));
  assert.equal(pdb.calls(), 1);
  // 두 번 다 바쁨(3040) → busy, Gemma 두 번
  const bAI = fakeAI(() => { throw new Error('3040: Capacity temporarily exceeded'); });
  const b = await hit(photo, '/api/photo?me=ko', jpeg(800, 800), { AI: bAI, USAGE_DB: pdb }, { type: 'image/jpeg' });
  assert.equal(b.data.code, 'busy');
  assert.deepEqual(bAI.calls.map((c) => c.model), [G, G]);
});

test('문턱은 환경 변수 USAGE_PAUSE_NEURONS로 (기본 7,000 · "0"이면 늘 쉼 · 잘못된 값은 기본) · wrangler.toml', async () => {
  assert.equal(DEFAULT_PAUSE_NEURONS, 7000, '무료 한도 10,000의 70%');
  assert.equal(pauseLimit({}), 7000);
  assert.equal(pauseLimit(undefined), 7000);
  assert.equal(pauseLimit({ USAGE_PAUSE_NEURONS: '5000' }), 5000);
  assert.equal(pauseLimit({ USAGE_PAUSE_NEURONS: 1234 }), 1234);
  assert.equal(pauseLimit({ USAGE_PAUSE_NEURONS: '0' }), 0);
  for (const bad of ['', ' ', 'abc', '-5', null, {}]) assert.equal(pauseLimit({ USAGE_PAUSE_NEURONS: bad }), 7000, JSON.stringify(bad));

  const now = Date.parse('2026-10-12T05:00:00Z');
  const at = async (used, limit) => {
    _resetUsage();
    const env = { USAGE_DB: fakeD1({ rows: used === null ? {} : { '2026-10-12': used } }), ...(limit === undefined ? {} : { USAGE_PAUSE_NEURONS: limit }) };
    return (await pausedResponse(env, now))?.status ?? 200;
  };
  assert.equal(await at(6999), 200);
  assert.equal(await at(7000), 503);
  assert.equal(await at(150, '100'), 503);
  assert.equal(await at(7000, '20000'), 200);
  assert.equal(await at(null, '0'), 503, '"0"이면 오늘 줄이 없어도 쉼 (실서비스에서 쉬는 응답 확인용)');
  assert.equal(await at(null), 200);

  // 함수에서도: 문턱 100, 오늘 150 → 추천은 쉬고 번역은 된다
  _resetUsage();
  const env = { AI: fakeAI(() => ({ response: 'Merhaba.' })), USAGE_DB: fakeD1({ rows: { [utcDay()]: 150 } }), USAGE_PAUSE_NEURONS: '100' };
  assert.equal((await hit(suggest, '/api/suggest', PAUSABLE[0][3], env)).data.code, 'paused');
  assert.equal((await hit(translate, '/api/translate', ALWAYS[0][3], env)).res.status, 200);

  const toml = readFileSync('wrangler.toml', 'utf8');
  assert.match(toml, /\[\[d1_databases\]\]\s*\nbinding = "USAGE_DB"\s*\ndatabase_name = "tercuman-usage"\s*\ndatabase_id = "17f6378a-b4dc-45fa-bee1-2a25fdf90fda"/);
  assert.match(toml, /\[vars\][\s\S]*USAGE_PAUSE_NEURONS = "7000"/);
  assert.doesNotMatch(toml, /kv_namespaces/, 'KV는 쓰지 않는다 (무료 쓰기 하루 1,000번)');
});

test('D1이 없거나 오류면 막지 않는다 (세기 · 쉬기 모두 조용히 건너뜀)', async () => {
  // 바인딩 없음 (예전 배포 · 시험)
  let AI = fakeAI(() => ({ response: SUGGESTIONS }));
  let r = await hit(suggest, '/api/suggest', PAUSABLE[0][3], { AI });
  assert.equal(r.res.status, 200);
  assert.equal(r.pending.length, 0, 'D1이 없으면 세기도 건너뜀');
  assert.equal(await usedToday({}), null);
  assert.equal(await pausedResponse({ USAGE_PAUSE_NEURONS: '0' }), null, '문턱이 0이어도 D1이 없으면 쉬지 않는다');

  // 읽기 · 쓰기 모두 오류
  const broken = fakeD1({ fail: true });
  for (const [name, fn, path, body, type] of PAUSABLE) {
    AI = fakeAI((m, input) => (Array.isArray(input.messages?.[1]?.content) ? { response: '{"lines":[],"summary":""}' } : { response: SUGGESTIONS }));
    r = await hit(fn, path, body, { AI, USAGE_DB: broken }, { type });
    assert.notEqual(r.data.code, 'paused', name);
    assert.ok(AI.calls.length >= 1, `${name}: AI를 부른다`);
  }
  for (const [name, fn, path, body, type, answer] of ALWAYS) {
    r = await hit(fn, path, body, { AI: fakeAI(() => answer), USAGE_DB: broken }, { type });
    assert.equal(r.res.status, 200, name);
  }
  assert.equal(await usedToday({ USAGE_DB: broken }), null);

  // prepare부터 던지는 D1
  const throwing = { prepare() { throw new Error('D1 binding broken'); } };
  r = await hit(suggest, '/api/suggest', PAUSABLE[0][3], { AI: fakeAI(() => ({ response: SUGGESTIONS })), USAGE_DB: throwing }, { ip: '4.4.4.4' });
  assert.equal(r.res.status, 200);
  r = await hit(translate, '/api/translate', ALWAYS[0][3], { AI: fakeAI(() => ALWAYS[0][5]), USAGE_DB: throwing });
  assert.equal(r.res.status, 200);

  // 한 번 읽은 오늘 값이 문턱 이상이면 D1이 잠깐 안 돼도 그 값으로 쉰다 (하루 안에서는 늘기만 한다)
  _resetUsage();
  const flaky = fakeD1({ rows: { [utcDay()]: 8000 } });
  const now = Date.now();
  assert.equal((await pausedResponse({ USAGE_DB: flaky }, now)).status, 503);
  flaky.fail = true;
  assert.equal((await pausedResponse({ USAGE_DB: flaky }, now + CACHE_MS + 1)).status, 503);
});

test('함수들: AI는 모두 runAI로 부르고(env.AI.run 직접 X), 쉬는 확인은 부가 기능 4곳에만', () => {
  const dir = 'functions/api';
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  const PAUSED = ['suggest.js', 'summary.js', 'photo.js', 'photo-summary.js'];
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, 'utf8');
    if (!/AI/.test(src)) continue;
    assert.doesNotMatch(src, /env\.AI\.run\(/, `${f}: runAI로`);
    assert.match(src, /runAI\(env, waitUntil, /, f);
    assert.match(src, /\{ request, env, waitUntil \}/, f);
    assert.equal(/pausedResponse\(env\)/.test(src), PAUSED.includes(f), `${f}: 쉬는 확인`);
  }
  for (const f of PAUSED) assert.ok(files.includes(f), f);
});

// ---------- 화면 ----------
test('화면: 쉬는 안내(err.paused)의 {time}을 그 사람 지역 시각으로 — 한국이면 오전 9:00, 모든 화면 언어', () => {
  const until = '2026-10-13T00:00:00.000Z';
  setUiLang('ko');
  assert.equal(resumeTime(until, { timeZone: 'Asia/Seoul' }), '오전 9:00');
  setUiLang('en');
  assert.match(resumeTime(until, { timeZone: 'Asia/Seoul' }), /^9:00\sAM$/u);
  setUiLang('tr');
  assert.match(resumeTime(until, { timeZone: 'Europe/Istanbul' }), /^0?3:00$/, '튀르키예는 03:00');
  // until이 없거나 잘못되면 다음 UTC 0시
  setUiLang('ko');
  const now = Date.parse('2026-10-12T10:00:00Z');
  assert.equal(resumeTime(undefined, { now, timeZone: 'Asia/Seoul' }), '오전 9:00');
  assert.equal(resumeTime('nonsense', { now, timeZone: 'Asia/Seoul' }), '오전 9:00');
  // 모든 화면 언어(새 언어 포함): 서버 오류 → 그 언어 문장, {time}은 채워진다
  for (const c of CODES) {
    setUiLang(c);
    const msg = serverError({ error: '오늘은 사용량이 많아 이 기능을 쉬어요.', code: 'paused', until }, 503, 'photo');
    assert.equal(msg, MESSAGES[c]['err.paused'].replace('{time}', resumeTime(until)), c);
    assert.doesNotMatch(msg, /\{time\}/, c);
    assert.match(msg, /\p{Nd}/u, `${c}: 시각이 들어 있다`);
  }
  setUiLang('ko');
  assert.doesNotMatch(serverError({ code: 'paused' }, 503), /\{time\}/, 'until이 없어도');
  assert.equal(serverError({ code: 'quota' }, 503), MESSAGES.ko['err.quota'], '다른 오류는 그대로');
  // 요약 · 사진 화면은 이 문장을 그대로 보여 주고 (share.js · views/photo.js), 추천은 조용히 숨긴다 (talk.js)
  assert.match(readFileSync('public/js/views/share.js', 'utf8'), /sum\.error = e\.message/);
  assert.match(readFileSync('public/js/views/photo.js', 'utf8'), /return \{ error: e\.message \}/);
  assert.match(readFileSync('public/js/views/talk.js', 'utf8'), /suggestReplies\([^)]*\)\.then\(settle, \(\) => settle\(\[\]\)\)/);
  assert.doesNotMatch(readFileSync('public/js/views/photo.js', 'utf8'), /photo\.backup/, '예비 AI 안내는 더 이상 안 뜬다 (사전 키는 둔다)');
});

test('화면: 답장 추천은 paused를 받으면 until까지 다시 부르지 않고 조용히 빈 목록 → 지나면 다시', async () => {
  const realFetch = globalThis.fetch;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const urls = [];
  let reply = () => new Response(JSON.stringify({ error: 'x', code: 'paused', until: new Date(Date.now() + 200).toISOString() }), { status: 503 });
  globalThis.fetch = async (url) => { urls.push(String(url)); return reply(); };
  try {
    const args = { me: 'ko', partner: 'zh', turns: TURNS };
    await assert.rejects(suggestReplies(args), (e) => e.code === 'paused' && !/\{time\}/.test(e.message));
    assert.deepEqual(await suggestReplies(args), [], 'until까지는 서버를 부르지 않는다');
    assert.deepEqual(await suggestReplies(args), []);
    assert.deepEqual(urls, ['/api/suggest']);
    await new Promise((r) => setTimeout(r, 250));
    reply = () => new Response(JSON.stringify({ suggestions: [{ me: '네', partner: '好的' }] }), { status: 200 });
    assert.deepEqual(await suggestReplies(args), [{ me: '네', partner: '好的' }]);
    assert.equal(urls.length, 2, 'until이 지나면 다시 부른다');
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.navigator.onLine;
  }
});

// ---------- 진짜 SQLite로 SQL 확인 (node:sqlite가 있는 Node에서만) ----------
test('D1 SQL을 실제 SQLite로: 표 만들기 · 더하기(RETURNING) · 읽기 · 보고서의 확인 명령(date(\'now\') = UTC 날짜)', async (t) => {
  let sqlite;
  try { sqlite = await import('node:sqlite'); } catch { t.skip('node:sqlite 없음'); return; }
  const raw = new sqlite.DatabaseSync(':memory:');
  // node:sqlite 위에 D1 모양 (prepare · bind · first · run · all · batch)
  const d1 = {
    prepare(sql) {
      const stmt = (args) => ({
        bind: (...a) => stmt(a),
        first: async (col) => { const r = raw.prepare(sql).get(...args) ?? null; return col && r ? r[col] : r; },
        run: async () => { const s = raw.prepare(sql); if (/RETURNING|^\s*SELECT/i.test(sql)) return { results: s.all(...args) }; s.run(...args); return { results: [] }; },
        all: async () => ({ results: raw.prepare(sql).all(...args) }),
      });
      return stmt([]);
    },
    async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
  const env = { USAGE_DB: d1 };
  const now = Date.now();
  assert.equal(await usedToday(env, now), 0, '표가 없으면 0 ("no such table")');
  await addUsage(env, 2.5, now);
  await addUsage(env, 1.25, now);
  assert.deepEqual({ ...raw.prepare('SELECT day, neurons, calls FROM ai_usage').get() }, { day: utcDay(now), neurons: 3.75, calls: 2 });
  assert.equal(raw.prepare("SELECT date('now') AS d").get().d, utcDay(), "SQLite date('now')는 UTC 날짜 = 표의 열쇠");
  // 보고서의 확인 명령: 오늘 값에 100,000을 더해 쉬게 했다가 다시 빼기
  const exec = (sql) => d1.prepare(sql).run();
  await exec("INSERT INTO ai_usage (day, neurons, calls) VALUES (date('now'), 100000, 0) ON CONFLICT(day) DO UPDATE SET neurons = neurons + 100000");
  _resetUsage();
  assert.equal((await pausedResponse(env)).status, 503);
  await exec("UPDATE ai_usage SET neurons = neurons - 100000 WHERE day = date('now')");
  _resetUsage();
  assert.equal(await pausedResponse(env), null);
  assert.equal(raw.prepare("SELECT round(neurons, 2) AS n FROM ai_usage WHERE day = date('now')").get().n, 3.75, '센 값은 그대로');
});

test('운영자가 D1 오늘 값을 고쳐 내리면 (확인용으로 올렸다 되돌림) 30초 메모리가 지난 뒤 풀린다 — 2026-10-12 실서비스에서 찾음', async () => {
  const now = Date.parse('2026-10-12T14:00:00Z');
  const db = fakeD1({ rows: { '2026-10-12': 100000 } });
  const env = { USAGE_DB: db };
  assert.ok(await pausedResponse(env, now), '올린 값이면 쉼');
  db.rows.get('2026-10-12').neurons = 4;
  assert.ok(await pausedResponse(env, now + 1000), '30초 안에는 메모리 값');
  assert.equal(await pausedResponse(env, now + CACHE_MS + 1000), null, '30초 뒤에는 D1 값 그대로 — 풀림');
  assert.equal(await usedToday(env, now + CACHE_MS + 2000), 4);
  await addUsage(env, 2, now + CACHE_MS + 3000);
  assert.equal(await usedToday(env, now + CACHE_MS + 4000), 6, '더한 뒤에는 D1이 돌려준 합');
});
