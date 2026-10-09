// 대화 통역: 나·상대가 각자 버튼을 누르고 말하면 → 받아쓰기 → 번역 → 상대 언어로 읽어 주기
// 마주 보기: 휴대폰을 탁자에 놓고, 상대 쪽 절반을 뒤집어 상대 언어로 보여 준다
import { h, icon, toast, copyText, showBig, fmtTime } from '../ui.js';
import { LANGS, UI, PARTNER_HINT } from '../lang.js';
import { state, setSetting, addHistory, updateHistory } from '../store.js';
import { listen, speak, stopSpeaking, unlockSpeech, hasVoice, sttMode } from '../speech.js';
import { translate, kana as kanaReading } from '../api.js';
import { readingFor } from '../reading.js';

const START_KEY = 'tercuman.convoStart';
const session = (() => {
  const start = Number(localStorage.getItem(START_KEY) || 0);
  return state.history.filter((t) => (t.side === 'me' || t.side === 'partner') && t.at >= start);
})();
let active = null;      // 듣는 중 { side, ctrl }
let live = null;        // 받아쓰는 중인 글 { side, text }
let typing = null;      // 글로 입력 { side }
let draw = null;        // 지금 화면 다시 그리기
let levelEl = null;
const warnedVoice = new Set();

const langOf = (side) => (side === 'me' ? state.settings.me : state.settings.partner);
const otherOf = (side) => (side === 'me' ? 'partner' : 'me');
const redraw = () => draw?.();

function context(beforeTurn) {
  const i = session.indexOf(beforeTurn);
  return session.slice(Math.max(0, i - 4), i < 0 ? undefined : i).filter((t) => t.text).map((t) => ({ lang: t.from, text: t.text }));
}

async function translateTurn(turn) {
  turn.pending = true; turn.error = null;
  redraw();
  try {
    const out = await translate(turn.text, turn.from, turn.to, { context: context(turn), formal: state.settings.formal });
    turn.translation = out;
    turn.kana = '';
    turn.pending = false;
    updateHistory(turn.id, { translation: out, text: turn.text, kana: '' });
    redraw();
    // 일본어로 옮겼으면 한국 사용자에게 한글 발음을 보여 주려고 읽기(히라가나)를 따로 받는다 (번역은 먼저 보여 줌)
    if (turn.to === 'ja' && state.settings.reading && state.settings.me === 'ko') {
      kanaReading(out).then((k) => { if (k && turn.translation === out) { turn.kana = k; updateHistory(turn.id, { kana: k }); redraw(); } });
    }
    if (state.settings.autoSpeak) {
      if (!hasVoice(turn.to) && !warnedVoice.has(turn.to)) {
        warnedVoice.add(turn.to);
        toast(`이 기기에는 ${LANGS[turn.to].name} 목소리가 없어요. 화면을 보여 주세요 (설정 → 목소리 안내).`);
      }
      speak(out, turn.to);
    }
  } catch (e) {
    turn.pending = false;
    turn.error = e.message;
    redraw();
  }
}

function addTurn(side, text) {
  const from = langOf(side), to = langOf(otherOf(side));
  const turn = addHistory({ side, from, to, text, translation: '' });
  session.push(turn);
  translateTurn(turn);
}

function toggleListen(side) {
  unlockSpeech();
  if (active) {
    const same = active.side === side;
    active.ctrl.stop();
    if (same) return;
  }
  stopSpeaking();
  const lang = langOf(side);
  let heard = '';
  const mine = { side, ctrl: null };   // 이 듣기만의 표시 — 다른 쪽으로 바꿨을 때 앞의 끝 신호가 새 듣기를 지우지 않게
  active = mine;
  live = { side, text: '' };
  redraw();
  mine.ctrl = listen(lang, {
    interim: (t) => { if (active === mine && live) { live.text = t; updateLive(); } },
    final: (t) => { heard = t; },
    nothing: () => toast(UI[lang].noSpeech),
    error: (m) => toast(m, 'bad'),
    level: (v) => { if (active === mine) levelEl?.style.setProperty('--lvl', v.toFixed(2)); },
    end: () => {
      if (active === mine) { active = null; live = null; levelEl = null; }
      if (heard) addTurn(side, heard); else redraw();
    },
  });
}

// 받아쓰는 글만 바꿔 그리기 (화면 전체를 다시 그리지 않게)
function updateLive() {
  for (const el of document.querySelectorAll('[data-live-text]')) el.textContent = live?.text || '…';
}

const actBtn = (name, label, fn) => h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': label, title: label, onclick: fn }, icon(name, 18));

function bubble(turn) {
  const s = state.settings;
  if (turn.editing) {
    const area = h('textarea', { class: 'edit-area', rows: 3, lang: turn.from }, turn.text);
    setTimeout(() => area.focus(), 0);
    return h('div', { class: `bubble ${turn.side}` },
      h('div', { class: 'b-orig' }, LANGS[turn.from].flag, ' 들은 말 고치기'),
      area,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => {
          const v = area.value.trim();
          turn.editing = false;
          if (v && v !== turn.text) { turn.text = v; turn.edited = true; translateTurn(turn); } else redraw();
        } }, '다시 번역'),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { turn.editing = false; redraw(); } }, '취소'),
      ));
  }
  const reading = s.reading && turn.translation ? readingFor(turn.translation, turn.to, s.me, turn.kana) : '';
  return h('div', { class: `bubble ${turn.side}` },
    h('div', { class: 'b-orig', lang: turn.from }, h('span', { class: 'flag' }, LANGS[turn.from].flag), ' ', turn.text, turn.edited ? h('em', null, ' · 고침') : null),
    turn.pending ? h('div', { class: 'b-trans pending', lang: turn.to }, h('span', { class: 'dots' }), UI[turn.to].thinking)
      : turn.error ? h('div', { class: 'b-error' }, turn.error, ' ', h('button', { class: 'link', type: 'button', onclick: () => translateTurn(turn) }, '다시 시도'))
        : h('div', { class: 'b-trans', lang: turn.to }, turn.translation),
    reading ? h('div', { class: 'b-reading' }, reading) : null,
    !turn.pending && !turn.error && turn.translation ? h('div', { class: 'b-actions' },
      actBtn('speaker', '다시 듣기', () => { unlockSpeech(); speak(turn.translation, turn.to); }),
      actBtn('expand', '크게 보여 주기', () => showBig(turn.translation, { lang: turn.to, onSpeak: () => speak(turn.translation, turn.to) })),
      actBtn('copy', '복사', () => copyText(turn.translation)),
      actBtn('edit', '들은 말 고치기', () => { turn.editing = true; redraw(); }),
      h('span', { class: 'b-time' }, fmtTime(turn.at)),
    ) : null,
  );
}

function micButton(side, { big = false } = {}) {
  const lang = langOf(side);
  const on = active?.side === side;
  const btn = h('button', {
    class: `mic ${side}${on ? ' on' : ''}${big ? ' big' : ''}`, type: 'button',
    'aria-pressed': String(on), 'aria-label': `${LANGS[lang].name}로 말하기`,
    onclick: () => toggleListen(side),
  },
  h('span', { class: 'mic-ring', 'aria-hidden': 'true' }),
  icon(on ? 'stop' : 'mic', big ? 34 : 28),
  h('span', { class: 'mic-text' }, h('b', null, LANGS[lang].flag, ' ', on ? UI[lang].listening : UI[lang].speak), h('small', null, on ? UI[lang].stop : LANGS[lang].native)));
  if (on) levelEl = btn;
  return btn;
}

function typingRow() {
  if (!typing) return null;
  const lang = langOf(typing.side);
  const input = h('input', { class: 'type-input', type: 'text', lang, placeholder: UI[lang].typeHere, enterkeyhint: 'send', 'aria-label': `${LANGS[lang].name}로 입력` });
  const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; addTurn(typing.side, v); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
  setTimeout(() => input.focus(), 0);
  return h('div', { class: 'typing' },
    h('button', { class: `chip side ${typing.side}`, type: 'button', title: '누가 쓰는지 바꾸기', onclick: () => { typing.side = otherOf(typing.side); redraw(); } }, LANGS[lang].flag, ' ', typing.side === 'me' ? '나' : '상대'),
    input,
    h('button', { class: 'icon-btn primary', type: 'button', 'aria-label': '보내기', onclick: send }, icon('send', 20)));
}

function emptyHint() {
  const { me, partner } = state.settings;
  const mode = sttMode();
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, '🎙️'),
    h('p', null, h('b', null, `${LANGS[me].flag} 왼쪽`), ' 버튼은 나, ', h('b', null, `${LANGS[partner].flag} 오른쪽`), ' 버튼은 상대가 누르고 말해요.'),
    h('p', { class: 'muted', lang: partner }, PARTNER_HINT[partner]),
    h('p', { class: 'muted small' }, '말을 마치면 저절로 번역해서 읽어 줘요. 글로 쓰려면 가운데 ⌨ 버튼.'),
    !mode ? h('p', { class: 'warn' }, '이 브라우저는 마이크를 쓸 수 없어요. ⌨ 버튼으로 글을 입력해 주세요.') : null,
  );
}

function newConversation() {
  if (session.length && !confirm('지금 대화를 화면에서 지울까요? (기록 탭에는 남아요)')) return;
  active?.ctrl?.stop();
  session.length = 0;
  localStorage.setItem(START_KEY, String(Date.now()));
  redraw();
}

function toolbar() {
  const f2f = state.settings.faceToFace;
  return h('div', { class: 'toolbar' },
    h('button', { class: `chip${f2f ? ' on' : ''}`, type: 'button', 'aria-pressed': String(f2f), onclick: () => { setSetting('faceToFace', !f2f); redraw(); } }, icon('faces', 16), ' 마주 보기'),
    h('div', { class: 'spacer' }),
    h('button', { class: 'chip', type: 'button', onclick: newConversation }, icon('plus', 16), ' 새 대화'));
}

// ---------- 마주 보기 ----------
function f2fPanel(side) {
  const L = langOf(side);
  const recent = session.slice(-3);
  const lines = recent.map((t) => {
    const own = t.side === side;
    const text = own ? t.text : t.translation;
    const pending = !own && t.pending;
    return h('div', { class: `f-line${own ? ' own' : ''}`, lang: L },
      pending ? h('span', { class: 'muted' }, UI[L].thinking) : text || (t.error ? '⚠️' : ''));
  });
  const liveLine = live?.side === side ? h('div', { class: 'f-line own live-line', lang: L, 'data-live-text': '' }, live.text || '…') : null;
  return h('div', { class: 'f-panel' },
    h('div', { class: 'f-lines' }, lines.length || liveLine ? [...lines, liveLine] : h('div', { class: 'f-hint', lang: L }, UI[L].tapToSpeak)),
    micButton(side, { big: true }));
}

function renderFaceToFace(root) {
  root.append(h('div', { class: 'f2f' },
    h('section', { class: 'f2f-half partner flip', 'aria-label': '상대 쪽 (뒤집힘)' }, f2fPanel('partner')),
    h('div', { class: 'f2f-mid' },
      h('button', { class: 'chip on', type: 'button', onclick: () => { setSetting('faceToFace', false); redraw(); } }, icon('faces', 16), ' 마주 보기 끄기'),
      h('button', { class: 'chip', type: 'button', onclick: newConversation }, icon('plus', 16), ' 새 대화')),
    h('section', { class: 'f2f-half me', 'aria-label': '내 쪽' }, f2fPanel('me'))));
}

export default {
  render(root) {
    draw = () => {
      root.replaceChildren();
      levelEl = null;
      if (state.settings.faceToFace) { renderFaceToFace(root); return; }
      const list = h('div', { class: 'chat', 'aria-live': 'polite' }, session.length ? session.map(bubble) : emptyHint());
      const liveBox = live ? h('div', { class: `live ${live.side}` },
        h('div', { class: 'live-label' }, LANGS[langOf(live.side)].flag, ' ', UI[langOf(live.side)].listening),
        h('div', { class: 'live-text', lang: langOf(live.side), 'data-live-text': '' }, live.text || '…')) : null;
      // append는 null을 "null" 글자로 넣으므로 빈 칸은 빼고 넣는다
      root.append(...[toolbar(), list, liveBox, typingRow(),
        h('div', { class: 'controls' },
          micButton('me'),
          h('button', { class: `icon-btn kb${typing ? ' on' : ''}`, type: 'button', 'aria-label': '글로 입력', 'aria-pressed': String(Boolean(typing)), onclick: () => { typing = typing ? null : { side: 'me' }; redraw(); } }, icon('keyboard', 22)),
          micButton('partner'))].filter(Boolean));
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };
    draw();
    return () => { active?.ctrl?.stop(); draw = null; };
  },
};
