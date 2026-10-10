// 언어 메뉴: 오른쪽 위 🌐 버튼 → 한국어 · Türkçe · English · 日本語 (각 언어를 그 언어 이름으로, 지금 언어에 ✓)
import { h } from '../ui.js';
import { CODES, LANGS } from '../lang.js';
import { t } from '../i18n.js';

/** anchor 아래에 메뉴를 연다. 고르면 onPick(code) */
export function openLangMenu(anchor, current, onPick) {
  if (document.querySelector('.menu-wrap')) return;
  const close = (focusBack = true) => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    anchor.setAttribute('aria-expanded', 'false');
    if (focusBack) anchor.focus();
  };
  const items = CODES.map((c) => h('button', {
    type: 'button', role: 'menuitemradio', lang: c, 'aria-checked': String(c === current),
    onclick: () => { close(false); if (c !== current) onPick(c); anchor.focus(); },
  }, h('span', null, LANGS[c].native), c === current ? h('span', { class: 'lm-check', 'aria-hidden': 'true' }, '✓') : null));
  const r = anchor.getBoundingClientRect();
  const menu = h('div', {
    class: 'lang-menu', role: 'menu', 'aria-label': t('app.language'),
    style: { top: `${Math.round(r.bottom + 6)}px`, right: `${Math.max(8, Math.round(innerWidth - r.right))}px` },
  }, items);
  const wrap = h('div', { class: 'menu-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, menu);
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  };
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  anchor.setAttribute('aria-expanded', 'true');
  (items[CODES.indexOf(current)] || items[0]).focus({ preventScroll: true });
}
