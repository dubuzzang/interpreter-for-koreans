// POST /api/photo?me=ko[&part=1&parts=3]  본문: 그림(JPEG · PNG · WebP, 화면이 긴 변 1,600px로 줄여 보냄)
//   → { lines: [{ text: 원문, lang, tr: 내 언어 번역, read: 병음 · 히라가나, check? }], summary, notes, model }
// 그림은 Workers AI(그림을 읽는 모델)로 보내 읽기만 하고 저장하지 않는다. 긴 그림은 화면이 겹치게 잘라 조각마다 부른다.
// 요청 제한은 번역과 따로 센다 (이름 'photo', 낮게).
// 무료 요금제 안전장치(v1.6.0, lib/usage.mjs): 오늘 사용량이 문턱을 넘으면 그림을 받기 전에 'paused' · 예비 모델은 부르지 않는다
import { photoParams, checkImage, buildPhotoMessages, cleanPhoto, PHOTO_MODELS, PHOTO_MAX_TOKENS, PHOTO_RATE, MAX_PHOTO_BYTES, CAPACITY_RETRY_MS } from '../../lib/photo-core.mjs';
import { responseText, aiError, withTimeout, toBase64 } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';
import { runAI, pausedResponse } from '../../lib/usage.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env, waitUntil }) {
  const denied = checkOrigin(request) || rateLimit(request, PHOTO_RATE.name, PHOTO_RATE.limit, PHOTO_RATE.windowMs);
  if (denied) return denied;
  const { value: q, ...invalid } = photoParams(request.url);
  if (!q) return json(invalid, 400);
  const paused = await pausedResponse(env);
  if (paused) return paused;
  if (Number(request.headers.get('content-length') || 0) > MAX_PHOTO_BYTES) return json({ error: '사진이 너무 커요.', code: 'photo_too_big', max: MAX_PHOTO_BYTES }, 413);
  const bytes = await request.arrayBuffer();
  const { value: img, status, ...bad } = checkImage(bytes);
  if (!img) return json(bad, status);
  if (!env.AI) return json({ error: 'AI 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);

  const messages = buildPhotoMessages(q, `data:${img.type};base64,${toBase64(bytes)}`);
  const [model] = PHOTO_MODELS;
  let lastError = null;
  // 기본 모델이 "잠시 바쁨(3040)"이면 한 번 더. 그래도 안 되거나 JSON이 아니면 "잠시 뒤 다시 해 주세요" (busy · photo_failed)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await withTimeout(runAI(env, waitUntil, model.id, { messages, max_tokens: PHOTO_MAX_TOKENS, temperature: 0, ...model.extra }), model.timeoutMs);
      const out = cleanPhoto(responseText(result), q);
      if (out) return json({ ...out, model: model.id });
      lastError = new Error(`invalid photo answer from ${model.id}`);
      break;
    } catch (e) {
      lastError = e;
      if (attempt === 1 && /3040|capacity/i.test(String(e?.message))) { await sleep(CAPACITY_RETRY_MS); continue; }
      break;
    }
  }
  const { status: st, ...problem } = aiError(lastError, '사진 번역');
  return json(problem, st);
}
