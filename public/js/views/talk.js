// 대화 통역: 나·상대가 각자 버튼을 누르고 말하면 → 받아쓰기 → 번역 → 상대 언어로 읽어 주기
// 마주 보기: 휴대폰을 탁자에 놓고, 상대 쪽 절반을 뒤집어 상대 언어로 보여 준다
// 답장 추천(v1.4.0): 상대 말이 통역되면 그 아래에 내가 할 만한 답 2~3개 — 누르면 상대 언어로 읽어 주고 내 말로 들어간다
import { h, icon, toast, copyText, showBig, fmtTime, rich } from '../ui.js';
import { LANGS, sideFor } from '../lang.js';
import { t, tl, langName } from '../i18n.js';
import { state, setSetting, addHistory, updateHistory } from '../store.js';
import { listen, speak, stopSpeaking, unlockSpeech, hasVoice, sttMode } from '../speech.js';
import { translate, sound as fetchSound, suggestReplies } from '../api.js';
import { readingFor, needsSound } from '../reading.js';
import { openShare } from './share.js';

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
const tips = new Map();   // 답장 추천: 상대 말 id → { status: loading|ok, items: [{ me, partner }], me, partner }
const drafts = new Map(); // 들은 말 고치는 중인 글 (화면을 다시 그려도 남게 — 기록에는 저장하지 않는다)

const langOf = (side) => (side === 'me' ? state.settings.me : state.settings.partner);
const otherOf = (side) => (side === 'me' ? 'partner' : 'me');
const redraw = () => draw?.();
/** 지난 대화 한 줄이 지금 '나' 기준으로 어느 쪽인지 (내 언어를 바꿨어도 맞게) */
const sideOf = (turn) => sideFor(turn, state.settings.me);
/** 번역의 소리 표기 (일본어 히라가나 · 중국어 병음). v1.2.0까지의 기록은 kana에 */
const soundOf = (turn) => turn.sound ?? turn.kana ?? '';

function context(beforeTurn) {
  const i = session.indexOf(beforeTurn);
  return session.slice(Math.max(0, i - 4), i < 0 ? undefined : i).filter((x) => x.text).map((x) => ({ lang: x.from, text: x.text }));
}

/** 소리 내어 읽기 — 이 기기에 그 언어 목소리가 없으면 한 번만 알려 준다 */
function sayAloud(text, lang) {
  if (!hasVoice(lang) && !warnedVoice.has(lang)) {
    warnedVoice.add(lang);
    toast(t('talk.noVoice', { lang: langName(lang) }));
  }
  speak(text, lang);
}

/** 일본어·중국어로 옮겼으면 읽는 법(한글 발음 · 로마자 · 병음)을 보여 주려고 소리 표기(히라가나 · 병음)를 따로 받는다 (번역은 먼저 보여 줌) */
function fetchReading(turn) {
  const out = turn.translation;
  if (!state.settings.reading || !needsSound(turn.to, state.settings.me)) return;
  fetchSound(out, turn.to).then((k) => { if (k && turn.translation === out) { turn.sound = k; updateHistory(turn.id, { sound: k }); redraw(); } });
}

async function translateTurn(turn) {
  turn.pending = true; turn.error = null;
  tips.delete(turn.id);
  redraw();
  try {
    const out = await translate(turn.text, turn.from, turn.to, { context: context(turn), formal: state.settings.formal });
    turn.translation = out;
    turn.sound = '';
    turn.pending = false;
    updateHistory(turn.id, { translation: out, text: turn.text, sound: '' });
    redraw();
    fetchReading(turn);
    if (state.settings.autoSpeak) sayAloud(out, turn.to);
    requestTips(turn);
  } catch (e) {
    turn.pending = false;
    turn.error = e.message;
    redraw();
  }
}

// ---------- 답장 추천 ----------
/**
 * 상대 말이 통역되면 (그 말이 대화의 마지막일 때만) 내가 할 만한 답을 따로 받는다.
 * 통역은 이미 보이고 읽히는 중 — 추천이 늦거나 실패해도 대화에는 아무 영향이 없게 조용히 넘어간다
 */
function requestTips(turn) {
  if (!state.settings.suggest || sideOf(turn) !== 'partner' || session.at(-1) !== turn || !turn.translation) return;
  const me = turn.to, partner = turn.from;
  if (me !== state.settings.me || me === partner) return;
  const i = session.indexOf(turn);
  const turns = session.slice(Math.max(0, i - 3), i + 1).filter((x) => x.translation)
    .map((x) => ({ side: sideOf(x), from: x.from, to: x.to, text: x.text, translation: x.translation }));
  const entry = { status: 'loading', items: [], me, partner };
  tips.set(turn.id, entry);
  redraw();
  const settle = (items) => {
    if (tips.get(turn.id) !== entry) return; // 그사이 다시 번역했거나 새 대화
    if (items.length) Object.assign(entry, { status: 'ok', items }); else tips.delete(turn.id);
    redraw();
  };
  suggestReplies({ me, partner, turns, formal: state.settings.formal }).then(settle, () => settle([]));
}

/** 추천 답을 누르면: 내 말로 대화에 넣고(번역은 이미 있으니 다시 부르지 않음) 상대 언어로 읽어 준다 */
function useTip(turn, tip, s) {
  unlockSpeech();
  stopSpeaking();
  tips.delete(turn.id);
  const mine = addHistory({ side: 'me', from: tip.me, to: tip.partner, text: s.me, translation: s.partner, suggested: true });
  session.push(mine);
  redraw();
  sayAloud(s.partner, tip.partner);
  fetchReading(mine);
}

/** 대화의 마지막 말이 상대 말이면 그 아래 추천 답 (마주 보기의 내 쪽 절반에도) */
function tipsBlock(turn, { compact = false } = {}) {
  const tip = state.settings.suggest && turn && session.at(-1) === turn ? tips.get(turn.id) : null;
  if (!tip || tip.me !== state.settings.me) return null;
  if (tip.status === 'loading') {
    return h('div', { class: `tips loading${compact ? ' compact' : ''}`, role: 'status' }, h('span', { class: 'dots' }), t('suggest.loading'));
  }
  return h('div', { class: `tips${compact ? ' compact' : ''}`, role: 'group', 'aria-label': t('suggest.title') },
    h('div', { class: 'tips-head' }, h('b', null, t('suggest.title')), compact ? null : h('span', { class: 'muted' }, t('suggest.hint'))),
    tip.items.map((s) => {
      const reading = state.settings.reading && !compact ? readingFor(s.partner, tip.partner, tip.me) : '';
      return h('button', { class: 'tip', type: 'button', 'aria-label': t('suggest.use', { text: s.partner }), onclick: () => useTip(turn, tip, s) },
        h('span', { class: 'tip-say', lang: tip.partner }, s.partner),
        reading ? h('span', { class: 'tip-reading' }, reading) : null,
        h('span', { class: 'tip-me', lang: tip.me }, s.me));
    }));
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
    const area = h('textarea', { class: 'edit-area', rows: 3, lang: turn.from }, drafts.get(turn.id) ?? turn.text);
    area.addEventListener('input', () => drafts.set(turn.id, area.value));
    setTimeout(() => area.focus(), 0);
    return h('div', { class: `bubble ${sideOf(turn)}` },
      h('div', { class: 'b-orig' }, LANGS[turn.from].flag, ' ', t('talk.editHeard')),
      area,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary sm', type: 'button', onclick: () => {
          const v = area.value.trim();
          turn.editing = false; drafts.delete(turn.id);
          if (v && v !== turn.text) { turn.text = v; turn.edited = true; translateTurn(turn); } else redraw();
        } }, t('talk.retranslate')),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { turn.editing = false; drafts.delete(turn.id); redraw(); } }, t('common.cancel')),
      ));
  }
  const reading = s.reading && turn.translation ? readingFor(turn.translation, turn.to, s.me, soundOf(turn)) : '';
  return h('div', { class: `bubble ${sideOf(turn)}` },
    h('div', { class: 'b-orig', lang: turn.from }, h('span', { class: 'flag' }, LANGS[turn.from].flag), ' ', turn.text,
      turn.edited ? h('em', null, ' · ', t('talk.edited')) : turn.suggested ? h('em', null, ' · ', t('suggest.used')) : null),
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
  // 쓰던 글은 화면을 다시 그려도 남게 (번역·추천이 도착하면 다시 그린다)
  input.value = typing.draft || '';
  input.addEventListener('input', () => { typing.draft = input.value; });
  const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; typing.draft = ''; addTurn(typing.side, v); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } });
  setTimeout(() => { input.focus(); input.setSelectionRange?.(input.value.length, input.value.length); }, 0);
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
  tips.clear();
  localStorage.setItem(START_KEY, String(Date.now()));
  redraw();
}

function toolbar() {
  const f2f = state.settings.faceToFace;
  const done = session.filter((x) => x.translation && !x.pending);
  return h('div', { class: 'toolbar' },
    h('button', { class: `chip${f2f ? ' on' : ''}`, type: 'button', 'aria-pressed': String(f2f), onclick: () => { setSetting('faceToFace', !f2f); redraw(); } }, icon('faces', 16), ' ', t('talk.faceToFace')),
    h('div', { class: 'spacer' }),
    // 지금 대화를 공유 (원문 + 번역, 합의 내용 요약은 골라서) — 처음엔 모두 고른 채로
    done.length ? h('button', { class: 'chip', type: 'button', onclick: () => openShare({ items: done, select: 'all' }) }, icon('share', 16), ' ', t('share.button')) : null,
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
    const reading = state.settings.reading && text && !pending ? readingFor(text, lineLang, L, own ? '' : soundOf(turn)) : '';
    return h('div', { class: `f-line${own ? ' own' : ''}`, lang: lineLang },
      pending ? h('span', { class: 'muted' }, tl(L, 'mic.thinking')) : text || (turn.error ? '⚠️' : ''),
      reading ? h('div', { class: 'b-reading' }, reading) : null);
  });
  const liveLine = live?.side === side ? h('div', { class: 'f-line own live-line', lang: L, 'data-live-text': '' }, live.text || '…') : null;
  const tipLine = side === 'me' && !live ? tipsBlock(session.at(-1), { compact: true }) : null;
  return h('div', { class: 'f-panel' },
    h('div', { class: 'f-lines' }, lines.length || liveLine ? [...lines, liveLine, tipLine] : h('div', { class: 'f-hint', lang: L }, tl(L, 'mic.tapToSpeak'))),
    micButton(side, { big: true }));
}

function renderFaceToFace(root) {
  root.append(h('div', { class: 'f2f' },
    h('section', { class: 'f2f-half partner flip', 'aria-label': t('talk.partnerHalf') }, f2fPanel('partner')),
    h('div', { class: 'f2f-mid' },
      h('button', { class: 'chip on', type: 'button', onclick: () => { setSetting('faceToFace', false); redraw(); } }, icon('faces', 16), ' ', t('talk.faceToFaceOff')),
      h('button', { class: 'chip', type: 'button', onclick: newConversation }, icon('plus', 16), ' ', t('talk.new'))),
    h('section', { class: 'f2f-half me', 'aria-label': t('talk.myHalf') }, f2fPanel('me'))));
  requestAnimationFrame(() => { for (const el of root.querySelectorAll('.f-lines')) el.scrollTop = el.scrollHeight; });
}

export default {
  render(root) {
    draw = () => {
      root.replaceChildren();
      levelEl = null;
      if (state.settings.faceToFace) { renderFaceToFace(root); return; }
      const list = h('div', { class: 'chat', 'aria-live': 'polite' }, session.length ? [...session.map(bubble), tipsBlock(session.at(-1))] : emptyHint());
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