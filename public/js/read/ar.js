// 아랍어 읽는 법 — ⚠️ 아직 비어 있음 (v1.6.0 공통 틀). 아랍 문자(모음 부호 없이 씀) → 서버에서 로마자(소리 표기)를 받아 한글 발음 · 로마자로
// reading.js READERS가 쓴다: hangul(text, sound) → 한국어 사용자에게 보일 한글 발음 · roman(text, sound) → 그 밖의 사용자에게 보일 로마자
// sound: true면 서버 /api/sound 가 준 소리 표기가 두 번째 인자로 온다 (없으면 화면이 부르지 않는다)
export default {
  sound: false, // 서버 규칙(lib/langs/ar.mjs sound)을 만든 뒤 true로
  hangul: null,
  roman: null,
};
