// 말소리: 듣기(음성 인식) · 말하기(읽어 주기)
// 듣기: 브라우저 음성 인식(실시간 자막) → 없거나 안 되면 녹음해서 서버(Whisper)로.
import { LANGS } from './lang.js';
import { transcribe } from './api.js';
import { state } from './store.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const hasBrowserSTT = () => Boolean(SR);
export const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

/** 지금 설정에서 어떤 방식으로 들을지 */
export function sttMode() {
  const pref = state.settings.stt;
  if (pref === 'server') return canRecord() ? 'server' : (hasBrowserSTT() ? 'browser' : null);
  if (pref === 'browser') return hasBrowserSTT() ? 'browser' : (canRecord() ? 'server' : null);
  return hasBrowserSTT() ? 'browser' : (canRecord() ? 'server' : null);
}

const FALLBACK_ERRORS = new Set(['network', 'service-not-allowed', 'language-not-supported', 'bad-grammar']);

/**
 * 한 번 듣기. 반환값의 stop()으로 멈춘다(누르면 끝).
 * on: { interim(text), final(text), error(message), end(), level(0..1) }
 */
export function listen(lang, on) {
  const mode = sttMode();
  if (!mode) { on.error?.('이 브라우저는 마이크를 쓸 수 없어요. 글로 입력해 주세요.'); on.end?.(); return { stop() {} }; }
  return mode === 'browser' ? listenBrowser(lang, on) : listenServer(lang, on);
}

function listenBrowser(lang, on) {
  const rec = new SR();
  rec.lang = LANGS[lang].bcp47;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let interimText = '';
  let switched = null;
  let ended = false;
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    interimText = interim;
    on.interim?.((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return;
    if (e.error === 'no-speech') return; // onend에서 "못 들었어요"
    if (e.error === 'not-allowed') { on.error?.('마이크 권한이 필요해요. 주소창 옆 자물쇠에서 마이크를 허용해 주세요.'); return; }
    if (e.error === 'audio-capture') { on.error?.('마이크를 찾지 못했어요.'); return; }
    if (FALLBACK_ERRORS.has(e.error) && canRecord()) {
      // 브라우저 음성 인식이 이 언어·환경에서 안 되면 서버 방식으로 바로 이어서
      switched = listenServer(lang, on);
      return;
    }
    on.error?.(`음성 인식 오류 (${e.error})`);
  };
  rec.onend = () => {
    if (switched || ended) return;
    ended = true;
    const text = (finalText || interimText).trim();
    if (text) on.final?.(text);
    else on.nothing?.();
    on.end?.();
  };
  try { rec.start(); } catch (e) { on.error?.('음성 인식을 시작하지 못했어요.'); on.end?.(); }
  return {
    stop() { if (switched) switched.stop(); else { try { rec.stop(); } catch {} } },
    mode: 'browser',
  };
}

function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

/** 녹음 → 서버 인식. 말을 멈추고 1.3초 조용하면 저절로 끝난다(최대 30초) */
function listenServer(lang, on) {
  let stopped = false;
  let heardVoice = false;
  let recorder, stream, ctx, raf, hardStop;
  const chunks = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(hardStop);
    try { recorder?.state !== 'inactive' && recorder?.stop(); } catch {}
  };
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      on.error?.('마이크 권한이 필요해요. 주소창 옆 자물쇠에서 마이크를 허용해 주세요.'); on.end?.(); return;
    }
    if (stopped) { stream.getTracks().forEach((t) => t.stop()); on.end?.(); return; }
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
      if (blob.size < 1500 || !heardVoice) { on.nothing?.(); on.end?.(); return; }
      on.interim?.('…');
      try {
        const text = (await transcribe(blob, lang)).trim();
        if (text) on.final?.(text); else on.nothing?.();
      } catch (e) { on.error?.(e.message); }
      on.end?.();
    };
    recorder.start(250);
    on.interim?.('');
    // 소리 크기로 말 시작·끝 알아채기
    let quietSince = performance.now();
    const startedAt = performance.now();
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += x * x;
        const rms = Math.sqrt(sum / buf.length);
        on.level?.(Math.min(1, rms * 8));
        const now = performance.now();
        if (rms > 0.02) { heardVoice = true; quietSince = now; }
        if (heardVoice && now - quietSince > 1300) return stop();
        if (!heardVoice && now - startedAt > 8000) return stop(); // 8초 동안 말이 없으면
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { heardVoice = true; } // 소리 크기를 못 재면 끝까지 받아서 서버에 맡긴다
    hardStop = setTimeout(stop, 30000);
  })();
  return { stop, mode: 'server' };
}

// ---------- 읽어 주기 ----------
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
function refreshVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { refreshVoices(); synth.addEventListener?.('voiceschanged', refreshVoices); }

export const canSpeak = () => Boolean(synth);

const GOOD = /(natural|neural|online|premium|enhanced|google|siri|yelda|yuna|samantha|ava|jenny|aria|sunhi|seoyeon|emel|ahmet)/i;
/** 언어별 목소리 후보 (좋은 것부터) */
export function voicesFor(lang) {
  const tag = LANGS[lang].bcp47.toLowerCase();
  const base = lang.toLowerCase();
  return voices
    .filter((v) => v.lang && (v.lang.toLowerCase().replace('_', '-') === tag || v.lang.toLowerCase().startsWith(`${base}-`) || v.lang.toLowerCase() === base))
    .sort((a, b) => (GOOD.test(b.name) - GOOD.test(a.name)) || (b.lang.toLowerCase().replace('_', '-') === tag) - (a.lang.toLowerCase().replace('_', '-') === tag));
}
export const hasVoice = (lang) => voicesFor(lang).length > 0;

function voiceFor(lang) {
  const list = voicesFor(lang);
  const chosen = state.settings.voices?.[lang];
  return list.find((v) => v.voiceURI === chosen) || list[0] || null;
}

/** 소리 내어 읽기. 끝나면 resolve */
export function speak(text, lang, { rate } = {}) {
  return new Promise((resolve) => {
    if (!synth || !text) return resolve(false);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[lang].bcp47;
    const v = voiceFor(lang);
    try { if (v) u.voice = v; } catch { /* 목소리를 못 고르면 언어만으로 */ }
    u.rate = rate ?? state.settings.rate;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synth.speak(u);
    // 크롬은 가끔 onend를 안 준다
    setTimeout(() => resolve(true), Math.min(30000, 1500 + text.length * 120));
  });
}
export const stopSpeaking = () => synth?.cancel();

/** 아이폰 사파리: 처음엔 사용자가 누를 때만 소리가 난다 — 첫 터치 때 빈 소리로 풀어 둔다 */
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !synth) return;
  unlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch {}
}
