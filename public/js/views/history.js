// 기록: 지난 통역을 날짜별로 (이 기기에만 저장). 나·상대는 지금 내 언어 기준 (lang.js sideFor)
// 공유(v1.4.0): 말을 골라 원문 + 번역을 한 묶음 글로 (views/share.js)
import { h, icon, toast, copyText, fmtTime, fmtDate } from '../ui.js';
import { LANGS, sideFor } from '../lang.js';
import { t } from '../i18n.js';
import { state, clearHistory } from '../store.js';
import { speak, unlockSpeech } from '../speech.js';
import { openShare } from './share.js';

const SIDE = { me: 'talk.me', partner: 'talk.partner', text: 'hist.text' };

export default {
  render(root) {
    const items = state.history.filter((x) => x.translation).slice().reverse();
    if (!items.length) {
      root.append(h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '🗂️'),
        h('p', null, t('hist.empty')),
        h('p', { class: 'muted small' }, state.settings.saveHistory ? t('hist.emptyHint') : t('hist.off'))));
      return;
    }
    const groups = new Map();
    for (const it of items) {
      const d = fmtDate(it.at);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(it);
    }
    root.append(
      h('div', { class: 'row between page-note' },
        h('span', { class: 'muted small' }, t('hist.count', { n: items.length })),
        h('div', { class: 'row gap' },
          h('button', { class: 'chip', type: 'button', onclick: () => openShare({ items }) }, icon('share', 16), ' ', t('share.button')),
          h('button', { class: 'chip', type: 'button', onclick: () => {
            if (!confirm(t('hist.clearConfirm'))) return;
            clearHistory(); toast(t('hist.cleared'), 'ok'); root.replaceChildren(); this.render(root);
          } }, icon('trash', 16), ' ', t('hist.clearAll')))),
      ...[...groups].map(([date, list]) => h('section', null,
        h('h2', { class: 'group-date' }, date),
        list.map((it) => h('div', { class: 'card hist' },
          h('div', { class: 'hist-meta muted small' }, `${t(SIDE[sideFor(it, state.settings.me)] || 'hist.text')} · ${LANGS[it.from]?.flag || ''} → ${LANGS[it.to]?.flag || ''} · ${fmtTime(it.at)}`),
          h('div', { class: 'hist-orig', lang: it.from }, it.text),
          h('div', { class: 'hist-trans', lang: it.to }, it.translation),
          h('div', { class: 'b-actions' },
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('common.listen'), onclick: () => { unlockSpeech(); speak(it.translation, it.to); } }, icon('speaker', 18)),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('common.copy'), onclick: () => copyText(it.translation) }, icon('copy', 18))))))));
  },
};
