// 번역 서버 핵심 (Cloudflare Pages Functions에서 쓰고, node:test로 검사한다)
// 엔진: Cloudflare Workers AI — 대화형 모델에 통역 지시문을 주고, 안 되면 다음 모델로.
// 언어 목록은 화면과 같은 것(public/js/lang.js), v1.6.0에 더한 언어의 지시문 · 점검은 lib/langs/<code>.mjs.
// 병음 음절 나누기는 화면 코드와 같은 것을 쓴다 (public/js/pinyin.js)
import { pinyinSyllableCount, hanCount } from '../public/js/pinyin.js';
import { LANGS, CODES as LANG_CODES } from '../public/js/lang.js';
import { cleanOutput, SCRIPT_RE } from './text.mjs';
import { packOf } from './langs/index.mjs';

export { cleanOutput };

// 번역 지시문에 쓰는 언어 이름 — 중국어는 간체(중국 본토 보통화, 타오바오·1688 판매자)와 번체(대만 · 홍콩)
export const LANG_NAMES = Object.fromEntries(LANG_CODES.map((c) => [c, LANGS[c].name]));
export const CODES = LANG_CODES;
export const MAX_TEXT = 1000;
export const MAX_CONTEXT = 4;
export const MAX_CONTEXT_TEXT = 300;

/**
 * 쓰는 순서대로 (2026-10-08 한·튀·영 예문 비교 — README "번역 엔진").
 * Gemma 4: 가장 자연스럽고, 생각(thinking)을 끄면 1~1.5초. 켜 두면 5~17초에 빈 답도 나온다.
 * 번역 전용 m2m100은 뜻이 틀린 번역(매워요 → "Bu çok basit")이 많아 쓰지 않는다 — 틀린 통역보다 오류 안내가 낫다.
 */
export const MODELS = [
  { id: '@cf/google/gemma-4-26b-a4b-it', extra: { chat_template_kwargs: { enable_thinking: false } }, timeoutMs: 9000 },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', timeoutMs: 12000 },
  { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', timeoutMs: 10000 },
];
/** 답 길이 상한: 원문 길이에 맞춰 (끝없이 이어 쓰는 것 방지) */
export const maxTokensFor = (text) => Math.min(800, 64 + String(text).length * 4);

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * 요청 본문 검사 → { value } 또는 { error, code }.
 * error는 한국어 문장, code는 화면이 고른 언어로 문장을 고르는 열쇠 (public/js/i18n.js의 err.<code>)
 */
export function validateTranslate(body) {
  if (!body || typeof body !== 'object') return { error: '요청 형식이 올바르지 않아요.', code: 'bad_request' };
  const text = String(body.text ?? '').trim();
  const from = String(body.from ?? '');
  const to = String(body.to ?? '');
  if (!text) return { error: '번역할 글이 비어 있어요.', code: 'empty' };
  if (text.length > MAX_TEXT) return { error: `한 번에 ${MAX_TEXT}자까지 번역할 수 있어요.`, code: 'too_long', max: MAX_TEXT };
  if (!CODES.includes(from) || !CODES.includes(to)) return { error: '지원하지 않는 언어예요.', code: 'unsupported_lang' };
  const context = Array.isArray(body.context)
    ? body.context.slice(-MAX_CONTEXT)
      .filter((c) => c && CODES.includes(c.lang) && String(c.text ?? '').trim())
      .map((c) => ({ lang: c.lang, text: clip(c.text, MAX_CONTEXT_TEXT) }))
    : [];
  const formal = body.formal !== false;
  return { value: { text, from, to, context, formal } };
}

/**
 * 말투(존댓말/반말)는 번역되는 쪽 언어에만: 한국어 존댓말·반말, 튀르키예어 siz·sen, 일본어 です·ます·タメ口, 중국어 您·你.
 * 영어는 말투 설정과 상관없이 자연스러운 말로. 누가 쓰든(한국어 사용자가 아니어도) 같은 규칙이다.
 */
export const REGISTER = {
  ko: ['Use natural, polite Korean 존댓말 (해요체, e.g. "감사합니다", "어디예요?").', 'Use natural, casual Korean 반말 between friends (e.g. "고마워", "어디야?").'],
  tr: ['Use polite Turkish "siz" forms.', 'Use casual Turkish "sen" forms between friends.'],
  ja: ['Use natural, polite Japanese です・ます調.', 'Use natural, casual Japanese plain form between friends (タメ口).'],
  en: ['Use natural, everyday English.', 'Use natural, everyday English.'],
  zh: ['Use natural, polite Mandarin as spoken in mainland China (您 where it sounds natural, 请).', 'Use natural, casual Mandarin between friends (你, not 您).'],
};
const NATURAL = (c) => [`Use natural, everyday ${LANG_NAMES[c]}.`, `Use natural, everyday ${LANG_NAMES[c]}.`];
for (const c of CODES) REGISTER[c] ??= packOf(c).register || NATURAL(c);

/** 옮길 언어의 글자 규칙 (옮길 언어 것만 지시문에 넣는다 — 간체 · 번체처럼 서로 어긋나는 규칙이 있어서) */
export const SCRIPT_RULE = {
  ko: 'Korean must be written in Hangul.',
  tr: 'Turkish must use correct Turkish letters (ç, ğ, ı, İ, ö, ş, ü).',
  ja: 'Japanese must be natural Japanese with kanji and kana (no romaji).',
  zh: 'Chinese must be written in Simplified Chinese characters as used in mainland China (never Traditional).',
};
for (const c of CODES) if (!SCRIPT_RULE[c] && packOf(c).script) SCRIPT_RULE[c] = packOf(c).script;

const NAMES_LIST = (() => {
  const names = [...new Set(Object.values(LANG_NAMES).map((n) => n.replace(/^(Simplified|Traditional) /, '')))];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
})();

/** 대화형 모델에 줄 메시지 */
export function buildMessages({ text, from, to, context = [], formal = true }) {
  const src = LANG_NAMES[from], tgt = LANG_NAMES[to];
  const tone = REGISTER[to][formal ? 0 : 1];
  const lines = [
    `You are a professional live interpreter for spoken conversations between ${NAMES_LIST} speakers.`,
    `Translate the user's message from ${src} into ${tgt}.`,
    'Rules:',
    `- Output ONLY the ${tgt} translation. No quotes, labels, notes, explanations, alternatives, romanization or pinyin.`,
    '- Keep the meaning, intent and nuance. Keep names, numbers, prices, times and units exact.',
    '- The message usually comes from speech recognition: ignore filler words and fix obvious recognition errors from context.',
    `- ${tone}`,
    SCRIPT_RULE[to] ? `- ${SCRIPT_RULE[to]}` : null,
    `- If the message is already in ${tgt}, return it unchanged.`,
  ].filter(Boolean);
  if (context.length) {
    lines.push('', 'Recent conversation, for context only (do NOT translate it):');
    for (const c of context) lines.push(`[${LANG_NAMES[c.lang]}] ${c.text}`);
  }
  return [
    { role: 'system', content: lines.join('\n') },
    { role: 'user', content: text },
  ];
}

/** 대화형 모델 응답에서 글 꺼내기 (모델마다 모양이 조금씩 다르다) */
export function responseText(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  if (typeof result.response === 'string') return result.response;
  const choice = result.choices?.[0];
  if (result.response && typeof result.response === 'object') {
    const inner = responseText(result.response);
    if (inner) return inner;
    // 모델이 JSON으로 답하면 Workers AI가 response를 객체로 풀어 줄 때가 있다(Mistral, 2026-10-12) → 원래 글, 없으면 JSON 글로
    const raw = choice?.message?.content ?? choice?.text;
    return typeof raw === 'string' && raw ? raw : JSON.stringify(result.response);
  }
  if (choice) return choice.message?.content ?? choice.text ?? '';
  if (typeof result.translated_text === 'string') return result.translated_text;
  if (Array.isArray(result.output)) {
    return result.output.flatMap((o) => (o.content || []).map((c) => c.text || '')).join('').trim();
  }
  return '';
}

/**
 * 언어마다 글자: must = 옮긴 글에 있어야 할 글자(하나라도), own = 그 언어만 쓰는 글자(다른 언어로 옮긴 글에 남아 있으면 안 옮긴 것),
 * foreign = 옮긴 글에 있으면 안 되는 글자. 한자는 중국어 · 일본어가 같이 써서 own이 아니다
 */
const NON_LATIN = ['Hang', 'Kana', 'Han', 'Thai', 'Cyrl', 'Arab'];
const SCRIPTS_OF = {
  ko: { must: ['Hang'], own: 'Hang' },
  ja: { must: ['Kana', 'Han'], own: 'Kana' },
  zh: { must: ['Han'], foreign: ['Kana'] },        // 중국어는 한자로, 가나가 있으면 일본어
  'zh-TW': { must: ['Han'], foreign: ['Kana', 'Hang', 'Thai', 'Cyrl', 'Arab'] },
  tr: { foreign: NON_LATIN },
  en: { foreign: NON_LATIN },
  vi: { foreign: NON_LATIN },
  fr: { foreign: NON_LATIN },
  th: { must: ['Thai'], own: 'Thai', foreign: ['Hang', 'Kana', 'Han', 'Cyrl', 'Arab'] },
  ru: { must: ['Cyrl'], own: 'Cyrl', foreign: ['Hang', 'Kana', 'Han', 'Thai', 'Arab'] },
  ar: { must: ['Arab'], own: 'Arab', foreign: ['Hang', 'Kana', 'Han', 'Thai', 'Cyrl'] },
};
const has = (s, script) => SCRIPT_RE[script].test(s);

/** 번역 결과가 쓸 만한가: 비었거나, 원문을 그대로 돌려줬거나(언어가 다른데), 글자 체계가 틀렸거나, 엉뚱하게 길면 다음 모델로 */
export function looksValid(out, { text, from, to }) {
  if (!out) return false;
  if (out.length > text.length * 6 + 80) return false;
  const T = SCRIPTS_OF[to] || {}, F = SCRIPTS_OF[from] || {};
  // 옮길 언어의 글자가 있어야 하고, 원문 글자 체계가 그대로 남아 있으면 안 옮긴 것
  if (T.must && !T.must.some((sc) => has(out, sc))) return false;
  if (T.foreign?.some((sc) => has(out, sc))) return false;
  if (F.own && F.own !== T.own && has(out, F.own)) return false;
  if (from !== to && out.trim().toLowerCase() === text.trim().toLowerCase() && text.trim().length > 3) return false;
  const extra = packOf(to).valid;
  return extra ? Boolean(extra(out, { text, from, to })) : true;
}
const KANA = SCRIPT_RE.Kana;
const HAN = /[一-鿿]/;
const JAPANESE = /[぀-ヿ一-鿿]/;

/** Workers AI 오류 → 상태 코드 · 사용자에게 보일 말(한국어) · 오류 코드 (what: 번역 · 음성 인식) */
export function aiError(error, what = '번역') {
  const msg = String(error?.message || error || '');
  if (/4006|daily free allocation|neurons/i.test(msg)) return { status: 503, error: `오늘 무료 ${what} 한도를 다 썼어요. 내일 다시 써 주세요.`, code: 'quota' };
  if (/timeout|timed out|deadline/i.test(msg)) return { status: 504, error: `${what} 서버가 늦게 답해요. 잠시 뒤 다시 해 주세요.`, code: 'timeout' };
  if (/capacity|overloaded|3040|unavailable|429/i.test(msg)) return { status: 503, error: `${what} 서버가 바빠요. 잠시 뒤 다시 해 주세요.`, code: 'busy' };
  return { status: 502, error: `${what}하지 못했어요. 잠시 뒤 다시 해 주세요.`, code: 'failed' };
}

/** 정해진 시간 안에 안 끝나면 실패로 보고 다음 모델로 */
export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms); }),
  ]);
}

// ---------- 음성 인식 (Whisper) ----------
export const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const MAX_AUDIO = 4 * 1024 * 1024;

/** Whisper가 조용한 녹음에서 지어내는 흔한 문장 (자막 끝인사 등) — 이것만 나오면 빈 결과로 */
const HALLUCINATIONS = [
  /^(시청|구독|좋아요)[^.]{0,30}(감사|부탁)[^.]*\.?$/, /^감사합니다\.?$/, /^MBC 뉴스/, /^(자막|번역)\s?(제공|by)/i,
  /^altyaz[ıi](\s|$)/i, /^izlediğiniz için teşekkür/i, /^abone ol/i, // \b는 ı를 글자로 안 봐서 쓰지 않는다
  /^thank(s| you) for watching/i, /^(please )?subscribe/i, /^you\.?$/i, /^\.+$/,
  /^ご視聴(いただき)?ありがとうございま(した|す)/, /^チャンネル登録/, /^(お疲れ様でした|ありがとうございました)。?$/,
  /^(谢谢|感谢|謝謝)(大家|您|你)?的?(观看|收看|觀看)/, /字幕(由|提供|志愿者|志願者|製作|制作)/, /Amara\.org/i, /^请?不吝点赞/, /^(点赞|订阅|訂閱)/, /^优优独播剧场/,
];
for (const c of CODES) HALLUCINATIONS.push(...(packOf(c).hallucinations || []));
/** Whisper 중국어 받아쓰기를 간체로 기울이는 첫 문장 (번체로 받아쓰는 일이 있다). 번체 중국어 등은 lib/langs/ */
export const STT_PROMPT = { zh: '以下是普通话的句子，使用简体中文。' };
for (const c of CODES) if (packOf(c).sttPrompt) STT_PROMPT[c] = packOf(c).sttPrompt;
/** Whisper에 넘길 언어 (번체 중국어 → zh) */
export const sttLanguage = (code) => packOf(code).whisper || code;
export function cleanTranscript(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return HALLUCINATIONS.some((re) => re.test(s)) ? '' : s;
}

// ---------- 일본어 읽기 (한국어 사용자에게 한글 발음, 튀르키예어·영어 사용자에게 로마자를 보여 주려고 먼저 히라가나 읽기를 받는다) ----------
export const MAX_KANA_TEXT = 500;

export function validateKana(body) {
  const text = String(body?.text ?? '').trim();
  if (!text) return { error: '읽을 글이 비어 있어요.', code: 'empty' };
  if (text.length > MAX_KANA_TEXT) return { error: `${MAX_KANA_TEXT}자까지 읽을 수 있어요.`, code: 'too_long', max: MAX_KANA_TEXT };
  if (!JAPANESE.test(text)) return { error: '일본어 글이 아니에요.', code: 'not_japanese' };
  return { value: { text } };
}

export function buildKanaMessages(text) {
  return [
    {
      role: 'system',
      content: [
        'Write the reading of the Japanese text in hiragana, exactly as it is pronounced.',
        'Rules:',
        '- Use hiragana only (convert kanji and katakana words to hiragana; keep the long-vowel mark ー for loanwords).',
        '- Write the particles は, へ, を as they sound: わ, え, お.',
        '- Write numbers as they are read, in hiragana.',
        '- Put a space between words, like a children\'s book (e.g. "とうきょうえきわ どこ ですか").',
        '- Keep sentence punctuation (。、？！). Output ONLY the reading, nothing else.',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}

/** 히라가나 읽기만 남긴다. 한자가 섞여 있으면 믿을 수 없어서 빈 값 */
export function cleanKana(raw) {
  let s = cleanOutput(raw).split('\n')[0];
  s = s.replace(/^\s*(?:reading|よみ|読み|ふりがな)\s*[:：]\s*/i, '');
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)); // 가타카나 → 히라가나
  s = s.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  return /^[ぁ-ゖー、。？！?!・ ]+$/.test(s) ? s : '';
}

// ---------- 중국어 읽기 (병음을 받아서, 한국어 사용자에게 한글 발음 + 병음, 다른 사용자에게 병음을 보여 준다) ----------
export const MAX_PINYIN_TEXT = 500;

export function validatePinyin(body) {
  const text = String(body?.text ?? '').trim();
  if (!text) return { error: '읽을 글이 비어 있어요.', code: 'empty' };
  if (text.length > MAX_PINYIN_TEXT) return { error: `${MAX_PINYIN_TEXT}자까지 읽을 수 있어요.`, code: 'too_long', max: MAX_PINYIN_TEXT };
  if (!HAN.test(text) || KANA.test(text)) return { error: '중국어 글이 아니에요.', code: 'not_chinese' };
  return { value: { text } };
}

/** lang: zh(간체, 본토 읽기) · zh-TW(번체, 대만 보통화 읽기) */
export function buildPinyinMessages(text, lang = 'zh') {
  return [
    {
      role: 'system',
      content: [
        `Write the Hanyu Pinyin of the Chinese text, as it is read in Mandarin (${lang === 'zh-TW' ? 'Taiwan' : 'mainland China'}).`,
        'Rules:',
        '- Use tone marks (ā á ǎ à), not tone numbers. Neutral-tone syllables have no mark. Write ü as ü.',
        '- Exactly one pinyin syllable for every Chinese character, in the same order. Pick the reading that fits the context (多音字).',
        '- Write syllables of one word together and put spaces between words, e.g. "Qǐngwèn, xǐshǒujiān zài nǎlǐ?". Use an apostrophe before a, o, e inside a word (Xī\'ān).',
        '- Keep numbers and Latin letters as they are. Use , . ? ! for Chinese punctuation.',
        '- Output ONLY the pinyin, nothing else.',
      ].join('\n'),
    },
    { role: 'user', content: text },
  ];
}

/** 병음만 남긴다. 한자·가나·한글이 섞였거나 병음 음절이 없으면 빈 값 */
export function cleanPinyin(raw) {
  let s = cleanOutput(raw).split('\n')[0];
  s = s.replace(/^\s*(?:pinyin|拼音|reading)\s*[:：]\s*/i, '');
  s = s.replace(/[，、]/g, ', ').replace(/。/g, '. ').replace(/？/g, '? ').replace(/！/g, '! ').replace(/[：]/g, ': ').replace(/[；]/g, '; ');
  s = s.replace(/\s+/g, ' ').replace(/\s+([,.?!:;])/g, '$1').trim();
  if (/[぀-ヿ㐀-䶿一-鿿가-힣]/.test(s)) return '';
  if (!/^[\p{Script=Latin}0-9\s,.?!:;'’"()%\-–—…]+$/u.test(s)) return '';
  return pinyinSyllableCount(s) ? s : '';
}
/** 병음 음절 수가 한자 수와 같은가 (모델이 글자를 빼먹거나 숫자를 읽어 버렸는지) */
export const pinyinMatches = (pinyin, text) => pinyinSyllableCount(pinyin) === hanCount(text);

/** 큰 ArrayBuffer → base64 (Workers에는 Buffer가 없어서 조각으로) */
export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
