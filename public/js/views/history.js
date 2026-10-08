// 기록: 지난 통역을 날짜별로 (이 기기에만 저장)
import { h, icon, toast, copyText, fmtTime, fmtDate } from '../ui.js';
import { LANGS } from '../lang.js';
import { state, clearHistory } from '../store.js';
import { speak, unlockSpeech } from '../speech.js';

const SIDE = { me: '나', partner: '상대', text: '글 번역' };

export default {
  render(root) {
    const items = state.history.filter((x) => x.translation).slice().reverse();
    if (!items.length) {
      root.append(h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '🗂️'),
        h('p', null, '아직 기록이 없어요.'),
        h('p', { class: 'muted small' }, state.settings.saveHistory ? '대화나 글 번역을 하면 여기에 남아요. 기록은 이 기기에만 저장돼요.' : '설정에서 "기록 남기기"가 꺼져 있어요.')));
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
        h('span', { class: 'muted small' }, `${items.length}개 · 이 기기에만 저장`),
        h('button', { class: 'chip', type: 'button', onclick: () => {
          if (!confirm('기록을 모두 지울까요?')) return;
          clearHistory(); toast('기록을 지웠어요', 'ok'); root.replaceChildren(); this.render(root);
        } }, icon('trash', 16), ' 모두 지우기')),
      ...[...groups].map(([date, list]) => h('section', null,
        h('h2', { class: 'group-date' }, date),
        list.map((it) => h('div', { class: 'card hist' },
          h('div', { class: 'hist-meta muted small' }, `${SIDE[it.side] || ''} · ${LANGS[it.from]?.flag || ''} → ${LANGS[it.to]?.flag || ''} · ${fmtTime(it.at)}`),
          h('div', { class: 'hist-orig', lang: it.from }, it.text),
          h('div', { class: 'hist-trans', lang: it.to }, it.translation),
          h('div', { class: 'b-actions' },
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': '듣기', onclick: () => { unlockSpeech(); speak(it.translation, it.to); } }, icon('speaker', 18)),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': '복사', onclick: () => copyText(it.translation) }, icon('copy', 18))))))));
  },
};
