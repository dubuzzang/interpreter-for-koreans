// 일본어: 번역 지시문 · 결과 점검 · 읽기(히라가나 → 한글 발음) · 읽기 API · 표현집
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, looksValid, cleanTranscript, validateKana, cleanKana, buildKanaMessages, CODES } from '../lib/translate-core.mjs';
import { onRequestPost as kanaApi } from '../functions/api/kana.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { jaKanaToHangul, readingFor } from '../public/js/reading.js';
import { detectLang, LANGS } from '../public/js/lang.js';
import { MESSAGES } from '../public/js/i18n.js';
import { PHRASES, phrasesFor } from '../public/js/phrases.js';

beforeEach(() => _resetBuckets());

test('모든 언어끼리 서로 통역 (지시문에 일본어 말투 규칙)', () => {
  assert.deepEqual(CODES, ['ko', 'tr', 'en', 'ja', 'zh', 'zh-TW', 'vi', 'th', 'ru', 'ar']);
  const [sys] = buildMessages({ text: '안녕', from: 'ko', to: 'ja' });
  assert.match(sys.content, /from Korean into Japanese/);
  assert.match(sys.content, /です・ます/);
  assert.match(buildMessages({ text: 'x', from: 'en', to: 'ja', formal: false })[0].content, /タメ口/);
  assert.match(sys.content, /no romaji/);
});

test('일본어 결과 점검: 일본어 글자가 있어야 하고, 다른 언어로 옮길 땐 가나가 남으면 안 된다', () => {
  assert.ok(looksValid('これはいくらですか？', { text: '이거 얼마예요?', from: 'ko', to: 'ja' }));
  assert.ok(!looksValid('Kore wa ikura desu ka?', { text: '이거 얼마예요?', from: 'ko', to: 'ja' }), '로마자만');
  assert.ok(!looksValid('これはいくらですか？', { text: 'これはいくらですか？', from: 'ja', to: 'tr' }), '안 옮김');
  assert.ok(looksValid('Bu ne kadar?', { text: 'これはいくらですか？', from: 'ja', to: 'tr' }));
  assert.ok(looksValid('이거 얼마예요?', { text: 'これはいくらですか？', from: 'ja', to: 'ko' }));
  assert.ok(!looksValid('How much is これ?', { text: 'これはいくらですか？', from: 'ja', to: 'en' }), '가나가 섞임');
});

test('Whisper가 일본어 무음에서 지어내는 말', () => {
  assert.equal(cleanTranscript('ご視聴ありがとうございました'), '');
  assert.equal(cleanTranscript('チャンネル登録よろしくお願いします'), '');
  assert.equal(cleanTranscript('駅はどこですか？'), '駅はどこですか？');
});

test('읽기 요청 검사 · 지시문 · 결과 정리(가타카나 → 히라가나, 한자가 남으면 버림)', () => {
  assert.ok(validateKana({ text: '駅はどこですか？' }).value);
  assert.match(validateKana({ text: 'hello' }).error, /일본어/);
  assert.match(validateKana({ text: '' }).error, /비어/);
  assert.match(buildKanaMessages('駅')[0].content, /particles は, へ, を/);
  assert.equal(cleanKana('えきわ どこ ですか？'), 'えきわ どこ ですか？');
  assert.equal(cleanKana('「エキワ ドコ デスカ」'), 'えきわ どこ ですか');
  assert.equal(cleanKana('Reading: めにゅーお ください'), 'めにゅーお ください');
  assert.equal(cleanKana('駅わ どこ'), '', '한자가 남음');
  assert.equal(cleanKana('eki wa doko'), '', '로마자');
});

test('일본어 읽기 → 한글 발음 (첫머리 예사소리 · っ ㅅ받침 · ん · 장음)', () => {
  const cases = {
    'こんにちわ': '곤니치와', 'ありがとう ございます': '아리가토 고자이마스', 'すみません': '스미마셍', 'はじめまして': '하지메마시테',
    'といれわ どこ ですか？': '도이레와 도코 데스카?', 'きっぷお いちまい ください': '깃푸오 이치마이 구다사이',
    'とうきょう': '도쿄', 'だいじょうぶ です': '다이조부 데스', 'わたしわ かんこくじん です': '와타시와 간코쿠진 데스',
    'にほんごわ あまり はなせません。': '니혼고와 아마리 하나세마셍.', 'めにゅーお いただけますか？': '메뉴오 이타다케마스카?',
    'わいふぁい': '와이파이', 'ゆっくり': '윳쿠리', 'チケット': '지켓토',
  };
  for (const [kana, ko] of Object.entries(cases)) assert.equal(jaKanaToHangul(kana), ko, kana);
  assert.equal(jaKanaToHangul(''), '');
  assert.equal(readingFor('駅はどこですか？', 'ja', 'ko', 'えきわ どこ ですか？'), '에키와 도코 데스카?');
  assert.equal(readingFor('駅はどこですか？', 'ja', 'ko'), '', '읽기를 아직 못 받았으면 비움');
  assert.equal(readingFor('駅はどこですか？', 'ja', 'tr', 'えきわ'), 'Ekiwa', '튀르키예어 사용자에게는 로마자로 (v1.2.0)');
  assert.equal(readingFor('안녕하세요', 'ko', 'ja'), 'Annyeonghaseyo', '일본 상대에게 한국어는 로마자로');
});

test('일본어 알아보기 · 언어 정보 · 상대 안내', () => {
  assert.equal(detectLang('トイレはどこですか？'), 'ja');
  assert.equal(detectLang('駅'), 'ja', '한자만 있어도 일본 글자체(駅)면 일본어');
  assert.equal(detectLang('안녕하세요'), 'ko');
  assert.equal(detectLang('Merhaba'), 'tr');
  assert.equal(LANGS.ja.bcp47, 'ja-JP');
  for (const k of Object.keys(MESSAGES.ko)) assert.ok(MESSAGES.ja[k], k);
  for (const c of CODES) assert.ok(MESSAGES[c]['mic.partnerHint'], c);
});

test('표현집: 모든 문장에 일본어와 히라가나 읽기, 상대가 일본어일 때 맞는 문장', () => {
  for (const p of PHRASES) {
    assert.match(p.ja, /[぀-ヿ一-鿿]/, p.ko);
    assert.match(p.ja, /[。？！]$/, `일본어 문장 끝: ${p.ja}`);
    assert.match(p.jaKana, /^[ぁ-ゖー ]+$/, `읽기는 히라가나만: ${p.jaKana}`);
    assert.ok(jaKanaToHangul(p.jaKana).length > 0);
  }
  const talk = phrasesFor('talk', 'ja');
  assert.ok(talk.some((p) => /일본어를/.test(p.ko)));
  assert.ok(!talk.some((p) => /영어를|튀르키예어를/.test(p.ko)));
});

test('읽기 API: 히라가나만 돌려주고, 한자가 섞인 답이면 다음 모델로', async () => {
  const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
  const req = (body, origin = ORIGIN) => new Request(`${ORIGIN}/api/kana`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '2.2.2.2' }, body: JSON.stringify(body) });
  let n = 0;
  const AI = { run: async () => (++n === 1 ? { response: '駅わ どこ ですか' } : { response: 'エキワ ドコ デスカ？' }) };
  const res = await kanaApi({ request: req({ text: '駅はどこですか？' }), env: { AI } });
  const data = await res.json();
  assert.equal(data.kana, 'えきわ どこ ですか？');
  assert.equal(n, 2);
  assert.equal((await kanaApi({ request: req({ text: 'hello' }), env: { AI } })).status, 400);
  assert.equal((await kanaApi({ request: req({ text: '駅' }, 'https://evil.example'), env: { AI } })).status, 403);
  const failing = { run: async () => { throw new Error('3040: Capacity temporarily exceeded'); } };
  assert.equal((await kanaApi({ request: req({ text: '駅' }), env: { AI: failing } })).status, 503);
});
