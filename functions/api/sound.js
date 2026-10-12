// POST /api/sound  { text, lang } → { sound: 소리 표기, model } (v1.6.0) — 일본어 히라가나 읽기 · 중국어(간체 · 번체) 병음 · lib/langs/의 언어.
// 화면에서 한글 발음(한국어 사용자)이나 로마자 · 병음(다른 사용자)으로 바꿔 보여 준다. 규칙은 lib/sound-core.mjs
import { validateSound, soundInput } from '../../lib/sound-core.mjs';
import { responseText, aiError, withTimeout, MODELS } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';

export async function onRequestPost({ request, env }) {
  const denied = checkOrigin(request) || rateLimit(request, 'sound', 40, 60_000);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: '요청 형식이 올바르지 않아요.', code: 'bad_request' }, 400); }
  const { value: v, ...invalid } = validateSound(body);
  if (!v) return json(invalid, 400);
  if (!env.AI) return json({ error: '읽기 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);
  const input = soundInput(v);
  let lastError = null;
  let rough = null; // 검사(음절 수 등)가 안 맞는 답 — 다음 모델도 안 맞으면 이것이라도
  for (const model of MODELS.slice(0, 2)) {
    try {
      const sound = v.spec.clean(responseText(await withTimeout(env.AI.run(model.id, { ...input, ...model.extra }), model.timeoutMs)), v.text);
      if (sound && (!v.spec.matches || v.spec.matches(sound, v.text))) return json({ sound, model: model.id });
      if (sound && !rough) rough = { sound, model: model.id };
      lastError = new Error(`invalid sound from ${model.id}`);
    } catch (e) {
      lastError = e;
      if (/4006|daily free allocation/i.test(String(e?.message))) break; // 한도는 모델을 바꿔도 같다
    }
  }
  if (rough) return json(rough);
  const { status, ...problem } = aiError(lastError, '읽기 변환');
  return json(problem, status);
}
