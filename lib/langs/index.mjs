// v1.6.0에 더한 언어의 서버 쪽 정보 (번역 지시문 · 결과 점검 · 받아쓰기 · 숫자 읽기 · 소리 표기 · 사진 읽는 법).
// 한국어 · 튀르키예어 · 영어 · 일본어 · 간체 중국어는 원래 자리(translate-core · assist-core · photo-core)에 있다.
//
// 언어 파일 모양 (모두 골라 쓸 수 있음 — 없으면 기본 동작):
//   register: [존댓말 지시, 반말 지시]               번역 · 답장 추천 지시문의 말투 (번역되는 쪽 언어에만)
//   script: '…'                                      번역 지시문의 글자 규칙 (옮길 언어가 이것일 때)
//   valid(out, { text, from, to }) → bool             번역 결과가 이 언어로 제대로 쓰였나 (기본 글자 검사 뒤에 더)
//   whisper: 'zh' · sttPrompt: '…' · hallucinations: [정규식]   서버 받아쓰기(Whisper) 언어 · 첫 문장 · 지어내는 말
//   decimals(text) → text                            소수로 읽는 말을 먼저 숫자로 (on dört buçuk = 14.5 같은 것)
//   numbers(text) → [{ alts: [값…], word: 낱말로 썼나 }]   낱말로 쓴 숫자 (아라비아 숫자 · 타이 숫자 · 아랍 숫자는 assist-core가 이미 읽음)
//   none: 정규식                                     요약 칸의 "없음" 말 (빈칸으로 본다)
//   sound: { messages(text), clean(raw, text) → '', matches?(sound, text), validate?(text) → null | { error, code } }
//                                                    /api/sound 가 쓰는 소리 표기 (읽는 법이 서버를 거치는 언어만)
//   photoRead: '…'                                   사진 번역에서 이 언어 줄의 "read"(소리 표기) 지시. 없으면 받지 않는다
//
// ⚠️ 이 폴더의 파일은 translate-core · assist-core · photo-core를 가져오지 않는다 (고리). 도우미는 lib/text.mjs · public/js/.
import zhTW from './zh-TW.mjs';
import vi from './vi.mjs';
import th from './th.mjs';
import ru from './ru.mjs';
import ar from './ar.mjs';

export const PACKS = { 'zh-TW': zhTW, vi, th, ru, ar };
/** 언어 code의 서버 쪽 정보 (없으면 빈 것) */
export const packOf = (code) => PACKS[code] || {};
