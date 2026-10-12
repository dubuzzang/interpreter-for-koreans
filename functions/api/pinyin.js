// POST /api/pinyin  { text: 중국어 } → { pinyin: 병음(성조 부호) } — 화면에서 한글 발음(니 하오)과 병음(Nǐ hǎo)으로 보여 준다
import { validatePinyin, buildPinyinMessages, cleanPinyin, pinyinMatches, responseText, aiError, withTimeout, maxTokensFor, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';
import { runAI } from '../../lib/usage.mjs';

export async function onRequestPost({ request, env, waitUntil }) {
  const denied = checkOrigin(request) || rateLimit(request, 'pinyin', 40, 60_000);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value, ...invalid } = validatePinyin(body);
  if (!value) return json(invalid, 400);
  if (!env.AI) return json({ error: '읽기 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);
  const input = { messages: buildPinyinMessages(value.text), max_tokens: maxTokensFor(value.text) * 2, temperature: 0 };
  let lastError = null;
  let rough = null; // 음절 수가 한자 수와 안 맞는 답 — 다음 모델도 안 맞으면 이것이라도
  for (const model of MODELS.slice(0, 2)) {
    try {
      const pinyin = cleanPinyin(responseText(await withTimeout(runAI(env, waitUntil, model.id, { ...input, ...model.extra }), model.timeoutMs)));
      if (pinyin && pinyinMatches(pinyin, value.text)) return json({ pinyin, model: model.id });
      if (pinyin && !rough) rough = { pinyin, model: model.id };
      lastError = new Error(`invalid pinyin from ${model.id}`);
    } catch (e) {
      lastError = e;
      if (/4006|daily free allocation/i.test(String(e?.message))) break;
    }
  }
  if (rough) return json(rough);
  const { status, ...problem } = aiError(lastError, '읽기 변환');
  return json(problem, status);
}
