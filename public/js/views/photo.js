// 사진 번역 (#/photo, v1.5.0): 번역 탭의 📷 사진 → 카메라로 찍기 / 사진 고르기 → 화면에서 줄여(아주 긴 그림은 겹치게 잘라) 서버로
// → 사진 + 읽은 줄(원문 · 읽는 법 · 번역) + 전체 요약 한 줄. 줄을 누르면 원문을 읽어 주고, 복사 · 공유 · ⭐ 내 표현에 넣기.
// 사진은 서버에서 읽기만 하고 저장하지 않는다. 결과는 이 화면을 떠났다 와도 앱을 닫기 전까지 남아 있다.
import { h, icon, toast, copyText } from '../ui.js';
import { CODES } from '../lang.js';
import { t, langName } from '../i18n.js';
import { state } from '../store.js';
import { readPhoto, photoSummary } from '../api.js';
import { speak, unlockSpeech } from '../speech.js';
import { readingFor } from '../reading.js';
import { preparePhoto, mergeParts, isPriceOnly, lineText, allText } from '../photo.js';
import * as M from '../mine.js';

let job = null;      // 지금 사진 { file, me, status: preparing|reading|done|error, preview, parts, done, results, lines, summary, … }
let redraw = null;   // 이 화면이 열려 있을 때 다시 그리기
const changed = () => redraw?.();

// ---------- 사진 고르기 (번역 탭의 📷 사진) ----------
/** 카메라로 찍기 / 사진 고르기. <label> 안의 file 입력이라 아이폰 · 안드로이드 모두 기본 동작으로 열린다 */
export function openPhotoPicker() {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const choice = (capture, cls, ic, key) => {
    const input = h('input', { type: 'file', accept: 'image/*', capture: capture ? 'environment' : null, class: 'vh', 'data-photo': capture ? 'camera' : 'gallery' });
    input.addEventListener('change', () => { const f = input.files?.[0]; close(); if (f) startPhoto(f); });
    return h('label', { class: `btn ${cls} block` }, icon(ic, 20), t(key), input);
  };
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet photo-sheet', role: 'dialog', 'aria-label': t('photo.title') },
      h('div', { class: 'sheet-head' }, h('b', null, t('photo.title')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('close'))),
      h('p', { class: 'muted small' }, t('photo.pickHint', { lang: langName(state.settings.me) })),
      choice(true, 'primary', 'camera', 'photo.camera'),
      choice(false, 'soft', 'image', 'photo.gallery'),
      h('p', { class: 'muted small photo-privacy' }, '🔒 ', t('photo.privacy'))));
  document.addEventListener('keydown', esc);
  document.body.append(wrap);
}

// ---------- 읽기 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 조각 하나 읽기. 요청이 잦다(429)고 하면 알려 준 초만큼 기다렸다가 다시 (긴 그림은 조각이 많아서) */
async function readPiece(my, blob, i) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await readPhoto(blob, { me: my.me, part: i + 1, parts: my.parts });
    } catch (e) {
      if (e.code !== 'rate_limited' || !(e.retry <= 60) || job !== my) return { error: e.message };
      for (my.wait = e.retry; my.wait > 0 && job === my; my.wait--) { changed(); await sleep(1000); }
      my.wait = 0;
      if (job !== my) return { error: '' }; // 기다리는 사이 다른 사진을 골랐다
    }
  }
  return { error: t('err.rate_limited', { retry: 60 }) };
}

function combine(my) {
  const ok = my.results.filter((r) => r && !r.error);
  my.lines = mergeParts(ok);
  my.failed = my.results.filter((r) => r?.error).length;
  my.dropped = ok.reduce((n, r) => n + (r.notes ? (r.notes.loops || 0) + (r.notes.wrongLang || 0) + (r.notes.numbers || 0) : 0), 0);
}

export async function startPhoto(file) {
  if (job?.preview) URL.revokeObjectURL(job.preview);
  const my = job = { file, me: state.settings.me, status: 'preparing', preview: '', parts: 0, done: 0, results: [], lines: [], summary: '', error: '', failed: 0, dropped: 0, truncated: false, wait: 0 };
  if (location.hash !== '#/photo') location.hash = '#/photo';
  else changed();
  let prepared;
  try { prepared = await preparePhoto(file); } catch {
    if (job === my) { my.status = 'error'; my.error = t('photo.badFile'); changed(); }
    return;
  }
  if (job !== my) { URL.revokeObjectURL(prepared.preview); return; }
  Object.assign(my, { preview: prepared.preview, parts: prepared.pieces.length, truncated: prepared.truncated, status: 'reading', results: new Array(prepared.pieces.length).fill(null) });
  changed();
  // 조각은 둘씩 동시에 읽고(긴 그림이 너무 오래 걸리지 않게), 결과는 차례대로 합친다
  let next = 0;
  const worker = async () => {
    while (job === my && next < my.parts) {
      const i = next++;
      my.results[i] = await readPiece(my, prepared.pieces[i], i);
      my.done++;
      combine(my);
      changed();
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, my.parts) }, worker));
  if (job !== my) return;
  combine(my);
  const ok = my.results.filter((r) => r && !r.error);
  if (!ok.length) { my.status = 'error'; my.error = my.results.find((r) => r?.error)?.error || t('err.photo_failed'); changed(); return; }
  if (my.parts === 1) my.summary = ok[0].summary || '';
  else if (my.lines.length) {
    my.status = 'summary'; changed();
    my.summary = await photoSummary({ me: my.me, lines: my.lines }) || ok.find((r) => r.summary)?.summary || '';
  }
  if (job !== my) return;
  my.status = 'done';
  changed();
}

// ---------- 화면 ----------
const sayLine = (line) => {
  unlockSpeech();
  if (CODES.includes(line.lang)) speak(line.text, line.lang);
  else toast(t('photo.noVoice'));
};

async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  copyText(text);
}

function viewer(src) {
  const close = () => { el.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const el = h('div', { class: 'photo-viewer', role: 'dialog', 'aria-label': t('photo.title'), onclick: close },
    h('img', { src, alt: '' }),
    h('button', { class: 'btn round ghost photo-viewer-close', type: 'button', 'aria-label': t('common.close') }, icon('close', 28)));
  document.addEventListener('keydown', esc);
  document.body.append(el);
}

export default {
  render(root) {
    const me = state.settings.me;
    const box = h('div', { class: 'photo-page' });
    root.append(box);

    function lineCard(line, mine) {
      const reading = state.settings.reading && CODES.includes(line.lang) ? readingFor(line.text, line.lang, me, line.read) : '';
      const saved = M.hasPhotoLine(mine, line);
      const btn = (name, label, onclick, extra = '') => h('button', { class: `icon-btn sm${extra}`, type: 'button', 'aria-label': label, title: label, onclick }, icon(name, 18));
      return h('div', { class: `photo-line card${isPriceOnly(line.text) ? ' price' : ''}` },
        h('button', { class: 'photo-main', type: 'button', onclick: () => sayLine(line), 'aria-label': `${t('common.speak')}: ${line.text}` },
          h('div', { class: 'photo-orig', lang: CODES.includes(line.lang) ? line.lang : null }, line.text),
          reading ? h('div', { class: 'b-reading' }, reading) : null,
          line.tr ? h('div', { class: 'photo-tr', lang: me }, line.tr) : null,
          line.check === 'script' ? h('div', { class: 'photo-check' }, t('photo.textOdd'))
            : !line.tr && line.check ? h('div', { class: 'photo-check' }, t('photo.trDropped')) : null),
        h('div', { class: 'photo-acts' },
          btn('speaker', t('common.speak'), () => sayLine(line)),
          btn('copy', t('common.copy'), () => copyText(lineText(line))),
          btn('share', t('photo.share'), () => shareText(lineText(line))),
          btn(saved ? 'starOn' : 'star', t(saved ? 'mine.unstar' : 'mine.star'), () => {
            const list = M.loadMine();
            if (!saved && list.length >= M.MAX_MINE) { toast(t('mine.full', { max: M.MAX_MINE }), 'bad'); return; }
            M.saveMine(M.togglePhotoLine(list, line, me));
            toast(t(saved ? 'mine.removed' : 'mine.saved'), saved ? '' : 'ok');
            draw();
          }, ` star${saved ? ' on' : ''}`)));
    }

    function progress(j) {
      if (j.wait) return h('div', { class: 'photo-status' }, h('span', { class: 'dots' }), t('photo.waiting', { s: j.wait }));
      const key = j.status === 'preparing' ? 'photo.preparing' : j.status === 'summary' ? 'photo.summarizing' : j.parts > 1 ? 'photo.readingPart' : 'photo.reading';
      return h('div', { class: 'photo-status', role: 'status' }, h('span', { class: 'dots' }), t(key, { n: j.done, total: j.parts }),
        j.parts > 1 && j.status === 'reading' ? h('div', { class: 'photo-bar' }, h('span', { style: { width: `${Math.round(((j.done + 0.3) / j.parts) * 100)}%` } })) : null,
        j.status === 'reading' && j.parts <= 1 ? h('span', { class: 'muted small' }, t('photo.readingHint')) : null);
    }

    function draw() {
      const j = job;
      const head = h('div', { class: 'row gap photo-top' },
        h('a', { class: 'icon-btn', href: '#/text', 'aria-label': t('photo.back') }, icon('back')),
        h('h1', { class: 'page-title' }, t('photo.title')),
        h('span', { class: 'spacer' }),
        j && j.status !== 'preparing' ? h('button', { class: 'btn soft sm', type: 'button', onclick: openPhotoPicker }, icon('camera', 18), t('photo.again')) : null);
      if (!j) {
        box.replaceChildren(head, h('div', { class: 'empty' },
          h('div', { class: 'empty-icon' }, '📷'),
          h('p', null, t('photo.empty')),
          h('p', { class: 'muted small' }, t('photo.pickHint', { lang: langName(me) })),
          h('button', { class: 'btn primary', type: 'button', onclick: openPhotoPicker }, t('photo.button'))));
        return;
      }
      const busy = j.status === 'preparing' || j.status === 'reading' || j.status === 'summary';
      const mine = M.loadMine();
      const lines = j.lines;
      const nothing = j.status === 'done' && !lines.length;
      // 사진은 한 번만 만들어 두고 다시 그릴 때 그대로 쓴다 (조각이 올 때마다 깜빡이지 않게)
      if (j.preview && !j.thumb) j.thumb = h('button', { class: 'photo-thumb card', type: 'button', 'aria-label': t('photo.viewPhoto'), onclick: () => viewer(j.preview) }, h('img', { src: j.preview, alt: '' }));
      box.replaceChildren(...[
        head,
        j.thumb,
        busy ? progress(j) : null,
        j.status === 'error' ? h('div', { class: 'card' },
          h('div', { class: 'b-error' }, j.error),
          h('div', { class: 'row gap mt' },
            j.file ? h('button', { class: 'btn primary sm', type: 'button', onclick: () => startPhoto(j.file) }, t('common.retry')) : null,
            h('button', { class: 'btn ghost sm', type: 'button', onclick: openPhotoPicker }, t('photo.again')))) : null,
        lines.length || nothing ? h('p', { class: 'photo-warn' }, '⚠️ ', t('photo.warning')) : null,
        j.truncated && j.status !== 'preparing' ? h('p', { class: 'photo-note' }, t('photo.tooLong', { n: j.parts })) : null,
        j.failed && !busy && j.status !== 'error' ? h('p', { class: 'photo-note' }, t('photo.partFailed', { n: j.failed, total: j.parts })) : null,
        j.summary ? h('div', { class: 'card photo-summary' }, h('div', { class: 'set-label small' }, '📝 ', t('photo.summary')), h('div', { lang: me }, j.summary)) : null,
        nothing ? h('div', { class: 'empty photo-none' },
          h('div', { class: 'empty-icon' }, '🔍'),
          h('p', null, t(j.dropped ? 'photo.unreadable' : 'photo.noText')),
          h('p', { class: 'muted small' }, t('photo.noTextHint'))) : null,
        lines.length ? h('div', { class: 'row between photo-head' },
          h('div', null, h('b', null, t('photo.lines', { n: lines.length })), h('div', { class: 'muted small' }, t('photo.tapHint'))),
          h('button', { class: 'btn ghost sm', type: 'button', onclick: () => copyText(allText(lines, j.summary)) }, icon('copy', 16), t('photo.copyAll'))) : null,
        ...lines.map((l) => lineCard(l, mine)),
      ].filter(Boolean));
    }

    redraw = draw;
    draw();
    return () => { if (redraw === draw) redraw = null; };
  },
};
