// 설정: 언어 · 말투 · 읽어 주기 · 목소리 · 음성 인식 방식 · 기록 · 화면 · 앱 설치 · 업데이트 · 앱 정보
import { h, icon, toast } from '../ui.js';
import { LANGS, CODES } from '../lang.js';
import { t, tl, langName } from '../i18n.js';
import { state, setSetting, clearHistory } from '../store.js';
import { voicesFor, speak, unlockSpeech, hasBrowserSTT, canRecord, canSpeak } from '../speech.js';
import { applyTheme, setMyLang } from '../app.js';
import { VERSION, RELEASED } from '../version.js';
import { installCard } from './install.js';

/** 설정의 "업데이트 확인" — 새 버전이 있으면 바로 바꾼다 (index.html의 업데이트 도우미) */
function updateCard() {
  const status = h('p', { class: 'muted small' }, t('set.version', { v: VERSION, date: RELEASED }));
  const btn = h('button', { class: 'btn soft block', type: 'button', onclick: async () => {
    const u = window.__tercumanUpdate;
    if (!u) { location.reload(); return; }
    btn.disabled = true; btn.textContent = t('set.checking');
    const r = await u.check();
    if (r.update) { btn.textContent = t('set.updating', { v: r.latest }); u.apply(); return; }
    btn.disabled = false; btn.textContent = t('set.checkUpdate');
    if (r.offline) toast(t('set.offline'), 'bad');
    else toast(t('set.latest', { v: r.latest || VERSION }), 'ok');
  } }, t('set.checkUpdate'));
  return h('section', { class: 'card' }, h('div', { class: 'set-label' }, t('set.update')), status,
    h('p', { class: 'muted small' }, t('set.updateHint')), btn);
}

/** 언어 / Language — 오른쪽 위 🌐 버튼과 같다. 각 언어를 그 언어 이름으로 */
function languageCard() {
  return h('section', { class: 'card' },
    h('div', { class: 'set-row col' },
      h('div', { class: 'set-label' }, t('app.language')),
      h('div', { class: 'seg langs', role: 'radiogroup', 'aria-label': t('app.language') }, CODES.map((c) => h('button', {
        type: 'button', lang: c, role: 'radio', class: state.settings.me === c ? 'on' : '', 'aria-checked': String(state.settings.me === c),
        onclick: () => setMyLang(c),
      }, LANGS[c].native))),
      h('div', { class: 'muted small' }, t('set.languageHint'))));
}

function toggle(key, label, desc) {
  const input = h('input', { type: 'checkbox', checked: Boolean(state.settings[key]), onchange: (e) => setSetting(key, e.target.checked) });
  return h('label', { class: 'set-row' }, h('div', null, h('div', { class: 'set-label' }, label), desc ? h('div', { class: 'muted small' }, desc) : null), h('span', { class: 'switch' }, input, h('span', { class: 'slider' })));
}

function seg(key, label, options, onChange, desc) {
  const wrap = h('div', { class: 'seg' });
  const draw = () => wrap.replaceChildren(...options.map(([v, text]) => h('button', {
    type: 'button', class: state.settings[key] === v ? 'on' : '', 'aria-pressed': String(state.settings[key] === v),
    onclick: () => { setSetting(key, v); draw(); onChange?.(v); },
  }, text)));
  draw();
  return h('div', { class: 'set-row col' }, h('div', { class: 'set-label' }, label), wrap, desc ? h('div', { class: 'muted small' }, desc) : null);
}

export default {
  render(root) {
    const s = state.settings;
    const rateText = (v) => t('set.rateValue', { x: Number(v).toFixed(2) });
    const rate = h('input', { type: 'range', min: '0.6', max: '1.2', step: '0.05', value: String(s.rate), 'aria-label': t('set.rate') });
    const rateVal = h('span', { class: 'muted small' }, rateText(s.rate));
    rate.addEventListener('input', () => { setSetting('rate', Number(rate.value)); rateVal.textContent = rateText(rate.value); });

    const voiceRows = h('div');
    const drawVoices = () => voiceRows.replaceChildren(...CODES.map((c) => {
      const list = voicesFor(c);
      const sel = h('select', { class: 'select', 'aria-label': t('set.voiceOf', { lang: langName(c) }), disabled: !list.length },
        list.length ? list.map((v) => h('option', { value: v.voiceURI }, `${v.name}${v.localService ? '' : ` ${t('set.online')}`}`)) : h('option', null, t('set.noVoice')));
      if (s.voices[c]) sel.value = s.voices[c];
      sel.addEventListener('change', () => { s.voices[c] = sel.value; setSetting('voices', { ...s.voices }); });
      return h('div', { class: 'voice-row' },
        h('span', { class: 'voice-lang' }, LANGS[c].flag, ' ', langName(c)), sel,
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('set.voiceTry', { lang: langName(c) }), disabled: !list.length, onclick: () => { unlockSpeech(); speak(tl(c, 'set.voiceSample'), c); } }, icon('speaker', 18)));
    }));
    drawVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', drawVoices, { once: true });

    const engine = [
      t(hasBrowserSTT() ? 'set.sttYes' : 'set.sttNo'),
      t(canRecord() ? 'set.recYes' : 'set.recNo'),
      t(canSpeak() ? 'set.ttsYes' : 'set.ttsNo'),
    ].join(' · ');

    root.append(
      h('h1', { class: 'page-title' }, t('set.title')),
      languageCard(),
      h('section', { class: 'card' },
        seg('formal', t('set.tone'), [[true, t('set.formal')], [false, t('set.casual')]], null, t('set.toneHint')),
        toggle('autoSpeak', t('set.autoSpeak'), t('set.autoSpeakHint')),
        h('div', { class: 'set-row col' }, h('div', { class: 'row between' }, h('div', { class: 'set-label' }, t('set.rate')), rateVal), rate),
        toggle('reading', t('set.reading'), t('set.readingHint')),
        toggle('suggest', t('set.suggest'), t('set.suggestHint'))),
      h('section', { class: 'card' },
        h('div', { class: 'set-label' }, t('set.voices')),
        h('p', { class: 'muted small' }, t('set.voicesHint')),
        voiceRows),
      h('section', { class: 'card' },
        seg('stt', t('set.stt'), [['auto', t('set.sttAuto')], ['browser', t('set.sttBrowser')], ['server', t('set.sttServer')]]),
        h('p', { class: 'muted small' }, t('set.sttHint')),
        h('p', { class: 'muted small' }, t('set.device', { list: engine }))),
      h('section', { class: 'card' },
        toggle('saveHistory', t('set.saveHistory'), t('set.saveHistoryHint')),
        h('button', { class: 'btn ghost block', type: 'button', onclick: () => { if (confirm(t('hist.clearConfirm'))) { clearHistory(); toast(t('hist.cleared'), 'ok'); } } }, icon('trash', 18), ' ', t('set.clearHistory'))),
      h('section', { class: 'card' },
        seg('theme', t('set.theme'), [['auto', t('set.themeAuto')], ['light', t('set.themeLight')], ['dark', t('set.themeDark')]], applyTheme)),
      installCard(),
      updateCard(),
      h('section', { class: 'card about' },
        h('div', { class: 'set-label' }, `Tercüman v${VERSION}`),
        h('p', { class: 'muted small' }, t('set.about', { date: RELEASED })),
        h('p', { class: 'muted small' }, t('set.privacy'))),
    );
  },
};
