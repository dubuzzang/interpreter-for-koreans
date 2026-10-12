// 중국어(간체, v1.3.0): 번역 지시문 · 결과 점검 · 받아쓰기 · 병음 → 한글 · 읽는 법 · 병음 API · 표현집 · 화면 문구
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODES as SERVER_CODES, buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate,
  validatePinyin, buildPinyinMessages, cleanPinyin, pinyinMatches,
} from '../lib/translate-core.mjs';
import { onRequestPost as pinyinApi } from '../functions/api/pinyin.js';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { pinyinToHangul, pinyinText, pinyinSyllableCount, splitPinyinWord, hanCount } from '../public/js/pinyin.js';
import { readingFor, needsSound, needsKana } from '../public/js/reading.js';
import { LANGS, CODES, otherLangs } from '../public/js/lang.js';
import { MESSAGES, tl, defaultLang, startLangs, defaultPartner, pickLanguage } from '../public/js/i18n.js';
import { PHRASES, PHRASE_CATS, phrasesFor, phraseSound } from '../public/js/phrases.js';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';

test('중국어 언어 정보: 간체(zh-CN) · 모든 언어와 짝', () => {
  assert.deepEqual(LANGS.zh, { code: 'zh', native: '中文', flag: '🇨🇳', bcp47: 'zh-CN', short: 'ZH' });
  assert.deepEqual(SERVER_CODES, CODES);
  assert.deepEqual(otherLangs('zh'), ['ko', 'tr', 'en', 'ja']);
  for (const c of CODES.filter((x) => x !== 'zh')) {
    assert.ok(validateTranslate({ text: '你好', from: 'zh', to: c }).value, `zh → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'zh' }).value, `${c} → zh`);
  }
  assert.equal(defaultLang(['zh-CN', 'en']), 'zh');
  assert.equal(defaultLang(['zh-TW']), 'zh', '번체 브라우저도 중국어로 (간체 화면)');
  assert.equal(defaultPartner('zh'), 'ko');
  assert.deepEqual(startLangs({}, ['zh-CN']), { me: 'zh', partner: 'ko' });
  assert.deepEqual(startLangs({ settings: { me: 'ko', partner: 'tr' } }, ['zh-CN']), { me: 'ko', partner: 'tr' }, '이미 쓰던 사람은 그대로');
  assert.deepEqual(pickLanguage({ me: 'ko', partner: 'zh' }, 'zh'), { me: 'zh', partner: 'ko' });
});

test('번역 지시문: 간체 · 말투(您/你) · 병음을 덧붙이지 않게', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.match(sys('ko', 'zh'), /from Korean into Simplified Chinese/);
  assert.match(sys('ko', 'zh'), /Simplified Chinese characters as used in mainland China \(never Traditional\)/);
  assert.match(sys('ko', 'zh'), /您/);
  assert.match(sys('ko', 'zh', false), /你, not 您/);
  assert.match(sys('zh', 'ko'), /from Simplified Chinese into Korean/);
  assert.match(sys('zh', 'ko'), /존댓말/);
  assert.match(sys('ko', 'zh'), /between Korean, Turkish, English, Japanese and Chinese speakers/);
  assert.match(sys('ko', 'zh'), /No quotes, labels, notes, explanations, alternatives, romanization or pinyin/);
  assert.equal(sys('zh', 'en', true), sys('zh', 'en', false), '영어로 옮길 때는 말투 상관없음');
  const ctx = buildMessages({ text: 'x', from: 'ko', to: 'zh', context: [{ lang: 'zh', text: '你好' }] })[0].content;
  assert.match(ctx, /\[Simplified Chinese\] 你好/);
});

test('중국어 결과 점검: 한자가 있어야 하고 가나·한글이 섞이면 안 됨, 다른 언어로 옮길 땐 한자가 남으면 안 됨', () => {
  assert.ok(looksValid('这个多少钱？', { text: '이거 얼마예요?', from: 'ko', to: 'zh' }));
  assert.ok(!looksValid('Zhège duōshao qián?', { text: '이거 얼마예요?', from: 'ko', to: 'zh' }), '병음만');
  assert.ok(!looksValid('これはいくらですか？', { text: '이거 얼마예요?', from: 'ko', to: 'zh' }), '일본어로 옮김');
  assert.ok(!looksValid('这个 얼마예요?', { text: '이거 얼마예요?', from: 'ko', to: 'zh' }), '한글이 남음');
  assert.ok(looksValid('이거 얼마예요?', { text: '这个多少钱？', from: 'zh', to: 'ko' }));
  assert.ok(!looksValid('这个多少钱？', { text: '这个多少钱？', from: 'zh', to: 'ko' }));
  assert.ok(!looksValid('How much is 这个?', { text: '这个多少钱？', from: 'zh', to: 'en' }), '한자가 남음');
  assert.ok(looksValid('Bu ne kadar?', { text: '这个多少钱？', from: 'zh', to: 'tr' }));
  assert.ok(looksValid('これはいくらですか？', { text: '这个多少钱？', from: 'zh', to: 'ja' }));
  assert.ok(!looksValid('这个多少钱？', { text: '这个多少钱？', from: 'zh', to: 'ja' }), '원문 그대로');
  assert.ok(!looksValid('这个いくら？', { text: 'これはいくら？', from: 'ja', to: 'zh' }), '가나가 남음');
  assert.equal(cleanOutput('中文：这个多少钱？'), '这个多少钱？');
  assert.equal(cleanOutput('Chinese: 你好'), '你好');
  assert.equal(cleanOutput('翻译：谢谢'), '谢谢');
  assert.equal(cleanOutput('중국어: 谢谢'), '谢谢');
});

test('받아쓰기: Whisper에 중국어(간체 유도 문장)로 넘기고, 중국어 자막 끝인사는 버린다', async () => {
  for (const s of ['谢谢观看', '谢谢大家的观看！', '字幕由Amara.org社区提供', '请不吝点赞 订阅 转发 打赏支持明镜与点点栏目']) assert.equal(cleanTranscript(s), '', s);
  assert.equal(cleanTranscript('这个多少钱？'), '这个多少钱？');
  assert.equal(cleanTranscript('谢谢，我要两个。'), '谢谢，我要两个。');
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' 这个多少钱？ ' }; } };
  const req = (lang) => new Request(`${ORIGIN}/api/stt?lang=${lang}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '3.3.3.3' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req('zh'), env: { AI } })).json(), { text: '这个多少钱？' });
  assert.equal(calls[0].language, 'zh');
  assert.match(calls[0].initial_prompt, /简体中文/);
  await stt({ request: req('ko'), env: { AI } });
  assert.equal(calls[1].initial_prompt, undefined, '다른 언어는 그대로');
});

test('병음 → 한글: 국립국어원 외래어 표기법 (잘 알려진 표기와 같게)', () => {
  const cases = {
    Běijīng: '베이징', Shànghǎi: '상하이', Guǎngzhōu: '광저우', Shēnzhèn: '선전', Yìwū: '이우', Táobǎo: '타오바오', Qīngdǎo: '칭다오',
    "Tiān'ānmén": '톈안먼', "Xī'ān": '시안', Sìchuān: '쓰촨', Chóngqìng: '충칭', Huánghé: '황허', Kǒngzǐ: '쿵쯔', 'Máo Zédōng': '마오 쩌둥',
    'Xí Jìnpíng': '시 진핑', xièxie: '셰셰', 'nǐ hǎo!': '니 하오!', 'duōshao qián?': '둬사오 첸?', duìbuqǐ: '두이부치', 'méi guānxi': '메이 관시',
    'wǒ shì Hánguórén.': '워 스 한궈런.', piányi: '폔이', jiǔ: '주', jiā: '자', jiě: '제', xiū: '슈', 'lǜ': '뤼', "nǚ'ér": '뉘얼',
    yuè: '웨', yuǎn: '위안', juān: '쥐안', wèi: '웨이', duì: '두이', wèn: '원', dùn: '둔', wēng: '웡', yòng: '융', xióng: '슝',
    'zhī chī shī rì zì cì sì': '즈 츠 스 르 쯔 츠 쓰', nǎr: '날', 'WiFi mìmǎ': 'WiFi 미마', 'iPhone 15': 'iPhone 15', lv: '뤼',
  };
  for (const [py, ko] of Object.entries(cases)) assert.equal(pinyinToHangul(py), ko, py);
  assert.equal(pinyinToHangul(''), '');
});

test('병음 음절 나누기 · 세기 (한자 한 글자 = 한 음절)', () => {
  assert.deepEqual(splitPinyinWord('Hánguórén'), ['han', 'guo', 'ren'], '뒤가 안 풀리면 짧게 (hang-uo ×)');
  assert.deepEqual(splitPinyinWord("Tǔ'ěrqí"), ['tu', 'er', 'qi']);
  assert.deepEqual(splitPinyinWord('qǐdìngliàng'), ['qi', 'ding', 'liang']);
  assert.deepEqual(splitPinyinWord('yìdiǎnr'), ['yi', 'dian', 'r']);
  assert.equal(splitPinyinWord('WiFi'), null);
  assert.equal(splitPinyinWord('hello'), null);
  assert.equal(pinyinSyllableCount('Qǐngwèn, xǐshǒujiān zài nǎlǐ?'), hanCount('请问，洗手间在哪里？'));
  assert.equal(hanCount('请问，洗手间在哪里？'), 8);
  assert.equal(pinyinSyllableCount('WiFi mìmǎ shì duōshao?'), 5);
  assert.equal(hanCount('WiFi密码是多少？'), 5);
  assert.equal(pinyinText('nǐ hǎo. qǐng zuò!'), 'Nǐ hǎo. Qǐng zuò!');
  assert.equal(pinyinText('ǎi'), 'Ǎi');
});

test('읽는 법: 한국어 사용자에게 중국어는 한글 발음 + 병음, 다른 사용자에게는 병음, 중국어 사용자에게 한국어는 로마자', () => {
  const py = 'zhège duōshao qián?';
  assert.equal(readingFor('这个多少钱？', 'zh', 'ko', py), '저거 둬사오 첸?\nZhège duōshao qián?');
  for (const v of ['tr', 'en', 'ja']) assert.equal(readingFor('这个多少钱？', 'zh', v, py), 'Zhège duōshao qián?', v);
  assert.equal(readingFor('这个多少钱？', 'zh', 'zh', py), '');
  assert.equal(readingFor('这个多少钱？', 'zh', 'ko'), '', '병음을 아직 못 받았으면 비움');
  assert.equal(readingFor('안녕하세요', 'ko', 'zh'), 'Annyeonghaseyo');
  assert.equal(readingFor('駅はどこですか？', 'ja', 'zh', 'えきわ どこ ですか？'), 'Ekiwa doko desuka?');
  assert.equal(readingFor('Merhaba', 'tr', 'zh'), '');
  assert.equal(readingFor('Hello', 'en', 'zh'), '');
  for (const v of ['ko', 'tr', 'en', 'ja']) assert.ok(needsSound('zh', v), v);
  assert.ok(!needsSound('zh', 'zh') && !needsSound('ko', 'zh') && !needsSound('tr', 'ko'));
  assert.ok(needsSound('ja', 'zh') && needsKana('ja', 'zh'), '중국어 사용자에게 일본어는 로마자 (히라가나 필요)');
});

test('병음 요청 검사 · 지시문 · 결과 정리', () => {
  assert.ok(validatePinyin({ text: '这个多少钱？' }).value);
  assert.equal(validatePinyin({ text: 'hello' }).code, 'not_chinese');
  assert.equal(validatePinyin({ text: '駅はどこですか' }).code, 'not_chinese', '가나가 있으면 일본어');
  assert.equal(validatePinyin({ text: '' }).code, 'empty');
  assert.equal(validatePinyin({ text: '好'.repeat(501) }).code, 'too_long');
  const sys = buildPinyinMessages('你好')[0].content;
  assert.match(sys, /tone marks/);
  assert.match(sys, /one pinyin syllable for every Chinese character/);
  assert.equal(cleanPinyin('Zhège duōshao qián？'), 'Zhège duōshao qián?');
  assert.equal(cleanPinyin('Pinyin: nǐ hǎo，wǒ shì Hánguórén。'), 'nǐ hǎo, wǒ shì Hánguórén.');
  assert.equal(cleanPinyin('"nǐ hǎo"'), 'nǐ hǎo');
  assert.equal(cleanPinyin('你好 nǐ hǎo'), '', '한자가 섞임');
  assert.equal(cleanPinyin('こんにちは'), '');
  assert.equal(cleanPinyin('hello world'), '', '병음 음절이 없음');
  assert.ok(pinyinMatches('Zhège duōshao qián?', '这个多少钱？'));
  assert.ok(!pinyinMatches('duōshao qián?', '这个多少钱？'), '글자를 빼먹음');
  assert.ok(pinyinMatches('Mǎi 2 ge.', '买2个。'), '숫자는 그대로');
});

test('병음 API: 음절 수가 맞는 답을 고르고, 둘 다 안 맞으면 처음 답이라도', async () => {
  const req = (body, origin = ORIGIN) => new Request(`${ORIGIN}/api/pinyin`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '4.4.4.4' }, body: JSON.stringify(body) });
  let n = 0;
  const AI = { run: async () => (++n === 1 ? { response: 'duōshao qián' } : { response: 'Zhège duōshao qián？' }) };
  let data = await (await pinyinApi({ request: req({ text: '这个多少钱？' }), env: { AI } })).json();
  assert.equal(data.pinyin, 'Zhège duōshao qián?');
  assert.equal(n, 2, '첫 답은 글자를 빼먹어서 다음 모델로');
  const rough = { run: async () => ({ response: 'duōshao qián' }) };
  data = await (await pinyinApi({ request: req({ text: '这个多少钱？' }), env: { AI: rough } })).json();
  assert.equal(data.pinyin, 'duōshao qián');
  const hanzi = { run: async () => ({ response: '这个 zhège' }) };
  assert.equal((await pinyinApi({ request: req({ text: '这个' }), env: { AI: hanzi } })).status, 502, '쓸 만한 답이 없음');
  assert.equal((await pinyinApi({ request: req({ text: 'hello' }), env: { AI } })).status, 400);
  assert.equal((await pinyinApi({ request: req({ text: '你好' }, 'https://evil.example'), env: { AI } })).status, 403);
  assert.equal((await pinyinApi({ request: req({ text: '你好' }), env: {} })).status, 500);
  const failing = { run: async () => { throw new Error('3040: Capacity temporarily exceeded'); } };
  const res = await pinyinApi({ request: req({ text: '你好' }), env: { AI: failing } });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'busy');
});

test('표현집: 모든 문장에 중국어(간체)와 병음 — 병음 음절 수 = 한자 수, 한글 발음이 나온다', () => {
  for (const p of PHRASES) {
    assert.match(p.zh, /[一-鿿]/, p.ko);
    assert.match(p.zh, /[。？！]$/, `중국어 문장 끝: ${p.zh}`);
    assert.doesNotMatch(p.zh, /[぀-ヿ가-힣]/, p.zh);
    // 번체로만 쓰는 흔한 글자가 없어야 (간체)
    assert.doesNotMatch(p.zh, /[們這說嗎麼錢買賣時東車門問謝對見還個為發貨價樣質換運輸單網訂給請語話讀]/, `번체: ${p.zh}`);
    assert.equal(pinyinSyllableCount(p.zhPinyin), hanCount(p.zh), `병음 음절 수: ${p.zh} ${p.zhPinyin}`);
    assert.match(p.zhPinyin, /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/, `성조 부호: ${p.zhPinyin}`);
    assert.match(pinyinToHangul(p.zhPinyin), /[가-힣]/);
    assert.equal(phraseSound(p, 'zh'), p.zhPinyin);
    assert.equal(phraseSound(p, 'ja'), p.jaKana);
  }
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'ko', 'zh').includes('저는 중국 사람이에요.'));
  assert.ok(!ko('talk', 'zh', 'ko').includes('저는 중국 사람이에요.'));
  assert.ok(ko('talk', 'zh', 'ko').includes('중국어를 잘 못해요.'));
  assert.ok(!ko('talk', 'ja', 'ko').includes('중국어를 잘 못해요.'));
  assert.ok(ko('help', 'ko', 'zh').includes('중국 대사관에 연락해 주세요.'));
  assert.ok(!ko('help', 'ko', 'zh').some((s) => /한국 대사관/.test(s)));
  for (const me of CODES) for (const partner of CODES.filter((c) => c !== me)) for (const c of PHRASE_CATS) assert.ok(phrasesFor(c.id, partner, me).length >= 5, `${me}→${partner} ${c.id}`);
});

test('표현집 주문·배송: 도매·인터넷 쇼핑 판매자에게 쓰는 문장 (단가 · 최소 주문 수량 · 샘플 · 배송 기간 · 영수증 · 불량 · 교환·환불)', () => {
  assert.ok(PHRASE_CATS.some((c) => c.id === 'order'));
  const zh = phrasesFor('order', 'zh', 'ko').map((p) => p.zh).join(' ');
  for (const w of ['单价', '起订量', '样品', '现货', '包邮', '发货', '几天', '快递单号', '发票', '质量问题', '换货', '退款', '韩国']) assert.ok(zh.includes(w), w);
  const shop = phrasesFor('shop', 'zh', 'ko').map((p) => p.zh).join(' ');
  for (const w of ['多少钱', '便宜', '太贵']) assert.ok(shop.includes(w), w);
  assert.equal(readingFor('单价是多少？', 'zh', 'ko', 'dānjià shì duōshao?'), '단자 스 둬사오?\nDānjià shì duōshao?');
});

test('화면 문구(중국어): 간체 한자로, 상대 안내 · 언어 이름 · 말투 안내', () => {
  for (const [k, s] of Object.entries(MESSAGES.zh)) if (!/^[A-Za-z0-9\s.()/:·→✕×{}-]+$/.test(s)) assert.match(s, /[一-鿿]/, `zh.${k}`);
  assert.doesNotMatch(Object.values(MESSAGES.zh).join(''), /[們這說嗎麼錢買賣時東車門問謝對見還個為發貨價樣質換運輸單網訂給請語話讀設錄]/, '번체 글자 없음');
  assert.match(tl('zh', 'mic.partnerHint'), /中文/);
  assert.equal(tl('ko', 'lang.zh'), '중국어');
  assert.equal(tl('tr', 'lang.zh'), 'Çince');
  assert.equal(tl('en', 'lang.zh'), 'Chinese');
  assert.equal(tl('ja', 'lang.zh'), '中国語');
  assert.equal(tl('zh', 'lang.ko'), '韩语');
  for (const c of CODES) {
    assert.match(tl(c, 'set.toneHint'), /您/, `${c} 말투 안내에 중국어`);
    assert.match(tl(c, 'set.about'), /중국어|Çince|Chinese|中国語|中文/, `${c} 앱 정보에 중국어`);
  }
  assert.match(tl('ko', 'set.readingHint'), /중국어/);
  assert.equal(tl('zh', 'talk.ariaSpeak', { lang: tl('zh', 'lang.zh') }), '用中文说话');
});
