// 언어 고르기: 내 언어 · 상대 언어 (세 언어 중 서로 다른 둘)
import { h, icon } from '../ui.js';
import { LANGS, CODES } from '../lang.js';
import { state, setSetting } from '../store.js';

export function openLangPicker(onDone) {
  const close = () => { sheet.remove(); onDone?.(); };
  const row = (key, label) => h('div', { class: 'pick-row' },
    h('div', { class: 'pick-label' }, label),
    h('div', { class: 'seg' }, CODES.map((c) => h('button', {
      type: 'button',
      class: state.settings[key] === c ? 'on' : '',
      'aria-pressed': String(state.settings[key] === c),
      onclick: () => {
        const other = key === 'me' ? 'partner' : 'me';
        if (state.settings[other] === c) setSetting(other, state.settings[key]); // 같은 언어를 고르면 서로 바꾼다
        setSetting(key, c);
        body.replaceChildren(...rows());
      },
    }, LANGS[c].flag, ' ', LANGS[c].name))),
  );
  const rows = () => [row('me', '내 언어'), row('partner', '상대 언어'),
    h('button', { class: 'btn ghost block mt', type: 'button', onclick: () => {
      const { me, partner } = state.settings;
      setSetting('me', partner); setSetting('partner', me);
      body.replaceChildren(...rows());
    } }, icon('swap', 18), ' 서로 바꾸기')];
  const body = h('div', null, ...rows());
  const sheet = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === sheet) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': '언어 고르기' },
      h('div', { class: 'sheet-head' }, h('b', null, '통역할 언어'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: close }, icon('close'))),
      body,
      h('button', { class: 'btn primary block mt', type: 'button', onclick: close }, '확인'),
    ));
  document.body.append(sheet);
}
