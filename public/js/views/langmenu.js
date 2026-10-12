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
  // lang(글 방향)은 이름에만 — 줄 배치(✓ 자리)는 화면 방향을 따라 모든 줄이 같게
  const items = CODES.map((c) => h('button', {
    type: 'button', role: 'menuitemradio', 'aria-checked': String(c === current),
    onclick: () => { close(false); if (c !== current) onPick(c); anchor.focus(); },
  }, h('span', { lang: c }, LANGS[c].native), c === current ? h('span', { class: 'lm-check', 'aria-hidden': 'true' }, '✓') : null));
  const r = anchor.getBoundingClientRect();
  // 버튼 끝에 맞춰 연다 (아랍어 화면은 위 막대가 뒤집혀 버튼이 왼쪽 끝에 있다). 언어가 많아 길면 메뉴 안에서 스크롤
  const side = document.documentElement.dir === 'rtl' ? { left: `${Math.max(8, Math.round(r.left))}px` } : { right: `${Math.max(8, Math.round(innerWidth - r.right))}px` };
  const menu = h('div', {
    class: 'lang-menu', role: 'menu', 'aria-label': t('app.language'),
    style: { top: `${Math.round(r.bottom + 6)}px`, maxHeight: `${Math.max(160, Math.round(innerHeight - r.bottom - 16))}px`, ...side },
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
