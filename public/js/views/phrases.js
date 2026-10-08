// 표현집: 바로 쓰는 문장 (인터넷 없이도 됨) — 누르면 상대 언어로 읽어 주기, 길게 보이기
import { h, icon, showBig } from '../ui.js';
import { LANGS } from '../lang.js';
import { state } from '../store.js';
import { PHRASE_CATS, phrasesFor } from '../phrases.js';
import { speak, unlockSpeech } from '../speech.js';
import { readingFor } from '../reading.js';

let cat = 'greet';

export default {
  render(root) {
    const { me, partner, reading } = state.settings;
    const list = h('div', { class: 'phrase-list' });
    const chips = h('div', { class: 'chips', role: 'tablist' });
    const draw = () => {
      chips.replaceChildren(...PHRASE_CATS.map((c) => h('button', {
        class: `chip${c.id === cat ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(c.id === cat),
        onclick: () => { cat = c.id; draw(); },
      }, c.icon, ' ', c.name)));
      list.replaceChildren(...phrasesFor(cat, partner).map((p) => {
        const say = p[partner];
        const read = reading ? readingFor(say, partner, me) : '';
        return h('div', { class: 'phrase card' },
          h('button', { class: 'phrase-main', type: 'button', onclick: () => { unlockSpeech(); speak(say, partner); } },
            h('div', { class: 'phrase-me', lang: me }, p[me]),
            h('div', { class: 'phrase-say', lang: partner }, say),
            read ? h('div', { class: 'b-reading' }, read) : null),
          h('div', { class: 'phrase-acts' },
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': '읽어 주기', onclick: () => { unlockSpeech(); speak(say, partner); } }, icon('speaker', 18)),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': '크게 보여 주기', onclick: () => showBig(say, { lang: partner, onSpeak: () => speak(say, partner) }) }, icon('expand', 18))));
      }));
    };
    draw();
    root.append(
      h('div', { class: 'page-note muted small' }, `${LANGS[me].flag} → ${LANGS[partner].flag} 누르면 ${LANGS[partner].name}로 읽어 줘요. 인터넷 없이도 돼요.`),
      chips, list);
  },
};
