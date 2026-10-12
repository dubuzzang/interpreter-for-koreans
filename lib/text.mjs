// 서버 글 도우미 (translate-core · assist-core · photo-core · 언어별 lib/langs/<code>.mjs 가 같이 쓴다)
// lib/langs/ 파일은 translate-core 등을 가져오면 안 된다 (서로 가져오는 고리가 생김) — 필요한 도우미는 여기에 둔다.

/** 글자 체계 (한 글자라도 있으면) — 번역 결과 점검 · 요약 칸 점검 · 사진 줄 언어에 쓴다 */
export const SCRIPT_RE = {
  Hang: /[가-힣ㄱ-ㅎㅏ-ㅣ]/,
  Kana: /[぀-ヿ]/,
  Han: /[㐀-䶿一-鿿]/,
  Thai: /[฀-๿]/,
  Cyrl: /[Ѐ-ӿ]/,
  Arab: /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/,
  Latn: /\p{Script=Latin}/u,
};

const LABEL = /^\s*(?:translation|translated text|turkish|english|korean|japanese|(?:simplified |traditional )?chinese|vietnamese|thai|russian|arabic|french|türkçe|çeviri|ingilizce|korece|japonca|çince|번역(?:문)?|영어|한국어|튀르키예어|터키어|일본어|중국어|베트남어|태국어|러시아어|아랍어|프랑스어|翻訳|訳|日本語|翻译|翻譯|译文|譯文|(?:简体|繁體|繁体)?中文|tiếng việt|bản dịch|ภาษาไทย|คำแปล|русский|перевод|العربية|الترجمة|français|traduction)\s*[:：-]\s*/i;
const QUOTES = [['"', '"'], ['“', '”'], ["'", "'"], ['‘', '’'], ['«', '»'], ['「', '」'], ['『', '』'], ['„', '“']];

/** 모델 출력 정리: 앞뒤 따옴표·"Translation:" 같은 이름표·코드 울타리·덧붙인 설명 줄 */
export function cleanOutput(raw, source = '') {
  let s = String(raw ?? '').replace(/\r/g, '').trim();
  s = s.replace(/^```[a-z]*\n?|```$/gi, '').trim();
  s = s.replace(/<\/?(?:think|reasoning)>[\s\S]*?(?:<\/(?:think|reasoning)>|$)/gi, '').trim();
  s = s.replace(LABEL, '');
  // 원문이 한 줄인데 모델이 빈 줄 뒤에 설명을 붙이면 첫 단락만
  if (!String(source).includes('\n')) s = s.split(/\n\s*\n/)[0].trim();
  for (let i = 0; i < 2; i++) {
    for (const [a, b] of QUOTES) {
      if (s.length > 1 && s.startsWith(a) && s.endsWith(b) && !String(source).trim().startsWith(a)) s = s.slice(a.length, -b.length).trim();
    }
  }
  return s.replace(/[ \t]+/g, ' ').trim();
}
