// POST /api/translate  { text, from, to, context?: [{lang,text}], formal?: true } → { text, model } · 오류는 { error(한국어), code }
import { validateTranslate, buildMessages, cleanOutput, responseText, looksValid, aiError, withTimeout, maxTokensFor, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';
import { runAI } from '../../lib/usage.mjs';

// 무료 요금제 안전장치(lib/usage.mjs): 번역은 사용량이 많은 날에도 쉬지 않는다 (쓴 뉴런은 센다)
export async function onRequestPost({ request, env, waitUntil }) {
  const denied = checkOrigin(request) || rateLimit(request, 'translate', 40, 60_000);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value: v, ...invalid } = validateTranslate(body);
  if (!v) return json(invalid, 400);
  if (v.from === v.to) return json({ text: v.text, model: 'same-language' });
  if (!env.AI) return json({ error: '번역 엔진이 연결되지 않았어요. (AI 바인딩 없음)', code: 'no_engine' }, 500);

  const input = { messages: buildMessages(v), max_tokens: maxTokensFor(v.text), temperature: 0.2 };
  let lastError = null;
  for (const model of MODELS) {
    try {
      const result = await withTimeout(runAI(env, waitUntil, model.id, { ...input, ...model.extra }), model.timeoutMs);
      const out = cleanOutput(responseText(result), v.text);
      if (looksValid(out, v)) return json({ text: out, model: model.id });
      lastError = new Error(`invalid output from ${model.id}`);
    } catch (e) {
      lastError = e;
      if (/4006|daily free allocation/i.test(String(e?.message))) break; // 한도는 모델을 바꿔도 같다
    }
  }
  const { status, ...problem } = aiError(lastError);
  return json(problem, status);
}
