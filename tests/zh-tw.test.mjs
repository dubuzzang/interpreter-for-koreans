// 번체 중국어(zh-TW, v1.6.0): 언어 정보 · 번역 지시문 · 결과 점검 · 받아쓰기 · 읽는 법 · 숫자 · 자동 감지 · 표현집 · 화면 문구 · 사진 줄 · 목소리
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate, sttLanguage, STT_PROMPT } from '../lib/translate-core.mjs';
import { numberMentions, cleanSuggestions, cleanSummary } from '../lib/assist-core.mjs';
import { lineLang, cleanPhoto, buildPhotoMessages } from '../lib/photo-core.mjs';
import { SOUND_SPECS } from '../lib/sound-core.mjs';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { pinyinToHangul, pinyinSyllableCount, hanCount } from '../public/js/pinyin.js';
import { readingFor, needsSound } from '../public/js/reading.js';
import { LANGS, CODES, detectLang, hanStyle } from '../public/js/lang.js';
import { MESSAGES, tl, defaultLang, startLangs } from '../public/js/i18n.js';
import { PHRASES, phrasesFor, phraseSound } from '../public/js/phrases.js';

beforeEach(() => _resetBuckets());
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const values = (text, lang = 'zh-TW') => numberMentions(text, lang).flatMap((m) => m.alts);
// 간체로만 쓰는 흔한 글자 (번체 글에 나오면 안 됨)
const SIMPLIFIED = /[们这说吗么钱买卖时东车门问谢对见还个为发货价样质换运输单网订给请语话读设录选关开头实点学会国来体号万与写声当数区医岁气图广乐经济险验总译转轻边迟带应觉续绿听两齐龙认识该试账购费错钟间层帮爱报无现电码确签简纸级约红线练组细终结绍统编联职节获补视计记访证评诉询负财责贴轮软较辆过进远连适邮递钥链锁键长闭队阳际陆难须顾预领题颜额风飞饭饮馆马鱼鸡种产厂坏损优几华场动业热务员处观欢后里着从类与没]/;

test('번체 중국어 언어 정보: zh-TW (대만) · 모든 언어와 짝 · 대만 · 홍콩 브라우저는 번체 화면', () => {
  const { code, native, flag, bcp47, short, script } = LANGS['zh-TW'];
  assert.deepEqual({ code, native, flag, bcp47, short, script }, { code: 'zh-TW', native: '繁體中文', flag: '🇹🇼', bcp47: 'zh-TW', short: 'TW', script: 'Hant' });
  for (const c of CODES.filter((x) => x !== 'zh-TW')) {
    assert.ok(validateTranslate({ text: '你好', from: 'zh-TW', to: c }).value, `zh-TW → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'zh-TW' }).value, `${c} → zh-TW`);
  }
  assert.equal(defaultLang(['zh-TW', 'en']), 'zh-TW');
  assert.deepEqual(startLangs({}, ['zh-HK']), { me: 'zh-TW', partner: 'ko' });
  assert.deepEqual(startLangs({ settings: { me: 'ko', partner: 'tr' } }, ['zh-TW']), { me: 'ko', partner: 'tr' }, '이미 쓰던 사람은 그대로');
});

test('번역 지시문: 번체 · 대만 낱말 · 말투(您/你), 간체 규칙은 섞이지 않는다', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.match(sys('ko', 'zh-TW'), /from Korean into Traditional Chinese/);
  assert.match(sys('ko', 'zh-TW'), /Traditional Chinese characters as used in Taiwan \(never Simplified\)/);
  assert.match(sys('ko', 'zh-TW'), /計程車, 捷運, 軟體, 影片, 網路/);
  assert.match(sys('ko', 'zh-TW'), /您/);
  assert.match(sys('ko', 'zh-TW', false), /你, not 您/);
  assert.doesNotMatch(sys('ko', 'zh-TW'), /never Traditional|mainland/);
  assert.match(sys('zh-TW', 'ko'), /from Traditional Chinese into Korean/);
  assert.doesNotMatch(sys('zh-TW', 'ko'), /Taiwan/, '옮길 언어의 규칙만');
  const ctx = buildMessages({ text: 'x', from: 'ko', to: 'zh-TW', context: [{ lang: 'zh-TW', text: '你好' }] })[0].content;
  assert.match(ctx, /\[Traditional Chinese\] 你好/);
});

test('번체 결과 점검: 한자가 있어야 하고, 간체로 쓴 답 · 가나 · 한글은 다음 모델로 (한두 글자 섞인 것은 봐준다)', () => {
  const to = (out) => looksValid(out, { text: '이거 얼마예요?', from: 'ko', to: 'zh-TW' });
  assert.ok(to('這個多少錢？'));
  assert.ok(to('好的。'), '어느 쪽 글자도 아닌 짧은 답');
  assert.ok(to('謝謝您，我要兩個。'));
  assert.ok(to('這個多少钱？'), '번체 글에 간체 한 글자는 봐준다');
  assert.ok(!to('这个多少钱？'), '간체로 씀');
  assert.ok(!to('太贵了。'), '짧은 글에 간체 글자');
  assert.ok(!to('能便宜一点吗？'), '点 · 吗 (일본어와 같은 간체 모양도 간체로)');
  assert.ok(!to('Zhège duōshǎo qián?'), '병음만');
  assert.ok(!to('これはいくらですか？'), '일본어');
  assert.ok(!to('這個 얼마예요?'), '한글이 남음');
  assert.ok(looksValid('이거 얼마예요?', { text: '這個多少錢？', from: 'zh-TW', to: 'ko' }));
  assert.ok(!looksValid('How much is 這個?', { text: '這個多少錢？', from: 'zh-TW', to: 'en' }), '한자가 남음');
  assert.equal(cleanOutput('繁體中文：謝謝'), '謝謝');
  assert.equal(cleanOutput('Traditional Chinese: 謝謝'), '謝謝');
  assert.equal(cleanOutput('翻譯：謝謝'), '謝謝');
  assert.deepEqual(hanStyle('這個多少錢'), { hans: 0, hant: 3 }, '這 · 個 · 錢');
  assert.deepEqual(hanStyle('这个多少钱'), { hans: 3, hant: 0 });
});

test('받아쓰기: Whisper에 zh + 번체 첫 문장, 번체 자막 끝인사는 버린다', async () => {
  assert.equal(sttLanguage('zh-TW'), 'zh');
  assert.match(STT_PROMPT['zh-TW'], /繁體中文/);
  for (const s of ['謝謝觀看', '感謝收看！', '感謝大家的觀看', '字幕由Amara.org社群提供', '請不吝點贊 訂閱 轉發 打賞支持明鏡與點點欄目', '優優獨播劇場——YoYo Television Series Exclusive', '訂閱我的頻道', '以下是普通話的句子，使用繁體中文。']) assert.equal(cleanTranscript(s), '', s);
  for (const s of ['這個多少錢？', '謝謝，我要兩個。', '感謝你的幫忙。']) assert.equal(cleanTranscript(s), s);
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' 這個多少錢？ ' }; } };
  const req = new Request(`${ORIGIN}/api/stt?lang=zh-TW`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '3.3.3.4' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req, env: { AI } })).json(), { text: '這個多少錢？' });
  assert.equal(calls[0].language, 'zh');
  assert.match(calls[0].initial_prompt, /繁體中文/);
});

test('읽는 법: 한국어 사용자에게 번체도 한글 발음 + 병음, 다른 사용자에게 병음, 간체 사용자에게는 없음', () => {
  const py = 'zhège duōshǎo qián?';
  assert.equal(readingFor('這個多少錢？', 'zh-TW', 'ko', py), '저거 둬사오 첸?\nZhège duōshǎo qián?');
  for (const v of ['tr', 'en', 'ja', 'vi', 'th', 'ru', 'ar', 'fr']) assert.equal(readingFor('這個多少錢？', 'zh-TW', v, py), 'Zhège duōshǎo qián?', v);
  assert.equal(readingFor('這個多少錢？', 'zh-TW', 'zh', py), '');
  assert.equal(readingFor('这个多少钱？', 'zh', 'zh-TW', py), '');
  assert.equal(readingFor('這個多少錢？', 'zh-TW', 'ko'), '', '병음을 아직 못 받았으면 비움');
  // 번체 사용자에게: 한국어 · 일본어는 로마자, 라틴 문자 언어는 없음
  assert.equal(readingFor('안녕하세요', 'ko', 'zh-TW'), 'Annyeonghaseyo');
  assert.equal(readingFor('駅はどこですか？', 'ja', 'zh-TW', 'えきわ どこ ですか？'), 'Ekiwa doko desuka?');
  assert.equal(readingFor('Xin chào', 'vi', 'zh-TW'), '');
  assert.ok(needsSound('zh-TW', 'ko') && !needsSound('zh-TW', 'zh') && needsSound('ja', 'zh-TW'));
  assert.ok(SOUND_SPECS['zh-TW'].matches('Zhège duōshǎo qián?', '這個多少錢？'), '병음 음절 수 = 한자 수');
});

test('숫자: 번체 한자 숫자 (一百五十塊 · 兩萬五 · 十四塊五 · 十四點五 · 三塊半) — 답장 추천 · 요약 · 사진의 지어낸 숫자 검사', () => {
  assert.deepEqual(values('一個一百五十塊'), [1, 150]);
  assert.ok(values('兩萬五').includes(25000), '兩萬五 = 25000');
  assert.deepEqual(values('最低十四塊五，一百個起訂'), [14.5, 100]);
  assert.deepEqual(values('十四點五元'), [14.5], '번체 點');
  assert.deepEqual(values('三塊半'), [3.5]);
  assert.deepEqual(values('三歲'), [3]);
  assert.deepEqual(values('NT$1,200'), [1200]);
  assert.deepEqual(values('第二'), [], '차례');
  assert.deepEqual(values('萬一'), [], '혹시');
  // 답장 추천: 대화에 나온 숫자만 (대만 판매자와 흥정)
  const turns = [
    { side: 'me', from: 'ko', to: 'zh-TW', text: '이거 얼마예요?', translation: '這個多少錢？' },
    { side: 'partner', from: 'zh-TW', to: 'ko', text: '一個一百五十塊，買兩個算你兩百八。', translation: '하나에 150위안, 두 개 사면 280위안에 드릴게요.' },
  ];
  const raw = JSON.stringify([
    { ko: '두 개에 280위안이면 살게요.', 'zh-TW': '兩個兩百八的話我買。' },
    { ko: '두 개에 250위안 안 돼요?', 'zh-TW': '兩個兩百五可以嗎？' },
    { ko: '조금 더 싸게 안 될까요?', 'zh-TW': '能便宜一点吗？' },
    { ko: '배송비 포함인가요?', 'zh-TW': '有含運費嗎？' },
  ]);
  const out = cleanSuggestions(raw, { me: 'ko', partner: 'zh-TW', turns });
  assert.deepEqual(out.map((s) => s.partner), ['兩個兩百八的話我買。', '有含運費嗎？'], '250은 지어낸 숫자, 간체로 쓴 답은 뺀다');
  // 요약: "無"는 빈칸
  const sum = cleanSummary({ price: { ko: '개당 150위안', 'zh-TW': '每個一百五十塊' }, quantity: { ko: '없음', 'zh-TW': '無' }, delivery: { ko: '', 'zh-TW': '未定' }, other: {} }, { me: 'ko', partner: 'zh-TW', turns });
  assert.deepEqual(sum.fields.price, { me: '개당 150위안', partner: '每個一百五十塊' });
  assert.deepEqual(sum.fields.quantity, { me: '', partner: '' });
  assert.equal(sum.filled, 1);
});

test('자동 감지: 한자만 있는 글을 간체 · 번체 · 일본어로 (번체 대화 중이면 애매한 것도 번체), 일본어 · 간체 동작은 그대로', () => {
  for (const s of ['這個多少錢？', '謝謝', '請問洗手間在哪裡？', '可以刷卡嗎', '我要兩個', '台灣', '牛肉麵', '沒有問題', '東西有瑕疵嗎？'])
    assert.equal(detectLang(s, 'ko'), 'zh-TW', s);
  for (const s of ['这个多少钱？', '谢谢', '我要两个', '能便宜一点吗', '有现货吗']) assert.equal(detectLang(s, 'ko'), 'zh', s);
  // 어느 쪽 글자도 없는 글: 간체, 번체 대화 중(fallback zh-TW)이면 번체
  assert.equal(detectLang('你好', 'ko'), 'zh');
  assert.equal(detectLang('你好', 'zh-TW'), 'zh-TW');
  assert.equal(detectLang('多少', 'zh-TW'), 'zh-TW');
  assert.equal(detectLang('大丈夫', 'zh-TW'), 'zh-TW');
  // 일본어와 같이 쓰는 번체 모양(東 · 問 · 題)만 있으면: 보통은 지금처럼 일본어, 번체 대화 중이면 번체
  assert.equal(detectLang('問題', 'ko'), 'ja');
  assert.equal(detectLang('問題', 'zh-TW'), 'zh-TW');
  // 일본 글자체 · 가나는 번체 대화 중에도 일본어
  for (const s of ['東京駅', '駅', '円', 'これはいくらですか', '駅はどこですか？']) assert.equal(detectLang(s, 'zh-TW'), 'ja', s);
  assert.equal(detectLang('東京駅', 'ko'), 'ja');
  assert.equal(detectLang('大丈夫', 'ja'), 'ja');
  assert.equal(detectLang('Xin chào', 'zh-TW'), 'vi');
  assert.equal(detectLang('안녕하세요', 'zh-TW'), 'ko');
});

test('표현집: 모든 문장에 번체(대만) + 병음 — 간체 글자 없음, 병음 음절 수 = 한자 수, 한글 발음', () => {
  for (const p of PHRASES) {
    const s = p['zh-TW'];
    const py = phraseSound(p, 'zh-TW');
    assert.match(s, /[一-鿿]/, p.ko);
    assert.match(s, /[。？！]$/, `문장 끝: ${s}`);
    assert.doesNotMatch(s, /[぀-ヿ가-힣]/, s);
    assert.doesNotMatch(s, SIMPLIFIED, `간체: ${s}`);
    assert.ok(hanStyle(s).hans === 0, `간체: ${s}`);
    assert.equal(pinyinSyllableCount(py), hanCount(s), `병음 음절 수: ${s} ${py}`);
    assert.match(py, /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/, `성조 부호: ${py}`);
    assert.match(pinyinToHangul(py), /[가-힣]/);
    assert.match(readingFor(s, 'zh-TW', 'ko', py), /[가-힣].*\n/);
  }
  // 간체와 다른 글자 · 대만 낱말
  const by = (cat) => phrasesFor(cat, 'zh-TW', 'ko').map((p) => p['zh-TW']).join(' ');
  for (const w of ['外帶', '結帳', '刷卡']) assert.ok(by('food').includes(w), w);
  for (const w of ['捷運', '公車']) assert.ok(by('move').includes(w), w);
  for (const w of ['單價', '訂購量', '樣品', '現貨', '運費', '出貨', '發票', '瑕疵', '退款', '韓國']) assert.ok(by('order').includes(w), w);
  for (const w of ['多少錢', '便宜', '太貴']) assert.ok(by('shop').includes(w), w);
  assert.ok(by('stay').includes('冷氣') && by('help').includes('藥局'));
  // 대만 사용자에게 보이는 문장: 소개는 대만 사람, 대사관은 "우리나라"
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'ko', 'zh-TW').includes('저는 대만 사람이에요.'));
  assert.ok(!ko('talk', 'ko', 'zh-TW').includes('저는 중국 사람이에요.'));
  assert.ok(ko('help', 'ko', 'zh-TW').includes('저희 나라 대사관에 연락해 주세요.'));
  assert.ok(ko('talk', 'zh-TW', 'ko').includes('중국어를 잘 못해요.'), '상대가 번체 중국어면 "중국어를 잘 못해요"');
  assert.equal(readingFor('單價是多少？', 'zh-TW', 'ko', 'dānjià shì duōshǎo?'), '단자 스 둬사오?\nDānjià shì duōshǎo?');
});

test('화면 문구(번체 중국어): 번체 한자로 (간체 글자 없음), 상대 안내 · 언어 이름 · 업데이트 버튼 · 말투 안내', () => {
  const zhTW = MESSAGES['zh-TW'];
  for (const [k, s] of Object.entries(zhTW)) if (!/^[A-Za-z0-9\s.()/:·→✕×{}-]+$/.test(s)) assert.match(s, /[一-鿿]/, `zh-TW.${k}`);
  for (const [k, s] of Object.entries(zhTW)) assert.doesNotMatch(s, SIMPLIFIED, `간체 글자: zh-TW.${k} ${s}`);
  for (const [k, s] of Object.entries(zhTW)) assert.equal(hanStyle(s).hans, 0, `간체 글자: zh-TW.${k}`);
  assert.notDeepEqual(Object.values(zhTW), Object.values(MESSAGES.zh), '간체 사본이 아님');
  assert.equal(tl('zh-TW', 'lang.zh'), '簡體中文');
  assert.equal(tl('zh-TW', 'lang.zh-TW'), '繁體中文');
  assert.equal(tl('zh-TW', 'lang.ko'), '韓語');
  assert.match(tl('zh-TW', 'mic.partnerHint'), /中文/);
  assert.ok(tl('zh-TW', 'set.updateHint').includes('更新'), 'index.html 업데이트 알림 버튼 이름');
  assert.match(tl('zh-TW', 'set.toneHint'), /您/);
  assert.match(tl('zh-TW', 'set.about'), /中文/);
  assert.match(tl('zh-TW', 'err.paused', { time: '09:00' }), /09:00/);
  assert.equal(tl('zh-TW', 'talk.ariaSpeak', { lang: tl('zh-TW', 'lang.ko') }), '用韓語說話');
  // 대만 낱말
  const all = Object.values(zhTW).join(' ');
  for (const w of ['設定', '螢幕', '網路', '伺服器', '裝置', '儲存']) assert.ok(all.includes(w), w);
  for (const w of ['设置', '屏幕', '网络', '服务器', '设备', '保存']) assert.ok(!all.includes(w), w);
  // 다른 언어 화면에서의 번체 중국어 이름
  assert.equal(tl('ko', 'lang.zh-TW'), '중국어(번체)');
  assert.equal(tl('zh', 'lang.zh-TW'), '繁体中文');
});

test('사진: 한자 줄이 번체면 zh-TW (모델이 zh라고 해도), 번체 줄 읽는 법 · 번역, 번체 사용자에게는 병음 없이 번체 번역', () => {
  assert.equal(lineLang('牛肉麵 NT$180', 'zh'), 'zh-TW', '모델은 zh라고 했지만 번체 글자');
  assert.equal(lineLang('雞排', ''), 'zh-TW');
  assert.equal(lineLang('滷肉飯', 'zh-TW'), 'zh-TW');
  assert.equal(lineLang('鸡排', 'zh-TW'), 'zh', '간체 글자면 간체');
  assert.equal(lineLang('牛肉面', 'zh'), 'zh');
  assert.equal(lineLang('砂肝 300円', 'zh-CN'), 'zh', '어느 쪽 글자도 아니면 모델 말대로');
  assert.equal(lineLang('生ビール', 'zh-TW'), 'ja', '가나가 있으면 일본어');
  // 한국어 사용자가 대만 메뉴를 찍음
  const menu = cleanPhoto({
    lines: [
      { text: '牛肉麵 NT$180', lang: 'zh', tr: '우육면 NT$180', read: 'niúròumiàn' },
      { text: '珍珠奶茶 大杯 65元', lang: 'zh-TW', tr: '버블티 큰 컵 65위안', read: 'zhēnzhū nǎichá dà bēi' },
      { text: '滷肉飯 小', lang: 'zh-TW', tr: '루러우판 소 35위안', read: 'lǔròufàn xiǎo' },
    ],
    summary: '대만 식당 메뉴예요.',
  }, { me: 'ko' });
  assert.deepEqual(menu.lines.map((l) => l.lang), ['zh-TW', 'zh-TW', 'zh-TW']);
  assert.equal(menu.lines[0].tr, '우육면 NT$180');
  assert.equal(menu.lines[0].read, 'niúròumiàn', '병음 음절 수 = 한자 수');
  assert.equal(menu.lines[1].read, '', '음절이 모자란 병음은 버림');
  assert.equal(menu.lines[2].tr, '', '원문에 없는 가격(35)');
  assert.equal(menu.lines[2].check, 'number');
  assert.equal(menu.summary, '대만 식당 메뉴예요.');
  // 대만 사용자가 한국 · 일본 · 중국 본토 메뉴를 찍음
  const tw = cleanPhoto({
    lines: [
      { text: '김치찌개 9,000원', lang: 'ko', tr: '泡菜鍋 9,000韓元' },
      { text: '生ビール 580円', lang: 'ja', tr: '生啤酒 580日圓', read: 'なまびーる 580えん' },
      { text: '牛肉面 25元', lang: 'zh', tr: '牛肉麵 25元', read: 'niúròumiàn' },
      { text: 'Phở bò 65.000đ', lang: 'vi', tr: 'Beef noodle soup' },
    ],
    summary: '韓國、日本和中國餐廳的菜單。',
  }, { me: 'zh-TW' });
  assert.equal(tw.lines[0].tr, '泡菜鍋 9,000韓元');
  assert.equal(tw.lines[1].read, 'なまびーる 580えん', '대만 사용자에게 일본어는 히라가나 (화면이 로마자로)');
  assert.equal(tw.lines[2].tr, '牛肉麵 25元', '간체 줄은 번체로');
  assert.equal(tw.lines[2].read, '', '번체 사용자에게 병음은 필요 없다');
  assert.equal(tw.lines[3].tr, '', '번체 사용자에게 영어 번역');
  assert.equal(tw.lines[3].check, 'lang');
  assert.equal(tw.summary, '韓國、日本和中國餐廳的菜單。');
  const sys = buildPhotoMessages({ me: 'zh-TW' }, 'x')[0].content;
  assert.match(sys, /translate each item into Traditional Chinese/);
  assert.doesNotMatch(sys, /Pinyin/, '번체 사용자에게 병음은 받지 않는다');
  assert.match(sys, /hiragana/);
});

test('목소리: 번체 중국어는 대만 목소리 → 본토, 홍콩 · 광둥어 목소리는 쓰지 않는다 (가짜 목소리 목록)', async () => {
  const VOICES = [
    { lang: 'zh-HK', name: 'Microsoft HiuMaan Online (Natural)', voiceURI: 'hk' },
    { lang: 'zh-CN', name: 'Microsoft Xiaoxiao Online (Natural)', voiceURI: 'cn' },
    { lang: 'yue-HK', name: 'Google 粵語（香港）', voiceURI: 'yue' },
    { lang: 'zh_TW', name: 'Mei-Jia', voiceURI: 'tw-ios' },
    { lang: 'cmn-Hant-TW', name: 'Google 國語（臺灣）', voiceURI: 'tw-google' },
    { lang: 'zh-Hant-HK', name: 'Sin-ji', voiceURI: 'hk-ios' },
    { lang: 'ko-KR', name: 'Yuna', voiceURI: 'ko' },
  ];
  globalThis.window = { speechSynthesis: { getVoices: () => VOICES, addEventListener() {} } };
  const { voicesFor, hasVoice } = await import('../public/js/speech.js');
  const tw = voicesFor('zh-TW').map((v) => v.voiceURI);
  assert.deepEqual(tw.slice(0, 2).sort(), ['tw-google', 'tw-ios'], '대만 목소리 먼저');
  assert.equal(tw[2], 'cn', '그다음 본토');
  assert.ok(!tw.some((u) => /hk|yue/.test(u)), '홍콩 · 광둥어 없음');
  assert.equal(voicesFor('zh')[0].voiceURI, 'cn', '간체는 본토 먼저');
  assert.ok(hasVoice('zh-TW') && !voicesFor('ko').some((v) => /zh/.test(v.lang)));
  assert.equal(LANGS['zh-TW'].bcp47, 'zh-TW', '브라우저 음성 인식 언어');
});
