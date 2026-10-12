// POST /api/photo-summary  { me, lines: [{ text, tr }] } → { summary }
// 긴 그림을 조각으로 읽어 합친 뒤 전체 요약 한 줄 (글만 보내는 짧은 호출). 요청 제한은 사진과 같이 센다 ('photo').
import { validatePhotoSummary, buildPhotoSummaryMessages, cleanPhotoSummary, PHOTO_RATE } from '../../lib/photo-core.mjs';
import { responseText, aiError, withTimeout, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';

export async function onRequestPost({ request, env }) {
  const denied = checkOrigin(request) || rateLimit(request, PHOTO_RATE.name, PHOTO_RATE.limit, PHOTO_RATE.windowMs);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value: v, ...invalid } = validatePhotoSummary(body);
  if (!v) return json(invalid, 400);
  if (!env.AI) return json({ error: 'AI 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);
  const model = MODELS[0]; // 요약은 없어도 되는 것이라 예비 모델은 부르지 않는다
  try {
    const result = await withTimeout(env.AI.run(model.id, { messages: buildPhotoSummaryMessages(v), max_tokens: 160, temperature: 0.2, ...model.extra }), model.timeoutMs);
    return json({ summary: cleanPhotoSummary(responseText(result), v), model: model.id });
  } catch (e) {
    const { status, ...problem } = aiError(e, '요약');
    return json(problem, status);
  }
}
