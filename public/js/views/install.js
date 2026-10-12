// 앱 설치 (#/install · 설정의 "앱 설치" 카드): 안드로이드 앱(APK) · 아이폰 홈 화면에 추가 · PC
import { h, icon, toast, rich } from '../ui.js';
import { t } from '../i18n.js';
import { APK_PATH, APK_NAME, INSTALL_URL, isStandalone, platform, inAppBrowser, iosOtherBrowser, safariLink, chromeLink } from '../install.js';

const steps = (...keys) => h('ol', { class: 'steps' }, keys.map((k) => h('li', null, rich(t(k)))));
const head = (emoji, key) => h('div', { class: 'set-label install-head' }, `${emoji} `, t(key));

/** APK 내려받기 버튼 — download 속성으로 바로 받게 (서비스 워커도 /download/ 는 그냥 보낸다) */
export const apkButton = () => h('a', { class: 'btn primary block', href: APK_PATH, download: APK_NAME }, icon('download', 20), t('install.apk'));

async function copyInstallUrl() {
  try {
    await navigator.clipboard.writeText(INSTALL_URL);
    toast(t('install.copied'), 'ok');
  } catch { toast(t('install.copyFailed', { url: INSTALL_URL.replace('https://', '') }), 'bad'); }
}

/** 안드로이드의 카카오톡 · 네이버 등 앱 안 브라우저: 크롬으로 연다 (아이폰은 iosCard가 사파리로 안내) */
const inAppNote = (kind) => h('section', { class: 'card install-warn' },
  h('div', { class: 'set-label' }, t('install.inApp')),
  h('p', { class: 'small' }, t('install.inAppAndroid')),
  h('a', { class: 'btn primary block', href: chromeLink(INSTALL_URL, kind) }, t('install.openChrome')));

function androidCard() {
  return h('section', { class: 'card' },
    head('🤖', 'install.android'),
    apkButton(),
    steps('install.a1', 'install.a2', 'install.a3', 'install.a4', 'install.a5'),
    h('p', { class: 'muted small' }, t('install.apkNote')),
    h('p', { class: 'muted small' }, rich(t('install.chromeAlt'))));
}

function iosCard(os) {
  // 아이폰의 카카오톡 · 네이버 앱 · 크롬 등: 사파리에서 하는 것이 가장 확실하다 → 사파리로 열기 · 주소 복사
  const other = os === 'ios' && iosOtherBrowser();
  const kind = inAppBrowser();
  return h('section', { class: 'card' },
    head('🍎', 'install.ios'),
    other ? h('div', { class: 'install-warn' },
      h('div', { class: 'set-label' }, t('install.iosOther')),
      h('p', { class: 'small' }, t('install.iosOtherHint')),
      h('a', { class: 'btn primary block', href: safariLink(INSTALL_URL, kind) }, t('install.openSafari')),
      h('button', { class: 'btn ghost block mt', type: 'button', onclick: copyInstallUrl }, icon('copy', 18), t('install.copyUrl')),
      // x-safari-https:// 는 iOS 17부터라 메뉴 안내도 함께 둔다 (카카오톡은 바깥 브라우저 열기 주소가 따로 있음)
      kind === 'kakao' ? null : h('p', { class: 'muted small' }, rich(t('install.menuHint')))) : null,
    steps('install.i1', 'install.i2', 'install.i3', 'install.i4'),
    h('p', { class: 'muted small' }, t('install.iosNote')));
}

const pcCard = () => h('section', { class: 'card' }, head('💻', 'install.pc'), h('p', { class: 'small' }, rich(t('install.pcHint'))));

/** 설정 화면의 "앱 설치" 카드: 기기에 맞는 한 줄 안내 + (안드로이드) APK 내려받기 + 설치 방법 보기 */
export function installCard() {
  const os = platform();
  const standalone = isStandalone();
  const hint = os === 'android' ? 'install.hintAndroid' : os === 'ios' ? 'install.hintIos' : 'install.hintPc';
  return h('section', { class: 'card' },
    h('div', { class: 'set-label' }, t('install.title')),
    standalone
      ? [h('p', { class: 'small' }, t('install.running')), h('p', { class: 'muted small' }, t('install.runningHint'))]
      : [h('p', { class: 'muted small' }, rich(t(hint))), os === 'android' && !inAppBrowser() ? apkButton() : null],
    h('a', { class: `btn ${standalone || os === 'android' ? 'ghost' : 'soft'} block mt`, href: '#/install' }, t('install.guide')));
}

export default {
  render(root) {
    const os = platform();
    const inApp = inAppBrowser();
    const standalone = isStandalone();
    const cards = os === 'ios' ? [iosCard(os), androidCard(), pcCard()]
      : os === 'android' ? [androidCard(), iosCard(os), pcCard()]
        : [pcCard(), androidCard(), iosCard(os)];
    root.append(...[
      h('div', { class: 'row gap install-top' },
        h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': t('install.back') }, icon('back')),
        h('h1', { class: 'page-title' }, t('install.title'))),
      h('p', { class: 'page-note muted' }, t('install.intro')),
      standalone && h('section', { class: 'card' }, h('div', { class: 'set-label' }, t('install.running')), h('p', { class: 'muted small' }, t('install.runningHint'))),
      inApp && os === 'android' && !standalone && inAppNote(inApp),
      ...(standalone ? [] : cards),
    ].filter(Boolean));
  },
};
