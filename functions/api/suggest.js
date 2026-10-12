// POST /api/suggest  { me, partner, formal?, turns: [{ side: me|partner, from, to, text, translation }] } → { suggestions: [{ me, partner }], model }
// 상대 말이 통역된 뒤 화면이 따로 부른다 (통역을 먼저 보여 주고 추천은 뒤에 붙인다). 실패해도 통역 흐름에는 영향이 없다.
// 요청 제한은 번역과 따로 센다 (이름 'suggest') — 추천 때문에 번역이 막히지 않게.
import { validateSuggest, buildSuggestMessages, cleanSuggestions, SUGGEST_MAX_TOKENS } from '../../lib/assist-core.mjs';
import { responseText, aiError, withTimeout, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';

export async function onRequestPost({ request, env }) {
  const denied = checkOrigin(request) || rateLimit(request, 'suggest', 30, 60_000);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value: v, ...invalid } = validateSuggest(body);
  if (!v) return json(invalid, 400);
  if (!env.AI) return json({ error: 'AI 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);

  const input = { messages: buildSuggestMessages(v), max_tokens: SUGGEST_MAX_TOKENS, temperature: 0.4 };
  let best = null;
  let lastError = null;
  // 첫 모델에서 2개 이상 나오면 끝. 모자라면 다음 모델 한 번만 (AI 사용량을 아끼려고 둘까지만)
  for (const model of MODELS.slice(0, 2)) {
    try {
      const result = await withTimeout(env.AI.run(model.id, { ...input, ...model.extra }), model.timeoutMs);
      const suggestions = cleanSuggestions(responseText(result), v);
      if (!best || suggestions.length > best.suggestions.length) best = { suggestions, model: model.id };
      if (suggestions.length >= 2) break;
      lastError = new Error(`too few suggestions from ${model.id}`);
    } catch (e) {
      lastError = e;
      if (/4006|daily free allocation/i.test(String(e?.message))) break;
    }
  }
  if (best?.suggestions.length) return json(best);
  if (best) return json({ suggestions: [], model: best.model });
  const { status, ...problem } = aiError(lastError, '답장 추천');
  return json(problem, status);
}
