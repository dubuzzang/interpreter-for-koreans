// 통역할 언어 고르기: 상대 언어(내 언어가 아닌 언어 중) · 내 언어(= 화면 언어) · 서로 바꾸기 — 11개 언어라 격자로(.seg.langs)
import { h, icon } from '../ui.js';
import { LANGS, CODES, otherLangs } from '../lang.js';
import { state, setSetting } from '../store.js';
import { t, langName } from '../i18n.js';

/** onMyLang(code): 내 언어를 바꿀 때 (화면 전체 문구가 바뀐다 — app.js) · onDone: 닫을 때 */
export function openLangPicker({ onMyLang, onDone } = {}) {
  const close = () => { sheet.remove(); onDone?.(); };
  // native: 그 언어 이름을 그 언어로 (한국어 · Türkçe · English · 日本語)
  const choice = (code, on, pick, native = false) => h('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': String(on), lang: native ? code : null, onclick: pick },
    native ? LANGS[code].native : [LANGS[code].flag, ' ', langName(code)]);
  const draw = () => {
    const { me, partner } = state.settings;
    sheet.replaceChildren(h('div', { class: 'sheet', role: 'dialog', 'aria-label': t('pair.dialog') },
      h('div', { class: 'sheet-head' }, h('b', null, t('pair.title')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('close'))),
      h('div', { class: 'pick-row' },
        h('div', { class: 'pick-label' }, t('pair.partner')),
        h('div', { class: 'seg langs' }, otherLangs(me).map((c) => choice(c, c === partner, () => { setSetting('partner', c); draw(); })))),
      h('div', { class: 'pick-row' },
        h('div', { class: 'pick-label' }, t('pair.me')),
        h('div', { class: 'seg langs' }, CODES.map((c) => choice(c, c === me, () => { onMyLang?.(c); draw(); }, true))),
        h('p', { class: 'muted small' }, t('pair.meHint'))),
      h('button', { class: 'btn ghost block mt', type: 'button', onclick: () => { onMyLang?.(partner); draw(); } }, icon('swap', 18), ' ', t('pair.swap')),
      h('button', { class: 'btn primary block mt', type: 'button', onclick: close }, t('common.ok'))));
  };
  const sheet = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === sheet) close(); } });
  draw();
  document.body.append(sheet);
}
