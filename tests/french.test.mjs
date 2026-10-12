// 프랑스어(v1.6.0, 추가지시 2): 언어 정보 · 번역 지시문(vous · tu) · 결과 점검 · 받아쓰기 · 읽는 법(철자 → 한글, 국립국어원 표기) ·
// 숫자(수 낱말 · 소수점 쉼표 · 천 단위 띄어쓰기 · et demi) · 자동 감지 · 표현집 · 화면 문구 · 사진 줄 · 목소리
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, CODES, detectLang, isRtl } from '../public/js/lang.js';
import { MESSAGES, tl, defaultLang, startLangs, setUiLang } from '../public/js/i18n.js';
import { readingFor, needsSound, hasSound, READERS } from '../public/js/reading.js';
import { frToHangul } from '../public/js/read/fr.js';
import { PHRASES, phrasesFor } from '../public/js/phrases.js';
import { buildMessages, looksValid, cleanOutput, cleanTranscript, validateTranslate, sttLanguage } from '../lib/translate-core.mjs';
import { numberMentions, cleanSuggestions, cleanSummary, validateSuggest, validateSummary } from '../lib/assist-core.mjs';
import { cleanPhoto, buildPhotoMessages, lineLang } from '../lib/photo-core.mjs';
import fr, { frDecimals } from '../lib/langs/fr.mjs';
import { onRequestPost as stt } from '../functions/api/stt.js';
import { _resetBuckets } from '../lib/guard.mjs';

beforeEach(() => { _resetBuckets(); setUiLang('ko'); });
const ORIGIN = 'https://interpreter-for-koreans.pages.dev';
const values = (text) => numberMentions(text, 'fr').map((m) => m.alts[0]).sort((a, b) => a - b);

test('프랑스어 언어 정보: fr-FR · 라틴 문자 · 왼쪽→오른쪽 · 모든 언어와 짝', () => {
  const { code, native, flag, bcp47, short, script } = LANGS.fr;
  assert.deepEqual({ code, native, flag, bcp47, short, script }, { code: 'fr', native: 'Français', flag: '🇫🇷', bcp47: 'fr-FR', short: 'FR', script: 'Latn' });
  assert.ok(!isRtl('fr'));
  for (const c of CODES.filter((x) => x !== 'fr')) {
    assert.ok(validateTranslate({ text: 'Bonjour', from: 'fr', to: c }).value, `fr → ${c}`);
    assert.ok(validateTranslate({ text: 'x', from: c, to: 'fr' }).value, `${c} → fr`);
  }
  assert.equal(defaultLang(['fr-CA', 'en']), 'fr', '캐나다 · 벨기에 · 스위스 프랑스어도');
  assert.equal(defaultLang(['fr-BE']), 'fr');
  assert.deepEqual(startLangs({}, ['fr-FR']), { me: 'fr', partner: 'ko' });
});

test('번역 지시문: vous / tu · 프랑스어 악센트, 영어로 답하면 다음 모델로', () => {
  const sys = (from, to, formal = true) => buildMessages({ text: 'x', from, to, formal })[0].content;
  assert.match(sys('ko', 'fr'), /from Korean into French/);
  assert.match(sys('ko', 'fr'), /"vous"/);
  assert.match(sys('ko', 'fr', false), /"tu"/);
  assert.doesNotMatch(sys('ko', 'fr', false), /"vous"/);
  assert.match(sys('ko', 'fr'), /French accents \(é, è, ê, à, ç/);
  assert.match(sys('fr', 'ko'), /from French into Korean/);
  assert.match(sys('fr', 'ko'), /존댓말/);
  assert.match(sys('ko', 'zh'), /and French speakers/, '언어 목록에 프랑스어');
  assert.ok(looksValid('C’est combien ?', { text: '이거 얼마예요?', from: 'ko', to: 'fr' }));
  assert.ok(looksValid('iPhone 15 Pro Max, c’est combien ?', { text: 'iPhone 15 Pro Max 얼마예요?', from: 'ko', to: 'fr' }));
  assert.ok(looksValid('OK', { text: '좋아요', from: 'ko', to: 'fr' }));
  assert.ok(!looksValid('How much is this?', { text: '이거 얼마예요?', from: 'ko', to: 'fr' }), '영어로 답함');
  assert.ok(!looksValid('C’est 얼마', { text: '얼마예요?', from: 'ko', to: 'fr' }), '한글이 남음');
  assert.equal(cleanOutput('Français : Bonjour !'), 'Bonjour !');
  assert.equal(cleanOutput('Traduction : Merci beaucoup.'), 'Merci beaucoup.');
  assert.equal(cleanOutput('French: Merci'), 'Merci');
});

test('받아쓰기: Whisper에 fr, 무음에서 지어내는 프랑스어 자막 문장은 버린다', async () => {
  for (const s of ['Sous-titrage ST\' 501', 'Sous-titres réalisés par la communauté d\'Amara.org', 'Merci d\'avoir regardé cette vidéo !', 'Abonnez-vous à la chaîne', 'N\'oubliez pas de vous abonner', 'Sous-titrage Société Radio-Canada'])
    assert.equal(cleanTranscript(s), '', s);
  for (const s of ['Merci beaucoup.', 'C’est combien ?', 'Je voudrais un café.', 'Merci.']) assert.equal(cleanTranscript(s), s, s);
  assert.equal(sttLanguage('fr'), 'fr');
  const calls = [];
  const AI = { run: async (model, input) => { calls.push(input); return { text: ' C’est combien ? ' }; } };
  const req = new Request(`${ORIGIN}/api/stt?lang=fr`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'audio/webm', 'cf-connecting-ip': '8.8.8.1' }, body: new Uint8Array(5000).fill(3) });
  assert.deepEqual(await (await stt({ request: req, env: { AI } })).json(), { text: 'C’est combien ?' });
  assert.equal(calls[0].language, 'fr');
});

test('읽는 법: 프랑스어 → 한글 (국립국어원 프랑스어 표기 · 잘 알려진 표기)', () => {
  const cases = {
    Paris: '파리', Bonjour: '봉주르', Merci: '메르시', croissant: '크루아상', 'Champs-Élysées': '샹젤리제', Bordeaux: '보르도', Lyon: '리옹',
    "s'il vous plaît": '실 부 플레', 's’il vous plaît': '실 부 플레', "l'addition": '라디시옹', combien: '콩비앵',
    Marseille: '마르세유', Versailles: '베르사유', Champagne: '샹파뉴', Cognac: '코냐크', Nice: '니스', Louvre: '루브르', Eiffel: '에펠',
    café: '카페', baguette: '바게트', 'crème brûlée': '크렘 브륄레', Toulouse: '툴루즈', Strasbourg: '스트라스부르', Chanel: '샤넬',
    Camembert: '카망베르', Rousseau: '루소', Napoléon: '나폴레옹', enchanté: '앙샹테', bonsoir: '봉수아르', 'au revoir': '오 르부아르',
    'merci beaucoup': '메르시 보쿠', oui: '위', non: '농', Monsieur: '므시외', chocolat: '쇼콜라', cuisine: '퀴진',
    // 국립국어원 외래어 표기법 제3장 제4절(프랑스어) 보기
    soupe: '수프', tête: '테트', avec: '아베크', ronde: '롱드', bague: '바그', septembre: '셉탕브르', octobre: '옥토브르', action: '악시옹',
    manche: '망슈', piège: '피에주', acheter: '아슈테', dégager: '데가제', chemise: '슈미즈', gigot: '지고', page: '파주', journal: '주르날',
    campagne: '캉파뉴', mignon: '미뇽', payer: '페예', billet: '비예', taille: '타유', Bastille: '바스티유', famille: '파미유', hier: '이에르',
    champion: '샹피옹', diable: '디아블', quoi: '쿠아', Montesquieu: '몽테스키외', taxi: '탁시', exemple: '에그장플',
    // 묵음 · 연음 · 엘리지옹 · 약한 e
    'les amis': '레 자미', 'vous avez': '부 자베', 'un ami': '욍 나미', 'Comment allez-vous ?': '코망 탈레부 ?', 'C’est en stock ?': '세 탕 스토크 ?',
    seulement: '쇨망', lentement: '랑트망', 'Appelez la police !': '아플레 라 폴리스 !', 'comprend-il': '콩프랑틸', 'Emballez-le': '앙발레르',
    'Ça coûte 14,50 €.': '사 쿠트 14,50 €.', 'Je voudrais un café.': '주 부드레 욍 카페.',
  };
  for (const [frText, ko] of Object.entries(cases)) assert.equal(frToHangul(frText), ko, frText);
  assert.equal(frToHangul(''), '');
  // 읽는 법 길: 한국어 사용자에게만 한글 발음 (서버 소리 표기 없이), 다른 사용자에게는 라틴 문자라 없음
  assert.ok(!READERS.fr.sound && !hasSound('fr') && !needsSound('fr', 'ko'));
  assert.equal(readingFor('Bonjour', 'fr', 'ko'), '봉주르');
  for (const v of ['en', 'tr', 'ja', 'zh', 'ar', 'vi']) assert.equal(readingFor('Bonjour', 'fr', v), '', v);
  assert.equal(readingFor('안녕하세요', 'ko', 'fr'), 'Annyeonghaseyo', '프랑스어 사용자에게 한국어는 로마자');
  assert.equal(readingFor('مرحبا', 'ar', 'fr', 'marḥabā'), 'Marhabā', '프랑스어 사용자에게 아랍어는 로마자');
});

test('숫자: 프랑스어 수 낱말 · 소수점 쉼표 · 천 단위 띄어쓰기 · et demi · euros cinquante', () => {
  const cases = [
    ['quatre-vingts', [80]], ['quatre-vingt-dix-neuf', [99]], ['quatre-vingt-un', [81]], ['soixante-dix', [70]], ['soixante-quinze', [75]],
    ['soixante et onze', [71]], ['vingt et un', [21]], ['vingt-et-un', [21]], ['trente-deux', [32]], ['dix-sept', [17]], ['seize', [16]],
    ['deux cents', [200]], ['deux cent cinquante', [250]], ['cent', [100]], ['mille', [1000]], ['deux mille cinq cents', [2500]], ['cinq mille', [5000]],
    ['un million', [1000000]], ['septante', [70]], ['nonante-neuf', [99]],
    ['14,50 €', [14.5]], ['1,5 kg', [1.5]], ['1 000 €', [1000]], ['1 000 €', [1000]], ['1 200,50 €', [1200.5]], ['15 mille', [15000]],
    ['quatorze euros et demi', [14.5]], ['14 et demi', [14.5]], ['deux heures et quart', [2.25]], ['un kilo et demi', [1.5]],
    ['quatorze euros cinquante', [14.5]], ['deux euros cinq', [2.05]],
    ['quinze pour cent', [15]], ['deux ou trois jours', [2, 3]], ['une demi-heure', [0.5, 1]],
    ['un téléphone tout neuf', [1]], ['neuf euros', [9]], ['Bonjour madame', []], ['C’est cher', []],
  ];
  for (const [text, want] of cases) assert.deepEqual(values(text), want, text);
  assert.deepEqual(numberMentions('un', 'fr'), [{ alts: [1], word: true }], '낱말로 쓴 1');
  assert.equal(frDecimals('Prix : 1 000,50 €'), 'prix : 1000.5 €');
  for (const n of ['aucun', 'non précisé', 'Rien', 'inconnue']) assert.match(n, fr.none, n);
});

test('답장 추천 · 합의 요약: 프랑스어로 쓴 지어낸 숫자는 버리고, 대화에 나온 숫자는 남긴다', () => {
  const turns = [{ side: 'partner', from: 'fr', to: 'ko', text: 'C’est quatorze euros cinquante la pièce, et la livraison prend trois jours.', translation: '개당 14.5유로이고, 배송은 3일 걸려요.' }];
  const v = validateSuggest({ me: 'ko', partner: 'fr', turns }).value;
  const raw = JSON.stringify([
    { ko: '좋아요, 14.5유로로 할게요.', fr: 'D’accord, quatorze euros cinquante, c’est bon.' },
    { ko: '12유로로 해 주세요.', fr: 'Vous pouvez faire douze euros ?' },
    { ko: '배송은 3일이면 괜찮아요.', fr: 'Trois jours, c’est parfait.' },
    { ko: '스무 개 주문할게요.', fr: 'Je vais en commander vingt.' },
    { ko: '하나 살게요.', fr: 'J’en prends un.' },
  ]);
  assert.deepEqual(cleanSuggestions(raw, v).map((s) => s.partner), ['D’accord, quatorze euros cinquante, c’est bon.', 'Trois jours, c’est parfait.', 'J’en prends un.']);
  const s = validateSummary({ me: 'fr', partner: 'ko', turns: [
    { side: 'partner', from: 'ko', to: 'fr', text: '개당 15위안이고 100개부터 팔아요.', translation: '15 yuans la pièce, minimum 100 pièces.' },
    { side: 'me', from: 'fr', to: 'ko', text: 'D’accord, je prends cent pièces.', translation: '좋아요, 100개 살게요.' },
  ] }).value;
  const out = cleanSummary({
    price: { fr: 'quinze yuans la pièce', ko: '개당 15위안' },
    quantity: { fr: 'cent pièces', ko: '100개' },
    delivery: { fr: 'non précisé', ko: '없음' },
    other: { fr: 'total 1 500 yuans', ko: '총 1500위안' },
  }, s);
  assert.deepEqual(out.fields, {
    price: { me: 'quinze yuans la pièce', partner: '개당 15위안' },
    quantity: { me: 'cent pièces', partner: '100개' },
    delivery: { me: '', partner: '' },
    other: { me: '', partner: '' },
  });
});

test('자동 감지: 프랑스어를 영어 · 튀르키예어 · 베트남어와 가른다 (기존 감지는 그대로)', () => {
  for (const s of ['Bonjour, c’est combien ?', 'Je voudrais l’addition, s’il vous plaît.', 'Ça coûte combien ?', 'Café crème', 'Où sont les toilettes ?', 'Pouvez-vous m’aider ?', 'Je suis allergique aux arachides.', 'Merci beaucoup'])
    assert.equal(detectLang(s, 'ko'), 'fr', s);
  for (const [s, want] of [['I’d like a café latte, please', 'en'], ['Where is the hotel?', 'en'], ['Çay lütfen', 'tr'], ['Merhaba, nasılsınız?', 'tr'], ['Hünkâr Beğendi', 'tr'], ['Xin chào, cái này bao nhiêu tiền?', 'vi'], ['Phở bò tái', 'vi']])
    assert.equal(detectLang(s, 'ko'), want, s);
  assert.equal(lineLang('Crème brûlée 8,50 €', 'fr'), 'fr');
  assert.equal(lineLang('Croque-monsieur', 'fr'), 'fr', '모델이 준 프랑스어');
  assert.equal(lineLang('Café crème', ''), 'fr');
});

test('표현집: 모든 문장에 프랑스어 (vous · 문장 부호), 한글 발음이 다 나온다, 성별이 드러나지 않는 소개', () => {
  for (const p of PHRASES) {
    assert.ok(typeof p.fr === 'string' && p.fr.trim(), p.ko);
    assert.match(p.fr, /[.?!]$/, `문장 끝: ${p.fr}`);
    assert.doesNotMatch(p.fr, /[가-힣؀-ۿ]/, p.fr);
    assert.doesNotMatch(p.fr, /\b(?:the|please|you)\b/i, `영어가 남음: ${p.fr}`);
    const ko = frToHangul(p.fr);
    assert.doesNotMatch(ko, /\p{Script=Latin}/u, `한글로 다 바뀜: ${p.fr} → ${ko}`);
    assert.equal(readingFor(p.fr, 'fr', 'ko'), ko);
  }
  const tokens = (s) => s.toLowerCase().split(/[^\p{L}]+/u);
  assert.ok(!PHRASES.some((p) => tokens(p.fr).some((w) => ['tu', 'te', 'ton', 'ta', 'tes'].includes(w))), 'vous 말투');
  const by = (k) => PHRASES.find((p) => p.ko === k);
  assert.equal(by('안녕하세요.').fr, 'Bonjour.');
  assert.equal(readingFor(by('계산서 주세요.').fr, 'fr', 'ko'), '라디시옹, 실 부 플레.');
  assert.equal(readingFor(by('이거 얼마예요?').fr, 'fr', 'ko'), '세 콩비앵 ?');
  assert.equal(by('저는 한국 사람이에요.').fr, 'Je viens de Corée.', '성별 없는 꼴 (coréen/coréenne를 피함)');
  const ko = (cat, partner, me) => phrasesFor(cat, partner, me).map((p) => p.ko);
  assert.ok(ko('talk', 'ko', 'fr').includes('저는 프랑스어를 해요.'));
  assert.ok(ko('talk', 'fr', 'ko').includes('프랑스어를 잘 못해요.'));
  assert.ok(ko('help', 'ko', 'fr').includes('저희 나라 대사관에 연락해 주세요.'));
  const order = phrasesFor('order', 'fr', 'ko').map((p) => p.fr).join(' ');
  for (const w of ['prix unitaire', 'échantillon', 'livraison', 'numéro de suivi', 'facture', 'remboursement']) assert.ok(order.includes(w), w);
});

test('화면 문구(프랑스어): vous 말투 · 업데이트 버튼 · 말투 안내 · 앱 정보 · 상대 안내(오른쪽 버튼)', () => {
  for (const [k, s] of Object.entries(MESSAGES.fr)) {
    if (k !== 'set.readingHint') assert.doesNotMatch(s, /[가-힣]/, `한국어가 남음: fr.${k}`);
  }
  const all = Object.values(MESSAGES.fr).join(' ');
  assert.doesNotMatch(all, /\b(?:Settings|Translate|History|Speak|Copy|Close|Tap|Share|Delete)\b/, '영어 사본이 남지 않음');
  assert.match(all, /[éèàçê]/, '프랑스어 악센트');
  const words = Object.entries(MESSAGES.fr).filter(([k]) => k !== 'set.toneHint').flatMap(([, s]) => s.toLowerCase().split(/[^\p{L}]+/u));
  for (const w of ['tu', 'ta', 'tes', 'toi']) assert.ok(!words.includes(w), `vous 말투: ${w}`); // ton은 '말투'(Ton)라 뺀다
  assert.match(tl('fr', 'set.updateHint'), /Mettre à jour/);
  assert.match(tl('fr', 'set.toneHint'), /您/);
  assert.match(tl('fr', 'set.toneHint'), /vous\/tu/);
  assert.match(tl('fr', 'set.about'), /chinois/);
  assert.match(tl('fr', 'set.about'), /11 langues/);
  assert.match(tl('fr', 'err.paused'), /\{time\}/);
  assert.match(tl('fr', 'mic.partnerHint'), /français/);
  assert.match(tl('fr', 'mic.partnerHint'), /droite/, '상대 버튼은 오른쪽');
  assert.match(tl('fr', 'set.voiceSample'), /Bonjour/);
  assert.equal(tl('fr', 'lang.ko'), 'coréen');
  assert.equal(tl('fr', 'talk.ariaSpeak', { lang: tl('fr', 'lang.ar') }), 'Parler en arabe');
  assert.equal(tl('ko', 'lang.fr'), '프랑스어');
  assert.equal(tl('ar', 'lang.fr'), 'الفرنسية');
});

test('사진: 프랑스어 메뉴 줄(줄 언어 · 소수점 쉼표 가격 · 지어낸 숫자) · 프랑스어 사용자에게 프랑스어 번역 (가짜 AI 답)', () => {
  const ko = cleanPhoto({
    lines: [
      { text: 'Croque-monsieur 8,50 €', lang: 'fr', tr: '크로크무슈 8,50 €' },
      { text: 'Soupe à l’oignon', lang: 'fr', tr: '양파 수프' },
      { text: 'Crème brûlée', lang: 'fr', tr: '크렘 브륄레 9유로' },
      { text: '12,00 €', tr: '12,00 €' },
    ],
    summary: '프랑스 식당 메뉴판이에요.',
  }, { me: 'ko' });
  assert.deepEqual(ko.lines[0], { text: 'Croque-monsieur 8,50 €', lang: 'fr', tr: '크로크무슈 8,50 €', read: '' });
  assert.equal(readingFor(ko.lines[1].text, 'fr', 'ko'), '수프 아 로뇽', '읽는 법은 화면에서 철자로');
  assert.deepEqual([ko.lines[2].tr, ko.lines[2].check], ['', 'number'], '원문에 없는 9유로');
  assert.equal(ko.lines[3].lang, 'fr', '가격만 있는 줄은 사진의 주 언어');
  assert.equal(ko.summary, '프랑스 식당 메뉴판이에요.');
  const sys = buildPhotoMessages({ me: 'fr' }, 'x');
  assert.match(sys[0].content, /for a French speaker/);
  assert.match(sys[0].content, /Hanyu Pinyin/);
  assert.match(sys[0].content, /Arabic → romanization/);
  assert.match(sys[1].content[1].text, /translate it into French/);
  const frUser = cleanPhoto({
    lines: [
      { text: '牛肉面 ¥25', lang: 'zh', tr: 'Nouilles au bœuf ¥25', read: 'niúròu miàn' },
      { text: 'شاورما دجاج', lang: 'ar', tr: 'Shawarma au poulet', read: 'shāwarmā dajāj' },
      { text: '烤鸡 ¥38', lang: 'zh', tr: 'Poulet rôti ¥45' },
    ],
    summary: 'Un menu de restaurant.',
  }, { me: 'fr' });
  assert.deepEqual(frUser.lines[0], { text: '牛肉面 ¥25', lang: 'zh', tr: 'Nouilles au bœuf ¥25', read: 'niúròu miàn' });
  assert.equal(frUser.lines[1].read, 'shāwarmā dajāj', '프랑스어 사용자에게 아랍어 로마자');
  assert.equal(readingFor(frUser.lines[1].text, 'ar', 'fr', frUser.lines[1].read), 'Shāwarmā dajāj');
  assert.deepEqual([frUser.lines[2].tr, frUser.lines[2].check], ['', 'number']);
  assert.equal(frUser.summary, 'Un menu de restaurant.');
});

test('목소리: 프랑스어는 fr-* 어느 지역 목소리든 쓰고(fr-FR 먼저), 다른 언어 목소리는 안 쓴다', async () => {
  const voices = [
    { lang: 'en-US', name: 'Samantha', voiceURI: 'en' },
    { lang: 'fr-CA', name: 'Amélie', voiceURI: 'ca' },
    { lang: 'fr-FR', name: 'Thomas', voiceURI: 'fr' },
    { lang: 'fr_BE', name: 'French Belgium', voiceURI: 'be' },
    { lang: 'fy-NL', name: 'Frisian', voiceURI: 'fy' },
  ];
  globalThis.window = { speechSynthesis: { getVoices: () => voices, addEventListener() {} } };
  try {
    const { voicesFor } = await import('../public/js/speech.js');
    const list = voicesFor('fr').map((v) => v.voiceURI);
    assert.equal(list[0], 'fr', 'fr-FR 먼저');
    assert.deepEqual([...list].sort(), ['be', 'ca', 'fr']);
  } finally { delete globalThis.window; }
});
