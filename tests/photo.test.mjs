// 사진 번역(v1.5.0): 요청 검사 · 크기/형식 상한 · 긴 그림 자르기/합치기 · 답 정리/지어내기 거르기 · 요청 제한 따로 (가짜 AI)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  photoParams, imageInfo, checkImage, buildPhotoMessages, cleanPhoto, parsePhotoJson, isLoop, lineLang, inMyScript, sourceNumbers, cleanRead, oddScript,
  validatePhotoSummary, buildPhotoSummaryMessages, cleanPhotoSummary, PHOTO_MODELS, PHOTO_RATE, MAX_PHOTO_BYTES, MAX_PARTS, MAX_LINES,
} from '../lib/photo-core.mjs';
import { onRequestPost as photo } from '../functions/api/photo.js';
import { onRequestPost as photoSum } from '../functions/api/photo-summary.js';
import { onRequestPost as translate } from '../functions/api/translate.js';
import { _resetBuckets } from '../lib/guard.mjs';
import { responseText } from '../lib/translate-core.mjs';
import { planPieces, mergeParts, sameLine, isPriceOnly, allText, MAX_SIDE, MAX_PARTS as CLIENT_PARTS, OVERLAP } from '../public/js/photo.js';
import { fromPhotoLine, togglePhotoLine, hasPhotoLine, loadMine, saveMine, myText, sayText } from '../public/js/mine.js';
import { MESSAGES, setUiLang } from '../public/js/i18n.js';
import { serverError } from '../public/js/api.js';
import { CODES } from '../public/js/lang.js';

beforeEach(() => { _resetBuckets(); setUiLang('ko'); });
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const req = (path, body, { origin = ORIGIN, ip = '9.9.9.9', type = 'image/jpeg', length } = {}) => new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: { 'content-type': type, 'cf-connecting-ip': ip, ...(origin ? { origin } : {}), ...(length ? { 'content-length': String(length) } : {}) },
  body,
});
const fakeAI = (fn) => ({ calls: [], async run(model, input) { this.calls.push({ model, input }); return fn(model, input, this.calls.length); } });

// 그림 머리만 있는 가짜 그림 (시험 그림은 남의 사진이라 저장소에 넣지 않는다)
function jpeg(width, height, size = 4000) {
  const b = new Uint8Array(size);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]); // SOI + APP0(JFIF)
  b.set([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00], 20);                                                                               // DQT(짧게)
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03], 26);                           // SOF0
  return b;
}
function png(width, height) {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width); new DataView(b.buffer).setUint32(20, height);
  return b;
}
function webp(kind, width, height) {
  const b = new Uint8Array(64);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8); b.set([...kind].map((c) => c.charCodeAt(0)), 12);
  if (kind === 'VP8 ') { b[26] = width & 255; b[27] = (width >> 8) & 0x3f; b[28] = height & 255; b[29] = (height >> 8) & 0x3f; }
  if (kind === 'VP8X') { const w = width - 1, h = height - 1; b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24); }
  if (kind === 'VP8L') { const w = width - 1, h = height - 1; b[21] = w & 255; b[22] = ((w >> 8) & 0x3f) | ((h & 3) << 6); b[23] = (h >> 2) & 255; b[24] = (h >> 10) & 0x0f; }
  return b;
}

const ANSWER = JSON.stringify({
  lines: [
    { text: '原价 ¥129', lang: 'zh', tr: '정가 ¥129', read: 'Yuánjià ¥129' },
    { text: '券后 ¥89', lang: 'zh', tr: '쿠폰 적용가 ¥89', read: 'Quànhòu ¥89' },
    { text: '净含量 30ml', lang: 'zh', tr: '용량 30ml', read: 'Jìng hánliàng 30ml' },
  ],
  summary: '히알루론산 에센스의 가격과 사양을 보여 주는 상세 이미지예요.',
});

test('사진 요청 검사: 내 언어 · 조각 번호(최대 8조각)', () => {
  assert.deepEqual(photoParams(`${ORIGIN}/api/photo?me=ko`).value, { me: 'ko', part: 1, parts: 1 });
  assert.deepEqual(photoParams(`${ORIGIN}/api/photo?me=tr&part=2&parts=3`).value, { me: 'tr', part: 2, parts: 3 });
  assert.equal(photoParams(`${ORIGIN}/api/photo?me=de`).code, 'unsupported_lang');
  assert.equal(photoParams(`${ORIGIN}/api/photo`).code, 'unsupported_lang');
  for (const q of ['part=4&parts=3', 'part=0&parts=2', `part=1&parts=${MAX_PARTS + 1}`, 'part=1.5&parts=2', 'part=x&parts=2']) assert.equal(photoParams(`${ORIGIN}/api/photo?me=ko&${q}`).code, 'bad_request', q);
  assert.equal(MAX_PARTS, CLIENT_PARTS, '화면과 서버의 조각 상한이 같다');
});

test('그림 형식 · 크기: JPEG · PNG · WebP 머리를 직접 읽고(content-type은 믿지 않음), 크기 · 화소 상한', () => {
  assert.deepEqual(imageInfo(jpeg(1200, 1600)), { type: 'image/jpeg', width: 1200, height: 1600 });
  assert.deepEqual(imageInfo(png(750, 1500)), { type: 'image/png', width: 750, height: 1500 });
  assert.deepEqual(imageInfo(webp('VP8 ', 1024, 768)), { type: 'image/webp', width: 1024, height: 768 });
  assert.deepEqual(imageInfo(webp('VP8X', 1440, 1920)), { type: 'image/webp', width: 1440, height: 1920 });
  assert.deepEqual(imageInfo(webp('VP8L', 300, 500)), { type: 'image/webp', width: 300, height: 500 });
  assert.equal(imageInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null, 'SVG는 받지 않음');
  assert.equal(imageInfo(new TextEncoder().encode('GIF89a..........................')), null);
  assert.equal(imageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0x00, 0x00, 0x12, 0x34, 0, 0])), null, '망가진 JPEG');

  assert.equal(checkImage(jpeg(1200, 1600)).value.type, 'image/jpeg');
  assert.equal(checkImage(new Uint8Array(MAX_PHOTO_BYTES + 1)).code, 'photo_too_big');
  assert.equal(checkImage(new Uint8Array(MAX_PHOTO_BYTES + 1)).status, 413);
  assert.equal(checkImage(jpeg(1600, 2049)).code, 'photo_too_big', '긴 변 2,048px 넘음 (화면은 1,600px로 줄여 보낸다)');
  assert.equal(checkImage(jpeg(10, 400)).code, 'bad_image', '너무 작음');
  assert.equal(checkImage(new TextEncoder().encode('hello hello hello hello hello hello hello')).status, 415);
  assert.equal(checkImage(new Uint8Array(0)).code, 'bad_image');
});

test('사진 지시문: 원문 그대로 · 지어내기 금지 · 같은 줄 가격만 · 읽는 법은 못 읽는 사람에게만 · 조각 안내 · JSON', () => {
  const [sys, user] = buildPhotoMessages({ me: 'ko', part: 1, parts: 1 }, 'data:image/jpeg;base64,AAAA');
  assert.match(sys.content, /for a Korean speaker/);
  assert.match(sys.content, /copy the text EXACTLY as printed/);
  assert.match(sys.content, /Simplified Chinese stays Simplified/);
  assert.match(sys.content, /NEVER invent words, prices, numbers/);
  assert.match(sys.content, /price printed on the SAME row/);
  assert.match(sys.content, /not sure which item a price belongs to, write the price as its own item/);
  assert.match(sys.content, /Do not convert currencies/);
  assert.match(sys.content, /no numbers or prices that are not in the image/);
  assert.match(sys.content, /no readable text, output \{"lines":\[\],"summary":""\}/);
  assert.match(sys.content, /Hanyu Pinyin/);
  assert.match(sys.content, /hiragana/);
  assert.doesNotMatch(sys.content, /part \d of/);
  assert.deepEqual(user.content[0], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }, '그림은 image_url (최상위 image로 주면 그림을 못 본다)');
  assert.match(user.content[1].text, /translate it into Korean/);
  const zh = buildPhotoMessages({ me: 'zh' }, 'x')[0].content;
  assert.doesNotMatch(zh, /Pinyin/, '중국어 사용자에게 병음은 필요 없다');
  assert.match(zh, /hiragana/);
  const ja = buildPhotoMessages({ me: 'ja' }, 'x')[0].content;
  assert.doesNotMatch(ja, /hiragana/);
  assert.match(buildPhotoMessages({ me: 'en', part: 2, parts: 4 }, 'x')[0].content, /part 2 of 4 of one tall image.*Skip lines that are cut off/);
});

test('답 정리: JSON 꺼내기 · 줄 언어 · 내 언어 줄 · 읽는 법 검사', () => {
  const out = cleanPhoto('```json\n' + ANSWER + '\n```', { me: 'ko' });
  assert.equal(out.lines.length, 3);
  assert.deepEqual(out.lines[0], { text: '原价 ¥129', lang: 'zh', tr: '정가 ¥129', read: 'Yuánjià 129' }, '가격 기호는 읽기에서 뺀다');
  assert.equal(out.lines[2].read, 'Jìng hánliàng 30ml');
  assert.match(out.summary, /히알루론산/);
  // 줄 언어: 글자 체계 → 모델이 준 lang → 글자가 없으면 사진의 주 언어
  assert.equal(lineLang('네기마 320엔'), 'ko');
  assert.equal(lineLang('ねぎま 320円', 'zh'), 'ja', '가나가 있으면 일본어');
  assert.equal(lineLang('砂肝 300円', 'ja'), 'ja');
  assert.equal(lineLang('砂肝 300円', 'zh-CN'), 'zh');
  assert.equal(lineLang('Künefe 180 ₺'), 'tr');
  assert.equal(lineLang('NIVEA', 'zh'), 'en', '중국어 사진 속 라틴 문자 상표');
  assert.equal(lineLang('Bánh mì', 'vi'), 'vi', '다섯 언어가 아닌 라틴 문자 언어');
  assert.equal(lineLang('Привет', 'ru'), 'ru');
  assert.equal(lineLang('85 ₺', 'tr'), null);
  const menu = cleanPhoto({ lines: [{ text: 'Mercimek Çorbası', lang: 'tr', tr: '렌틸콩 수프' }, { text: '85 ₺', tr: '85 ₺' }, { text: 'Ayran', lang: 'tr', tr: '아이란' }] }, { me: 'ko' });
  assert.equal(menu.lines[1].lang, 'tr', '가격만 있는 줄은 사진의 주 언어');
  assert.equal(menu.lines[1].tr, '', '원문과 같은 번역은 비운다 (화면은 원문만)');
  // 내 언어로 쓰인 줄은 번역 없음
  const own = cleanPhoto({ lines: [{ text: '설화수 윤조에센스', lang: 'ko', tr: 'Sulwhasoo' }] }, { me: 'ko' });
  assert.deepEqual(own.lines[0], { text: '설화수 윤조에센스', lang: 'ko', tr: '', read: '' });
  // 읽는 법: 병음 음절 수 = 한자 수 (숫자를 읽은 것까지), 히라가나 (괄호 · 가격 숫자 허용), 그 밖은 버림
  assert.equal(cleanRead('jiā shēng chōu, háo yóu gè yī sháo', '加生抽、蚝油各1勺', 'zh'), 'jiā shēng chōu, háo yóu gè yī sháo', '1勺 → yī sháo');
  assert.equal(cleanRead('jiā shēng chōu', '加生抽、蚝油各1勺', 'zh'), '', '음절이 모자람');
  assert.equal(cleanRead('gé xīn 「zhì gǎn tiáo jié jì shù」', '革新「智感调节技术」', 'zh'), 'gé xīn "zhì gǎn tiáo jié jì shù"');
  assert.equal(cleanRead('xiū hù/liàng zé/tán rùn', '修护/亮泽/弹润', 'zh'), 'xiū hù liàng zé tán rùn');
  assert.equal(cleanRead('好吃', '好吃', 'zh'), '', '병음 자리에 한자');
  assert.equal(cleanRead('なまビール (ちゅう) 580えん', '生ビール（中）580円', 'ja'), 'なまびーる (ちゅう) 580えん');
  assert.equal(cleanRead('nama biiru', '生ビール', 'ja'), '', '로마자는 히라가나 읽기가 아님');
  const zhUser = cleanPhoto({ lines: [{ text: '券后 ¥89', lang: 'zh', tr: '券后 ¥89', read: 'Quànhòu' }, { text: 'ねぎま', lang: 'ja', tr: '葱肉串', read: 'ねぎま' }] }, { me: 'zh' });
  assert.equal(zhUser.lines[0].read, '', '중국어 사용자에게 병음은 없음');
  assert.equal(zhUser.lines[1].read, 'ねぎま', '중국어 사용자에게 일본어는 히라가나 (화면이 로마자로)');
});

test('지어내기 거르기: 번역에 원문에 없는 숫자 · 엉뚱한 언어 → 번역만 빼고 표시, 요약도 같은 검사', () => {
  const out = cleanPhoto({
    lines: [
      { text: 'Mercimek Çorbası 85 ₺', lang: 'tr', tr: '렌틸콩 수프 85 ₺ (약 3,500원)' },  // 환산 금액을 지어냄
      { text: '一勺蚝油', lang: 'zh', tr: 'オイスターソース大さじ1' },                      // 한국어 사용자에게 일본어 번역
      { text: '三重玻尿酸 水润一整天', lang: 'zh', tr: '3중 히알루론산 하루 종일 촉촉' },      // 三 = 3 (세는 말 없는 한자 숫자도)
      { text: '最低十四块五', lang: 'zh', tr: '최저 14.5위안' },                              // 十四块五 = 14.5
      { text: '本日の刺身三点盛り 1,480円', lang: 'ja', tr: '오늘의 사시미 3종 모둠 1,480엔' },
      { text: '下单后48小时内发货', lang: 'zh', tr: '주문 후 24시간 이내 발송' },               // 숫자를 바꿈
      { text: 'Clam Chowder (cup / bowl) $6 / $9', lang: 'en', tr: '클램 차우더 (컵 / 볼) $6 / $9' },
      { text: '买2送面膜1片', lang: 'zh', tr: '2개 사면 마스크팩 1장 증정' },
    ],
    summary: '튀르키예 식당 메뉴로, 수프가 85리라예요.',
  }, { me: 'ko' });
  const by = (s) => out.lines.find((l) => l.text.startsWith(s));
  assert.equal(by('Mercimek').tr, ''); assert.equal(by('Mercimek').check, 'number');
  assert.equal(by('一勺').tr, ''); assert.equal(by('一勺').check, 'lang');
  assert.equal(by('三重').tr, '3중 히알루론산 하루 종일 촉촉');
  assert.equal(by('最低').tr, '최저 14.5위안');
  assert.equal(by('本日').tr, '오늘의 사시미 3종 모둠 1,480엔');
  assert.equal(by('下单').check, 'number');
  assert.equal(by('Clam').tr, '클램 차우더 (컵 / 볼) $6 / $9');
  assert.equal(by('买2').tr, '2개 사면 마스크팩 1장 증정');
  assert.equal(out.notes.numbers, 2); assert.equal(out.notes.wrongLang, 1);
  assert.equal(out.summary, '튀르키예 식당 메뉴로, 수프가 85리라예요.', '요약의 85는 사진에 있는 값');
  assert.equal(cleanPhoto({ lines: [{ text: 'Çay 20 ₺', tr: '차 20 ₺' }], summary: '차가 25리라예요.' }, { me: 'ko' }).summary, '', '요약에 지어낸 가격');
  assert.equal(cleanPhoto({ lines: [{ text: '唇妆进阶新体验', tr: '립 메이크업' }], summary: '립 メイクアップ 광고예요.' }, { me: 'ko' }).summary, '', '한국어 요약에 원문에 없는 가나');
  assert.equal(cleanPhoto({ lines: [{ text: 'Çay', tr: 'Tea' }], summary: 'A tea menu.' }, { me: 'ko' }).summary, '', '요약이 내 언어가 아님');
  assert.ok(inMyScript('등록 번호 粤G妆网备字2025123456', 'ko', '备案编号 粤G妆网备字2025123456'), '원문 글자(등록 번호 등)가 섞여도 내 언어가 1/3 넘으면 괜찮다');
  assert.ok(!inMyScript('オイスターソース', 'ko'));
  assert.ok(sourceNumbers('一合', 'ja').has(1) && sourceNumbers('三大亮点', 'zh').has(3));
  // 원문에 엉뚱한 글자가 낀 줄: 줄은 두고 표시 (2026-10-12 실제: 泡水 → 泡น้ำ)
  const odd = cleanPhoto({ lines: [{ text: '土豆切丝泡น้ำ', lang: 'zh', tr: '감자를 채 썰어 물에 담그기' }, { text: '含β-折叠蚕丝蛋白', lang: 'zh', tr: 'β-접힘 실크 단백질 함유' }] }, { me: 'ko' });
  assert.equal(odd.lines[0].check, 'script');
  assert.equal(odd.lines[0].tr, '감자를 채 썰어 물에 담그기');
  assert.equal(odd.lines[1].check, undefined, '성분 이름의 그리스 문자(β)는 괜찮다');
  assert.equal(odd.notes.oddScript, 1);
  assert.ok(!oddScript('Ayran / Айран'), '라틴 · 키릴 두 언어 메뉴는 괜찮다');
  assert.ok(!oddScript('ต้มยำกุ้ง 120฿'), '타이어 메뉴는 괜찮다');
});

test('지어내기 거르기: 글자 없는 사진에 요약 X · 되풀이 · 빈 답 · 잘린 JSON · 줄 수 상한', () => {
  const none = cleanPhoto('{"lines":[],"summary":"화장품을 바르는 여성 사진입니다."}', { me: 'ko' });
  assert.deepEqual(none.lines, []);
  assert.equal(none.summary, '', '읽은 글이 없으면 요약도 없다 (예비 모델이 글자 없는 사진에 요약을 지어낸 일)');
  assert.deepEqual(cleanPhoto('{"lines":[{"text":"","tr":""}],"summary":""}', { me: 'ko' }).lines, []);
  assert.ok(isLoop('哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈'));
  assert.ok(isLoop('包邮 包邮 包邮 包邮 包邮 包邮 包邮 包邮 包邮 包邮'));
  assert.ok(!isLoop('三种分子玻尿酸，层层渗透补水'));
  assert.ok(!isLoop('★★★★★'));
  const loop = cleanPhoto({ lines: [
    { text: '包邮包邮包邮包邮包邮包邮包邮包邮包邮包邮包邮包邮', tr: '무료 배송' },
    { text: '正品保证', tr: '정품 보장 정품 보장 정품 보장 정품 보장 정품 보장 정품 보장' },
    ...Array.from({ length: 6 }, () => ({ text: '新品上市', tr: '신상품 출시' })),
  ] }, { me: 'ko' });
  assert.deepEqual(loop.lines.map((l) => l.text), ['正品保证', '新品上市', '新品上市'], '되풀이 줄 빼기 · 같은 줄은 두 번까지');
  assert.equal(loop.lines[0].tr, '', '번역이 되풀이면 번역만 비움');
  assert.equal(loop.notes.repeats, 4);
  assert.equal(cleanPhoto('죄송해요, 읽을 수 없어요.', { me: 'ko' }), null, 'JSON이 아니면 null → 예비 모델');
  const cut = parsePhotoJson('{"lines":[{"text":"原价 ¥129","lang":"zh","tr":"정가 ¥129"},{"text":"券后 ¥89","lang":"zh","tr":"쿠폰가 ¥89"},{"text":"第二件半');
  assert.equal(cut.lines.length, 2, '답 길이 상한에 잘린 JSON에서 끝까지 온 줄만');
  assert.equal(cut.truncated, true);
  const many = cleanPhoto({ lines: Array.from({ length: MAX_LINES + 15 }, (_, i) => ({ text: `第${i}行文字`, tr: `${i}번째 줄` })) }, { me: 'ko' });
  assert.equal(many.lines.length, MAX_LINES);
  assert.equal(many.notes.cut, 15);
  const long = cleanPhoto({ lines: [{ text: Array.from({ length: 900 }, (_, i) => String.fromCharCode(0x4e00 + i)).join(''), tr: '설명' }] }, { me: 'ko' });
  assert.equal(long.lines[0].text.length, 401, '한 줄 400자 + …');
});

test('/api/photo: 그림을 image_url로 생각 끈 Gemma에 한 번, 줄 정리해서 돌려준다 · 그림은 저장하지 않는다', async () => {
  const AI = fakeAI(() => ({ response: ANSWER, usage: { neurons: 20 } }));
  const img = jpeg(750, 1500);
  const res = await photo({ request: req('/api/photo?me=ko&part=1&parts=2', img), env: { AI } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.model, PHOTO_MODELS[0].id);
  assert.equal(data.model, '@cf/google/gemma-4-26b-a4b-it');
  assert.equal(data.lines.length, 3);
  assert.equal(AI.calls.length, 1);
  const { input } = AI.calls[0];
  assert.equal(input.chat_template_kwargs.enable_thinking, false);
  assert.equal(input.temperature, 0);
  assert.equal(input.messages[1].content[0].image_url.url, `data:image/jpeg;base64,${Buffer.from(img).toString('base64')}`);
  assert.match(input.messages[0].content, /part 1 of 2/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  // 그림을 남기는 코드가 없다 (KV · R2 · 캐시 · console)
  for (const f of ['functions/api/photo.js', 'functions/api/photo-summary.js', 'lib/photo-core.mjs']) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /env\.(?!AI\b)[A-Z_]+|caches\.|\.put\(|console\./, f);
  }
  // PNG · WebP도 받고, data URL 형식은 그림 머리대로
  await photo({ request: req('/api/photo?me=en', png(800, 600), { type: 'application/octet-stream' }), env: { AI } });
  assert.match(AI.calls.at(-1).input.messages[1].content[0].image_url.url, /^data:image\/png;base64,/);
});

test('/api/photo: 검사 실패 · 크기 상한 · 예비 모델 · 한도 · 오류 코드', async () => {
  let AI = fakeAI(() => ({ response: ANSWER }));
  const img = jpeg(1200, 1600);
  assert.equal((await photo({ request: req('/api/photo?me=ko', img, { origin: 'https://evil.example' }), env: { AI } })).status, 403);
  assert.equal((await photo({ request: req('/api/photo?me=ko', img, { origin: null }), env: { AI } })).status, 403);
  assert.equal((await photo({ request: req('/api/photo?me=xx', img), env: { AI } })).status, 400);
  let res = await photo({ request: req('/api/photo?me=ko', img, { length: MAX_PHOTO_BYTES + 10 }), env: { AI } });
  assert.equal(res.status, 413, 'content-length만 보고 바로 거절');
  assert.equal((await res.json()).code, 'photo_too_big');
  res = await photo({ request: req('/api/photo?me=ko', new Uint8Array(MAX_PHOTO_BYTES + 1)), env: { AI } });
  assert.equal(res.status, 413);
  res = await photo({ request: req('/api/photo?me=ko', new TextEncoder().encode('{"not":"an image","x":"..................."}'), { type: 'image/jpeg' }), env: { AI } });
  assert.equal(res.status, 415);
  assert.equal((await res.json()).code, 'bad_image');
  assert.equal((await photo({ request: req('/api/photo?me=ko', jpeg(3000, 4000)), env: { AI } })).status, 413, '화소 상한');
  assert.equal((await photo({ request: req('/api/photo?me=ko', img), env: {} })).status, 500);
  assert.equal(AI.calls.length, 0, '검사에 걸리면 AI를 부르지 않는다');

  // 첫 모델이 JSON이 아닌 답 → 예비 모델(Mistral) 한 번
  AI = fakeAI((m, i, n) => (n === 1 ? { response: '죄송합니다. 이미지를 볼 수 없습니다.' } : { choices: [{ message: { content: ANSWER } }] }));
  res = await photo({ request: req('/api/photo?me=ko', img), env: { AI } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).model, '@cf/mistralai/mistral-small-3.1-24b-instruct');
  assert.deepEqual(AI.calls.map((c) => c.model), PHOTO_MODELS.map((m) => m.id));
  assert.equal(AI.calls[1].input.chat_template_kwargs, undefined, '예비 모델에는 Gemma 설정을 넘기지 않음');

  AI = fakeAI(() => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); });
  res = await photo({ request: req('/api/photo?me=ko', img), env: { AI } });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'quota');
  assert.equal(AI.calls.length, 1, '한도면 예비 모델도 같다');

  AI = fakeAI(() => { throw new Error('upstream error'); });
  res = await photo({ request: req('/api/photo?me=ko', img), env: { AI } });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.code, 'failed');
  assert.equal(serverError(body, 502, 'photo'), MESSAGES.ko['err.photo_failed'], '화면은 사진 오류 문장으로');
  assert.equal(AI.calls.length, 2);
});

test('/api/photo: 기본 모델이 잠시 바쁘면(3040) 한 번 더, JSON 답을 객체로 풀어 준 응답(Mistral)도 읽는다', async () => {
  const img = jpeg(1200, 1600);
  let AI = fakeAI((m, i, n) => { if (n === 1) throw new Error('3040: Capacity temporarily exceeded, please try again.'); return { response: ANSWER }; });
  let res = await photo({ request: req('/api/photo?me=ko', img), env: { AI } });
  assert.equal(res.status, 200);
  assert.deepEqual(AI.calls.map((c) => c.model), [PHOTO_MODELS[0].id, PHOTO_MODELS[0].id], '예비 모델(뉴런 4~6배)로 가기 전에 기본 모델 한 번 더');
  // 두 번 다 바쁘면 예비 모델 — Workers AI가 JSON 답을 response 객체로 풀어 주고 원래 글은 choices에 둔다
  const parsed = JSON.parse(ANSWER);
  AI = fakeAI((m) => { if (m === PHOTO_MODELS[0].id) throw new Error('3040: Capacity temporarily exceeded'); return { response: parsed, choices: [{ message: { content: ANSWER } }] }; });
  res = await photo({ request: req('/api/photo?me=ko', img), env: { AI } });
  const data = await res.json();
  assert.equal(data.model, PHOTO_MODELS[1].id);
  assert.equal(data.backup, true, '화면이 "예비 AI로 읽어 더 틀릴 수 있어요"를 띄운다');
  assert.equal(data.lines.length, 3);
  assert.equal(AI.calls.length, 3);
  // 객체로만 온 응답도
  AI = fakeAI(() => ({ response: parsed }));
  assert.equal((await (await photo({ request: req('/api/photo?me=ko', img), env: { AI } })).json()).lines.length, 3);
  assert.equal(responseText({ response: { lines: [] }, choices: [{ message: { content: '{"lines":[]}' } }] }), '{"lines":[]}');
  assert.equal(responseText({ response: [{ ko: '네' }] }), '[{"ko":"네"}]', '답장 추천 · 요약의 JSON 답도 같은 길');
});

test('요청 제한: 사진은 이름 photo로 따로, 낮게 (번역은 그대로) — 긴 그림 요약도 같이 센다', async () => {
  const AI = fakeAI((m, input) => (Array.isArray(input.messages[1].content) ? { response: ANSWER } : { response: 'Merhaba.' }));
  assert.equal(PHOTO_RATE.name, 'photo');
  assert.ok(PHOTO_RATE.limit < 40 && PHOTO_RATE.limit >= MAX_PARTS + 1, '번역(40번/분)보다 낮고, 긴 그림 8조각 + 요약이 들어간다');
  const ip = { ip: '8.8.4.4' };
  for (let i = 0; i < PHOTO_RATE.limit - 1; i++) assert.equal((await photo({ request: req('/api/photo?me=ko', jpeg(800, 800), ip), env: { AI } })).status, 200);
  const sum = await photoSum({ request: req('/api/photo-summary', JSON.stringify({ me: 'ko', lines: [{ text: '原价 ¥129', tr: '정가 ¥129' }] }), { ...ip, type: 'application/json' }), env: { AI } });
  assert.equal(sum.status, 200);
  const limited = await photo({ request: req('/api/photo?me=ko', jpeg(800, 800), ip), env: { AI } });
  assert.equal(limited.status, 429);
  const lj = await limited.json();
  assert.equal(lj.code, 'rate_limited');
  assert.ok(lj.retry > 0, '화면은 기다릴 초를 받아 잠시 뒤 이어서 읽는다');
  const tr = await translate({ request: req('/api/translate', JSON.stringify({ text: '안녕하세요', from: 'ko', to: 'tr' }), { ...ip, type: 'application/json' }), env: { AI } });
  assert.equal(tr.status, 200, '같은 IP라도 번역은 그대로');
});

test('/api/photo-summary: 조각을 합친 글로 요약 한 줄 (글만 · 기본 모델 한 번) · 지어낸 숫자 거르기', async () => {
  assert.equal(validatePhotoSummary({ me: 'ko', lines: [] }).code, 'empty');
  assert.equal(validatePhotoSummary({ me: 'xx', lines: [{ text: 'a' }] }).code, 'unsupported_lang');
  assert.equal(validatePhotoSummary(null).code, 'bad_request');
  const v = validatePhotoSummary({ me: 'ko', lines: [{ text: '原价 ¥129', tr: '정가 ¥129' }, { text: '券后 ¥89', tr: '쿠폰가 ¥89' }, { text: '保质期 3年', tr: '유통기한 3년' }] }).value;
  const [sys, user] = buildPhotoSummaryMessages(v);
  assert.match(sys.content, /ONE short Korean sentence/);
  assert.match(sys.content, /Never add numbers or prices/);
  assert.match(user.content, /原价 ¥129 = 정가 ¥129/);
  assert.equal(cleanPhotoSummary('히알루론산 에센스 상세 페이지로, 쿠폰가는 ¥89예요.', v), '히알루론산 에센스 상세 페이지로, 쿠폰가는 ¥89예요.');
  assert.equal(cleanPhotoSummary('히알루론산 에센스, 지금 ¥59예요.', v), '', '없는 가격');
  assert.equal(cleanPhotoSummary('A hyaluronic serum page.', v), '', '내 언어가 아님');
  const AI = fakeAI(() => ({ response: '히알루론산 에센스 상세 페이지예요.' }));
  const res = await photoSum({ request: req('/api/photo-summary', JSON.stringify({ me: 'ko', lines: v.lines }), { type: 'application/json' }), env: { AI } });
  assert.deepEqual((await res.json()).summary, '히알루론산 에센스 상세 페이지예요.');
  assert.equal(AI.calls.length, 1);
  assert.equal(typeof AI.calls[0].input.messages[1].content, 'string', '그림 없이 글만');
  assert.equal((await photoSum({ request: req('/api/photo-summary', '{bad', { type: 'application/json' }), env: { AI } })).status, 400);
});

test('긴 그림 자르기: 보통 사진은 한 장(긴 변 1,600px), 세로로 아주 긴 상세 이미지는 겹치게 고른 조각, 최대 8조각', () => {
  let p = planPieces(1200, 1600);
  assert.equal(p.pieces.length, 1); assert.equal(p.scale, 1);
  p = planPieces(4032, 3024);
  assert.equal(p.pieces.length, 1); assert.equal(Math.round(4032 * p.scale), MAX_SIDE, '휴대폰 사진 → 긴 변 1,600px');
  assert.equal(planPieces(1080, 2400).pieces.length, 1, '20:9 화면 캡처는 한 장');
  const check = (w, h) => {
    const plan = planPieces(w, h);
    const ps = plan.pieces;
    assert.ok(ps.length >= 2 && ps.length <= MAX_PARTS, `${w}x${h}: ${ps.length}조각`);
    assert.equal(ps[0].y, 0);
    if (!plan.truncated) assert.equal(ps.at(-1).y + ps.at(-1).h, h, '끝까지 덮는다');
    for (let i = 1; i < ps.length; i++) {
      const overlap = ps[i - 1].y + ps[i - 1].h - ps[i].y;
      assert.ok(overlap >= Math.floor(ps[i].h * OVERLAP) - 1, `겹침 ${overlap}`);
    }
    for (const x of ps) {
      assert.equal(x.w, w);
      assert.ok(x.h / x.w <= 3 + 1e-9, '조각은 3:1 이하');
      assert.ok(Math.max(x.w, x.h) * plan.scale <= MAX_SIDE + 0.5, '보내는 조각도 긴 변 1,600px 이하');
    }
    return plan;
  };
  assert.equal(check(750, 4423).pieces.length, 4);
  assert.equal(check(790, 6000).truncated, false);
  const huge = check(750, 30000);
  assert.equal(huge.truncated, true, '아주 길면 앞쪽 8조각만 (화면이 알린다)');
  assert.equal(huge.pieces.length, MAX_PARTS);
  const wide = planPieces(3000, 700);
  assert.ok(wide.pieces.length >= 2 && wide.pieces.every((x) => x.h === 700 && x.y === 0), '가로로 긴 그림은 가로로 자른다');
});

test('조각 합치기: 경계에서 겹친 줄은 한 번만(덜 잘린 쪽), 떨어진 곳의 같은 줄은 그대로', () => {
  const parts = [
    { lines: [{ text: '玻尿酸补水精华液' }, { text: '85 ₺' }, { text: '产品参数' }, { text: '品名 玻尿酸补' }, { text: '净含量 30ml' }] },
    { lines: [{ text: '品名 玻尿酸补水精华液' }, { text: '净含量 30ml' }, { text: '保质期 3年' }, { text: '85 ₺' }] },
    { lines: [{ text: '保质期 3年' }, { text: '使用方法' }] },
  ];
  assert.deepEqual(mergeParts(parts).map((l) => l.text), ['玻尿酸补水精华液', '85 ₺', '产品参数', '品名 玻尿酸补水精华液', '净含量 30ml', '保质期 3年', '85 ₺', '使用方法']);
  assert.deepEqual(mergeParts([
    { lines: [{ text: '使用方法' }, { text: '1 洁面后，取2-3滴于掌心' }, { text: '2 轻拍于' }] },
    { lines: [{ text: '1 洁面后，取2-3滴于掌心' }, { text: '2 轻拍于面部至吸收' }, { text: '3 早晚各使用一次' }] },
  ]).map((l) => l.text), ['使用方法', '1 洁面后，取2-3滴于掌心', '2 轻拍于面部至吸收', '3 早晚各使用一次'], '경계에서 잘린 줄은 온전한 쪽으로');
  assert.deepEqual(mergeParts([
    { lines: [{ text: 'Mercimek Çorbası' }, { text: '85 ₺' }, { text: 'Ezogelin Çorbası' }] },
    { lines: [{ text: '85 ₺' }, { text: 'İşkembe Çorbası' }] },
  ]).map((l) => l.text), ['Mercimek Çorbası', '85 ₺', 'Ezogelin Çorbası', '85 ₺', 'İşkembe Çorbası'], '끝까지 이어지지 않는 짧은 같은 줄(다른 메뉴의 같은 가격)은 그대로');
  // 뒤 조각이 앞 조각 줄의 일부("葱段")로 시작하면 버리고 이어 맞춘다 (2026-10-12 진짜 사진 3장을 이은 긴 그림에서 나온 겹침)
  assert.deepEqual(mergeParts([
    { lines: [{ text: '猪肝翻炒片刻' }, { text: '加一勺生抽 葱段' }, { text: '翻炒均匀即可出锅' }] },
    { lines: [{ text: '葱段' }, { text: '翻炒均匀即可出锅' }, { text: '凉拌土豆丝' }] },
  ]).map((l) => l.text), ['猪肝翻炒片刻', '加一勺生抽 葱段', '翻炒均匀即可出锅', '凉拌土豆丝']);
  // 실서비스에서 나온 모양: 앞 조각은 한 줄, 뒤 조각은 두 줄로 나눠 읽음
  assert.deepEqual(mergeParts([
    { lines: [{ text: '猪肝翻炒片刻' }, { text: '加一勺生抽 葱段' }, { text: '翻炒均匀即可出锅' }] },
    { lines: [{ text: '加一勺生抽' }, { text: '葱段' }, { text: '翻炒均匀即可出锅' }, { text: '凉拌土豆丝' }] },
  ]).map((l) => l.text), ['猪肝翻炒片刻', '加一勺生抽 葱段', '翻炒均匀即可出锅', '凉拌土豆丝']);
  assert.deepEqual(mergeParts([
    { lines: [{ text: '使用方法' }, { text: '1 洁面后，取2-3滴于掌心' }] },
    { lines: [{ text: '轻拍至吸收' }, { text: '1 洁面后，取2-3滴于掌心' }, { text: '早晚各一次' }] },
  ]).map((l) => l.text), ['使用方法', '轻拍至吸收', '1 洁面后，取2-3滴于掌心', '早晚各一次'], '앞 조각이 놓친 줄은 그 자리에 넣는다');
  assert.ok(sameLine('· 下单后48小时内发货（节假日顺延）', '下单后48小时内发货 (节假日顺延)'));
  assert.ok(!sameLine('320円', '380円'));
  assert.ok(!sameLine('Mercimek Çorbası', 'Ezogelin Çorbası'));
  assert.deepEqual(mergeParts([{ lines: [] }, { error: 'x' }, { lines: [{ text: 'A' }] }]).map((l) => l.text), ['A']);
  assert.ok(isPriceOnly('85 ₺') && isPriceOnly('320円') && isPriceOnly('$6 / $9') && isPriceOnly('¥89'));
  assert.ok(!isPriceOnly('Çay 20 ₺') && !isPriceOnly('30ml 精华液') && !isPriceOnly('Espresso'));
  assert.equal(allText([{ text: 'Çay 20 ₺', tr: '차 20 ₺' }, { text: '85 ₺', tr: '' }], '메뉴판'), '메뉴판\n\nÇay 20 ₺\n차 20 ₺\n\n85 ₺');
});

test('⭐ 내 표현에 넣기: 원문(사진 언어) + 내 언어 번역 + 읽기, 기존 저장 형식 그대로', () => {
  const line = { text: '券后 ¥89', lang: 'zh', tr: '쿠폰 적용가 ¥89', read: 'Quànhòu 89' };
  const item = fromPhotoLine(line, 'ko');
  assert.equal(item.orig, 'zh');
  assert.deepEqual(item.texts, { zh: '券后 ¥89', ko: '쿠폰 적용가 ¥89' });
  assert.deepEqual(item.sound, { zh: 'Quànhòu 89' });
  assert.equal(myText(item, 'ko'), '쿠폰 적용가 ¥89');
  assert.equal(sayText(item, 'zh'), '券后 ¥89');
  const other = fromPhotoLine({ text: 'Bánh mì 25.000đ', lang: 'vi', tr: '반미 25.000동' }, 'ko');
  assert.equal(other.orig, 'ko', '다섯 언어가 아니면 번역을 처음 글로');
  assert.deepEqual(other.texts, { ko: '반미 25.000동' });
  let list = togglePhotoLine([], line, 'ko');
  assert.ok(hasPhotoLine(list, line));
  list = togglePhotoLine(list, line, 'ko');
  assert.equal(list.length, 0);
  // 저장해서 다시 읽어도 그대로 (tercuman.mine.v1 · 설정 tercuman.v1은 건드리지 않음)
  const store = new Map([['tercuman.v1', '{"settings":{"me":"ko"}}']]);
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveMine(togglePhotoLine([], line, 'ko'), storage);
  assert.deepEqual(loadMine(storage)[0].texts, { zh: '券后 ¥89', ko: '쿠폰 적용가 ¥89' });
  assert.equal(store.get('tercuman.v1'), '{"settings":{"me":"ko"}}');
});

test('화면: 번역 탭의 📷 사진 → 카메라로 찍기 / 사진 고르기, #/photo 결과 화면, 다섯 언어 문구 · 개인정보 안내', () => {
  const text = readFileSync('public/js/views/text.js', 'utf8');
  assert.match(text, /openPhotoPicker/);
  assert.match(text, /t\('photo\.button'\)/);
  const view = readFileSync('public/js/views/photo.js', 'utf8');
  assert.match(view, /type: 'file', accept: 'image\/\*', capture: capture \? 'environment'/, '카메라 입력(capture)과 사진 고르기 입력');
  assert.match(view, /choice\(true, [^)]*'photo\.camera'\)/);
  assert.match(view, /choice\(false, [^)]*'photo\.gallery'\)/);
  for (const k of ['photo.warning', 'photo.noText', 'photo.summary', 'photo.privacy', 'mine.star']) assert.match(view, new RegExp(`'${k.replace('.', '\\.')}'`), k);
  assert.match(view, /speak\(line\.text, line\.lang\)/, '줄을 누르면 원문을 읽어 준다');
  assert.match(readFileSync('public/js/app.js', 'utf8'), /photo \}/);
  for (const l of CODES) {
    for (const k of ['photo.button', 'photo.camera', 'photo.gallery', 'photo.warning', 'photo.noText', 'photo.privacy', 'err.photo_failed', 'err.photo_too_big', 'err.bad_image']) assert.ok(MESSAGES[l][k], `${l}.${k}`);
    assert.match(MESSAGES[l]['photo.button'], /^📷 /);
  }
  // 개인정보 안내: 사진은 읽기만 하고 저장하지 않음 (다섯 언어)
  assert.match(MESSAGES.ko['set.privacy'], /사진.*저장하지 않아요/);
  assert.match(MESSAGES.tr['set.privacy'], /Fotoğraf.*saklanmaz/);
  assert.match(MESSAGES.en['set.privacy'], /Photos.*never stored/);
  assert.match(MESSAGES.ja['set.privacy'], /写真.*保存しません/);
  assert.match(MESSAGES.zh['set.privacy'], /照片.*不会保存/);
});
