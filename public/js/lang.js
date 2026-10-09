// 언어 정보 · 글로 언어 알아보기 · 상대 쪽 화면 문구(상대 언어로)

export const LANGS = {
  ko: { code: 'ko', name: '한국어', native: '한국어', flag: '🇰🇷', bcp47: 'ko-KR', short: 'KO' },
  tr: { code: 'tr', name: '튀르키예어', native: 'Türkçe', flag: '🇹🇷', bcp47: 'tr-TR', short: 'TR' },
  en: { code: 'en', name: '영어', native: 'English', flag: '🇺🇸', bcp47: 'en-US', short: 'EN' },
  ja: { code: 'ja', name: '일본어', native: '日本語', flag: '🇯🇵', bcp47: 'ja-JP', short: 'JA' },
};
export const CODES = Object.keys(LANGS);

/** 각 언어 사용자에게 보이는 문구 (대화 화면의 마이크 버튼 등) */
export const UI = {
  ko: { speak: '말하기', listening: '듣는 중…', stop: '멈추려면 누르세요', thinking: '번역 중…', tapToSpeak: '눌러서 말하세요', typeHere: '여기에 입력하세요', reading: '발음', heard: '들은 말', noSpeech: '말소리를 듣지 못했어요' },
  tr: { speak: 'Konuşun', listening: 'Dinliyorum…', stop: 'Durdurmak için dokunun', thinking: 'Çevriliyor…', tapToSpeak: 'Dokunup konuşun', typeHere: 'Buraya yazın', reading: 'Okunuşu', heard: 'Duyulan', noSpeech: 'Ses algılanmadı' },
  en: { speak: 'Speak', listening: 'Listening…', stop: 'Tap to stop', thinking: 'Translating…', tapToSpeak: 'Tap and speak', typeHere: 'Type here', reading: 'Reading', heard: 'Heard', noSpeech: "Didn't catch that" },
  ja: { speak: '話す', listening: '聞いています…', stop: 'タップで停止', thinking: '翻訳中…', tapToSpeak: 'タップして話してください', typeHere: 'ここに入力', reading: '読み方', heard: '聞き取り', noSpeech: '聞き取れませんでした' },
};

/** 대화 화면이 비었을 때 상대에게 보이는 안내 (상대 언어로) */
export const PARTNER_HINT = {
  ko: '오른쪽 버튼을 누르고 한국어로 말하세요.',
  tr: 'Sağdaki düğmeye dokunup Türkçe konuşun.',
  en: 'Tap the button on the right and speak English.',
  ja: '右のボタンを押して日本語で話してください。',
};

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

/** 대화 상대 언어 선택지: 내 언어가 아닌 두 언어 */
export const otherLangs = (me) => CODES.filter((c) => c !== me);
