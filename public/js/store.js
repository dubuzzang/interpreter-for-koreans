// 이 기기에만 저장: 설정 · 통역 기록
const KEY = 'tercuman.v1';
const MAX_HISTORY = 500;

export const DEFAULTS = {
  me: 'ko',            // 내 언어
  partner: 'tr',       // 상대 언어
  formal: true,        // 존댓말(siz) / 반말(sen)
  autoSpeak: true,     // 번역을 바로 소리 내어 읽기
  rate: 0.95,          // 읽는 속도
  reading: true,       // 튀르키예어 한글 발음 · 한국어 로마자 같이 보이기
  stt: 'auto',         // 음성 인식: auto(브라우저 → 안 되면 서버) · browser · server
  voices: { ko: '', tr: '', en: '' },
  saveHistory: true,
  theme: 'auto',       // auto · light · dark
  faceToFace: false,   // 마주 보기(상대 쪽 화면을 뒤집어 보여 줌)
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      settings: { ...DEFAULTS, ...(raw.settings || {}), voices: { ...DEFAULTS.voices, ...(raw.settings?.voices || {}) } },
      history: Array.isArray(raw.history) ? raw.history : [],
    };
  } catch { return { settings: { ...DEFAULTS, voices: { ...DEFAULTS.voices } }, history: [] }; }
}

export const state = load();

let timer;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ settings: state.settings, history: state.history.slice(-MAX_HISTORY) })); } catch {}
  }, 150);
}
addEventListener('pagehide', () => {
  try { localStorage.setItem(KEY, JSON.stringify({ settings: state.settings, history: state.history.slice(-MAX_HISTORY) })); } catch {}
});

export function setSetting(k, v) { state.settings[k] = v; save(); }

/** 통역 한 번 기록: { side: me|partner|text, from, to, text, translation, at } */
export function addHistory(item) {
  const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), ...item };
  if (state.settings.saveHistory) {
    state.history.push(entry);
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
    save();
  }
  return entry;
}
export function updateHistory(id, patch) {
  const e = state.history.find((x) => x.id === id);
  if (e) { Object.assign(e, patch); save(); }
}
export function clearHistory() { state.history = []; save(); }
