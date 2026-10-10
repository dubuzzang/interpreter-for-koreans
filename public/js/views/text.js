// 글 번역: 언어 고르기(자동 감지) · 받아쓰기 · 결과 읽어 주기 · 복사 · 크게 보기
// 기본 방향: (자동 감지, 모르면 내 언어) → 상대 언어
import { h, icon, toast, copyText, showBig } from '../ui.js';
import { LANGS, CODES, detectLang } from '../lang.js';
import { t, tl, langName } from '../i18n.js';
import { state, addHistory } from '../store.js';
import { translate, kana as kanaReading } from '../api.js';
import { listen, speak, unlockSpeech, sttMode } from '../speech.js';
import { readingFor, needsKana } from '../reading.js';

const memo = { from: 'auto', to: null, text: '', result: null, me: null };

export default {
  render(root) {
    const s = state.settings;
    // 내 언어를 바꿨으면 기본 방향부터 다시
    if (memo.me !== s.me) { memo.me = s.me; memo.from = 'auto'; memo.to = s.partner; }
    if (!memo.to || !CODES.includes(memo.to)) memo.to = s.partner;
    let listening = null;

    const option = (c) => h('option', { value: c }, `${LANGS[c].flag} ${langName(c)}`);
    const fromSel = h('select', { class: 'select', 'aria-label': t('text.from') },
      h('option', { value: 'auto' }, t('text.auto')),
      CODES.map(option));
    const toSel = h('select', { class: 'select', 'aria-label': t('text.to') }, CODES.map(option));
    fromSel.value = memo.from; toSel.value = memo.to;
    fromSel.addEventListener('change', () => { memo.from = fromSel.value; });
    toSel.addEventListener('change', () => { memo.to = toSel.value; });

    const area = h('textarea', { class: 'text-area', rows: 5, maxlength: 1000, placeholder: t('text.placeholder'), 'aria-label': t('text.area') }, memo.text);
    const count = h('span', { class: 'muted small' }, `${memo.text.length}/1000`);
    area.addEventListener('input', () => { memo.text = area.value; count.textContent = `${area.value.length}/1000`; });
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });

    const result = h('div', { class: 'result', 'aria-live': 'polite' });
    const goBtn = h('button', { class: 'btn primary block', type: 'button', onclick: () => go() }, t('text.go'));
    const micBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('text.dictate'), onclick: dictate, disabled: !sttMode() }, icon('mic', 20));

    function sourceLang(text) {
      return memo.from === 'auto' ? detectLang(text, s.me === memo.to ? s.partner : s.me) : memo.from;
    }

    function dictate() {
      unlockSpeech();
      if (listening) { listening.stop(); return; }
      const lang = memo.from === 'auto' ? (memo.to === s.me ? s.partner : s.me) : memo.from;
      micBtn.classList.add('on');
      area.placeholder = tl(lang, 'mic.listening');
      const base = area.value ? `${area.value.trimEnd()} ` : '';
      listening = listen(lang, {
        interim: (said) => { area.value = base + said; },
        final: (said) => { area.value = base + said; memo.text = area.value; },
        nothing: () => toast(tl(lang, 'mic.noSpeech')),
        error: (m) => toast(m, 'bad'),
        end: () => {
          listening = null; micBtn.classList.remove('on'); area.placeholder = t('text.placeholder');
          memo.text = area.value; count.textContent = `${area.value.length}/1000`;
          if (memo.from === 'auto' && area.value.trim()) { memo.from = lang; fromSel.value = lang; }
          if (area.value.trim()) go();
        },
      });
    }

    function showResult(r) {
      if (!r) { result.replaceChildren(); return; }
      const reading = s.reading ? readingFor(r.translation, r.to, s.me, r.kana) : '';
      result.replaceChildren(h('div', { class: 'card result-card' },
        h('div', { class: 'muted small' }, `${LANGS[r.from].flag} ${langName(r.from)} → ${LANGS[r.to].flag} ${langName(r.to)}`),
        h('div', { class: 'result-text', lang: r.to }, r.translation),
        reading ? h('div', { class: 'b-reading' }, reading) : null,
        h('div', { class: 'b-actions' },
          h('button', { class: 'btn soft sm', type: 'button', onclick: () => { unlockSpeech(); speak(r.translation, r.to); } }, icon('speaker', 18), ' ', t('common.listen')),
          h('button', { class: 'btn soft sm', type: 'button', onclick: () => showBig(r.translation, { lang: r.to, onSpeak: () => speak(r.translation, r.to) }) }, icon('expand', 18), ' ', t('text.big')),
          h('button', { class: 'btn soft sm', type: 'button', onclick: () => copyText(r.translation) }, icon('copy', 18), ' ', t('common.copy')))));
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
      goBtn.disabled = true; goBtn.textContent = t('text.going');
      try {
        const translation = await translate(text, from, to, { formal: s.formal });
        const r = { from, to, text, translation, kana: '' };
        memo.result = r;
        const entry = addHistory({ side: 'text', from, to, text, translation });
        showResult(r);
        if (s.reading && needsKana(to, s.me)) {
          kanaReading(translation).then((k) => { if (k && memo.result === r) { r.kana = k; entry.kana = k; showResult(r); } });
        }
      } catch (e) {
        result.replaceChildren(h('div', { class: 'card b-error' }, e.message));
      } finally { goBtn.disabled = false; goBtn.textContent = t('text.go'); }
    }

    const swap = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('text.swap'), onclick: () => {
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
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('text.clear'), onclick: () => { area.value = ''; memo.text = ''; memo.result = null; showResult(null); count.textContent = '0/1000'; area.focus(); } }, icon('trash', 20))),
          count),
        goBtn),
      result);
    showResult(memo.result);
    return () => listening?.stop();
  },
};
