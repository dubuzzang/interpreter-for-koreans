// 소리 표기 (/api/sound, v1.6.0): 읽는 법이 서버를 거치는 언어 — 일본어 → 히라가나 읽기, 중국어(간체 · 번체) → 병음,
// 그 밖은 lib/langs/<code>.mjs 의 sound. 화면(reading.js)이 이것으로 한글 발음 · 로마자를 만든다.
// /api/kana · /api/pinyin 은 예전 화면을 위해 그대로 둔다 (같은 규칙).
import {
  validateKana, buildKanaMessages, cleanKana, validatePinyin, buildPinyinMessages, cleanPinyin, pinyinMatches,
  maxTokensFor, CODES,
} from './translate-core.mjs';
import { packOf } from './langs/index.mjs';

export const MAX_SOUND_TEXT = 500;

const pinyin = (lang) => ({
  validate: (text) => validatePinyin({ text }).error ? validatePinyin({ text }) : null,
  messages: (text) => buildPinyinMessages(text, lang),
  clean: (raw) => cleanPinyin(raw),
  matches: (sound, text) => pinyinMatches(sound, text), // 음절 수 = 한자 수 (안 맞으면 다음 모델에 한 번 더)
});

/** 언어마다 소리 표기 규칙: { validate?(text) → null | { error, code }, messages(text), clean(raw, text), matches?(sound, text) } */
export const SOUND_SPECS = {
  ja: {
    validate: (text) => validateKana({ text }).error ? validateKana({ text }) : null,
    messages: (text) => buildKanaMessages(text),
    clean: (raw) => cleanKana(raw),
  },
  zh: pinyin('zh'),
  'zh-TW': pinyin('zh-TW'),
};
for (const c of CODES) if (!SOUND_SPECS[c] && packOf(c).sound) SOUND_SPECS[c] = packOf(c).sound;

/** /api/sound 본문 { text, lang } 검사 → { value: { text, lang, spec } } 또는 { error, code } */
export function validateSound(body) {
  const text = String(body?.text ?? '').trim();
  const lang = String(body?.lang ?? '');
  const spec = SOUND_SPECS[lang];
  if (!spec) return { error: '지원하지 않는 언어예요.', code: 'unsupported_lang' };
  if (!text) return { error: '읽을 글이 비어 있어요.', code: 'empty' };
  if (text.length > MAX_SOUND_TEXT) return { error: `${MAX_SOUND_TEXT}자까지 읽을 수 있어요.`, code: 'too_long', max: MAX_SOUND_TEXT };
  const bad = spec.validate?.(text);
  if (bad) return bad;
  return { value: { text, lang, spec } };
}

/** 모델에 줄 입력 (온도 0 — 같은 글은 같은 읽기로) */
export const soundInput = ({ text, spec }) => ({ messages: spec.messages(text), max_tokens: maxTokensFor(text) * 2, temperature: 0 });
