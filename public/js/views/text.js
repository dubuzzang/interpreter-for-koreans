// 글 번역: 언어 고르기(자동 감지) · 받아쓰기 · 결과 읽어 주기 · 복사 · 크게 보기
import { h, icon, toast, copyText, showBig } from '../ui.js';
import { LANGS, CODES, detectLang, UI } from '../lang.js';
import { state, addHistory } from '../store.js';
import { translate } from '../api.js';
import { listen, speak, unlockSpeech, sttMode } from '../speech.js';
import { readingFor } from '../reading.js';

const memo = { from: 'auto', to: null, text: '', result: null };

export default {
  render(root) {
    const s = state.settings;
    if (!memo.to || !CODES.includes(memo.to)) memo.to = s.partner;
    let listening = null;

    const fromSel = h('select', { class: 'select', 'aria-label': '원문 언어' },
      h('option', { value: 'auto' }, '🔎 자동 감지'),
      CODES.map((c) => h('option', { value: c }, `${LANGS[c].flag} ${LANGS[c].name}`)));
    const toSel = h('select', { class: 'select', 'aria-label': '번역할 언어' }, CODES.map((c) => h('option', { value: c }, `${LANGS[c].flag} ${LANGS[c].name}`)));
    fromSel.value = memo.from; toSel.value = memo.to;
    fromSel.addEventListener('change', () => { memo.from = fromSel.value; });
    toSel.addEventListener('change', () => { memo.to = toSel.value; });

    const area = h('textarea', { class: 'text-area', rows: 5, maxlength: 1000, placeholder: '번역할 말을 쓰거나 🎤 를 눌러 말하세요', 'aria-label': '번역할 글' }, memo.text);
    const count = h('span', { class: 'muted small' }, `${memo.text.length}/1000`);
    area.addEventListener('input', () => { memo.text = area.value; count.textContent = `${area.value.length}/1000`; });
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });

    const result = h('div', { class: 'result', 'aria-live': 'polite' });
    const goBtn = h('button', { class: 'btn primary block', type: 'button', onclick: () => go() }, '번역하기');
    const micBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '말로 입력', onclick: dictate, disabled: !sttMode() }, icon('mic', 20));

    function sourceLang(text) {
      return memo.from === 'auto' ? detectLang(text, s.me === memo.to ? s.partner : s.me) : memo.from;
    }

    function dictate() {
      unlockSpeech();
      if (listening) { listening.stop(); return; }
      const lang = memo.from === 'auto' ? (memo.to === s.me ? s.partner : s.me) : memo.from;
      micBtn.classList.add('on');
      area.placeholder = UI[lang].listening;
      const base = area.value ? `${area.value.trimEnd()} ` : '';
      listening = listen(lang, {
        interim: (t) => { area.value = base + t; },
        final: (t) => { area.value = base + t; memo.text = area.value; },
        nothing: () => toast(UI[lang].noSpeech),
        error: (m) => toast(m, 'bad'),
        end: () => {
          listening = null; micBtn.classList.remove('on'); area.placeholder = '번역할 말을 쓰거나 🎤 를 눌러 말하세요';
          memo.text = area.value; count.textContent = `${area.value.length}/1000`;
          if (memo.from === 'auto' && area.value.trim()) { memo.from = lang; fromSel.value = lang; }
          if (area.value.trim()) go();
        },
      });
    }

    function showResult(r) {
      if (!r) { result.replaceChildren(); return; }
      const reading = s.reading ? readingFor(r.translation, r.to, s.me) : '';
      result.replaceChildren(h('div', { class: 'card result-card' },
        h('div', { class: 'muted small' }, `${LANGS[r.from].flag} ${LANGS[r.from].name} → ${LANGS[r.to].flag} ${LANGS[r.to].name}`),
        h('div', { class: 'result-text', lang: r.to }, r.translation),
        reading ? h('div', { class: 'b-reading' }, reading) : null,
        h('div', { class: 'b-actions' },
          h('button', { class: 'btn soft sm', type: 'button', onclick: () => { unlockSpeech(); speak(r.translation, r.to); } }, icon('speaker', 18), ' 듣기'),
          h('button', { class: 'btn soft sm', type: 'button', onclick: () => showBig(r.translation, { lang: r.to, onSpeak: () => speak(r.translation, r.to) }) }, icon('expand', 18), ' 크게'),
          h('button', { class: 'btn soft sm', type: 'button', onclick: () => copyText(r.translation) }, icon('copy', 18), ' 복사'))));
    }

    async function go() {
      const text = area.value.trim();
      if (!text) { area.focus(); return; }
      let from = sourceLang(text);
      let to = memo.to;
      if (from === to) {
        to = from === s.me ? s.partner : s.me; // 같은 언어면 반대쪽으로
        toSel.value = to; memo.to = to;
      }
      goBtn.disabled = true; goBtn.textContent = '번역 중…';
      try {
        const translation = await translate(text, from, to, { formal: s.formal });
        memo.result = { from, to, text, translation };
        addHistory({ side: 'text', from, to, text, translation });
        showResult(memo.result);
      } catch (e) {
        result.replaceChildren(h('div', { class: 'card b-error' }, e.message));
      } finally { goBtn.disabled = false; goBtn.textContent = '번역하기'; }
    }

    const swap = h('button', { class: 'icon-btn', type: 'button', 'aria-label': '언어 바꾸기', onclick: () => {
      const from = memo.from === 'auto' ? sourceLang(area.value || '') : memo.from;
      memo.from = memo.to; memo.to = from;
      fromSel.value = memo.from; toSel.value = memo.to;
      if (memo.result) { area.value = memo.result.translation; memo.text = area.value; count.textContent = `${area.value.length}/1000`; memo.result = null; showResult(null); }
    } }, icon('swap', 20));

    root.append(
      h('div', { class: 'card' },
        h('div', { class: 'lang-row' }, fromSel, swap, toSel),
        area,
        h('div', { class: 'row between' },
          h('div', { class: 'row gap' }, micBtn,
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': '지우기', onclick: () => { area.value = ''; memo.text = ''; memo.result = null; showResult(null); count.textContent = '0/1000'; area.focus(); } }, icon('trash', 20))),
          count),
        goBtn),
      result);
    showResult(memo.result);
    return () => listening?.stop();
  },
};
