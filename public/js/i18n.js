// 화면 문구 · 고른 언어 · 처음 쓰는 사람의 기본 언어. 사전은 언어마다 i18n/<code>.js (한국어 사전이 기준 — 키가 모두 같아야 한다)
// 고른 언어 = '나'의 언어: 화면 문구, 내 말 받아쓰기·읽어 주기, 번역 방향이 모두 이것을 따른다.
// 문구는 짧은 현지 표현으로 (튀르키예어는 siz 말투, 일본어는 です·ます, 중국어는 你). {이름}은 채워 넣는 자리, *굵게* 는 굵은 글씨.
import { CODES, LANGS, codeOfTag } from './lang.js';
import ko from './i18n/ko.js';
import tr from './i18n/tr.js';
import en from './i18n/en.js';
import ja from './i18n/ja.js';
import zh from './i18n/zh.js';
import zhTW from './i18n/zh-TW.js';
import vi from './i18n/vi.js';
import th from './i18n/th.js';
import ru from './i18n/ru.js';
import ar from './i18n/ar.js';
import fr from './i18n/fr.js';

export const MESSAGES = { ko, tr, en, ja, zh, 'zh-TW': zhTW, vi, th, ru, ar, fr };

let current = 'ko';
/** 지금 화면 언어 (= 나의 언어) */
export const uiLang = () => current;
export function setUiLang(code) {
  if (MESSAGES[code]) current = code;
  return current;
}

/** lang 언어의 문구. {이름} 자리를 vars로 채운다 (없는 문구는 한국어 → 키 그대로) */
export function tl(lang, key, vars) {
  const s = MESSAGES[lang]?.[key] ?? MESSAGES.ko[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
/** 지금 화면 언어의 문구 */
export const t = (key, vars) => tl(current, key, vars);
/** 언어 이름 (지금 화면 언어로: 한국어 화면이면 튀르키예어, 영어 화면이면 Turkish) */
export const langName = (code) => t(`lang.${code}`);
/** 날짜·시각 표시용 지역 설정 */
export const locale = () => LANGS[current].bcp47;

/** 처음 쓰는 사람의 언어: 브라우저 언어(navigator.languages) 중 앞에서부터 지원하는 언어에 드는 것(zh-TW · zh-HK는 번체), 없으면 영어 */
export function defaultLang(languages = []) {
  for (const tag of languages || []) {
    const code = codeOfTag(tag);
    if (code) return code;
  }
  return 'en';
}

/** 내 언어에 맞는 기본 상대: 한국어 사용자는 튀르키예어, 나머지는 한국어 */
export const defaultPartner = (me) => (me === 'ko' ? 'tr' : 'ko');

/**
 * 앱을 열 때의 내 언어 · 상대 언어 (raw = localStorage에 저장된 것).
 * 이미 쓰던 사람(저장된 설정이나 기록이 있음)은 저장된 그대로 — 예전 버전엔 언어 설정이 없었으니 한국어로.
 * 처음이면 브라우저 언어로.
 */
export function startLangs(raw, languages) {
  const used = Boolean(raw?.settings) || (Array.isArray(raw?.history) && raw.history.length > 0);
  let me = used ? raw.settings?.me : defaultLang(languages);
  if (!CODES.includes(me)) me = 'ko';
  let partner = used ? raw.settings?.partner : null;
  if (!CODES.includes(partner) || partner === me) partner = defaultPartner(me);
  return { me, partner };
}

/** 내 언어를 code로 바꾼 결과: 상대 언어가 새 내 언어와 같아지면 서로 바꾼다 */
export function pickLanguage({ me, partner }, code) {
  if (!CODES.includes(code) || code === me) return { me, partner };
  return { me: code, partner: partner === code ? me : partner };
}
