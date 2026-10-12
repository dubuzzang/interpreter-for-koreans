// 답장 추천(v1.4.0): 숫자 지어내기 막기 · 지시문 · 답 정리 · /api/suggest (가짜 AI)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  numberMentions, allowedNumbers, inventsNumber, parseCjkNumber, PLACEHOLDER,
  validateSuggest, buildSuggestMessages, cleanSuggestions, parseJsonLoose, SUGGEST_MAX_TOKENS,
} from '../lib/assist-core.mjs';
import { onRequestPost as suggest } from '../functions/api/suggest.js';
import { onRequestPost as translate } from '../functions/api/translate.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { MESSAGES } from '../public/js/i18n.js';
import { DEFAULTS } from '../public/js/store.js';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const req = (path, body, { origin = ORIGIN, ip = '5.5.5.5' } = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(origin ? { origin } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const fakeAI = (fn) => ({ calls: [], async run(model, input) { this.calls.push({ model, input }); return fn(model, input, this.calls.length); } });
const values = (text, lang) => numberMentions(text, lang).flatMap((m) => m.alts);

// 한국어 사용자가 중국 판매자와 흥정하는 대화
const TURNS = [
  { side: 'me', from: 'ko', to: 'zh', text: '단가가 얼마예요? 백 개 사면 더 싸게 해 주실 수 있어요?', translation: '单价是多少？如果买一百个，能便宜点吗？' },
  { side: 'partner', from: 'zh', to: 'ko', text: '一百个的话每个十五块，包邮，三天发货。', translation: '100개면 개당 15위안이고, 무료 배송, 3일 안에 발송해요.' },
];
const BODY = { me: 'ko', partner: 'zh', formal: true, turns: TURNS };

test('숫자 찾기: 아라비아 숫자 · 한자 숫자 · 한국어 · 튀르키예어 · 영어 · 일본어 수 낱말', () => {
  assert.deepEqual(values('100개에 15위안', 'ko'), [100, 15]);
  assert.deepEqual(values('15,000원 · 1.5kg', 'ko'), [15000, 1.5]);
  assert.deepEqual(values('１００個', 'ja'), [100], '전각 숫자');
  assert.deepEqual(values('1.500 lira', 'tr'), [1500], '튀르키예어 천 단위 점');
  assert.deepEqual(values('15万元', 'zh'), [15, 150000]);
  assert.deepEqual(values('5만 원', 'ko'), [5, 50000]);
  assert.deepEqual(values('一百个的话每个十五块，三天发货', 'zh'), [100, 15, 3]);
  assert.deepEqual(parseCjkNumber('一百五'), [105, 150], '一百五 = 150 (말로)');
  assert.deepEqual(parseCjkNumber('一百零五'), [105]);
  assert.deepEqual(parseCjkNumber('两万五'), [20005, 25000]);
  assert.deepEqual(parseCjkNumber('三千二百'), [3200]);
  assert.deepEqual(values('五千克', 'zh'), [5], '五千克 = 5kg');
  assert.deepEqual(values('四五天能到', 'zh'), [45, 4, 5], '四五天 = 4~5일');
  assert.deepEqual(values('백 개 · 두 개 · 열두 개 · 이틀', 'ko'), [2, 12, 100, 2], '열두 개는 한 번만 (고유어 → 한자어 → 날 수 차례)');
  assert.deepEqual(values('yüz elli tane', 'tr'), [150]);
  assert.deepEqual(values('two hundred and fifty pieces, a dozen boxes', 'en'), [250, 12]);
  assert.deepEqual(values('二つください', 'ja'), [2]);
  // 숫자가 아닌 흔한 낱말
  for (const [s, lang] of [['十分感谢', 'zh'], ['十分です', 'ja'], ['百货商店', 'zh'], ['千万别忘了', 'zh'], ['一緒に行きましょう', 'ja'],
    ['네 배송은 언제 돼요?', 'ko'], ['네 주문할게요', 'ko'], ['천천히 말해 주세요', 'ko'], ['만일 불량이면요', 'ko'], ['추천해 주십시오', 'ko'], ['I need it on Monday', 'en']]) {
    assert.deepEqual(values(s, lang), [], s);
  }
});

test('숫자 지어내기 막기: 대화에 나온 숫자(원문·번역 어느 쪽이든)만 허용, 낱말로 쓴 1은 괜찮다', () => {
  const allowed = allowedNumbers(TURNS);
  for (const v of [100, 15, 3]) assert.ok(allowed.has(v), v);
  assert.equal(inventsNumber('좋아요, 100개 주문할게요.', 'ko', allowed), false);
  assert.equal(inventsNumber('好的，我要一百个。', 'zh', allowed), false, '한자로 써도 같은 값');
  assert.equal(inventsNumber('3일 안에 꼭 보내 주세요.', 'ko', allowed), false);
  assert.equal(inventsNumber('200개 사면 12위안 돼요?', 'ko', allowed), true, '200 · 12는 대화에 없음');
  assert.equal(inventsNumber('两百个的话十二块可以吗？', 'zh', allowed), true);
  assert.equal(inventsNumber('그럼 두 개만 먼저 보내 주세요.', 'ko', allowed), true, '두 개');
  assert.equal(inventsNumber('이틀 안에 보내 주세요.', 'ko', allowed), true, '이틀');
  assert.equal(inventsNumber('能便宜一点吗？', 'zh', allowed), false, '一点 = 조금');
  assert.equal(inventsNumber('샘플 한 개 먼저 받을 수 있어요?', 'ko', allowed), false, '낱말 1은 관사처럼');
  assert.equal(inventsNumber('샘플 1개 먼저 받을 수 있어요?', 'ko', allowed), true, '숫자로 쓴 1은 지어낸 수량');
  assert.equal(inventsNumber('Bir sorum var.', 'tr', allowed), false);
  assert.equal(inventsNumber('Can you do 12 yuan each?', 'en', allowed), true);
  assert.equal(inventsNumber('Can you do fifteen yuan?', 'en', allowed), false);
});

test('빈칸 막기: ○○ · ___ · XX · [가격]', () => {
  for (const s of ['○○개 주문할게요', '___개 주세요', 'XX개요', '[가격]에 해 주세요', '〇〇个', 'ㅇㅇ개만']) assert.match(s, PLACEHOLDER, s);
  for (const s of ['100개 주문할게요', '好的，没问题。', 'Tamam, anlaştık.', 'I see...']) assert.doesNotMatch(s, PLACEHOLDER, s);
});

test('추천 요청 검사: 두 언어 · 마지막 말은 상대 말 · 최근 4줄 · 300자', () => {
  const v = validateSuggest(BODY).value;
  assert.equal(v.me, 'ko'); assert.equal(v.partner, 'zh'); assert.equal(v.formal, true);
  assert.equal(v.turns.length, 2);
  assert.equal(validateSuggest({ ...BODY, partner: 'ko' }).code, 'unsupported_lang', '같은 언어');
  assert.equal(validateSuggest({ ...BODY, me: 'de' }).code, 'unsupported_lang');
  assert.equal(validateSuggest({ ...BODY, turns: [TURNS[0]] }).code, 'empty', '마지막이 내 말이면');
  assert.equal(validateSuggest({ ...BODY, turns: [] }).code, 'empty');
  assert.equal(validateSuggest(null).code, 'bad_request');
  const many = Array.from({ length: 9 }, (_, i) => ({ ...TURNS[i % 2], text: 'x'.repeat(500) }));
  many.push(TURNS[1]);
  const long = validateSuggest({ ...BODY, turns: many }).value;
  assert.equal(long.turns.length, 4, '최근 4줄만 (토큰 아끼기)');
  assert.ok(long.turns.every((t) => t.text.length <= 300));
  assert.equal(validateSuggest({ ...BODY, formal: false }).value.formal, false);
});

test('추천 지시문: 두 언어 · 말투 · 숫자 지어내기 금지 · 빈칸 금지 · JSON · 짧게', () => {
  const [sys, user] = buildSuggestMessages(validateSuggest(BODY).value);
  assert.match(sys.content, /Korean speaker reply .* Chinese speaker/);
  assert.match(sys.content, /bargaining, ordering, shipping/);
  assert.match(sys.content, /NEVER invent numbers/);
  assert.match(sys.content, /make it a question instead/);
  assert.match(sys.content, /placeholders like ○○, ___, XX/);
  assert.match(sys.content, /at most 12 words/);
  assert.match(sys.content, /您/, '중국어 존댓말');
  assert.match(sys.content, /존댓말/, '한국어 존댓말');
  assert.match(sys.content, /\[\{"ko":"<Korean>","zh":"<Chinese>"\}\]/);
  assert.match(user.content, /\[Me \(Korean speaker\), Korean\] 단가가 얼마예요\?/);
  assert.match(user.content, /\[Other person, Chinese\] 一百个的话每个十五块.*\(= 100개면/);
  const casual = buildSuggestMessages(validateSuggest({ ...BODY, formal: false }).value)[0].content;
  assert.match(casual, /你, not 您/);
  assert.match(casual, /반말/);
  assert.ok(SUGGEST_MAX_TOKENS <= 400, '답 길이 짧게');
});

test('추천 답 정리: JSON을 꺼내고, 글자 · 빈칸 · 지어낸 숫자 · 겹침을 걸러 최대 3개', () => {
  const raw = '```json\n[' + [
    '{"ko":"좋아요, 100개 주문할게요.","zh":"好的，我订一百个。"}',
    '{"ko":"샘플을 먼저 받을 수 있어요?","zh":"可以先寄样品吗？"}',
    '{"ko":"200개 사면 12위안 돼요?","zh":"买两百个的话十二块可以吗？"}', // 지어낸 숫자
    '{"ko":"○○개 주문할게요.","zh":"我订○○个。"}', // 빈칸
    '{"ko":"좋아요","zh":"좋아요"}', // 중국어 칸에 한글
    '{"ko":"샘플을 먼저 받을 수 있어요?","zh":"可以先寄样品吗？"}', // 겹침
    '{"ko":"3일 안에 보내 주세요.","zh":"请三天内发货。"}',
    '{"ko":"결제는 어떻게 해요?","zh":"怎么付款？"}',
  ].join(',') + ',]\n```';
  const out = cleanSuggestions(raw, validateSuggest(BODY).value);
  assert.deepEqual(out, [
    { me: '좋아요, 100개 주문할게요.', partner: '好的，我订一百个。' },
    { me: '샘플을 먼저 받을 수 있어요?', partner: '可以先寄样品吗？' },
    { me: '3일 안에 보내 주세요.', partner: '请三天内发货。' },
  ]);
  assert.deepEqual(cleanSuggestions('죄송해요, 모르겠어요', validateSuggest(BODY).value), [], 'JSON이 아니면 빈 목록');
  assert.deepEqual(cleanSuggestions('{"suggestions":[{"ko":"네, 좋아요.","zh":"好的。"}]}', validateSuggest(BODY).value), [{ me: '네, 좋아요.', partner: '好的。' }], '객체로 감싸 와도');
  assert.deepEqual(parseJsonLoose('Here you go: [{"a":1},] thanks'), [{ a: 1 }]);
  assert.equal(parseJsonLoose('no json'), null);
});

test('/api/suggest: 생각 끈 Gemma로 짧게 한 번, 쓸 만한 답이 2개 이상이면 다음 모델을 부르지 않는다', async () => {
  const AI = fakeAI(() => ({ response: '[{"ko":"좋아요, 100개 주문할게요.","zh":"好的，我订一百个。"},{"ko":"샘플을 먼저 받을 수 있어요?","zh":"可以先寄样品吗？"},{"ko":"200개면요?","zh":"两百个呢？"}]' }));
  const res = await suggest({ request: req('/api/suggest', BODY), env: { AI } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.suggestions.length, 2, '지어낸 200은 빠짐');
  assert.equal(data.model, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(AI.calls.length, 1);
  assert.equal(AI.calls[0].input.chat_template_kwargs.enable_thinking, false);
  assert.equal(AI.calls[0].input.max_tokens, SUGGEST_MAX_TOKENS);
});

test('/api/suggest: 답이 모자라면 다음 모델 한 번, 그래도 없으면 빈 목록(200) · 오류면 오류 코드', async () => {
  let AI = fakeAI((m, i, n) => (n === 1 ? { response: '[{"ko":"200개 주세요","zh":"两百个"}]' } : { response: '[{"ko":"네, 좋아요.","zh":"好的。"},{"ko":"언제 발송돼요?","zh":"什么时候发货？"}]' }));
  let data = await (await suggest({ request: req('/api/suggest', BODY), env: { AI } })).json();
  assert.equal(data.suggestions.length, 2);
  assert.equal(AI.calls.length, 2);
  assert.notEqual(AI.calls[1].model, AI.calls[0].model);

  AI = fakeAI(() => ({ response: 'Sorry.' }));
  const res = await suggest({ request: req('/api/suggest', BODY), env: { AI } });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).suggestions, []);
  assert.equal(AI.calls.length, 2, '모델은 둘까지만');

  AI = fakeAI(() => { throw new Error('4006: daily free allocation'); });
  const quota = await suggest({ request: req('/api/suggest', BODY), env: { AI } });
  assert.equal(quota.status, 503);
  assert.equal((await quota.json()).code, 'quota');
  assert.equal(AI.calls.length, 1, '한도면 다른 모델도 같다');

  AI = fakeAI(() => ({ response: '[]' }));
  assert.equal((await suggest({ request: req('/api/suggest', BODY, { origin: 'https://evil.example' }), env: { AI } })).status, 403);
  assert.equal((await suggest({ request: req('/api/suggest', '{bad'), env: { AI } })).status, 400);
  assert.equal((await suggest({ request: req('/api/suggest', { ...BODY, turns: [TURNS[0]] }), env: { AI } })).status, 400);
  assert.equal((await suggest({ request: req('/api/suggest', BODY), env: {} })).status, 500);
  assert.equal(AI.calls.length, 0);
});

test('/api/suggest 요청 제한은 번역과 따로 센다 (추천 때문에 번역이 막히지 않게)', async () => {
  const AI = fakeAI((m, input) => (input.messages[0].content.includes('Suggest') ? { response: '[]' } : { response: 'Merhaba.' }));
  for (let i = 0; i < 30; i++) assert.equal((await suggest({ request: req('/api/suggest', BODY, { ip: '6.6.6.6' }), env: { AI } })).status, 200);
  const limited = await suggest({ request: req('/api/suggest', BODY, { ip: '6.6.6.6' }), env: { AI } });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'rate_limited');
  const tr = await translate({ request: req('/api/translate', { text: '안녕하세요', from: 'ko', to: 'tr' }, { ip: '6.6.6.6' }), env: { AI } });
  assert.equal(tr.status, 200, '같은 IP라도 번역은 그대로');
});

test('설정: 답장 추천은 기본으로 켜져 있고, 다섯 언어 문구가 있다', () => {
  assert.equal(DEFAULTS.suggest, true);
  for (const l of Object.keys(MESSAGES)) for (const k of ['set.suggest', 'set.suggestHint', 'suggest.title', 'suggest.loading', 'suggest.hint', 'suggest.use', 'suggest.used']) assert.ok(MESSAGES[l][k], `${l}.${k}`);
});
