// POST /api/photo?me=ko[&part=1&parts=3]  본문: 그림(JPEG · PNG · WebP, 화면이 긴 변 1,600px로 줄여 보냄)
//   → { lines: [{ text: 원문, lang, tr: 내 언어 번역, read: 병음 · 히라가나, check? }], summary, notes, model }
// 그림은 Workers AI(그림을 읽는 모델)로 보내 읽기만 하고 저장하지 않는다. 긴 그림은 화면이 겹치게 잘라 조각마다 부른다.
// 요청 제한은 번역과 따로 센다 (이름 'photo', 낮게).
import { photoParams, checkImage, buildPhotoMessages, cleanPhoto, PHOTO_MODELS, PHOTO_MAX_TOKENS, PHOTO_RATE, MAX_PHOTO_BYTES, CAPACITY_RETRY_MS } from '../../lib/photo-core.mjs';
import { responseText, aiError, withTimeout, toBase64 } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  const denied = checkOrigin(request) || rateLimit(request, PHOTO_RATE.name, PHOTO_RATE.limit, PHOTO_RATE.windowMs);
  if (denied) return denied;
  const { value: q, ...invalid } = photoParams(request.url);
  if (!q) return json(invalid, 400);
  if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) return json({ error: '사진이 너무 커요.', code: 'photo_too_big', max: MAX_PHOTO_BYTES }, 413);
  const bytes = await request.arrayBuffer();
  const { value: img, status, ...bad } = checkImage(bytes);
  if (!img) return json(bad, status);
  if (!env.AI) return json({ error: 'AI 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);

  const messages = buildPhotoMessages(q, `data:${img.type};base64,${toBase64(bytes)}`);
  let lastError = null;
  models: for (const [i, model] of PHOTO_MODELS.entries()) {
    // 기본 모델이 "잠시 바쁨(3040)"이면 한 번 더 — 예비 모델은 한 장에 뉴런을 4~6배 쓴다
    for (let attempt = 1; attempt <= (i === 0 ? 2 : 1); attempt++) {
      try {
        const result = await withTimeout(env.AI.run(model.id, { messages, max_tokens: PHOTO_MAX_TOKENS, temperature: 0, ...model.extra }), model.timeoutMs);
        const out = cleanPhoto(responseText(result), q);
        if (out) return json({ ...out, model: model.id, backup: i > 0 }); // backup: 화면이 "예비 AI로 읽어 더 틀릴 수 있어요"를 띄운다
        lastError = new Error(`invalid photo answer from ${model.id}`);
        break;
      } catch (e) {
        lastError = e;
        const msg = String(e?.message);
        if (/4006|daily free allocation/i.test(msg)) break models; // 한도는 모델을 바꿔도 같다
        if (attempt === 1 && i === 0 && /3040|capacity/i.test(msg)) { await sleep(CAPACITY_RETRY_MS); continue; }
        break;
      }
    }
  }
  const { status: st, ...problem } = aiError(lastError, '사진 번역');
  return json(problem, st);
}
