// 앱 설치: 안드로이드 앱(APK · TWA) 주소, 기기 · 브라우저 알아보기, 다른 브라우저로 여는 주소 (화면은 views/install.js)
// 안드로이드 프로젝트: android/README.md (C:\Users\jeong\tercuman-android, Bubblewrap)

export const APP_ORIGIN = 'https://interpreter-for-koreans.pages.dev';
export const INSTALL_URL = `${APP_ORIGIN}/#/install`;
// 같은 출처의 파일 주소: 서비스 워커는 /download/ 를 건드리지 않는다 (scripts/gen-sw.mjs)
export const APK_PATH = '/download/tercuman.apk';
export const APK_NAME = 'tercuman.apk';

const ua0 = () => globalThis.navigator?.userAgent || '';

/** 홈 화면 앱 · 안드로이드 앱(TWA)으로 열려 있다 */
export function isStandalone() {
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone === true
    || globalThis.document?.referrer?.startsWith('android-app://'));
}

/** 'ios' · 'android' · 'desktop' (아이패드는 Mac처럼 보여도 터치가 되면 ios) */
export function platform(ua = ua0(), touch = globalThis.navigator?.maxTouchPoints || 0) {
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/** 앱 안 브라우저(카카오톡 · 네이버 · 인스타그램 등) — 여기서는 설치가 잘 안 된다 */
export function inAppBrowser(ua = ua0()) {
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/NAVER\(inapp|Whale\/.*inapp/i.test(ua)) return 'naver';
  if (/Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return 'other';
  return null;
}

/** 아이폰의 사파리 말고 다른 브라우저(크롬 · 웨일 · 네이버 앱 · 앱 안 브라우저). 사파리가 아닌 화면(앱 안 웹뷰)은 UA에 "Safari/"가 없다 */
export function iosOtherBrowser(ua = ua0()) {
  return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|Whale|NAVER|DaumApps|KAKAOTALK|Line\/|Instagram|FBAN|FBAV|everytimeApp/i.test(ua) || !/Safari\//.test(ua);
}

/** 아이폰에서 사파리로 여는 주소: 카카오톡은 "바깥 브라우저로 열기", 그 밖에는 x-safari-https:// (iOS 17 이상 — 그래서 메뉴 안내도 함께 둔다) */
export function safariLink(url, kind = inAppBrowser()) {
  return kind === 'kakao' ? `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}` : url.replace(/^https:\/\//, 'x-safari-https://');
}

/** 안드로이드에서 크롬으로 여는 주소 (카카오톡은 "바깥 브라우저로 열기") */
export function chromeLink(url, kind = inAppBrowser()) {
  return kind === 'kakao'
    ? `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`
    : `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
}
