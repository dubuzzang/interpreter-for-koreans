// POST /api/summary  { me, partner, turns: [{ side: me|partner, from, to, text, translation }] }
//   → { fields: { price: { me, partner }, quantity, delivery, other }, filled, model }
// 공유할 대화에서 합의한 단가 · 수량 · 배송일 · 기타 조건을 두 언어로 뽑는다. 대화에 없는 값(지어낸 숫자 포함)은 빈칸.
// 화면은 사용자가 확인·고친 뒤에만 공유한다. 요청 제한은 번역과 따로('summary').
import { validateSummary, buildSummaryMessages, cleanSummary, SUMMARY_MAX_TOKENS } from '../../lib/assist-core.mjs';
import { responseText, aiError, withTimeout, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';
import { runAI, pausedResponse } from '../../lib/usage.mjs';

// 무료 요금제 안전장치: 오늘 사용량이 문턱을 넘으면 AI를 부르지 않고 'paused' (lib/usage.mjs)
export async function onRequestPost({ request, env, waitUntil }) {
  const denied = checkOrigin(request) || rateLimit(request, 'summary', 10, 60_000) || await pausedResponse(env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value: v, ...invalid } = validateSummary(body);
  if (!v) return json(invalid, 400);
  if (!env.AI) return json({ error: 'AI 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);

  const input = { messages: buildSummaryMessages(v), max_tokens: SUMMARY_MAX_TOKENS, temperature: 0 };
  let lastError = null;
  for (const model of MODELS.slice(0, 2)) {
    try {
      const result = await withTimeout(runAI(env, waitUntil, model.id, { ...input, ...model.extra }), model.timeoutMs + 6000);
      const summary = cleanSummary(responseText(result), v);
      if (summary) return json({ ...summary, model: model.id });
      lastError = new Error(`invalid summary from ${model.id}`);
    } catch (e) {
      lastError = e;
      if (/4006|daily free allocation/i.test(String(e?.message))) break;
    }
  }
  const { status, ...problem } = aiError(lastError, '요약');
  return json(problem, status);
}
