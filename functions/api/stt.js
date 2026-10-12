// POST /api/stt?lang=ko  본문: 녹음 파일(webm·mp4·ogg·wav·mp3) → { text }  (lang: 앱의 언어 코드 — 번체 중국어 zh-TW는 Whisper에 zh로)
// 브라우저 음성 인식이 없는 곳(일부 앱 안 브라우저·파이어폭스)에서 쓰는 대신 경로 — Whisper large-v3 turbo
import { CODES, STT_MODEL, STT_PROMPT, MAX_AUDIO, aiError, cleanTranscript, sttLanguage, toBase64, withTimeout } from '../../lib/translate-core.mjs';
import { checkOrigin, rateLimit, json } from '../../lib/guard.mjs';
import { runAI } from '../../lib/usage.mjs';

// 받아쓰기는 사용량이 많은 날에도 쉬지 않는다 (오디오 길이로 뉴런을 센다 — lib/usage.mjs)
export async function onRequestPost({ request, env, waitUntil }) {
  const denied = checkOrigin(request) || rateLimit(request, 'stt', 20, 60_000);
  if (denied) return denied;
  const lang = new URL(request.url).searchParams.get('lang');
  if (!CODES.includes(lang)) return json({ error: '지원하지 않는 언어예요.', code: 'unsupported_lang' }, 400);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_AUDIO) return json({ error: '녹음이 너무 길어요. 1분 안으로 말해 주세요.', code: 'audio_too_long' }, 413);
  const audio = await request.arrayBuffer();
  if (audio.byteLength < 800) return json({ text: '' });
  if (audio.byteLength > MAX_AUDIO) return json({ error: '녹음이 너무 길어요. 1분 안으로 말해 주세요.', code: 'audio_too_long' }, 413);
  if (!env.AI) return json({ error: '음성 인식 엔진이 연결되지 않았어요.', code: 'no_engine' }, 500);
  try {
    const input = { audio: toBase64(audio), language: sttLanguage(lang), task: 'transcribe', vad_filter: true };
    if (STT_PROMPT[lang]) input.initial_prompt = STT_PROMPT[lang];
    const r = await withTimeout(runAI(env, waitUntil, STT_MODEL, input), 25_000);
    return json({ text: cleanTranscript(r?.text) });
  } catch (e) {
    const { status, ...problem } = aiError(e, '음성 인식');
    return json(problem, status);
  }
}
