// Tercüman — 10개 언어 통역 (화면 뼈대 · 화면 전환 · 화면 언어)
import { h, icon } from './ui.js';
import { LANGS, dirOf } from './lang.js';
import { state, setSetting } from './store.js';
import { t, setUiLang, langName, pickLanguage } from './i18n.js';
import { unlockSpeech } from './speech.js';
import talk from './views/talk.js';
import text from './views/text.js';
import phrases from './views/phrases.js';
import history from './views/history.js';
import settings from './views/settings.js';
import install from './views/install.js';
import photo from './views/photo.js';
import { openLangPicker } from './views/langpicker.js';
import { openLangMenu } from './views/langmenu.js';
import { VERSION } from './version.js';

// install: 설정 → 앱 설치 (#/install) · photo: 번역 탭의 📷 사진 → 사진 번역 결과 (#/photo) — 아래 탭에는 없음
const VIEWS = { talk, text, phrases, history, settings, install, photo };
const TAB_OF = { photo: 'text' }; // 아래 탭에서 어느 것을 켜 둘지
const TABS = [
  ['talk', 'tab.talk', 'chat'],
  ['text', 'tab.text', 'text'],
  ['phrases', 'tab.phrases', 'book'],
  ['history', 'tab.history', 'clock'],
];

const main = document.getElementById('main');
const pairBtn = document.getElementById('pair');
const tabbar = document.getElementById('tabbar');
const gearBtn = document.getElementById('gear');
const langBtn = document.getElementById('lang');
let cleanup = null;

export function applyTheme() {
  const th = state.settings.theme;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1220' : '#f4f5fb');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

export function renderPair() {
  const { me, partner } = state.settings;
  pairBtn.replaceChildren(
    h('span', { class: 'pair-lang' }, LANGS[me].flag),
    icon('swap', 16),
    h('span', { class: 'pair-lang', lang: partner }, LANGS[partner].flag, ' ', LANGS[partner].native),
  );
  pairBtn.setAttribute('aria-label', t('app.pair', { me: langName(me), partner: langName(partner) }));
}

/** 화면 뼈대(제목 · 위 막대 · 아래 탭)를 고른 언어로 */
function applyLang() {
  const me = setUiLang(state.settings.me);
  document.documentElement.lang = me;
  document.documentElement.dir = dirOf(me); // 아랍어 화면은 오른쪽에서 왼쪽으로 (v1.6.0)
  document.title = t('app.title');
  document.querySelector('.brand')?.setAttribute('aria-label', t('app.home'));
  gearBtn.setAttribute('aria-label', t('app.settings'));
  tabbar.setAttribute('aria-label', t('app.menu'));
  tabbar.replaceChildren(...TABS.map(([id, key, ic]) => h('a', { href: `#/${id}`, dataset: { tab: id } }, icon(ic, 22), h('span', null, t(key)))));
  if (langBtn) {
    langBtn.replaceChildren(icon('globe', 18), h('span', null, LANGS[me].short));
    langBtn.setAttribute('aria-label', `${t('app.language')}: ${LANGS[me].native}`);
    langBtn.hidden = false;
  }
  renderPair();
}

/** 내 언어(= 화면 언어)를 바꾼다. 상대 언어가 같아지면 서로 바꾸고, 새로 고침 없이 화면 전체를 다시 그린다 */
export function setMyLang(code) {
  const next = pickLanguage(state.settings, code);
  if (next.me === state.settings.me) return;
  setSetting('me', next.me);
  setSetting('partner', next.partner);
  applyLang();
  render();
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
  for (const b of tabbar.querySelectorAll('a')) b.setAttribute('aria-current', b.dataset.tab === (TAB_OF[name] || name) ? 'page' : 'false');
  cleanup = VIEWS[name].render(main) || null;
  main.focus({ preventScroll: true });
}

function init() {
  applyTheme();
  applyLang();
  pairBtn.addEventListener('click', () => openLangPicker({ onMyLang: setMyLang, onDone: () => { renderPair(); render(); } }));
  gearBtn.addEventListener('click', () => { location.hash = '#/settings'; });
  langBtn?.addEventListener('click', () => openLangMenu(langBtn, state.settings.me, setMyLang));
  document.documentElement.dataset.version = VERSION;
  addEventListener('hashchange', render);
  // 아이폰: 첫 터치 때 읽어 주기 소리를 풀어 둔다
  addEventListener('pointerdown', unlockSpeech, { once: true, capture: true });
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}

window.__tercuman = { state, setSetting, setMyLang };
init();
