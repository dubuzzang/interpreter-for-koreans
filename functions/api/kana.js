// POST /api/kana  { text: 일본어 } → { kana: 히라가나 읽기 } — 화면에서 한글 발음(곤니치와)이나 로마자(Konnichiwa)로 바꿔 보여 준다
import { validateKana, buildKanaMessages, cleanKana, responseText, aiError, withTimeout, maxTokensFor, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';
import { runAI } from '../../lib/usage.mjs';

export async function onRequestPost({ request, env, waitUntil }) {
  const denied = checkOrigin(request) || rateLimit(request, 'kana', 40, 60_000);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value, ...invalid } = validateKana(body);
  if (!value) return json(invalid, 400);
  if (!env.AI) return json({ error: '읽기 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);
  const input = { messages: buildKanaMessages(value.text), max_tokens: maxTokensFor(value.text) * 2, temperature: 0 };
  let lastError = null;
  for (const model of MODELS.slice(0, 2)) {
    try {
      const kana = cleanKana(responseText(await withTimeout(runAI(env, waitUntil, model.id, { ...input, ...model.extra }), model.timeoutMs)));
      if (kana) return json({ kana, model: model.id });
      lastError = new Error(`invalid kana from ${model.id}`);
    } catch (e) {
      lastError = e;
      if (/4006|daily free allocation/i.test(String(e?.message))) break;
    }
  }
  const { status, ...problem } = aiError(lastError, '읽기 변환');
  return json(problem, status);
}
