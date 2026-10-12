// 대화 공유(v1.4.0): 기록이나 지금 대화에서 말을 골라(전체 · 오늘 · 범위) 원문 + 번역을 한 묶음 글로 →
// 휴대폰 공유 시트(카톡 · 메일, navigator.share) · 안 되면 복사.
// 합의 내용 요약(선택): AI가 단가 · 수량 · 배송일 · 기타 조건을 두 언어로 뽑는다(대화에 없는 값은 빈칸).
// 사용자가 확인 표시를 해야만 공유 버튼이 켜진다 — 고친 값이 그대로 들어간다.
import { h, icon, toast, copyText, fmtTime, fmtDate, arrow } from '../ui.js';
import { LANGS, sideFor } from '../lang.js';
import { t, tl, langName } from '../i18n.js';
import { state } from '../store.js';
import { summarize, translate } from '../api.js';
import { buildShareText, otherLang, hasSummary, SUMMARY_FIELDS } from '../share.js';

const dayKey = (at) => new Date(at).toDateString();

/** items: 기록 항목들 (번역이 있는 것) · select: 'all'이면 처음부터 모두 고름 */
export function openShare({ items, select = 'none' } = {}) {
  const me = state.settings.me;
  const list = items.filter((x) => x.text && x.translation).slice().sort((a, b) => a.at - b.at);
  if (!list.length) { toast(t('share.empty')); return; }
  const chosen = new Set(select === 'all' ? list.map((x) => x.id) : []);
  let step = 'pick';
  let range = null;   // null · 'start' · { from: 번호 }
  const sum = { on: false, status: 'idle', fields: null, error: '', confirmed: false, key: '' };

  const picked = () => list.filter((x) => chosen.has(x.id));
  const other = () => otherLang(picked().length ? picked() : list, me, state.settings.partner);
  const asShared = (x) => ({ ...x, side: sideFor(x, me) });
  const text = () => buildShareText(picked().map(asShared), {
    me, other: other(), tl, time: fmtTime, date: fmtDate, flag: (l) => LANGS[l]?.flag || '',
    summary: sum.on && sum.status === 'ok' ? sum.fields : null, // 미리 보기에는 확인 전에도 보이고, 공유는 확인 뒤에만 (ready)
  });

  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  // 시트는 한 번만 만들고 안쪽만 바꾼다 (다시 만들면 올라오는 움직임이 누를 때마다 다시 돈다)
  const sheet = h('div', { class: 'share-sheet' });
  const wrap = h('div', { class: 'share-wrap', role: 'dialog', 'aria-modal': 'true' }, sheet);
  let shown = null;

  // ---------- 1. 고르기 ----------
  function pickRow(it, i) {
    const on = chosen.has(it.id);
    const side = sideFor(it, me);
    const mark = range && typeof range === 'object' && range.from === i;
    return h('button', {
      class: `share-row ${side}${on ? ' on' : ''}${mark ? ' mark' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': String(on),
      onclick: () => {
        if (range === 'start') { range = { from: i }; draw(); return; }
        if (range && typeof range === 'object') {
          const [a, b] = [Math.min(range.from, i), Math.max(range.from, i)];
          chosen.clear();
          list.slice(a, b + 1).forEach((x) => chosen.add(x.id));
          range = null; draw(); return;
        }
        if (on) chosen.delete(it.id); else chosen.add(it.id);
        draw();
      },
    },
    h('span', { class: 'share-check', 'aria-hidden': 'true' }, on ? icon('check', 16) : null),
    h('span', { class: 'share-body' },
      h('span', { class: 'share-meta' }, `${t(side === 'me' ? 'talk.me' : side === 'partner' ? 'talk.partner' : 'hist.text')} · ${arrow(LANGS[it.from]?.flag || '', LANGS[it.to]?.flag || '')} · ${fmtTime(it.at)}`),
      h('span', { class: 'share-orig', lang: it.from }, it.text),
      h('span', { class: 'share-trans', lang: it.to }, it.translation)));
  }

  function pickStep() {
    const today = dayKey(Date.now());
    const rows = [];
    let lastDay = null;
    list.forEach((it, i) => {
      const d = dayKey(it.at);
      if (d !== lastDay) { rows.push(h('div', { class: 'group-date' }, fmtDate(it.at))); lastDay = d; }
      rows.push(pickRow(it, i));
    });
    const quick = (key, on, fn) => h('button', { class: `chip${on ? ' on' : ''}`, type: 'button', onclick: fn }, t(key));
    const body = h('div', { class: 'share-scroll' }, rows);
    return [
      h('div', { class: 'share-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('close')),
        h('b', null, t('share.pickTitle'))),
      h('div', { class: 'share-quick' },
        quick('share.all', chosen.size === list.length, () => { list.forEach((x) => chosen.add(x.id)); range = null; draw(); }),
        quick('share.today', false, () => { chosen.clear(); list.filter((x) => dayKey(x.at) === today).forEach((x) => chosen.add(x.id)); range = null; draw(); }),
        quick('share.range', Boolean(range), () => { range = range ? null : 'start'; draw(); }),
        quick('share.none', false, () => { chosen.clear(); range = null; draw(); })),
      range ? h('div', { class: 'share-hint', role: 'status' }, t(range === 'start' ? 'share.rangeStart' : 'share.rangeEnd')) : null,
      body,
      h('div', { class: 'share-foot' },
        h('button', { class: 'btn primary block', type: 'button', disabled: !chosen.size, onclick: () => { step = 'compose'; range = null; if (sum.on) runSummary(); draw(); } },
          t('share.next', { n: chosen.size }))),
    ];
  }

  // ---------- 2. 요약 · 미리 보기 · 공유 ----------
  const preview = h('pre', { class: 'share-preview', 'aria-label': t('share.preview') });
  const sendBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => send() }, icon('share', 18), ' ', t('share.send'));
  const copyBtn = h('button', { class: 'btn soft', type: 'button', onclick: () => { if (ready()) copyText(text()); } }, icon('copy', 18), ' ', t('share.copy'));
  const gate = h('p', { class: 'muted small share-gate' });
  const ready = () => !sum.on || (sum.status === 'ok' && sum.confirmed);
  function refresh() {
    preview.textContent = text();
    const ok = ready();
    sendBtn.disabled = !ok; copyBtn.disabled = !ok;
    gate.textContent = ok ? '' : t('share.confirmFirst');
  }

  async function send() {
    if (!ready()) return;
    const body = text();
    if (navigator.share) {
      try { await navigator.share({ title: `Tercüman · ${t('share.heading')}`, text: body }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    copyText(body);
  }

  function runSummary() {
    const turns = picked().map((x) => {
      const side = sideFor(x, me);
      return { ...x, side: side === 'text' ? (x.from === me ? 'me' : 'partner') : side };
    });
    const key = turns.map((x) => x.id).join(',');
    if (sum.key === key && sum.status === 'ok') return;
    Object.assign(sum, { status: 'loading', key, confirmed: false, error: '' });
    draw();
    summarize({ me, partner: other(), turns })
      .then((fields) => {
        if (sum.key !== key || !wrap.isConnected) return;
        sum.fields = Object.fromEntries(SUMMARY_FIELDS.map((f) => [f, { me: fields[f]?.me || '', partner: fields[f]?.partner || '' }]));
        sum.status = 'ok';
        draw();
      })
      .catch((e) => { if (sum.key === key) { sum.status = 'error'; sum.error = e.message; draw(); } });
  }

  function summaryField(f) {
    const v = sum.fields[f];
    const o = other();
    const input = (lang, k) => {
      const el = h('input', { class: 'type-input', type: 'text', lang, value: v[k], 'aria-label': `${t(`share.${f}`)} (${langName(lang)})` });
      el.addEventListener('input', () => { v[k] = el.value; refresh(); });
      return el;
    };
    const mineEl = input(me, 'me');
    const otherEl = input(o, 'partner');
    const fill = h('button', { class: 'link small', type: 'button', onclick: async () => {
      const src = mineEl.value.trim();
      if (!src) return;
      fill.disabled = true;
      try { otherEl.value = v.partner = await translate(src, me, o, { formal: state.settings.formal }); refresh(); } catch (e) { toast(e.message, 'bad'); }
      fill.disabled = false;
    } }, t('share.translateTo', { lang: langName(o) }));
    return h('div', { class: 'sum-field' },
      h('div', { class: 'row between' }, h('span', { class: 'set-label small' }, t(`share.${f}`), o !== me ? h('span', { class: 'muted' }, ' · ', h('span', { lang: o }, tl(o, `share.${f}`))) : null), fill),
      h('label', { class: 'sum-input' }, h('span', { 'aria-hidden': 'true' }, LANGS[me].flag), mineEl),
      h('label', { class: 'sum-input' }, h('span', { 'aria-hidden': 'true' }, LANGS[o].flag), otherEl));
  }

  function summaryCard() {
    const toggle = h('input', { type: 'checkbox', checked: sum.on, onchange: (e) => { sum.on = e.target.checked; if (sum.on) runSummary(); else draw(); } });
    const head = h('label', { class: 'set-row' },
      h('div', null, h('div', { class: 'set-label' }, t('share.summary')), h('div', { class: 'muted small' }, t('share.summaryHint'))),
      h('span', { class: 'switch' }, toggle, h('span', { class: 'slider' })));
    if (!sum.on) return h('section', { class: 'card' }, head);
    let body;
    if (sum.status === 'loading') body = h('div', { class: 'phrase-wait', role: 'status' }, h('span', { class: 'dots' }), t('share.summarizing'));
    else if (sum.status === 'error') {
      body = h('div', { class: 'b-error' }, sum.error, ' ', h('button', { class: 'link', type: 'button', onclick: () => { sum.key = ''; runSummary(); } }, t('common.retry')));
    } else if (sum.status === 'ok') {
      const confirm = h('input', { type: 'checkbox', checked: sum.confirmed, onchange: (e) => { sum.confirmed = e.target.checked; refresh(); } });
      body = h('div', { class: 'sum-form' },
        h('p', { class: 'muted small' }, t(hasSummary(sum.fields) ? 'share.summaryCheck' : 'share.summaryNone')),
        SUMMARY_FIELDS.map(summaryField),
        h('label', { class: 'sum-confirm' }, confirm, h('span', null, t('share.confirm'))));
    }
    return h('section', { class: 'card' }, head, body);
  }

  function composeStep() {
    refresh();
    return [
      h('div', { class: 'share-head' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('share.back'), onclick: () => { step = 'pick'; draw(); } }, icon('back')),
        h('b', null, t('share.title')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('close'))),
      h('div', { class: 'share-scroll pad' },
        summaryCard(),
        h('div', { class: 'set-label small share-label' }, t('share.preview')),
        preview),
      h('div', { class: 'share-foot' },
        gate,
        h('div', { class: 'row gap share-actions' }, navigator.share ? sendBtn : null, copyBtn)),
    ];
  }

  function draw() {
    // 고르기 화면의 스크롤 위치는 다시 그려도 그대로 (처음 열 때 · 돌아왔을 때는 맨 아래 = 최근 말)
    const old = sheet.querySelector('.share-scroll');
    const keep = old && shown === 'pick' && step === 'pick' ? old.scrollTop : null;
    sheet.replaceChildren(...(step === 'pick' ? pickStep() : composeStep()).filter(Boolean));
    shown = step;
    const el = sheet.querySelector('.share-scroll');
    if (step === 'pick') requestAnimationFrame(() => { el.scrollTop = keep ?? el.scrollHeight; });
  }

  document.addEventListener('keydown', esc);
  document.body.append(wrap);
  draw();
  return { close };
}
