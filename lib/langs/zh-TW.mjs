// 번체 중국어 (대만 · 홍콩 글자, 대만 보통화) — 서버 쪽 정보 (v1.6.0)
// 엔진은 간체(zh)와 같고 글자체 · 낱말만 다르다. 소리 표기는 간체와 같은 병음(/api/sound — lib/sound-core.mjs, 대만 읽기),
// 숫자(一百五十塊 · 兩萬五 · 十四塊五 · 十四點五)는 assist-core의 한자 숫자 읽기가 같이 읽는다.
import { hanStyle } from '../../public/js/lang.js';

export default {
  register: [
    'Use natural, polite Mandarin as spoken in Taiwan (您 where it sounds natural, 請).',
    'Use natural, casual Mandarin between friends as spoken in Taiwan (你, not 您).',
  ],
  // 대만 낱말: 計程車(택시) · 捷運(지하철) · 軟體 · 影片 · 網路 · 出貨 — 본토 낱말(出租車 · 地鐵 · 軟件 · 視頻 · 網絡 · 發貨) 대신
  script: 'Chinese must be written in Traditional Chinese characters as used in Taiwan (never Simplified), with Taiwanese word choices (e.g. 計程車, 捷運, 軟體, 影片, 網路).',
  /** 번체로 옮겼나: 간체로만 쓰는 글자가 번체 글자보다 많고, 둘 이상이거나 한자의 1/4 이상이면 간체로 쓴 것 (한두 글자 섞인 것은 봐준다) */
  valid(out) {
    const { hans, hant } = hanStyle(out);
    const han = (String(out).match(/[㐀-䶿一-鿿]/g) || []).length;
    return !(hans > hant && (hans >= 2 || hans * 4 >= han));
  },
  whisper: 'zh',
  sttPrompt: '以下是普通話的句子，使用繁體中文。',
  // 무음에서 지어내는 번체 자막 문장 (간체 · 謝謝觀看 · Amara 등은 translate-core에 이미 있다)
  hallucinations: [
    /^感謝(大家|您|你)?的?(觀看|收看|收聽)/, /^請?不吝(點贊|點讚|按讚)/, /^(點贊|點讚|按讚)/, /^優優獨播劇場/, /^(本|此)節目由/, /明鏡與點點欄目/,
    /^多謝(收睇|觀看)/, /^以上言論不代表本台立場/, /^以下是普通話的句子/, // 조용하면 첫 문장(sttPrompt)을 그대로 돌려줄 때가 있다
  ],
  none: /^(?:無|沒有|未知|不明|未定|待定|未提及|尚未確定)$/,
};
