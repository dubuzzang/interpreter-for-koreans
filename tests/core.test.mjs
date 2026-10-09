import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTranslate, buildMessages, cleanOutput, responseText, looksValid, aiError, cleanTranscript, toBase64, maxTokensFor, MODELS, MAX_TEXT,
} from '../lib/translate-core.mjs';

test('요청 검사: 글·언어·길이·맥락', () => {
  assert.ok(validateTranslate({ text: '안녕', from: 'ko', to: 'tr' }).value);
  assert.match(validateTranslate({ text: '  ', from: 'ko', to: 'tr' }).error, /비어/);
  assert.match(validateTranslate({ text: 'x', from: 'ko', to: 'zh' }).error, /지원하지/);
  assert.ok(validateTranslate({ text: 'こんにちは', from: 'ja', to: 'tr' }).value, '일본어 지원');
  assert.match(validateTranslate({ text: 'x'.repeat(MAX_TEXT + 1), from: 'ko', to: 'en' }).error, /1000자/);
  assert.match(validateTranslate(null).error, /형식/);
  const v = validateTranslate({ text: 'a', from: 'en', to: 'ko', context: [{ lang: 'ko', text: '가' }, { lang: 'xx', text: 'bad' }, { lang: 'tr', text: '' }, ...Array(6).fill({ lang: 'en', text: 'y'.repeat(400) })] }).value;
  assert.ok(v.context.length <= 4 && v.context.every((c) => c.text.length <= 300 && ['ko', 'tr', 'en'].includes(c.lang)));
  assert.equal(v.formal, true);
  assert.equal(validateTranslate({ text: 'a', from: 'en', to: 'ko', formal: false }).value.formal, false);
});

test('통역 지시문: 언어·말투·맥락이 들어가고, 원문은 사용자 메시지로만', () => {
  const [sys, user] = buildMessages({ text: '이거 얼마예요?', from: 'ko', to: 'tr', context: [{ lang: 'tr', text: 'Hoş geldiniz' }], formal: true });
  assert.equal(sys.role, 'system');
  assert.match(sys.content, /from Korean into Turkish/);
  assert.match(sys.content, /Output ONLY the Turkish translation/);
  assert.match(sys.content, /siz/);
  assert.match(sys.content, /\[Turkish\] Hoş geldiniz/);
  assert.deepEqual(user, { role: 'user', content: '이거 얼마예요?' });
  assert.match(buildMessages({ text: 'x', from: 'en', to: 'ko', formal: false })[0].content, /반말/);
  assert.doesNotMatch(buildMessages({ text: 'x', from: 'en', to: 'ko' })[0].content, /Recent conversation/);
});

test('모델 출력 정리: 따옴표·이름표·설명 줄·생각 태그', () => {
  assert.equal(cleanOutput('"Bu ne kadar?"'), 'Bu ne kadar?');
  assert.equal(cleanOutput('Translation: Bu ne kadar?'), 'Bu ne kadar?');
  assert.equal(cleanOutput('Çeviri: Teşekkürler.'), 'Teşekkürler.');
  assert.equal(cleanOutput('번역: 감사합니다.'), '감사합니다.');
  assert.equal(cleanOutput('Bu ne kadar?\n\n(Note: informal alternative: Kaç para?)', '이거 얼마예요?'), 'Bu ne kadar?');
  assert.equal(cleanOutput('<think>hmm</think>Merhaba.'), 'Merhaba.');
  assert.equal(cleanOutput('```\nHello\n```'), 'Hello');
  assert.equal(cleanOutput('“Merhaba”'), 'Merhaba');
  assert.equal(cleanOutput('"Quoted" source stays', '"Quoted" source stays'), '"Quoted" source stays');
  assert.equal(cleanOutput('line one\nline two', 'a\nb'), 'line one\nline two');
});

test('응답 모양이 달라도 글을 꺼낸다', () => {
  assert.equal(responseText({ response: 'Merhaba' }), 'Merhaba');
  assert.equal(responseText({ choices: [{ message: { content: 'Hi' } }] }), 'Hi');
  assert.equal(responseText({ translated_text: 'Selam' }), 'Selam');
  assert.equal(responseText({ output: [{ content: [{ text: 'A' }, { text: 'B' }] }] }), 'AB');
  assert.equal(responseText('plain'), 'plain');
  assert.equal(responseText(null), '');
});

test('번역 결과 점검: 빈 답·원문 그대로·글자 체계가 틀린 답은 다음 모델로', () => {
  assert.ok(looksValid('Bu ne kadar?', { text: '이거 얼마예요?', from: 'ko', to: 'tr' }));
  assert.ok(!looksValid('', { text: 'a', from: 'ko', to: 'tr' }));
  assert.ok(!looksValid('Thank you very much', { text: 'Thank you very much', from: 'en', to: 'tr' }));
  assert.ok(!looksValid('Hello', { text: 'Merhaba', from: 'tr', to: 'ko' }), '한국어로 옮겼는데 한글이 없음');
  assert.ok(!looksValid('이거 얼마예요?', { text: '이거 얼마예요?', from: 'ko', to: 'en' }), '영어로 옮겼는데 한글');
  assert.ok(!looksValid('x'.repeat(500), { text: 'hi', from: 'en', to: 'tr' }), '터무니없이 김');
  assert.ok(looksValid('OK', { text: 'OK', from: 'en', to: 'tr' }), '짧은 낱말은 같아도 된다');
});

test('오류 안내: 무료 한도 · 늦음 · 바쁨 · 그 밖', () => {
  assert.equal(aiError(new Error('4006: you have used up your daily free allocation of 10,000 neurons')).status, 503);
  assert.match(aiError(new Error('4006 daily free allocation')).error, /한도/);
  assert.equal(aiError(new Error('timeout after 9000ms')).status, 504);
  assert.equal(aiError(new Error('3040: Capacity temporarily exceeded')).status, 503);
  assert.equal(aiError(new Error('weird')).status, 502);
  assert.match(aiError(new Error('weird'), '음성 인식').error, /음성 인식하지 못했어요/);
});

test('Whisper가 조용한 녹음에서 지어내는 말은 버린다', () => {
  assert.equal(cleanTranscript('Altyazı M.K.'), '');
  assert.equal(cleanTranscript('시청해 주셔서 감사합니다.'), '');
  assert.equal(cleanTranscript('Thank you for watching!'), '');
  assert.equal(cleanTranscript(' Merhaba,  nasılsınız? '), 'Merhaba, nasılsınız?');
  assert.equal(cleanTranscript('감사합니다만 그건 아니에요'), '감사합니다만 그건 아니에요');
});

test('base64 · 답 길이 · 모델 목록', () => {
  assert.equal(toBase64(new TextEncoder().encode('Merhaba').buffer), Buffer.from('Merhaba').toString('base64'));
  const big = new Uint8Array(200000).map((_, i) => i % 251);
  assert.equal(toBase64(big.buffer), Buffer.from(big).toString('base64'));
  assert.ok(maxTokensFor('hi') >= 64 && maxTokensFor('x'.repeat(1000)) === 800);
  assert.match(MODELS[0].id, /gemma-4/);
  assert.equal(MODELS[0].extra.chat_template_kwargs.enable_thinking, false, '생각 기능을 꺼야 1~2초에 답한다');
  assert.ok(MODELS.every((m) => m.timeoutMs > 0));
  assert.ok(!MODELS.some((m) => /m2m100/.test(m.id)), '뜻이 틀린 번역을 내는 m2m100은 쓰지 않는다');
});
