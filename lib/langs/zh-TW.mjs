// 번체 중국어 (대만 · 홍콩 글자, 대만 보통화) — 서버 쪽 정보. ⚠️ v1.6.0 공통 틀의 기본값 — 에이전트가 다듬는다
// 엔진은 간체(zh)와 같고 글자체만 다르다. 소리 표기는 간체와 같은 병음(/api/sound — lib/sound-core.mjs).
export default {
  register: [
    'Use natural, polite Mandarin as spoken in Taiwan (您 where it sounds natural, 請).',
    'Use natural, casual Mandarin between friends as spoken in Taiwan (你, not 您).',
  ],
  script: 'Chinese must be written in Traditional Chinese characters as used in Taiwan (never Simplified).',
  whisper: 'zh',
  sttPrompt: '以下是普通話的句子，使用繁體中文。',
};
