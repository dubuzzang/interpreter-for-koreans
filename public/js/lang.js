// 언어 정보 · 글로 언어 알아보기 · 기록 항목이 누구 쪽인지 (화면 문구는 i18n.js)

export const LANGS = {
  ko: { code: 'ko', native: '한국어', flag: '🇰🇷', bcp47: 'ko-KR', short: 'KO' },
  tr: { code: 'tr', native: 'Türkçe', flag: '🇹🇷', bcp47: 'tr-TR', short: 'TR' },
  en: { code: 'en', native: 'English', flag: '🇺🇸', bcp47: 'en-US', short: 'EN' },
  ja: { code: 'ja', native: '日本語', flag: '🇯🇵', bcp47: 'ja-JP', short: 'JA' },
  zh: { code: 'zh', native: '中文', flag: '🇨🇳', bcp47: 'zh-CN', short: 'ZH' }, // 간체 중국어 (중국 본토)
};
export const CODES = Object.keys(LANGS);

const TR_LETTERS = /[çğıöşüİĞŞ]/i;
const TR_WORDS = new Set('ve bir bu da de ne ben sen o biz siz onlar var yok mı mi mu mü için çok ama evet hayır merhaba teşekkür ederim lütfen nasıl nerede kaç ne zaman tamam iyi güzel değil şey gibi daha en ile bunu şu benim senin sizin burada orada istiyorum ister misiniz musunuz miyim yapabilir olur oldu olsun kadar sonra önce şimdi bugün yarın dün otel otobüs tren bilet su çay kahve hesap fiyat lira'.split(' '));
const EN_WORDS = new Set('the a an and is are was were be been to of in on at for with from this that these those it i you he she we they my your our me him her them do does did not no yes please thank thanks hello hi how what where when why who which can could would should will shall have has had there here go going want need like much many some any just very really okay ok sorry excuse'.split(' '));

// 한자만 있는 글이 중국어인지 일본어인지 가를 글자들.
// 중국어: 간체로만 쓰는 글자 · 중국어에만 쓰는 낱말 글자(你·吗·呢…) · 번체로만 쓰는 글자(們·這·說…, 일본에서 안 쓰는 모양)
const ZH_CHARS = new Set([...'们这说吗么钱买卖时东车门问谢对见还个为发货价样质换运输单网订给你她呢吧啊很吃喝哪谁怎边贵块让认识请语话读讲该详试账购赔费银错钟间开关头实层岁帮带广应总爱报无现电码确签简纸级约红线练组细终经结绍统续绿编联职节范获补视觉计记设访证评诉译询负财责贴转轮软轻较辆过进远连迟适选邮递钥链销锁键长闭队阳际陆险难须顾预领题颜额风飞饭饮馆马验鱼鸡齐龙您咱俩呀啦哦嗯种产厂坏损优图几两是我',
  ...'們這說嗎麼錢賣對發價樣單讀國學會來點體號萬與實寫聲當舊數區醫歲氣圖廣樂經濟關險驗總譯轉輕邊遲帶應覺續綠聽兩齊龍']);
// 일본어: 일본에서만 쓰는 약자(駅·円·気…)와, 일본어·번체가 같이 쓰고 간체에는 없는 모양(東·時·見…)
const JA_CHARS = new Set([...'駅円気様楽売読図広発経済対実単戦鉄関険験総歳説訳転軽辺遅価帯応覚続緑聴弁両斉竜悪圧囲栄塩桜絵拡勧観歓帰拠挙駆継鶏県剣検権厳効鉱剤雑歯児釈渋縦譲収従処浄乗証焼粋酔銭繊荘捜巣騒増蔵臓択沢団弾庁徴伝稲闘徳悩脳廃拝髪抜晩払仏変豊満黙薬頼覧涙霊齢労録込畑峠働枠匂',
  ...'東時見車門間長書語話買電開閉問題頭顔風飛飯飲館馬魚鳥島機業親現線紙級約紅練組細終結紹統編職節範補規視設訪評計記試誤調談謝請認識貴費質購貨負財責輪軟較輸進遠連選郵銀錯鍵隊陽陸難須顧預領額歩個為']);
const KANA = /[ぁ-ゖァ-ヺー]/g; // 히라가나 · 가타카나 · 장음 (・는 중국어 글에도 나와서 뺀다)
const HAN = /[㐀-䶿一-鿿]/g;

/** 한자만 있는 글: 중국어 쪽 글자가 많으면 zh, 일본어 쪽이 많으면 ja, 같으면 fallback이 일본어일 때만 ja (그 밖은 중국어 쪽으로) */
function hanOnlyLang(s, fallback) {
  let zh = 0, ja = 0;
  for (const c of s) { if (ZH_CHARS.has(c)) zh++; else if (JA_CHARS.has(c)) ja++; }
  if (zh !== ja) return zh > ja ? 'zh' : 'ja';
  return fallback === 'ja' ? 'ja' : 'zh';
}

/**
 * 글이 어느 언어인지: 한글 → ko, 가나가 있으면 ja, 한자만 있으면 zh 쪽으로(일본 글자체면 ja),
 * 튀르키예어 글자·흔한 낱말 → tr, 영어 낱말 → en. 모르겠으면 fallback
 */
export function detectLang(text, fallback = 'en') {
  const s = String(text || '');
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters) return fallback;
  const hangul = (s.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  if (hangul / letters.length >= 0.3) return 'ko';
  const kana = (s.match(KANA) || []).length;
  const han = (s.match(HAN) || []).length;
  if ((kana + han) / letters.length >= 0.3) return kana ? 'ja' : hanOnlyLang(s, fallback);
  if (TR_LETTERS.test(s)) return 'tr';
  const words = s.toLowerCase().match(/[a-zçğıöşü']+/g) || []; // tr-TR 소문자는 영어 I를 ı로 바꿔 버린다
  let tr = 0, en = 0;
  for (const w of words) {
    if (TR_WORDS.has(w)) tr++;
    if (EN_WORDS.has(w.replace(/'.*$/, ''))) en++;
    if (/(yor|iyor|ıyor|uyor|üyor|ler|lar|mak|mek|sınız|siniz|ım|im|um|üm)$/.test(w) && w.length > 4) tr += 0.5;
  }
  if (tr === en) return fallback;
  return tr > en ? 'tr' : 'en';
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
