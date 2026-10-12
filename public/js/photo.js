// 사진 번역(v1.5.0) 화면 쪽 도우미: 사진 줄이기(긴 변 1,600px JPEG) · 아주 긴 그림(타오바오 상세 이미지)을 겹치게 자르기 · 조각 결과 합치기.
// 자르기 · 합치기 계산은 순수 함수라 node 시험에서도 쓴다. 그림은 서버에서 읽기만 하고 저장하지 않는다.

export const MAX_SIDE = 1600;          // 보내는 그림의 긴 변
export const SPLIT_ASPECT = 2.5;       // 긴 변 / 짧은 변이 이보다 크면 자른다 (20:9 휴대폰 화면 캡처까지는 한 장)
export const PIECE_ASPECT = [2, 3];    // 조각 하나의 긴 변 / 짧은 변 상한 — 2가 기본, 조각이 MAX_PARTS를 넘으면 3까지 늘린다
export const OVERLAP = 0.12;           // 조각끼리 겹치는 몫 (경계에 걸린 줄이 한쪽에는 온전히 들어가게)
export const MAX_PARTS = 8;            // 서버(lib/photo-core.mjs)와 같은 값
export const MAX_BYTES = 1.9 * 1024 * 1024;

/**
 * 자를 자리 계산 → { pieces: [{ x, y, w, h }] (원본 좌표), scale: 보낼 때 곱할 배율, truncated: 너무 길어 뒷부분을 못 읽음 }.
 * 긴 쪽(세로가 길면 위→아래, 가로가 길면 왼→오른쪽)으로만 자르고, 마지막 조각은 끝에 맞춘다.
 */
export function planPieces(width, height) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const long = Math.max(w, h), short = Math.min(w, h);
  const tall = h >= w;
  const one = (len) => Math.min(1, MAX_SIDE / len);
  if (long / short <= SPLIT_ASPECT) return { pieces: [{ x: 0, y: 0, w, h }], scale: one(long), truncated: false };
  // 조각 수: 2:1 조각으로 덮는 데 드는 수 (넘치면 조각을 조금씩 길게, 3:1까지)
  const countFor = (aspect) => { const len = short * aspect; return Math.max(2, Math.ceil((long - len * OVERLAP) / (len * (1 - OVERLAP)))); };
  let aspect = PIECE_ASPECT[0];
  while (countFor(aspect) > MAX_PARTS && aspect < PIECE_ASPECT[1]) aspect = Math.min(PIECE_ASPECT[1], aspect + 0.1);
  const truncated = countFor(aspect) > MAX_PARTS;
  const n = Math.min(countFor(aspect), MAX_PARTS);
  // 다 덮을 수 있으면 n조각이 고르게 OVERLAP씩 겹치게 길이를 맞춘다 (조각이 짧을수록 글자가 크게 보인다)
  const len = Math.ceil(truncated ? short * aspect : long / (n - (n - 1) * OVERLAP)); // 올림: 반올림하면 마지막 겹침이 1px 모자랄 수 있다
  const step = len * (1 - OVERLAP);
  const pieces = [];
  for (let i = 0; i < n; i++) {
    const start = i === n - 1 && !truncated ? long - len : Math.min(Math.round(i * step), long - len);
    pieces.push(tall ? { x: 0, y: start, w, h: len } : { x: start, y: 0, w: len, h });
  }
  return { pieces, scale: one(len), truncated };
}

// ---------- 조각 결과 합치기 ----------
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
/** 같은 줄인가: 글자가 같거나, 한쪽이 다른 쪽을 품거나(경계에서 잘린 줄), 두 글자 묶음이 80% 넘게 겹침 */
export function sameLine(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 4 && long.includes(short)) return true;
  const A = bigrams(x), B = bigrams(y);
  if (A.length < 3 || B.length < 3) return false;
  const pool = [...B];
  let hit = 0;
  for (const g of A) { const k = pool.indexOf(g); if (k >= 0) { hit++; pool.splice(k, 1); } }
  return (2 * hit) / (A.length + B.length) >= 0.8;
}

const WINDOW = 8; // 경계 앞뒤로 견줄 줄 수 (겹치는 부분에 들어가는 줄)
/**
 * 조각 결과 [{ lines }]를 차례로 합친다. 겹친 부분은 "앞 조각의 끝 몇 줄 = 뒤 조각의 첫 몇 줄"이 같은 차례로 나온다 —
 * 앞 조각 끝(WINDOW줄 안)에서 시작해 끝까지 차례대로 맞는 자리를 찾아, 맞은 뒤 조각 줄만 뺀다 (같은 줄이면 더 긴, 덜 잘린 쪽을 남김).
 * 그래서 메뉴에 같은 가격이 여러 번 나오는 것처럼 떨어진 곳의 같은 줄은 그대로 둔다.
 * 앞 조각의 맨 끝 한 줄은 맞지 않아도 된다 (경계에 걸려 반만 읽힌 줄). 한쪽에만 있는 줄은 하나씩 건너뛰며 맞추고,
 * 뒤 조각에만 있는 줄은 앞 조각의 줄에 이미 들어 있으면(葱段 ⊂ 加一勺生抽 葱段) 버리고, 아니면 그 자리에 넣는다.
 */
export function mergeParts(parts) {
  const out = [];
  for (const part of parts) {
    const lines = part?.lines || [];
    let best = null;
    for (let k = Math.max(0, out.length - WINDOW); k < out.length; k++) {
      const pairs = [], extra = [];
      let ti = k, j = 0;
      while (j < Math.min(lines.length, WINDOW) && ti < out.length) {
        if (sameLine(out[ti].text, lines[j].text)) { pairs.push([ti, j]); ti += 1; j += 1; }
        else if (ti + 1 < out.length && sameLine(out[ti + 1].text, lines[j].text)) { pairs.push([ti + 1, j]); ti += 2; j += 1; } // 앞 조각에만 있는 줄
        else if (pairs.length === 0 && j + 1 < lines.length && sameLine(out[ti].text, lines[j + 1].text)) { extra.push([ti, j]); pairs.push([ti, j + 1]); ti += 1; j += 2; } // 뒤 조각에만 있는 첫 줄
        else if (pairs.length && norm(lines[j].text) && norm(out[ti - 1].text).includes(norm(lines[j].text))) { pairs.push([ti - 1, j]); j += 1; } // 앞 조각은 한 줄, 뒤 조각은 두 줄로 나눠 읽음 (加一勺生抽 葱段 = 加一勺生抽 + 葱段)
        else break;
      }
      const reachesEnd = ti >= out.length || (ti === out.length - 1 && (pairs.length >= 2 || norm(lines[pairs.at(-1)?.[1]]?.text).length >= 4));
      if (pairs.length && reachesEnd && (!best || pairs.length > best.pairs.length)) best = { pairs, extra };
    }
    if (best) {
      for (const [ti, j] of best.pairs) if (norm(lines[j].text).length > norm(out[ti].text).length) out[ti] = lines[j];
      const near = out.slice(Math.max(0, out.length - WINDOW)).map((x) => norm(x.text));
      for (const [ti, j] of [...best.extra].reverse()) {
        const x = norm(lines[j].text);
        if (x && !near.some((y) => y.includes(x))) out.splice(ti, 0, lines[j]);
      }
    }
    out.push(...lines.slice(best ? best.pairs.at(-1)[1] + 1 : 0));
  }
  return out;
}

/** 가격 · 숫자만 있는 줄 (메뉴에서 가격을 따로 읽은 줄) — 화면에서 작게 보인다 */
// 화폐 이름 (0xc6d0 · 0xc5d4 = 한국어로 쓴 원 · 엔 — 화면 코드에는 한글을 직접 쓰지 않는다)
// v1.6.0: 베트남 동 · 태국 바트 · 러시아 루블 · 아랍권 리얄 · 디르함 · 파운드 · 대만 · 홍콩 달러, 숫자는 타이 숫자 · 아랍 숫자도
const CURRENCY = new RegExp(['円', '元', '块', '塊', String.fromCharCode(0xc6d0), String.fromCharCode(0xc5d4), 'lira', 'tl', 'usd', 'eur', 'yuan', 'rmb', 'krw', 'jpy', 'try', 'cny',
  'đồng', 'vnđ', 'vnd', 'บาท', 'thb', 'руб', 'rub', 'ريال', 'درهم', 'جنيه', 'sar', 'aed', 'egp', 'twd', 'ntd', 'hkd'].join('|'), 'gi');
export const isPriceOnly = (text) => /[0-9๐-๙٠-٩۰-۹]/.test(text) && !/\p{L}{2,}/u.test(String(text).replace(CURRENCY, ''));

/**
 * 공유 · 복사용 글. 아랍어 같은 오른쪽→왼쪽 글 줄은 앞에 RLM(U+200F)을 붙인다 (v1.6.0) —
 * 상표 · 숫자로 시작하는 줄(iPhone 15 بسعر …)도 붙여 넣은 곳(카카오톡 · 메일)에서 오른쪽부터 읽히게
 */
const RTL_LANGS = new Set(['ar', 'fa', 'ur', 'he', 'ps', 'ckb', 'yi']);
const rtlMostly = (s) => {
  const r = (s.match(/[֐-׿؀-ۿݐ-ݿ]/g) || []).length;
  return r > 0 && r >= (s.match(/\p{Script=Latin}/gu) || []).length;
};
const dirMark = (s, lang) => (s && (RTL_LANGS.has(lang) || (!lang && rtlMostly(s))) ? `‏${s}` : s);
export const lineText = (line) => (line.tr ? `${dirMark(line.text, line.lang)}\n${dirMark(line.tr)}` : dirMark(line.text, line.lang));
export const allText = (lines, summary = '') => [dirMark(summary), ...lines.map(lineText)].filter(Boolean).join('\n\n');

// ---------- 브라우저: 사진 열기 · 줄이기 · 자르기 ----------
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* 아래 <img>로 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
async function jpeg(canvas) {
  for (const q of [0.85, 0.72, 0.6]) {
    const blob = await toBlob(canvas, q);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('too big');
}

function draw(src, { x, y, w, h }, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명한 PNG는 흰 바탕으로
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * 고른 사진 → { preview: 미리 보기 주소, width, height, pieces: [Blob JPEG], truncated }.
 * 미리 보기는 화면에 보일 만큼만 줄이고, 보낼 조각은 긴 변 1,600px 이하 JPEG.
 */
export async function preparePhoto(file) {
  const src = await decode(file);
  const width = src.width, height = src.height;
  try {
    const plan = planPieces(width, height);
    const pieces = [];
    for (const p of plan.pieces) pieces.push(await jpeg(draw(src, p, plan.scale)));
    // 미리 보기: 짧은 변 900px · 넓이 4백만 화소 · 긴 변 8,192px 안으로 (아주 긴 그림도 휴대폰 메모리에 맞게)
    const pv = Math.min(1, 900 / Math.min(width, height), Math.sqrt(4e6 / (width * height)), 8192 / Math.max(width, height));
    const previewBlob = await toBlob(draw(src, { x: 0, y: 0, w: width, h: height }, pv), 0.8);
    return { preview: URL.createObjectURL(previewBlob), width, height, pieces, truncated: plan.truncated };
  } finally { src.close?.(); }
}
