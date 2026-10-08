// Pages Functions를 가짜 AI로 실행해 본다
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost as translate } from '../functions/api/translate.js';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { checkOrigin, rateLimit, _resetBuckets } from '../lib/guard.mjs';

const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const req = (path, body, { origin = ORIGIN, ip = '1.1.1.1', type = 'application/json' } = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: { 'content-type': type, ...(origin ? { origin } : {}), 'cf-connecting-ip': ip },
  body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
});
const fakeAI = (fn) => ({ calls: [], async run(model, input) { this.calls.push({ model, input }); return fn(model, input, this.calls.length); } });

beforeEach(() => _resetBuckets());

test('번역: 첫 모델(생각 끔) 답을 정리해서 돌려준다', async () => {
  const AI = fakeAI(() => ({ response: '"Bu ne kadar?"' }));
  const res = await translate({ request: req('/api/translate', { text: '이거 얼마예요?', from: 'ko', to: 'tr' }), env: { AI } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: 'Bu ne kadar?', model: '@cf/google/gemma-4-26b-a4b-it' });
  assert.equal(AI.calls[0].input.chat_template_kwargs.enable_thinking, false);
  assert.equal(AI.calls[0].input.messages[1].content, '이거 얼마예요?');
});

test('번역: 첫 모델이 실패하거나 빈 답이면 다음 모델로', async () => {
  const AI = fakeAI((model, input, n) => {
    if (n === 1) throw new Error('3040: Capacity temporarily exceeded');
    if (n === 2) return { response: '' };
    return { response: 'Teşekkür ederim.' };
  });
  const res = await translate({ request: req('/api/translate', { text: '감사합니다', from: 'ko', to: 'tr' }), env: { AI } });
  const data = await res.json();
  assert.equal(data.text, 'Teşekkür ederim.');
  assert.equal(AI.calls.length, 3);
  assert.notEqual(AI.calls[2].model, AI.calls[0].model);
});

test('번역: 무료 한도가 끝나면 다른 모델을 더 부르지 않고 503', async () => {
  const AI = fakeAI(() => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); });
  const res = await translate({ request: req('/api/translate', { text: 'hi', from: 'en', to: 'ko' }), env: { AI } });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /한도/);
  assert.equal(AI.calls.length, 1);
});

test('번역: 같은 언어 · 잘못된 요청 · AI 없음', async () => {
  const AI = fakeAI(() => ({ response: 'x' }));
  assert.deepEqual(await (await translate({ request: req('/api/translate', { text: 'hi', from: 'en', to: 'en' }), env: { AI } })).json(), { text: 'hi', model: 'same-language' });
  assert.equal((await translate({ request: req('/api/translate', '{bad json'), env: { AI } })).status, 400);
  assert.equal((await translate({ request: req('/api/translate', { text: '', from: 'en', to: 'ko' }), env: { AI } })).status, 400);
  assert.equal((await translate({ request: req('/api/translate', { text: 'hi', from: 'en', to: 'ko' }), env: {} })).status, 500);
  assert.equal(AI.calls.length, 0);
});

test('다른 사이트·Origin 없는 요청은 막는다 (공개 주소의 무료 AI 보호)', async () => {
  const AI = fakeAI(() => ({ response: '안녕' }));
  for (const origin of ['https://evil.example', null, 'not a url']) {
    const res = await translate({ request: req('/api/translate', { text: 'hi', from: 'en', to: 'ko' }, { origin }), env: { AI } });
    assert.equal(res.status, 403, String(origin));
  }
  assert.equal(AI.calls.length, 0);
  const local = new Request('http://127.0.0.1:8788/api/translate', { method: 'POST', headers: { origin: 'http://localhost:8788' } });
  assert.equal(checkOrigin(local), null, '내 PC 개발 서버는 허용');
});

test('너무 잦은 요청은 429 (IP마다)', () => {
  const r = req('/api/translate', {}, { ip: '9.9.9.9' });
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(r, 't', 3, 60000, 1000 + i), null);
  const limited = rateLimit(r, 't', 3, 60000, 1004);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(rateLimit(req('/x', {}, { ip: '8.8.8.8' }), 't', 3, 60000, 1004), null, '다른 IP는 따로');
  assert.equal(rateLimit(r, 't', 3, 60000, 1000 + 60001), null, '시간이 지나면 다시');
});

test('음성 인식: 언어·크기 검사, Whisper에 base64로 넘기고 지어낸 말은 버린다', async () => {
  const audio = new Uint8Array(5000).fill(7);
  const AI = fakeAI((model, input) => ({ text: input.language === 'tr' ? ' Merhaba, nasılsınız? ' : 'Altyazı M.K.' }));
  let res = await stt({ request: req('/api/stt?lang=tr', audio, { type: 'audio/webm' }), env: { AI } });
  assert.deepEqual(await res.json(), { text: 'Merhaba, nasılsınız?' });
  assert.equal(AI.calls[0].model, '@cf/openai/whisper-large-v3-turbo');
  assert.equal(AI.calls[0].input.audio, Buffer.from(audio).toString('base64'));
  assert.equal(AI.calls[0].input.language, 'tr');
  res = await stt({ request: req('/api/stt?lang=ko', audio, { type: 'audio/webm' }), env: { AI } });
  assert.deepEqual(await res.json(), { text: '' }, '지어낸 자막 끝인사');
  assert.equal((await stt({ request: req('/api/stt?lang=ja', audio, { type: 'audio/webm' }), env: { AI } })).status, 400);
  assert.deepEqual(await (await stt({ request: req('/api/stt?lang=ko', new Uint8Array(10), { type: 'audio/webm' }), env: { AI } })).json(), { text: '' }, '너무 짧은 녹음');
  assert.equal((await stt({ request: req('/api/stt?lang=ko', audio, { origin: 'https://evil.example', type: 'audio/webm' }), env: { AI } })).status, 403);
});
