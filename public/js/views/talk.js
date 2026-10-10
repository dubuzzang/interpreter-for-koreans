// 대화 통역: 나·상대가 각자 버튼을 누르고 말하면 → 받아쓰기 → 번역 → 상대 언어로 읽어 주기
// 마주 보기: 휴대폰을 탁자에 놓고, 상대 쪽 절반을 뒤집어 상대 언어로 보여 준다
import { h, icon, toast, copyText, showBig, fmtTime, rich } from '../ui.js';
import { LANGS, sideFor } from '../lang.js';
import { t, tl, langName } from '../i18n.js';
import { state, setSetting, addHistory, updateHistory } from '../store.js';
import { listen, speak, stopSpeaking, unlockSpeech, hasVoice, sttMode } from '../speech.js';
import { translate, kana as kanaReading } from '../api.js';
import { readingFor, needsKana } from '../reading.js';

const START_KEY = 'tercuman.convoStart';
const session = (() => {
  const start = Number(localStorage.getItem(START_KEY) || 0);
  return state.history.filter((x) => (x.side === 'me' || x.side === 'partner') && x.at >= start);
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
/** 지난 대화 한 줄이 지금 '나' 기준으로 어느 쪽인지 (내 언어를 바꿨어도 맞게) */
const sideOf = (turn) => sideFor(turn, state.settings.me);

function context(beforeTurn) {
  const i = session.indexOf(beforeTurn);
  return session.slice(Math.max(0, i - 4), i < 0 ? undefined : i).filter((x) => x.text).map((x) => ({ lang: x.from, text: x.text }));
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
    // 일본어로 옮겼으면 읽는 법(한글 발음 · 로마자)을 보여 주려고 읽기(히라가나)를 따로 받는다 (번역은 먼저 보여 줌)
    if (state.settings.reading && needsKana(turn.to, state.settings.me)) {
      kanaReading(out).then((k) => { if (k && turn.translation === out) { turn.kana = k; updateHistory(turn.id, { kana: k }); redraw(); } });
    }
    if (state.settings.autoSpeak) {
      if (!hasVoice(turn.to) && !warnedVoice.has(turn.to)) {
        warnedVoice.add(turn.to);
        toast(t('talk.noVoice', { lang: langName(turn.to) }));
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
    interim: (said) => { if (active === mine && live) { live.text = said; updateLive(); } },
    final: (said) => { heard = said; },
    nothing: () => toast(tl(lang, 'mic.noSpeech')),
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
    return h('div', { class: `bubble ${sideOf(turn)}` },
      h('div', { class: 'b-orig' }, LANGS[turn.from].flag, ' ', t('talk.editHeard')),
      area,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => {
          const v = area.value.trim();
          turn.editing = false;
          if (v && v !== turn.text) { turn.text = v; turn.edited = true; translateTurn(turn); } else redraw();
        } }, t('talk.retranslate')),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { turn.editing = false; redraw(); } }, t('common.cancel')),
      ));
  }
  const reading = s.reading && turn.translation ? readingFor(turn.translation, turn.to, s.me, turn.kana) : '';
  return h('div', { class: `bubble ${sideOf(turn)}` },
    h('div', { class: 'b-orig', lang: turn.from }, h('span', { class: 'flag' }, LANGS[turn.from].flag), ' ', turn.text, turn.edited ? h('em', null, ' · ', t('talk.edited')) : null),
    turn.pending ? h('div', { class: 'b-trans pending', lang: turn.to }, h('span', { class: 'dots' }), tl(turn.to, 'mic.thinking'))
      : turn.error ? h('div', { class: 'b-error' }, turn.error, ' ', h('button', { class: 'link', type: 'button', onclick: () => translateTurn(turn) }, t('common.retry')))
        : h('div', { class: 'b-trans', lang: turn.to }, turn.translation),
    reading ? h('div', { class: 'b-reading' }, reading) : null,
    !turn.pending && !turn.error && turn.translation ? h('div', { class: 'b-actions' },
      actBtn('speaker', t('talk.replay'), () => { unlockSpeech(); speak(turn.translation, turn.to); }),
      actBtn('expand', t('common.showBig'), () => showBig(turn.translation, { lang: turn.to, onSpeak: () => speak(turn.translation, turn.to) })),
      actBtn('copy', t('common.copy'), () => copyText(turn.translation)),
      actBtn('edit', t('talk.editHeard'), () => { turn.editing = true; redraw(); }),
      h('span', { class: 'b-time' }, fmtTime(turn.at)),
    ) : null,
  );
}

function micButton(side, { big = false } = {}) {
  const lang = langOf(side);
  const on = active?.side === side;
  const btn = h('button', {
    class: `mic ${side}${on ? ' on' : ''}${big ? ' big' : ''}`, type: 'button',
    'aria-pressed': String(on), 'aria-label': t('talk.ariaSpeak', { lang: langName(lang) }),
    onclick: () => toggleListen(side),
  },
  h('span', { class: 'mic-ring', 'aria-hidden': 'true' }),
  icon(on ? 'stop' : 'mic', big ? 34 : 28),
  h('span', { class: 'mic-text' }, h('b', null, LANGS[lang].flag, ' ', tl(lang, on ? 'mic.listening' : 'mic.speak')), h('small', null, on ? tl(lang, 'mic.stop') : LANGS[lang].native)));
  if (on) levelEl = btn;
  return btn;
}

function typingRow() {
  if (!typing) return null;
  const lang = langOf(typing.side);
  const input = h('input', { class: 'type-input', type: 'text', lang, placeholder: tl(lang, 'mic.typeHere'), enterkeyhint: 'send', 'aria-label': t('talk.ariaType', { lang: langName(lang) }) });
  const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; addTurn(typing.side, v); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
  setTimeout(() => input.focus(), 0);
  return h('div', { class: 'typing' },
    h('button', { class: `chip side ${typing.side}`, type: 'button', title: t('talk.whoTypes'), onclick: () => { typing.side = otherOf(typing.side); redraw(); } }, LANGS[lang].flag, ' ', t(typing.side === 'me' ? 'talk.me' : 'talk.partner')),
    input,
    h('button', { class: 'icon-btn primary', type: 'button', 'aria-label': t('talk.send'), onclick: send }, icon('send', 20)));
}

function emptyHint() {
  const { me, partner } = state.settings;
  const mode = sttMode();
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon' }, '🎙️'),
    h('p', null, rich(t('talk.emptyHow', { me: LANGS[me].flag, partner: LANGS[partner].flag }))),
    h('p', { class: 'muted', lang: partner }, tl(partner, 'mic.partnerHint')),
    h('p', { class: 'muted small' }, t('talk.emptyAuto')),
    !mode ? h('p', { class: 'warn' }, t('talk.noMic')) : null,
  );
}

function newConversation() {
  if (session.length && !confirm(t('talk.newConfirm'))) return;
  active?.ctrl?.stop();
  session.length = 0;
  localStorage.setItem(START_KEY, String(Date.now()));
  redraw();
}

function toolbar() {
  const f2f = state.settings.faceToFace;
  return h('div', { class: 'toolbar' },
    h('button', { class: `chip${f2f ? ' on' : ''}`, type: 'button', 'aria-pressed': String(f2f), onclick: () => { setSetting('faceToFace', !f2f); redraw(); } }, icon('faces', 16), ' ', t('talk.faceToFace')),
    h('div', { class: 'spacer' }),
    h('button', { class: 'chip', type: 'button', onclick: newConversation }, icon('plus', 16), ' ', t('talk.new')));
}

// ---------- 마주 보기 ----------
// 각 절반은 그쪽 사람의 언어로: 문구도, 읽는 법도 그 절반을 보는 사람 기준
function f2fPanel(side) {
  const L = langOf(side);
  const recent = session.slice(-3);
  const lines = recent.map((turn) => {
    const own = sideOf(turn) === side;
    const text = own ? turn.text : turn.translation;
    const lineLang = own ? turn.from : turn.to;
    const pending = !own && turn.pending;
    const reading = state.settings.reading && text && !pending ? readingFor(text, lineLang, L, own ? '' : turn.kana) : '';
    return h('div', { class: `f-line${own ? ' own' : ''}`, lang: lineLang },
      pending ? h('span', { class: 'muted' }, tl(L, 'mic.thinking')) : text || (turn.error ? '⚠️' : ''),
      reading ? h('div', { class: 'b-reading' }, reading) : null);
  });
  const liveLine = live?.side === side ? h('div', { class: 'f-line own live-line', lang: L, 'data-live-text': '' }, live.text || '…') : null;
  return h('div', { class: 'f-panel' },
    h('div', { class: 'f-lines' }, lines.length || liveLine ? [...lines, liveLine] : h('div', { class: 'f-hint', lang: L }, tl(L, 'mic.tapToSpeak'))),
    micButton(side, { big: true }));
}

function renderFaceToFace(root) {
  root.append(h('div', { class: 'f2f' },
    h('section', { class: 'f2f-half partner flip', 'aria-label': t('talk.partnerHalf') }, f2fPanel('partner')),
    h('div', { class: 'f2f-mid' },
      h('button', { class: 'chip on', type: 'button', onclick: () => { setSetting('faceToFace', false); redraw(); } }, icon('faces', 16), ' ', t('talk.faceToFaceOff')),
      h('button', { class: 'chip', type: 'button', onclick: newConversation }, icon('plus', 16), ' ', t('talk.new'))),
    h('section', { class: 'f2f-half me', 'aria-label': t('talk.myHalf') }, f2fPanel('me'))));
}

export default {
  render(root) {
    draw = () => {
      root.replaceChildren();
      levelEl = null;
      if (state.settings.faceToFace) { renderFaceToFace(root); return; }
      const list = h('div', { class: 'chat', 'aria-live': 'polite' }, session.length ? session.map(bubble) : emptyHint());
      const liveBox = live ? h('div', { class: `live ${live.side}` },
        h('div', { class: 'live-label' }, LANGS[langOf(live.side)].flag, ' ', tl(langOf(live.side), 'mic.listening')),
        h('div', { class: 'live-text', lang: langOf(live.side), 'data-live-text': '' }, live.text || '…')) : null;
      // append는 null을 "null" 글자로 넣으므로 빈 칸은 빼고 넣는다
      root.append(...[toolbar(), list, liveBox, typingRow(),
        h('div', { class: 'controls' },
          micButton('me'),
          h('button', { class: `icon-btn kb${typing ? ' on' : ''}`, type: 'button', 'aria-label': t('talk.typeToggle'), 'aria-pressed': String(Boolean(typing)), onclick: () => { typing = typing ? null : { side: 'me' }; redraw(); } }, icon('keyboard', 22)),
          micButton('partner'))].filter(Boolean));
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };
    draw();
    return () => { active?.ctrl?.stop(); draw = null; };
  },
};