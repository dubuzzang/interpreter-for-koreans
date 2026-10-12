// 표현집: 바로 쓰는 문장 (인터넷 없이도 됨) — 위는 내 말(내 언어), 아래는 상대 언어. 누르면 상대 언어로 읽어 주기
// ⭐ 내 표현(v1.4.0): 표현집에서 ☆ 한 문장 · 직접 쓴 문장 — 이 기기에만 저장(mine.js). 직접 쓴 문장은 저장할 때 상대 언어로 번역해 두고,
// 상대 언어 · 내 언어가 바뀌면 그 언어 번역을 이 화면을 열 때 새로 받아 둔다. 저장된 글과 읽기는 인터넷 없이도 보이고 읽어 준다.
import { h, icon, showBig, toast } from '../ui.js';
import { LANGS } from '../lang.js';
import { t, langName } from '../i18n.js';
import { state } from '../store.js';
import { PHRASE_CATS, phrasesFor, phraseSound } from '../phrases.js';
import { speak, unlockSpeech } from '../speech.js';
import { readingFor, needsSound } from '../reading.js';
import { translate, sound as fetchSound } from '../api.js';
import * as M from '../mine.js';

const MINE = { id: 'mine', icon: '⭐' };
const EXAMPLES = [
  { icon: '📍', label: 'mine.exAddress', text: 'mine.exAddressText' },
  { icon: '📋', label: 'mine.exTerms', text: 'mine.exTermsText' },
];
let cat = null;                                            // 처음엔 내 표현이 있으면 내 표현, 없으면 인사
const view = { editing: false, adding: null, fixing: null }; // 편집(순서·고치기·지우기) · 추가 양식 · 고치는 항목
const work = new Map();                                    // `${id}|${lang}|text|sound` → 'busy' · 'skip' · 오류 문장

const sayIt = (text, lang) => { unlockSpeech(); speak(text, lang); };
const iconBtn = (name, label, onclick, extra = '') => h('button', { class: `icon-btn sm${extra}`, type: 'button', 'aria-label': label, title: label, onclick }, icon(name, 18));

export default {
  render(root) {
    const { me, partner, reading } = state.settings;
    let mine = M.loadMine();
    if (!cat) cat = mine.length ? MINE.id : 'greet';
    let alive = true, filling = false, dirty = false;

    const note = h('div', { class: 'page-note muted small' });
    const chips = h('div', { class: 'chips', role: 'tablist' });
    const tools = h('div');
    const list = h('div', { class: 'phrase-list' });
    const commit = (next) => { mine = next; M.saveMine(mine); };
    const update = (id, fn) => commit(mine.map((x) => (x.id === id ? fn(x) : x)));
    // 양식을 쓰는 중에는 뒤에서 번역이 도착해도 다시 그리지 않는다 (쓰던 글 · 키보드가 사라지지 않게)
    const softDraw = () => { if (view.adding || view.fixing) dirty = true; else draw(); };

    // ---------- 표현집 문장 ----------
    function phraseCard(p) {
      const say = p[partner];
      const read = reading ? readingFor(say, partner, me, phraseSound(p, partner)) : '';
      const starred = M.isStarred(mine, p);
      return h('div', { class: 'phrase card' },
        h('button', { class: 'phrase-main', type: 'button', onclick: () => sayIt(say, partner) },
          h('div', { class: 'phrase-me', lang: me }, p[me]),
          h('div', { class: 'phrase-say', lang: partner }, say),
          read ? h('div', { class: 'b-reading' }, read) : null),
        h('div', { class: 'phrase-acts' },
          h('button', {
            class: `icon-btn sm star${starred ? ' on' : ''}`, type: 'button', 'aria-pressed': String(starred), 'aria-label': t(starred ? 'mine.unstar' : 'mine.star'), title: t(starred ? 'mine.unstar' : 'mine.star'),
            onclick: () => {
              if (!starred && mine.length >= M.MAX_MINE) { toast(t('mine.full', { max: M.MAX_MINE }), 'bad'); return; }
              commit(M.toggleStar(mine, p)); toast(t(starred ? 'mine.removed' : 'mine.saved'), starred ? '' : 'ok'); draw();
            },
          }, icon(starred ? 'starOn' : 'star', 18)),
          iconBtn('speaker', t('common.speak'), () => sayIt(say, partner)),
          iconBtn('expand', t('common.showBig'), () => showBig(say, { lang: partner, onSpeak: () => speak(say, partner) }))));
    }

    // ---------- 내 표현 ----------
    const jobKey = (item, lang, kind) => `${item.id}|${lang}|${kind}|${item.texts[item.orig]}`;

    /** 상대 말 자리: 번역 · 번역 중 · 오류(다시 시도) · 인터넷 기다림 */
    function sayLine(item) {
      const say = M.sayText(item, partner);
      if (say) return h('div', { class: 'phrase-say', lang: partner }, say);
      const state_ = work.get(jobKey(item, partner, 'text'));
      if (state_ === 'busy') return h('div', { class: 'phrase-wait' }, h('span', { class: 'dots' }), t('mine.translating', { lang: langName(partner) }));
      if (state_ && state_ !== 'skip') {
        return h('div', { class: 'phrase-wait bad' }, state_, ' ',
          h('button', { class: 'link', type: 'button', onclick: (e) => { e.stopPropagation(); work.delete(jobKey(item, partner, 'text')); fill(); } }, t('common.retry')));
      }
      return h('div', { class: 'phrase-wait' }, t(navigator.onLine ? 'mine.translating' : 'mine.waitOnline', { lang: langName(partner) }));
    }

    function mineCard(item, i) {
      if (view.fixing?.id === item.id) return fixForm(item);
      const say = M.sayText(item, partner);
      const read = reading && say ? readingFor(say, partner, me, item.sound?.[partner] || '') : '';
      const speakIt = () => (say ? sayIt(say, partner) : toast(t('mine.noTranslation', { lang: langName(partner) })));
      return h('div', { class: `phrase card mine${view.editing ? ' editing' : ''}` },
        h(view.editing ? 'div' : 'button', view.editing ? { class: 'phrase-main' } : { class: 'phrase-main', type: 'button', onclick: speakIt },
          item.label ? h('div', { class: 'mine-label' }, item.ref ? '⭐ ' : '', item.label) : null,
          h('div', { class: 'phrase-me', lang: M.myLang(item, me) }, M.myText(item, me)),
          sayLine(item),
          read ? h('div', { class: 'b-reading' }, read) : null),
        view.editing
          ? h('div', { class: 'mine-tools' },
            iconBtn('up', t('mine.up'), () => { commit(M.moveItem(mine, item.id, -1)); draw(); }, i === 0 ? ' dim' : ''),
            iconBtn('down', t('mine.down'), () => { commit(M.moveItem(mine, item.id, 1)); draw(); }, i === mine.length - 1 ? ' dim' : ''),
            h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { view.fixing = { id: item.id }; draw(); } }, icon('edit', 16), ' ', t('mine.fix')),
            h('button', { class: 'btn ghost sm danger', type: 'button', onclick: () => {
              if (!confirm(t('mine.deleteConfirm'))) return;
              commit(M.removeItem(mine, item.id)); toast(t('mine.removed')); draw();
            } }, icon('trash', 16), ' ', t('mine.delete')))
          : h('div', { class: 'phrase-acts' },
            iconBtn('speaker', t('common.speak'), speakIt),
            iconBtn('expand', t('common.showBig'), () => (say ? showBig(say, { lang: partner, onSpeak: () => speak(say, partner) }) : speakIt()))));
    }

    /** 이름 · 글 입력칸 (쓰던 글은 view에 남겨 둔다) */
    const field = (tag, draft, key, attrs) => {
      const el = h(tag, { class: tag === 'textarea' ? 'text-area mine-text' : 'type-input', ...attrs });
      el.value = draft[key] ?? '';
      el.addEventListener('input', () => { draft[key] = el.value; });
      return el;
    };

    function addForm() {
      const d = view.adding;
      const text = field('textarea', d, 'text', { rows: 3, lang: me, maxlength: M.MAX_MINE_TEXT, placeholder: d.example ? t(d.example) : t('mine.textPh', { lang: langName(me) }), 'aria-label': t('mine.myText', { lang: langName(me) }) });
      const label = field('input', d, 'label', { type: 'text', maxlength: M.MAX_LABEL, placeholder: t('mine.labelPh'), 'aria-label': t('mine.label') });
      setTimeout(() => (d.label ? text : label).focus(), 0);
      const save = () => {
        const v = String(d.text || '').trim();
        if (!v) { text.focus(); return; }
        if (mine.length >= M.MAX_MINE) { toast(t('mine.full', { max: M.MAX_MINE }), 'bad'); return; }
        commit([M.createItem({ text: v, lang: me, label: d.label }), ...mine]);
        view.adding = null;
        toast(t('mine.saved'), 'ok');
        draw(); fill();
      };
      return h('div', { class: 'card mine-form' },
        h('div', { class: 'mine-examples' }, h('span', { class: 'muted small' }, t('mine.examples')),
          EXAMPLES.map((ex) => h('button', { class: `chip${d.example === ex.text ? ' on' : ''}`, type: 'button', onclick: () => { d.label = t(ex.label); d.example = ex.text; draw(); } }, ex.icon, ' ', t(ex.label)))),
        h('label', { class: 'mine-field' }, h('span', { class: 'set-label small' }, t('mine.label')), label),
        h('label', { class: 'mine-field' }, h('span', { class: 'set-label small' }, t('mine.myText', { lang: langName(me) })), text),
        h('p', { class: 'muted small' }, t('mine.saveHint', { lang: langName(partner) })),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn primary sm', type: 'button', onclick: save }, t('mine.save')),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { view.adding = null; draw(); } }, t('common.cancel'))));
    }

    function fixForm(item) {
      const d = view.fixing;
      d.label ??= item.label || '';
      d.mine ??= M.myText(item, me);
      d.say ??= M.sayText(item, partner);
      const label = field('input', d, 'label', { type: 'text', maxlength: M.MAX_LABEL, placeholder: t('mine.labelPh'), 'aria-label': t('mine.label') });
      const mineEl = field('textarea', d, 'mine', { rows: 3, lang: M.myLang(item, me), maxlength: M.MAX_MINE_TEXT, 'aria-label': t('mine.myText', { lang: langName(me) }) });
      const sayEl = field('textarea', d, 'say', { rows: 3, lang: partner, maxlength: M.MAX_MINE_TEXT, placeholder: t('mine.sayHint'), 'aria-label': t('mine.sayText', { lang: langName(partner) }) });
      setTimeout(() => mineEl.focus(), 0);
      const close = () => { view.fixing = null; draw(); fill(); };
      return h('div', { class: 'card mine-form' },
        h('label', { class: 'mine-field' }, h('span', { class: 'set-label small' }, t('mine.label')), label),
        h('label', { class: 'mine-field' }, h('span', { class: 'set-label small' }, t('mine.myText', { lang: langName(me) })), mineEl),
        h('label', { class: 'mine-field' }, h('span', { class: 'set-label small' }, t('mine.sayText', { lang: langName(partner) })), sayEl,
          h('span', { class: 'muted small' }, t('mine.sayHint'))),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn primary sm', type: 'button', onclick: () => { update(item.id, (x) => M.editItem(x, { me, partner, mine: d.mine, say: d.say, label: d.label })); close(); } }, t('mine.save')),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: close }, t('common.cancel'))));
    }

    function emptyMine() {
      return h('div', { class: 'empty mine-empty' },
        h('div', { class: 'empty-icon' }, '⭐'),
        h('p', null, t('mine.empty')),
        h('div', { class: 'row gap center' }, EXAMPLES.map((ex) => h('button', { class: 'chip', type: 'button', onclick: () => { view.adding = { label: t(ex.label), example: ex.text }; draw(); } }, ex.icon, ' ', t(ex.label)))),
        h('p', { class: 'muted small' }, t('mine.emptyHint', { lang: langName(partner) })));
    }

    function drawMine() {
      tools.replaceChildren(h('div', { class: 'row gap mine-bar' },
        h('button', { class: 'chip', type: 'button', disabled: Boolean(view.adding), onclick: () => { view.adding = { label: '', text: '' }; view.editing = false; draw(); } }, icon('plus', 16), ' ', t('mine.add')),
        mine.length ? h('button', { class: `chip${view.editing ? ' on' : ''}`, type: 'button', 'aria-pressed': String(view.editing), onclick: () => { view.editing = !view.editing; view.fixing = null; draw(); } },
          icon(view.editing ? 'check' : 'edit', 16), ' ', t(view.editing ? 'mine.done' : 'mine.edit')) : null));
      list.replaceChildren(...[
        view.adding ? addForm() : null,
        !mine.length && !view.adding ? emptyMine() : null,
        ...mine.map(mineCard),
      ].filter(Boolean));
    }

    function draw() {
      if (!alive) return;
      dirty = false;
      chips.replaceChildren(...[MINE, ...PHRASE_CATS].map((c) => h('button', {
        class: `chip${c.id === cat ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(c.id === cat),
        onclick: () => { cat = c.id; view.editing = false; view.adding = null; view.fixing = null; draw(); fill(); },
      }, c.icon, ' ', t(`cat.${c.id}`))));
      note.textContent = cat === MINE.id ? t('mine.note') : t('phrases.note', { me: LANGS[me].flag, partner: LANGS[partner].flag, lang: langName(partner) });
      if (cat === MINE.id) { drawMine(); return; }
      tools.replaceChildren();
      list.replaceChildren(...phrasesFor(cat, partner, me).map(phraseCard));
    }

    // ---------- 필요한 번역 · 읽기 받기 (하나씩, 인터넷이 있을 때) ----------
    function nextJob() {
      for (const item of mine) {
        for (const lang of M.missingLangs(item, me, partner)) {
          if (!work.has(jobKey(item, lang, 'text'))) return { item, lang, kind: 'text' };
        }
        const say = M.sayText(item, partner);
        if (reading && say && needsSound(partner, me) && !item.sound?.[partner] && !work.has(jobKey(item, partner, 'sound'))) return { item, lang: partner, kind: 'sound' };
      }
      return null;
    }

    async function fill() {
      if (filling || cat !== MINE.id) return;
      filling = true;
      try {
        while (alive && navigator.onLine) {
          const job = nextJob();
          if (!job) break;
          const { item, lang, kind } = job;
          const key = jobKey(item, lang, kind);
          const src = item.texts[item.orig];
          work.set(key, 'busy');
          softDraw();
          try {
            if (kind === 'text') {
              const out = await translate(src, item.orig, lang, { formal: state.settings.formal });
              // 그사이 고쳤으면 버린다
              update(item.id, (x) => (x.texts[x.orig] === src && !x.texts[lang] ? M.withText(x, lang, out) : x));
              work.delete(key);
            } else {
              const say = item.texts[lang];
              const k = await fetchSound(say, lang);
              if (k) update(item.id, (x) => (x.texts[lang] === say ? M.withSound(x, lang, k) : x));
              work.set(key, 'skip'); // 못 받았어도 이 화면에서는 다시 묻지 않는다 (읽기는 없어도 됨)
            }
          } catch (e) {
            work.set(key, e.message);
          }
          softDraw();
        }
      } finally { filling = false; }
      if (dirty) softDraw();
    }

    const onOnline = () => { for (const [k, v] of work) if (v !== 'busy' && v !== 'skip') work.delete(k); softDraw(); fill(); };
    const onOffline = () => softDraw();
    addEventListener('online', onOnline);
    addEventListener('offline', onOffline);
    draw();
    root.append(note, chips, tools, list);
    fill();
    return () => { alive = false; removeEventListener('online', onOnline); removeEventListener('offline', onOffline); };
  },
};
