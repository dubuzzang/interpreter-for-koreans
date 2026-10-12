// 대화 기록 공유(v1.4.0): 공유 글 형식 · 합의 내용 요약(지시문 · 정리 · 지어낸 값 비우기 · /api/summary)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText, otherLang, hasSummary, SUMMARY_FIELDS } from '../public/js/share.js';
import { validateSummary, buildSummaryMessages, cleanSummary, wrongScript, SUMMARY_FIELDS as SERVER_FIELDS, SUMMARY_MAX_TOKENS } from '../lib/assist-core.mjs';
import { onRequestPost as summary } from '../functions/api/summary.js';
import { onRequestPost as suggest } from '../functions/api/suggest.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { tl, MESSAGES } from '../public/js/i18n.js';
import { LANGS, CODES } from '../public/js/lang.js';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const req = (path, body, { origin = ORIGIN, ip = '7.1.1.1' } = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(origin ? { origin } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const fakeAI = (fn) => ({ calls: [], async run(model, input) { this.calls.push({ model, input }); return fn(model, input, this.calls.length); } });

const D1 = new Date(2026, 9, 12, 14, 3).getTime();
const ITEMS = [
  { id: 'a', side: 'me', from: 'ko', to: 'zh', text: '단가가 얼마예요? 백 개 사면 더 싸게 해 주실 수 있어요?', translation: '单价是多少？如果买一百个，能便宜点吗？', at: D1 },
  { id: 'b', side: 'partner', from: 'zh', to: 'ko', text: '一百个的话每个十五块，包邮，三天发货。', translation: '100개면 개당 15위안이고, 무료 배송, 3일 안에 발송해요.', at: D1 + 60_000 },
  { id: 'c', side: 'me', from: 'ko', to: 'zh', text: '좋아요. 100개 주문할게요.', translation: '好的。我订100个。', at: D1 + 120_000 },
];
const fmt = { tl, time: (at) => new Date(at).toTimeString().slice(0, 5), date: (at) => `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}`, flag: (l) => LANGS[l].flag };

test('공유 글: 제목(두 언어) · 날짜 · [시각] 국기 말한 쪽 · 원문 · → 번역, 시간 순', () => {
  const text = buildShareText([ITEMS[2], ITEMS[0], ITEMS[1]], { ...fmt, me: 'ko', other: 'zh' });
  assert.equal(text, [
    'Tercüman · 대화 기록 · 对话记录 · 10/12',
    '',
    '■ 대화 · 对话 (3)',
    '',
    '[14:03] 🇰🇷 나',
    '단가가 얼마예요? 백 개 사면 더 싸게 해 주실 수 있어요?',
    '→ 🇨🇳 单价是多少？如果买一百个，能便宜点吗？',
    '',
    '[14:04] 🇨🇳 상대',
    '一百个的话每个十五块，包邮，三天发货。',
    '→ 🇰🇷 100개면 개당 15위안이고, 무료 배송, 3일 안에 발송해요.',
    '',
    '[14:05] 🇰🇷 나',
    '좋아요. 100개 주문할게요.',
    '→ 🇨🇳 好的。我订100个。',
  ].join('\n'));
});

test('공유 글: 확인한 합의 내용 요약은 맨 위에, 항목 이름은 두 언어, 빈 칸은 빼고 같은 값은 한 번만', () => {
  const s = {
    price: { me: '개당 15위안', partner: '每个15块' },
    quantity: { me: '100개', partner: '100个' },
    delivery: { me: '', partner: '' },
    other: { me: '무료 배송', partner: '包邮' },
  };
  const text = buildShareText(ITEMS, { ...fmt, me: 'ko', other: 'zh', summary: s });
  const head = text.split('\n').slice(0, 6);
  assert.deepEqual(head, [
    'Tercüman · 대화 기록 · 对话记录 · 10/12',
    '',
    '■ 합의 내용 · 协议内容',
    '· 단가 · 单价: 개당 15위안 / 每个15块',
    '· 수량 · 数量: 100개 / 100个',
    '· 기타 조건 · 其他条件: 무료 배송 / 包邮',
  ]);
  assert.doesNotMatch(text, /배송일|交货日期/, '빈 칸은 뺀다');
  assert.match(buildShareText(ITEMS, { ...fmt, me: 'ko', other: 'zh', summary: { ...s, quantity: { me: '100', partner: '100' } } }), /· 수량 · 数量: 100\n/);
  assert.doesNotMatch(buildShareText(ITEMS, { ...fmt, me: 'ko', other: 'zh', summary: { price: { me: ' ', partner: '' } } }), /■ 합의/, '채운 칸이 없으면 요약 없음');
  assert.ok(hasSummary(s));
  assert.ok(!hasSummary({ price: { me: '', partner: '' } }));
  assert.ok(!hasSummary(null));
  assert.deepEqual(SUMMARY_FIELDS, SERVER_FIELDS);
});

test('공유 글: 날짜가 여럿이면 날짜 줄, 글 번역은 "글 번역", 다른 화면 언어(튀르키예어 사용자)도', () => {
  const day2 = { id: 'd', side: 'text', from: 'ko', to: 'en', text: '영수증 주세요', translation: 'Receipt, please.', at: D1 + 86_400_000 };
  const text = buildShareText([...ITEMS, day2], { ...fmt, me: 'ko', other: 'zh' });
  assert.match(text, /^Tercüman · 대화 기록 · 对话记录\n/, '날짜가 여럿이면 제목에 날짜 없음');
  assert.match(text, /— 10\/12 —[\s\S]*— 10\/13 —\n\n\[14:03\] 🇰🇷 글 번역\n영수증 주세요\n→ 🇺🇸 Receipt, please\./);
  const tr = buildShareText([{ ...ITEMS[1], side: 'me' }], { ...fmt, me: 'tr', other: 'zh' });
  assert.match(tr, /^Tercüman · Konuşma kaydı · 对话记录/);
  assert.match(tr, /🇨🇳 Ben\n/);
  const same = buildShareText(ITEMS, { ...fmt, me: 'ko', other: 'ko' });
  assert.match(same, /^Tercüman · 대화 기록 · 10\/12/, '상대 언어가 같으면 한 번만');
  assert.equal(buildShareText([{ ...ITEMS[0], translation: '' }], { ...fmt, me: 'ko', other: 'zh' }).includes('단가'), false, '번역 없는 말은 뺀다');
});

test('상대 언어: 고른 말에서 내 언어가 아닌 것 중 가장 많이 나온 것', () => {
  assert.equal(otherLang(ITEMS, 'ko', 'tr'), 'zh');
  assert.equal(otherLang([], 'ko', 'tr'), 'tr');
  assert.equal(otherLang([{ from: 'ko', to: 'en' }, { from: 'ja', to: 'ko' }, { from: 'ko', to: 'ja' }], 'ko', 'tr'), 'ja');
  for (const c of CODES) for (const k of ['share.heading', 'share.agreed', 'share.talk', 'share.price', 'share.quantity', 'share.delivery', 'share.other']) assert.ok(MESSAGES[c][k], `${c}.${k}`);
});

// ---------- 요약 ----------
const BODY = { me: 'ko', partner: 'zh', turns: ITEMS.map(({ side, from, to, text, translation }) => ({ side, from, to, text, translation })) };

test('요약 요청 검사 · 지시문: 대화에 있는 것만 · 계산·지어내기 금지 · 없으면 빈칸 · 두 언어 JSON', () => {
  const v = validateSummary(BODY).value;
  assert.equal(v.turns.length, 3);
  assert.equal(validateSummary({ ...BODY, turns: [] }).code, 'empty');
  assert.equal(validateSummary({ ...BODY, partner: 'ko' }).code, 'unsupported_lang');
  assert.equal(validateSummary({ ...BODY, turns: Array(60).fill(BODY.turns[0]) }).value.turns.length, 40);
  const [sys, user] = buildSummaryMessages(v);
  assert.match(sys.content, /price: unit price/);
  assert.match(sys.content, /quantity/);
  assert.match(sys.content, /delivery/);
  assert.match(sys.content, /other: other agreed conditions/);
  assert.match(sys.content, /If a field was not mentioned, leave it empty ""/);
  assert.match(sys.content, /NEVER calculate or invent numbers \(no totals\)/);
  assert.match(sys.content, /\{"price":\{"ko":"","zh":""\},"quantity":\{"ko":"","zh":""\},"delivery":\{"ko":"","zh":""\},"other":\{"ko":"","zh":""\}\}/);
  assert.match(user.content, /\[Other person, Chinese\] 一百个的话每个十五块/);
  assert.ok(SUMMARY_MAX_TOKENS <= 500);
});

test('요약 정리: 대화에 없는 숫자(합계 등)를 쓴 칸은 두 언어 모두 비우고, "없음"은 빈칸, 언어가 뒤바뀐 칸도 비운다', () => {
  const v = validateSummary(BODY).value;
  const raw = JSON.stringify({
    price: { ko: '개당 15위안 (총 1500위안)', zh: '每个15块（共1500块）' }, // 합계는 대화에 없음
    quantity: { ko: '100개', zh: '100个' },
    delivery: { ko: '3일 안에 발송', zh: '三天内发货' },
    other: { ko: '없음', zh: '无' },
  });
  const out = cleanSummary(`Here:\n\`\`\`json\n${raw}\n\`\`\``, v);
  assert.deepEqual(out.fields, {
    price: { me: '', partner: '' },
    quantity: { me: '100개', partner: '100个' },
    delivery: { me: '3일 안에 발송', partner: '三天内发货' },
    other: { me: '', partner: '' },
  });
  assert.equal(out.filled, 2);
  const swapped = cleanSummary({ price: { ko: '每个15块', zh: '개당 15위안' } }, v);
  assert.deepEqual(swapped.fields.price, { me: '', partner: '' });
  const placeholder = cleanSummary({ quantity: { ko: '○○개', zh: '○○个' } }, v);
  assert.deepEqual(placeholder.fields.quantity, { me: '', partner: '' });
  assert.equal(cleanSummary('not json', v), null);
  assert.equal(cleanSummary('[1,2]', v), null);
  assert.equal(cleanSummary('{}', v).filled, 0, '빈 요약도 정상 (화면은 "찾지 못했어요")');
  assert.ok(wrongScript('每个15块', 'ko') && wrongScript('개당', 'zh') && wrongScript('Merhaba 你好', 'tr'));
  assert.ok(!wrongScript('100', 'ko') && !wrongScript('15 USD', 'zh') && !wrongScript('3日以内', 'ja'));
});

test('/api/summary: 가짜 AI로 요약 · 다음 모델 · 오류 코드 · 출처 확인 · 요청 제한은 따로("summary")', async () => {
  const good = JSON.stringify({ price: { ko: '개당 15위안', zh: '每个15块' }, quantity: { ko: '100개', zh: '100个' }, delivery: { ko: '3일 안에 발송', zh: '三天内发货' }, other: { ko: '무료 배송', zh: '包邮' } });
  let AI = fakeAI(() => ({ response: good }));
  let res = await summary({ request: req('/api/summary', BODY), env: { AI } });
  assert.equal(res.status, 200);
  let data = await res.json();
  assert.equal(data.filled, 4);
  assert.equal(data.fields.price.partner, '每个15块');
  assert.equal(data.model, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(AI.calls[0].input.temperature, 0);
  assert.equal(AI.calls[0].input.chat_template_kwargs.enable_thinking, false);

  AI = fakeAI((m, i, n) => (n === 1 ? { response: 'I cannot.' } : { response: good }));
  data = await (await summary({ request: req('/api/summary', BODY), env: { AI } })).json();
  assert.equal(data.filled, 4);
  assert.equal(AI.calls.length, 2);

  AI = fakeAI(() => { throw new Error('3040: Capacity temporarily exceeded'); });
  res = await summary({ request: req('/api/summary', BODY), env: { AI } });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'busy');

  AI = fakeAI(() => ({ response: good }));
  assert.equal((await summary({ request: req('/api/summary', BODY, { origin: null }), env: { AI } })).status, 403);
  assert.equal((await summary({ request: req('/api/summary', { ...BODY, turns: [] }), env: { AI } })).status, 400);
  assert.equal((await summary({ request: req('/api/summary', BODY), env: {} })).status, 500);
  assert.equal(AI.calls.length, 0);

  for (let i = 0; i < 10; i++) assert.equal((await summary({ request: req('/api/summary', BODY, { ip: '7.7.7.8' }), env: { AI } })).status, 200);
  assert.equal((await summary({ request: req('/api/summary', BODY, { ip: '7.7.7.8' }), env: { AI } })).status, 429);
  const sAI = fakeAI(() => ({ response: '[{"ko":"네, 좋아요.","zh":"好的。"}]' }));
  const sBody = { me: 'ko', partner: 'zh', turns: BODY.turns.slice(0, 2) };
  assert.equal((await suggest({ request: req('/api/suggest', sBody, { ip: '7.7.7.8' }), env: { AI: sAI } })).status, 200, '요약 제한과 추천 제한은 따로');
});
