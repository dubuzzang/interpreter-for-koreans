// 언어 정보 · 글로 언어 알아보기 · 기록 항목이 누구 쪽인지 (화면 문구는 i18n.js)

export const LANGS = {
  ko: { code: 'ko', native: '한국어', flag: '🇰🇷', bcp47: 'ko-KR', short: 'KO' },
  tr: { code: 'tr', native: 'Türkçe', flag: '🇹🇷', bcp47: 'tr-TR', short: 'TR' },
  en: { code: 'en', native: 'English', flag: '🇺🇸', bcp47: 'en-US', short: 'EN' },
  ja: { code: 'ja', native: '日本語', flag: '🇯🇵', bcp47: 'ja-JP', short: 'JA' },
};
export const CODES = Object.keys(LANGS);

const TR_LETTERS = /[çğıöşüİĞŞ]/i;
const TR_WORDS = new Set('ve bir bu da de ne ben sen o biz siz onlar var yok mı mi mu mü için çok ama evet hayır merhaba teşekkür ederim lütfen nasıl nerede kaç ne zaman tamam iyi güzel değil şey gibi daha en ile bunu şu benim senin sizin burada orada istiyorum ister misiniz musunuz miyim yapabilir olur oldu olsun kadar sonra önce şimdi bugün yarın dün otel otobüs tren bilet su çay kahve hesap fiyat lira'.split(' '));
const EN_WORDS = new Set('the a an and is are was were be been to of in on at for with from this that these those it i you he she we they my your our me him her them do does did not no yes please thank thanks hello hi how what where when why who which can could would should will shall have has had there here go going want need like much many some any just very really okay ok sorry excuse'.split(' '));

/** 글이 어느 언어인지 (한글 → ko, 가나·한자 → ja, 튀르키예어 글자·흔한 낱말 → tr, 영어 낱말 → en). 모르겠으면 fallback */
export function detectLang(text, fallback = 'en') {
  const s = String(text || '');
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters) return fallback;
  const hangul = (s.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length;
  if (hangul / letters.length >= 0.3) return 'ko';
  const japanese = (s.match(/[぀-ヿ一-鿿]/g) || []).length; // 중국어는 지원하지 않으므로 한자만 있어도 일본어로
  if (japanese / letters.length >= 0.3) return 'ja';
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

/** 대화 상대 언어 선택지: 내 언어가 아닌 세 언어 */
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
