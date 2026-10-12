// 언어 정보 · 글로 언어 알아보기 · 기록 항목이 누구 쪽인지 (화면 문구는 i18n/ · 표현집은 phrases.js · 읽는 법은 reading.js)
// 언어를 더할 때: 여기 LANGS 한 줄 → i18n/<code>.js(화면 글자) · phrases/<code>.js(표현집) · read/<code>.js(읽는 법) · lib/langs/<code>.mjs(서버)
//
// name: 번역 지시문에 쓰는 영어 이름 · script: 글자 체계(ISO 15924) · dir: 글 방향(아랍어만 rtl)
// voices: 읽어 주기 목소리 고르기 — 받는 목소리 언어 태그(소문자, _는 -로)를 앞에서부터 순서대로 (이 목록에 없는 목소리는 안 씀)

export const LANGS = {
  ko: { code: 'ko', native: '한국어', flag: '🇰🇷', bcp47: 'ko-KR', short: 'KO', name: 'Korean', script: 'Hang' },
  tr: { code: 'tr', native: 'Türkçe', flag: '🇹🇷', bcp47: 'tr-TR', short: 'TR', name: 'Turkish', script: 'Latn' },
  en: { code: 'en', native: 'English', flag: '🇺🇸', bcp47: 'en-US', short: 'EN', name: 'English', script: 'Latn' },
  ja: { code: 'ja', native: '日本語', flag: '🇯🇵', bcp47: 'ja-JP', short: 'JA', name: 'Japanese', script: 'Jpan' },
  // 간체 중국어 (중국 본토 보통화). 홍콩·광둥어(zh-HK · yue) 목소리는 같은 글을 광둥어로 읽어서 뺀다
  zh: {
    code: 'zh', native: '简体中文', flag: '🇨🇳', bcp47: 'zh-CN', short: 'ZH', name: 'Simplified Chinese', script: 'Hans',
    voices: [/^(zh|cmn)(-hans)?(-cn|-sg)?$/, /^(zh|cmn)(-hant)?-tw$/],
  },
  // 번체 중국어 (대만 · 홍콩 글자, 소리는 대만 보통화) — 엔진은 간체와 같고 글자체 · 목소리만 다르다 (v1.6.0)
  'zh-TW': {
    code: 'zh-TW', native: '繁體中文', flag: '🇹🇼', bcp47: 'zh-TW', short: 'TW', name: 'Traditional Chinese', script: 'Hant',
    voices: [/^(zh|cmn)(-hant)?-tw$/, /^(zh|cmn)(-hans)?(-cn|-sg)?$/],
  },
  vi: { code: 'vi', native: 'Tiếng Việt', flag: '🇻🇳', bcp47: 'vi-VN', short: 'VI', name: 'Vietnamese', script: 'Latn' },
  th: { code: 'th', native: 'ภาษาไทย', flag: '🇹🇭', bcp47: 'th-TH', short: 'TH', name: 'Thai', script: 'Thai' },
  ru: { code: 'ru', native: 'Русский', flag: '🇷🇺', bcp47: 'ru-RU', short: 'RU', name: 'Russian', script: 'Cyrl' },
  ar: { code: 'ar', native: 'العربية', flag: '🇸🇦', bcp47: 'ar-SA', short: 'AR', name: 'Arabic', script: 'Arab', dir: 'rtl' },
  fr: { code: 'fr', native: 'Français', flag: '🇫🇷', bcp47: 'fr-FR', short: 'FR', name: 'French', script: 'Latn' }, // 추가지시 2
};
export const CODES = Object.keys(LANGS);

/** 오른쪽에서 왼쪽으로 쓰는 언어인가 (아랍어) */
export const isRtl = (code) => LANGS[code]?.dir === 'rtl';
/** 글 방향: 'rtl' · 'ltr' (모르는 언어는 ltr) */
export const dirOf = (code) => (isRtl(code) ? 'rtl' : 'ltr');
/** 한자로 쓰는 중국어 (간체 · 번체) */
export const isChinese = (code) => code === 'zh' || code === 'zh-TW';

/**
 * 브라우저 언어 태그(zh-TW · zh_Hant_HK · vi-VN · ar-EG …) → 이 앱의 언어 코드, 없으면 null.
 * 대만 · 홍콩 · 마카오 · 번체(Hant)는 번체 중국어, 그 밖의 중국어는 간체
 */
export function codeOfTag(tag) {
  const s = String(tag || '').toLowerCase().replace(/_/g, '-');
  const base = s.split('-')[0];
  if (base === 'zh') return /-(hant|tw|hk|mo)(-|$)/.test(s) ? 'zh-TW' : 'zh';
  return CODES.includes(base) ? base : null;
}

// ---------- 글로 언어 알아보기 (글 번역 탭의 🔎 자동 감지 · 사진 줄 언어) ----------
const TR_LETTERS = /[çğıöşüİĞŞ]/i;
const TR_WORDS = new Set('ve bir bu da de ne ben sen o biz siz onlar var yok mı mi mu mü için çok ama evet hayır merhaba teşekkür ederim lütfen nasıl nerede kaç ne zaman tamam iyi güzel değil şey gibi daha en ile bunu şu benim senin sizin burada orada istiyorum ister misiniz musunuz miyim yapabilir olur oldu olsun kadar sonra önce şimdi bugün yarın dün otel otobüs tren bilet su çay kahve hesap fiyat lira'.split(' '));
const EN_WORDS = new Set('the a an and is are was were be been to of in on at for with from this that these those it i you he she we they my your our me him her them do does did not no yes please thank thanks hello hi how what where when why who which can could would should will shall have has had there here go going want need like much many some any just very really okay ok sorry excuse'.split(' '));
// 베트남어: 베트남어에만 쓰는 글자 (ă đ ơ ư와 아래 점 · 갈고리 · 겹친 성조 부호가 붙은 모음).
// â · ê · ô · à · é 같은 것은 튀르키예어(kâğıt) · 프랑스어에도 나와서 뺀다
const VI_LETTERS = /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
// 프랑스어: 튀르키예어 · 영어에 없는 글자(é è à ù œ ë ï — ç는 튀르키예어에도 있어서 뺀다)와 흔한 낱말
const FR_LETTERS = /[éèàùœëïÿ]/i;
const FR_WORDS = new Set("le la les un une des du de et est je tu il elle nous vous ils elles sont pas ne que qui où quoi combien merci bonjour bonsoir salut oui non avec pour dans sur ce cette ces c'est je voudrais voudrais s'il plaît madame monsieur au aux mon ma mes votre vos très bien aussi encore l'addition prix euros ça".split(' '));

// 베트남어 낱말 (글자만으로 모를 때: Xin chào · Bánh mì · 부호 없이 쓴 xin chao): 부호까지 그대로 쓴 흔한 낱말은 2점(부호 없는 것 1점),
// 부호 없이 쓴 흔한 낱말은 1점 — 프랑스어 · 튀르키예어 · 영어와 겹치는 낱말(là · toi · tien · on · can …)은 넣지 않는다
const VI_WORDS = new Set('xin chào cảm tôi bạn có không được cái này kia đây đó bao nhiêu tiền gì đâu rồi nhé ạ vâng dạ anh chị em ông bà cô chú mình tên mua bán ăn uống đi về ở muốn cần biết hiểu nói tiếng người việt hàn quốc phở bánh mì cà phê trà sữa nước cơm bún gà bò thịt rất quá lắm nhiều rẻ đắt ngon đẹp khách sạn phòng giúp lỗi giá mấy giờ'.split(' '));
const VI_PLAIN = new Set('chao khong duoc nhieu nguoi viet muon biet hieu tieng khach phong giup banh nuoc uong minh vang cai nay dau nhe thit dep'.split(' '));
function viScore(text) {
  const s = String(text).normalize('NFC').toLowerCase();
  let n = /\b(cam on|xin loi)\b/.test(s) ? 2 : 0;
  for (const w of s.match(/\p{L}+/gu) || []) {
    const plain = /^[a-z]+$/.test(w);
    if (VI_WORDS.has(w)) n += plain ? 1 : 2;
    else if (plain && VI_PLAIN.has(w)) n++;
  }
  return n;
}

// 한자만 있는 글이 간체 · 번체 중국어인지 일본어인지 가를 글자들 (v1.6.0부터 간체 · 번체를 따로 센다)
// 간체로만 쓰는 글자
const HANS = new Set([...'们这说吗么钱买卖时东车门问谢对见还个为发货价样质换运输单网订给谁边贵块让认识请语话读讲该详试账购赔费银错钟间开关头实层岁帮带广应总爱报无现电码确签简纸级约红线练组细终经结绍统续绿编联职节范获补视觉计记设访证评诉译询负财责贴转轮软轻较辆过进远连迟适选邮递钥链销锁键长闭队阳际陆险难须顾预领题颜额风飞饭饮馆马验鱼鸡齐龙俩种产厂坏损优图几两华场动业热务卫员汇处观欢鲜虾汤烧鸭']);
// 간체와 일본어가 같은 모양이고 번체만 다른 글자 (点 · 学 · 国 …): 일본어와 가를 때는 세지 않고, 간체 · 번체를 가를 때만 간체로 센다
const HANS_JA = new Set([...'国学会来点体号万与写声当旧数区医双条宝乱党独灯将状断称画尽没']);
// 번체로만 쓰는 글자 (일본은 약자 · 다른 모양: 們 · 這 · 說 · 錢 · 麵 · 臺 …)
const HANT = new Set([...'們這說嗎麼錢賣對發價樣單讀國學會來點體號萬與實寫聲當舊數區醫歲氣圖廣樂經濟關險驗總譯轉輕邊遲帶應覺續綠聽兩齊龍臺灣麵雞鐵歡觀處廳戰黃圓縣鹽變讓證寶稱圍惡壓營舉斷狀將傳團燈黨獨腦髮辦滿藥亂齡勞錄畫歸檢權從燒裡雙條沒幫簽聯輛遞鑰鏈顏產廠壞囉']);
// 중국어에만 쓰는 낱말 글자 (간체 · 번체 같음)
const ZH_WORD = new Set([...'你她呢吧啊很吃喝哪怎您咱呀啦哦嗯喔是我']);
// 일본어: 일본에서만 쓰는 약자(駅·円·気…)
const JA_ONLY = new Set([...'駅円気様楽売読図広発経済対実単戦鉄関険験総歳説訳転軽辺遅価帯応覚続緑聴弁両斉竜悪圧囲栄塩桜絵拡勧観歓帰拠挙駆継鶏県剣検権厳効鉱剤雑歯児釈渋縦譲収従処浄乗証焼粋酔銭繊荘捜巣騒増蔵臓択沢団弾庁徴伝稲闘徳悩脳廃拝髪抜晩払仏変豊満黙薬頼覧涙霊齢労録込畑峠働枠匂']);
// 일본어 · 번체가 같이 쓰고 간체에는 없는 모양(東·時·見…)
const HANT_JA = new Set([...'東時見車門間長書語話買電開閉問題頭顔風飛飯飲館馬魚鳥島機業親現線紙級約紅練組細終結紹統編職節範補規視設訪評計記試誤調談謝請認識貴費質購貨負財責輪軟較輸進遠連選郵銀錯鍵隊陽陸難須顧預領額歩個為']);
const KANA = /[ぁ-ゖァ-ヺー]/g; // 히라가나 · 가타카나 · 장음 (・는 중국어 글에도 나와서 뺀다)
const HAN = /[㐀-䶿一-鿿]/g;
const HAN1 = /[㐀-䶿一-鿿]/;

/**
 * 한자 글의 간체 글자 수 · 번체 글자 수 — 사진 줄 · 번체 번역 점검 · 자동 감지
 * (간체 = 간체로만 쓰는 글자 + 일본어와 같은 간체 모양, 번체 = 번체로만 쓰는 글자 + 일본어와 같은 번체 모양)
 */
export function hanStyle(text) {
  let hans = 0, hant = 0;
  for (const c of String(text ?? '')) {
    if (HANS.has(c) || HANS_JA.has(c)) hans++;
    else if (HANT.has(c) || HANT_JA.has(c)) hant++;
  }
  return { hans, hant };
}

/**
 * 한자만 있는 글: 중국어에만 쓰는 글자(간체 · 번체 · 중국어 낱말 · 謝謝처럼 겹쳐 쓴 글자)와 일본에서만 쓰는 글자를 견줘 많은 쪽.
 * 같으면 일본어 · 번체가 같이 쓰는 모양(東 · 問 · 題…)이 있거나 fallback이 일본어일 때 ja — 다만 번체 대화 중(fallback zh-TW)이면 번체.
 * 중국어면 간체 글자와 번체 글자를 견줘 zh · zh-TW, 같으면 fallback이 번체일 때만 zh-TW
 */
function hanOnlyLang(s, fallback) {
  const tw = fallback === 'zh-TW';
  let zh = 0, ja = 0, shared = 0, prev = '';
  for (const c of s) {
    if (HANS.has(c) || HANT.has(c) || ZH_WORD.has(c) || (c === prev && HAN1.test(c))) zh++; // 일본어는 겹쳐 쓸 때 々
    else if (JA_ONLY.has(c)) ja++;
    else if (HANT_JA.has(c)) shared++;
    prev = c;
  }
  if (zh < ja || (zh === ja && (fallback === 'ja' || (shared && !tw)))) return 'ja';
  const { hans, hant } = hanStyle(s);
  if (hans !== hant) return hans > hant ? 'zh' : 'zh-TW';
  return tw ? 'zh-TW' : 'zh';
}

/** 글자 체계마다 글자 수 (글자만 센다) */
const count = (s, re) => (s.match(re) || []).length;

/**
 * 글이 어느 언어인지: 한글 → ko, 가나가 있으면 ja, 한자만 있으면 중국어 쪽으로(간체 zh · 번체 zh-TW, 일본 글자체면 ja),
 * 타이 문자 → th, 키릴 문자 → ru, 아랍 문자 → ar, 베트남어 글자 · 흔한 낱말 → vi, 프랑스어 글자(é · à …) → fr,
 * 튀르키예어 글자·흔한 낱말 → tr, 영어 · 프랑스어 낱말 → en · fr. 모르겠으면 fallback
 */
export function detectLang(text, fallback = 'en') {
  const s = String(text || '');
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters) return fallback;
  const n = letters.length;
  if (count(s, /[가-힣ㄱ-ㅎㅏ-ㅣ]/g) / n >= 0.3) return 'ko';
  const kana = count(s, KANA);
  const han = count(s, HAN);
  if ((kana + han) / n >= 0.3) return kana ? 'ja' : hanOnlyLang(s, fallback);
  if (count(s, /[฀-๿]/g) / n >= 0.3) return 'th';
  if (count(s, /[Ѐ-ӿ]/g) / n >= 0.3) return 'ru';
  if (count(s, /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g) / n >= 0.3) return 'ar';
  if (VI_LETTERS.test(s.normalize('NFC')) || viScore(s) >= 2) return 'vi'; // 프랑스어 글자(à · é)보다 먼저: Xin chào · Cà phê
  if (FR_LETTERS.test(s) && !/[ğışİ]/i.test(s)) return 'fr';
  if (TR_LETTERS.test(s) && !/[ç]/i.test(s.replace(/[ğıöşüİĞŞ]/g, ''))) return 'tr';
  const words = s.toLowerCase().match(/[a-zçğıöşüâêîôûéèàùœëï']+/g) || []; // tr-TR 소문자는 영어 I를 ı로 바꿔 버린다
  let tr = TR_LETTERS.test(s) ? 1 : 0, en = 0, fr = 0;
  for (const w of words) {
    if (TR_WORDS.has(w)) tr++;
    if (EN_WORDS.has(w.replace(/'.*$/, ''))) en++;
    if (FR_WORDS.has(w) || FR_WORDS.has(w.replace(/^[ldjmnstc]'/, ''))) fr++;
    if (/(yor|iyor|ıyor|uyor|üyor|ler|lar|mak|mek|sınız|siniz|ım|im|um|üm)$/.test(w) && w.length > 4) tr += 0.5;
  }
  const best = Math.max(tr, en, fr);
  if (!best || [tr, en, fr].filter((x) => x === best).length > 1) return fallback;
  return best === tr ? 'tr' : best === en ? 'en' : 'fr';
}

/** 대화 상대 언어 선택지: 내 언어가 아닌 나머지 언어 */
export const otherLangs = (me) => CODES.filter((c) => c !== me);

/**
 * 기록 항목(대화 한 번)을 지금 '나' 기준으로 어느 쪽에 보일지: me · partner · text.
 * 항목에는 그때의 내 언어(me)가 남아 있다(v1.2.0부터, 없으면 한국어). 그 뒤 내 언어를 바꿨으면 말한 언어로 다시 가른다.
 */
export function sideFor(item, me) {
  if (item.side === 'text') return 'text';
  if ((item.me || 'ko') === me) return item.side;
  return item.from === me ? 'me' : 'partner';
}
