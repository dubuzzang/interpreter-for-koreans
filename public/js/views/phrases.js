// 표현집: 바로 쓰는 문장 (인터넷 없이도 됨) — 위는 내 말(내 언어), 아래는 상대 언어. 누르면 상대 언어로 읽어 주기
import { h, icon, showBig } from '../ui.js';
import { LANGS } from '../lang.js';
import { t, langName } from '../i18n.js';
import { state } from '../store.js';
import { PHRASE_CATS, phrasesFor, phraseSound } from '../phrases.js';
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
      }, c.icon, ' ', t(`cat.${c.id}`))));
      list.replaceChildren(...phrasesFor(cat, partner, me).map((p) => {
        const say = p[partner];
        const read = reading ? readingFor(say, partner, me, phraseSound(p, partner)) : '';
        return h('div', { class: 'phrase card' },
          h('button', { class: 'phrase-main', type: 'button', onclick: () => { unlockSpeech(); speak(say, partner); } },
            h('div', { class: 'phrase-me', lang: me }, p[me]),
            h('div', { class: 'phrase-say', lang: partner }, say),
            read ? h('div', { class: 'b-reading' }, read) : null),
          h('div', { class: 'phrase-acts' },
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('common.speak'), onclick: () => { unlockSpeech(); speak(say, partner); } }, icon('speaker', 18)),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('common.showBig'), onclick: () => showBig(say, { lang: partner, onSpeak: () => speak(say, partner) }) }, icon('expand', 18))));
      }));
    };
    draw();
    root.append(
      h('div', { class: 'page-note muted small' }, t('phrases.note', { me: LANGS[me].flag, partner: LANGS[partner].flag, lang: langName(partner) })),
      chips, list);
  },
};
