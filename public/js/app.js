// Tercüman — 한국어 · 튀르키예어 · 영어 통역 (화면 뼈대 · 화면 전환)
import { h, icon } from './ui.js';
import { LANGS } from './lang.js';
import { state, setSetting } from './store.js';
import { unlockSpeech } from './speech.js';
import talk from './views/talk.js';
import text from './views/text.js';
import phrases from './views/phrases.js';
import history from './views/history.js';
import settings from './views/settings.js';
import { openLangPicker } from './views/langpicker.js';
import { VERSION } from './version.js';

const VIEWS = { talk, text, phrases, history, settings };
const TABS = [
  ['talk', '대화', 'chat'],
  ['text', '번역', 'text'],
  ['phrases', '표현', 'book'],
  ['history', '기록', 'clock'],
];

const main = document.getElementById('main');
const pairBtn = document.getElementById('pair');
const tabbar = document.getElementById('tabbar');
let cleanup = null;

export function applyTheme() {
  const t = state.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1220' : '#f4f5fb');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

export function renderPair() {
  const { me, partner } = state.settings;
  pairBtn.replaceChildren(
    h('span', { class: 'pair-lang' }, LANGS[me].flag, ' ', LANGS[me].name),
    icon('swap', 16),
    h('span', { class: 'pair-lang' }, LANGS[partner].flag, ' ', LANGS[partner].native),
  );
  pairBtn.setAttribute('aria-label', `언어 바꾸기: 나 ${LANGS[me].name}, 상대 ${LANGS[partner].name}`);
}

function route() {
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
  return VIEWS[name] ? name : 'talk';
}

export function render() {
  const name = route();
  cleanup?.();
  cleanup = null;
  document.body.dataset.view = name;
  main.replaceChildren();
  for (const b of tabbar.querySelectorAll('a')) b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
  cleanup = VIEWS[name].render(main) || null;
  main.focus({ preventScroll: true });
}

function init() {
  applyTheme();
  renderPair();
  tabbar.replaceChildren(...TABS.map(([id, label, ic]) => h('a', { href: `#/${id}`, dataset: { tab: id } }, icon(ic, 22), h('span', null, label))));
  pairBtn.addEventListener('click', () => openLangPicker(() => { renderPair(); render(); }));
  document.getElementById('gear').addEventListener('click', () => { location.hash = '#/settings'; });
  document.documentElement.dataset.version = VERSION;
  addEventListener('hashchange', render);
  // 아이폰: 첫 터치 때 읽어 주기 소리를 풀어 둔다
  addEventListener('pointerdown', unlockSpeech, { once: true, capture: true });
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.__tercuman = { state, setSetting };
init();
