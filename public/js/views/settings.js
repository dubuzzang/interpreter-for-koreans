// 설정: 말투 · 읽어 주기 · 목소리 · 음성 인식 방식 · 기록 · 화면 · 앱 정보
import { h, icon, toast } from '../ui.js';
import { LANGS, CODES } from '../lang.js';
import { state, setSetting, clearHistory } from '../store.js';
import { voicesFor, speak, unlockSpeech, hasBrowserSTT, canRecord, canSpeak } from '../speech.js';
import { applyTheme } from '../app.js';
import { VERSION, RELEASED } from '../version.js';

const SAMPLE = { ko: '안녕하세요. 만나서 반가워요.', tr: 'Merhaba, tanıştığımıza memnun oldum.', en: 'Hello, nice to meet you.' };

function toggle(key, label, desc) {
  const input = h('input', { type: 'checkbox', checked: Boolean(state.settings[key]), onchange: (e) => setSetting(key, e.target.checked) });
  return h('label', { class: 'set-row' }, h('div', null, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'muted small' }, desc) : null), h('span', { class: 'switch' }, input, h('span', { class: 'slider' })));
}

function seg(key, label, options, onChange) {
  const wrap = h('div', { class: 'seg' });
  const draw = () => wrap.replaceChildren(...options.map(([v, t]) => h('button', {
    type: 'button', class: state.settings[key] === v ? 'on' : '', 'aria-pressed': String(state.settings[key] === v),
    onclick: () => { setSetting(key, v); draw(); onChange?.(v); },
  }, t)));
  draw();
  return h('div', { class: 'set-row col' }, h('div', { class: 'set-label' }, label), wrap);
}

export default {
  render(root) {
    const s = state.settings;
    const rate = h('input', { type: 'range', min: '0.6', max: '1.2', step: '0.05', value: String(s.rate), 'aria-label': '읽는 속도' });
    const rateVal = h('span', { class: 'muted small' }, `${Number(s.rate).toFixed(2)}배`);
    rate.addEventListener('input', () => { setSetting('rate', Number(rate.value)); rateVal.textContent = `${Number(rate.value).toFixed(2)}배`; });

    const voiceRows = h('div');
    const drawVoices = () => voiceRows.replaceChildren(...CODES.map((c) => {
      const list = voicesFor(c);
      const sel = h('select', { class: 'select', 'aria-label': `${LANGS[c].name} 목소리`, disabled: !list.length },
        list.length ? list.map((v) => h('option', { value: v.voiceURI }, `${v.name}${v.localService ? '' : ' (온라인)'}`)) : h('option', null, '이 기기에 목소리 없음'));
      if (s.voices[c]) sel.value = s.voices[c];
      sel.addEventListener('change', () => { s.voices[c] = sel.value; setSetting('voices', { ...s.voices }); });
      return h('div', { class: 'voice-row' },
        h('span', { class: 'voice-lang' }, LANGS[c].flag, ' ', LANGS[c].name), sel,
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': `${LANGS[c].name} 들어 보기`, disabled: !list.length, onclick: () => { unlockSpeech(); speak(SAMPLE[c], c); } }, icon('speaker', 18)));
    }));
    drawVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', drawVoices, { once: true });

    const engine = [
      hasBrowserSTT() ? '브라우저 음성 인식 사용 가능' : '브라우저 음성 인식 없음',
      canRecord() ? '녹음(서버 인식) 가능' : '녹음 불가',
      canSpeak() ? '읽어 주기 가능' : '읽어 주기 불가',
    ].join(' · ');

    root.append(
      h('h1', { class: 'page-title' }, '설정'),
      h('section', { class: 'card' },
        seg('formal', '말투', [[true, '존댓말 (siz)'], [false, '반말 (sen)']]),
        toggle('autoSpeak', '번역을 바로 읽어 주기', '대화에서 번역이 나오면 상대 언어로 소리 내어 읽어요'),
        h('div', { class: 'set-row col' }, h('div', { class: 'row between' }, h('div', { class: 'set-label' }, '읽는 속도'), rateVal), rate),
        toggle('reading', '읽는 법 같이 보기', '튀르키예어 번역 밑에 한글 발음(메르하바), 상대에게 보이는 한국어엔 로마자')),
      h('section', { class: 'card' },
        h('div', { class: 'set-label' }, '목소리'),
        h('p', { class: 'muted small' }, '기기에 깔린 목소리로 읽어요. 튀르키예어 목소리가 없으면 휴대폰 설정 → 언어/음성(텍스트 음성 변환)에서 추가할 수 있어요.'),
        voiceRows),
      h('section', { class: 'card' },
        seg('stt', '음성 인식 방식', [['auto', '자동'], ['browser', '브라우저'], ['server', '서버(Whisper)']]),
        h('p', { class: 'muted small' }, '자동: 브라우저 음성 인식(말하는 동안 글자가 보임)을 쓰고, 안 되는 브라우저에서는 녹음해서 서버로 보내요.'),
        h('p', { class: 'muted small' }, `이 기기: ${engine}`)),
      h('section', { class: 'card' },
        toggle('saveHistory', '기록 남기기', '통역한 내용을 이 기기에만 저장해요'),
        h('button', { class: 'btn ghost block', type: 'button', onclick: () => { if (confirm('기록을 모두 지울까요?')) { clearHistory(); toast('기록을 지웠어요', 'ok'); } } }, icon('trash', 18), ' 기록 모두 지우기')),
      h('section', { class: 'card' },
        seg('theme', '화면', [['auto', '기기 설정대로'], ['light', '밝게'], ['dark', '어둡게']], applyTheme)),
      h('section', { class: 'card about' },
        h('div', { class: 'set-label' }, `Tercüman v${VERSION}`),
        h('p', { class: 'muted small' }, `${RELEASED} · 한국어 · 튀르키예어 · 영어 통역`),
        h('p', { class: 'muted small' }, '번역: Cloudflare Workers AI (Gemma 4) · 음성 인식: 브라우저 / Whisper large-v3 turbo · 읽어 주기: 기기 목소리. 말한 내용은 번역을 위해 서버로 보내지고 저장되지 않아요. 기록은 이 기기에만 남아요.'),
        h('p', { class: 'muted small' }, '홈 화면에 추가하면 앱처럼 쓸 수 있어요 (아이폰: Safari 공유 → 홈 화면에 추가 · 안드로이드: Chrome 메뉴 → 앱 설치).')),
    );
  },
};
