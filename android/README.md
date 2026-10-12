# 안드로이드 앱 (TWA)

Tercüman 안드로이드 앱은 [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity)로,
https://interpreter-for-koreans.pages.dev 를 Chrome 엔진으로 주소창 없이 전체 화면에 띄운다. 그래서

- 웹을 업데이트하면 앱도 바로 최신이 된다 (APK를 다시 배포할 필요 없음 — 아이콘·이름·주소·색을 바꿀 때만 새로 빌드)
- 마이크(받아쓰기)·읽어 주기·서비스 워커·기기 저장(기록 · 내 표현)이 웹과 똑같이 동작한다

주소창 없이 열리려면 사이트의 `/.well-known/assetlinks.json`(이 저장소의 `public/.well-known/assetlinks.json`)에 앱 서명 인증서의 SHA-256 지문이 있어야 한다.
`public/_headers`가 이 파일을 `application/json`으로 보낸다.

| 항목 | 값 |
|---|---|
| 패키지 | `io.github.dubuzzang.tercuman` |
| 버전 | versionName `1.4.1` · versionCode `1` |
| 시작 주소 | `/#/talk` |
| 내려받기 | https://interpreter-for-koreans.pages.dev/download/tercuman.apk (`public/download/tercuman.apk`) |
| 서명 지문 (SHA-256) | `5D:EF:DA:A1:FF:E3:F0:50:2A:F7:B7:33:65:87:62:39:0F:35:82:42:01:6E:0E:DB:05:BC:EC:2F:F3:3E:9D:AF` |

## 빌드

```powershell
# 준비: JDK 17+ · Android SDK (cmdline-tools) · Node 20+
# ~/.bubblewrap/config.json: { "jdkPath": "...", "androidSdkPath": "..." }

mkdir C:\Users\jeong\tercuman-android; copy android\twa-manifest.json C:\Users\jeong\tercuman-android\   # 한글이 없는 경로에서
cd C:\Users\jeong\tercuman-android
$pw = [IO.File]::ReadAllText('C:\Users\jeong\keys\tercuman\password.txt')
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $pw; $env:BUBBLEWRAP_KEY_PASSWORD = $pw
Remove-Item Env:\NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue   # gradlew.bat을 찾도록
npx @bubblewrap/cli@1.25.0 update --skipVersionUpgrade
npx @bubblewrap/cli@1.25.0 build --skipPwaValidation
apksigner verify --print-certs app-release-signed.apk   # SHA-256이 위 지문과 같은지
copy app-release-signed.apk <저장소>\public\download\tercuman.apk
```

- 서명 키: `C:\Users\jeong\keys\tercuman\tercuman.keystore` (별칭 `tercuman`, 비밀번호는 같은 폴더의 `password.txt`) — **저장소에 넣지 말 것.** 잃어버리면 같은 앱으로 업데이트할 수 없다(새 키로 만든 APK는 기존 앱 위에 설치되지 않음).
- 새 APK를 낼 때는 `twa-manifest.json`의 `appVersionCode`(정수)를 올린다.
- `npm test`의 `tests/install.test.mjs`가 `public/download/tercuman.apk`의 서명 인증서 지문이 `assetlinks.json`과 같은지 확인한다.
- 구글 플레이에 올리려면 `app-release-bundle.aab`를 플레이 콘솔에 올린다(개발자 등록 필요). 플레이 앱 서명을 쓰면 플레이가 다시 서명하므로, 플레이 콘솔에 표시되는 SHA-256 지문도 `assetlinks.json`에 더해야 한다.
