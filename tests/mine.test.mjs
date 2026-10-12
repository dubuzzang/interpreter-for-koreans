// 내 표현(v1.4.0): 기기 저장 · 별표 · 직접 추가 · 번역 채우기 · 고치기 · 순서 · 인터넷 없이 읽는 법
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../public/js/mine.js';
import { PHRASES, phraseSound } from '../public/js/phrases.js';
import { readingFor } from '../public/js/reading.js';
import { assetList } from '../scripts/gen-sw.mjs';
import { MESSAGES } from '../public/js/i18n.js';

const fakeStorage = (init = {}) => {
  const data = { ...init };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};
const PRICE = PHRASES.find((p) => p.ko === '단가가 얼마예요?');
const HELLO = PHRASES.find((p) => p.ko === '안녕하세요.');

test('기기에만 저장: 설정·기록(tercuman.v1)과 따로, 망가진 값은 버리고 빈 목록', () => {
  const old = JSON.stringify({ settings: { me: 'ko', partner: 'zh' }, history: [{ id: 'h1', side: 'me', from: 'ko', to: 'zh', text: '안녕', translation: '你好' }] });
  const s = fakeStorage({ 'tercuman.v1': old });
  assert.equal(M.MINE_KEY, 'tercuman.mine.v1');
  assert.deepEqual(M.loadMine(s), []);
  const item = M.createItem({ text: '제 배송 주소는 서울시 강남구 테헤란로 123이에요.', lang: 'ko', label: '내 배송 주소' });
  assert.ok(M.saveMine([item], s));
  assert.equal(s.data['tercuman.v1'], old, '예전 설정·기록은 그대로');
  const back = M.loadMine(s);
  assert.equal(back.length, 1);
  assert.deepEqual(back[0], item);
  assert.deepEqual(M.loadMine(fakeStorage({ 'tercuman.mine.v1': '{broken' })), []);
  assert.deepEqual(M.loadMine(fakeStorage({ 'tercuman.mine.v1': JSON.stringify([{ id: 'x' }, null, 3, { id: 'y', orig: 'ko', texts: { ko: '좋아요' } }]) })).map((x) => x.id), ['y']);
  assert.deepEqual(M.loadMine(null), [], '저장소가 없어도');
  const full = fakeStorage();
  M.saveMine(Array.from({ length: M.MAX_MINE + 5 }, (_, i) => M.createItem({ text: `문장 ${i}`, lang: 'ko' })), full);
  assert.equal(M.loadMine(full).length, M.MAX_MINE);
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(M.loadMine(throwing), []);
  assert.equal(M.saveMine([item], throwing), false);
});

test('별표: 표현집 문장을 다섯 언어 글 · 읽기와 함께 저장 (번역이 필요 없다), 다시 누르면 뺀다', () => {
  let list = [];
  assert.equal(M.isStarred(list, PRICE), false);
  list = M.toggleStar(list, PRICE);
  assert.equal(list.length, 1);
  assert.ok(M.isStarred(list, PRICE));
  const it = list[0];
  assert.equal(it.ref, 'order|단가가 얼마예요?');
  for (const c of ['ko', 'tr', 'en', 'ja', 'zh']) assert.equal(it.texts[c], PRICE[c], c);
  assert.equal(it.sound.zh, PRICE.zhPinyin);
  assert.equal(it.sound.ja, PRICE.jaKana);
  for (const me of ['ko', 'tr', 'en', 'ja', 'zh']) for (const partner of ['ko', 'tr', 'en', 'ja', 'zh']) if (me !== partner) assert.deepEqual(M.missingLangs(it, me, partner), []);
  list = M.toggleStar(list, HELLO);
  assert.deepEqual(list.map((x) => x.ref), ['order|단가가 얼마예요?', 'greet|안녕하세요.'], '새 별표는 뒤에');
  list = M.toggleStar(list, PRICE);
  assert.deepEqual(list.map((x) => x.ref), ['greet|안녕하세요.']);
});

test('직접 추가: 내 언어로 쓰고, 상대 언어 번역은 채워야 할 것으로 남는다 → 받으면 같이 저장', () => {
  const it = M.createItem({ text: '  100개 주문할게요.\n\n\n\n샘플 먼저 보내 주세요.  ', lang: 'ko', label: '주문 조건' });
  assert.equal(it.orig, 'ko');
  assert.equal(it.texts.ko, '100개 주문할게요.\n\n샘플 먼저 보내 주세요.');
  assert.equal(it.label, '주문 조건');
  assert.deepEqual(M.missingLangs(it, 'ko', 'zh'), ['zh']);
  assert.equal(M.sayText(it, 'zh'), '');
  assert.equal(M.myText(it, 'ko'), it.texts.ko);
  const done = M.withSound(M.withText(it, 'zh', '我要订100个。请先寄样品。'), 'zh', 'Wǒ yào dìng 100 gè. Qǐng xiān jì yàngpǐn.');
  assert.deepEqual(M.missingLangs(done, 'ko', 'zh'), []);
  assert.equal(it.texts.zh, undefined, '원래 항목은 그대로 (새 항목을 돌려준다)');
  // 상대 언어가 바뀌면 그 언어만 새로 필요, 내 언어를 바꿔도 마찬가지 (그동안은 처음 쓴 글을 보여 준다)
  assert.deepEqual(M.missingLangs(done, 'ko', 'tr'), ['tr']);
  assert.deepEqual(M.missingLangs(done, 'en', 'zh'), ['en']);
  assert.equal(M.myText(done, 'en'), done.texts.ko);
  assert.equal(M.myLang(done, 'en'), 'ko');
  assert.equal(M.createItem({ text: 'x'.repeat(900), lang: 'ko', label: 'y'.repeat(90) }).texts.ko.length, M.MAX_MINE_TEXT);
  assert.equal(M.createItem({ text: 'x', lang: 'ko', label: 'y'.repeat(90) }).label.length, M.MAX_LABEL);
});

test('인터넷 없이: 저장된 글 · 병음으로 읽는 법이 바로 나온다 (서버를 부르지 않음), 앱 파일은 서비스 워커가 미리 저장', () => {
  const s = fakeStorage();
  const it = M.withSound(M.withText(M.createItem({ text: '샘플 먼저 보내 주세요.', lang: 'ko' }), 'zh', '请先寄样品。'), 'zh', 'qǐng xiān jì yàngpǐn.');
  M.saveMine([it, ...M.toggleStar([], PRICE)], s);
  const [own, fav] = M.loadMine(s);
  assert.equal(readingFor(M.sayText(own, 'zh'), 'zh', 'ko', own.sound.zh), '칭 셴 지 양핀.\nQǐng xiān jì yàngpǐn.');
  assert.equal(readingFor(M.sayText(fav, 'zh'), 'zh', 'ko', fav.sound.zh), readingFor(PRICE.zh, 'zh', 'ko', phraseSound(PRICE, 'zh')));
  assert.equal(readingFor(M.sayText(fav, 'tr'), 'tr', 'ko'), '비림 피야트 네 카다르?', '튀르키예어는 화면에서 바로');
  for (const f of ['/js/mine.js', '/js/views/phrases.js', '/js/phrases.js', '/js/reading.js', '/js/pinyin.js']) assert.ok(assetList().includes(f), f);
});

test('고치기: 내 말을 바꾸면 다른 언어 번역은 다시 받고, 상대 말만 고치면 그것을 쓴다, 이름만 바꾸면 그대로', () => {
  const base = M.withSound(M.withText(M.createItem({ text: '100개 주문할게요.', lang: 'ko', label: '주문' }), 'zh', '我要订100个。'), 'zh', 'wǒ yào dìng 100 gè.');
  const renamed = M.editItem(base, { me: 'ko', partner: 'zh', label: '주문 조건' });
  assert.equal(renamed.label, '주문 조건');
  assert.deepEqual(renamed.texts, base.texts);
  assert.deepEqual(renamed.sound, base.sound);

  const mineChanged = M.editItem(base, { me: 'ko', partner: 'zh', mine: '200개 주문할게요.', say: '我要订100个。' });
  assert.deepEqual(mineChanged.texts, { ko: '200개 주문할게요.' }, '예전 번역은 지움');
  assert.deepEqual(mineChanged.sound, {});
  assert.deepEqual(M.missingLangs(mineChanged, 'ko', 'zh'), ['zh']);

  const both = M.editItem(base, { me: 'ko', partner: 'zh', mine: '200개 주문할게요.', say: '我要订两百个。' });
  assert.deepEqual(both.texts, { ko: '200개 주문할게요.', zh: '我要订两百个。' });
  assert.equal(both.manual.zh, true);

  const sayOnly = M.editItem(base, { me: 'ko', partner: 'zh', mine: '100개 주문할게요.', say: '我想订100个。' });
  assert.equal(sayOnly.texts.ko, '100개 주문할게요.');
  assert.equal(sayOnly.texts.zh, '我想订100个。');
  assert.equal(sayOnly.sound.zh, undefined, '읽기는 새로 받는다');

  const cleared = M.editItem(base, { me: 'ko', partner: 'zh', mine: '100개 주문할게요.', say: '' });
  assert.deepEqual(M.missingLangs(cleared, 'ko', 'zh'), ['zh'], '비우면 다시 번역');

  // 표현집 별표 문장도 글을 고치면 내 문장 (별표와 연결이 끊긴다)
  const fav = M.toggleStar([], PRICE)[0];
  assert.ok(M.editItem(fav, { me: 'ko', partner: 'zh', label: '단가' }).ref, '이름만 바꾸면 별표 그대로');
  const own = M.editItem(fav, { me: 'ko', partner: 'zh', mine: '개당 단가가 얼마예요?' });
  assert.equal(own.ref, undefined);
  assert.deepEqual(own.texts, { ko: '개당 단가가 얼마예요?' });
  assert.equal(M.editItem(base, { me: 'ko', partner: 'zh', mine: '   ' }).texts.ko, '100개 주문할게요.', '빈 글로는 안 바뀜');
});

test('순서 바꾸기 · 지우기', () => {
  const [a, b, c] = ['가', '나', '다'].map((text) => M.createItem({ text, lang: 'ko' }));
  const list = [a, b, c];
  assert.deepEqual(M.moveItem(list, c.id, -1).map((x) => x.texts.ko), ['가', '다', '나']);
  assert.deepEqual(M.moveItem(list, a.id, 1).map((x) => x.texts.ko), ['나', '가', '다']);
  assert.equal(M.moveItem(list, a.id, -1), list, '맨 위에서 위로는 그대로');
  assert.equal(M.moveItem(list, c.id, 1), list);
  assert.equal(M.moveItem(list, 'none', 1), list);
  assert.deepEqual(M.removeItem(list, b.id).map((x) => x.texts.ko), ['가', '다']);
  assert.deepEqual(M.replaceItem(list, { ...b, label: '둘' }).map((x) => x.label), ['', '둘', '']);
});

test('화면 문구: 내 표현 · 예시 자리(내 배송 주소 · 주문 조건)가 다섯 언어에', () => {
  for (const l of Object.keys(MESSAGES)) {
    for (const k of ['cat.mine', 'mine.exAddress', 'mine.exAddressText', 'mine.exTerms', 'mine.exTermsText', 'mine.note', 'mine.saveHint']) assert.ok(MESSAGES[l][k], `${l}.${k}`);
    assert.match(MESSAGES[l]['mine.saveHint'], /\{lang\}/);
  }
  assert.equal(MESSAGES.ko['mine.exAddress'], '내 배송 주소');
  assert.equal(MESSAGES.ko['mine.exTerms'], '주문 조건');
});
