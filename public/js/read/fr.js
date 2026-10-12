// 프랑스어 읽는 법 (v1.6.0, 추가지시 2): 철자와 소리가 많이 달라 한국어 사용자에게 한글 발음을 보여 준다 (서버 없이 화면에서 규칙으로).
// 라틴 문자라 다른 사용자에게는 로마자를 따로 적지 않는다 (roman 없음).
//
// 1) 철자 → 소리: 끝 묵음 자음(s t d x z p g · -e · -es) · -er/-ez → é · 비모음(an/en/am/em → 앙, in/ain/ein/im → 앵, on/om → 옹, un/um → 욍) ·
//    eau/au → o · ou → u · oi → wa · ai/ei → e · eu/œu → ø · gn → ɲ · ill → j · ch → ʃ · qu → k · ç/c(e·i) → s · g(e·i) → ʒ · 모음 사이 s → z ·
//    -tion → sjɔ̃ · 낱말 가운데 약한 e 빠짐(seulement 쇨망 · acheter 아슈테)
// 2) 이어 읽기: 엘리지옹(l'addition 라디시옹 · s'il 실) · 연음(les amis 레 자미 · vous avez 부 자베 · un ami 욍 나미) · 붙임표 낱말(Champs-Élysées 샹젤리제)
// 3) 소리 → 한글: 국립국어원 외래어 표기법 「국제 음성 기호와 한글 대조표」 · 제3장 제4절 프랑스어 —
//    끝 · 자음 앞 [p t k]는 '프 트 크', 단 짧은 모음과 무성 자음 사이는 받침(악시옹 · 셉탕브르) · [ʃ] 끝 '슈', 모음 앞 '샤 셰 시 쇼 슈' ·
//    [ʒ] 끝 '주' · [ɲ] 끝 '뉴', 모음 앞 '냐 녜 뇨 뉴' · [j] 끝 '유', 모음 사이 '예 야 요', 그 밖 '이' · [w] '우'(자음 없이 오면 와 · 웨 · 위) ·
//    [ɥ] '위' · [l] 모음 앞 ㄹㄹ · [ʁ] 끝 · 자음 앞 '르' · [ə] '으'(ʃ · ʒ 뒤는 슈 · 주) · [y] 위 · [ø œ] 외
//    잘 알려진 표기: Paris 파리 · Bonjour 봉주르 · Merci 메르시 · croissant 크루아상 · Bordeaux 보르도 · Lyon 리옹 · combien 콩비앵

const VL = 'aeiouyàâäéèêëîïôöùûüœæ';
const isVL = (c) => Boolean(c) && VL.includes(c);
const SOFT = 'eéèêëiîïy';
const LIQUID = /^(?:[bcdfgkptv][lr]|ch|ph|th|gn|qu|gu)$/;

// 소리 기호: 모음 a e i o u(ou) y(u) ø(eu) ə · 비모음 A(an) E(in) O(on) U(un) · 반모음 j w ɥ · 자음 p b t d k g f v s z ʃ ʒ m n ɲ l r
const VOWEL_PH = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'ø', 'ə', 'A', 'E', 'O', 'U']);
const isV = (p) => VOWEL_PH.has(p);
const isC = (p) => Boolean(p) && !isV(p) && !'jwɥ'.includes(p);

// 따로 읽는 낱말 (철자 규칙으로 안 되는 흔한 것)
const WORDS = Object.fromEntries(Object.entries({
  est: 'e', et: 'e', es: 'e', les: 'l e', des: 'd e', mes: 'm e', tes: 't e', ses: 's e', ces: 's e', aux: 'o', eux: 'ø',
  cest: 's e', cet: 's e', oui: 'w i', eu: 'y', août: 'u t', hier: 'j e r',
  monsieur: 'm ə s j ø', messieurs: 'm e s j ø', femme: 'f a m', fils: 'f i s', six: 's i s', dix: 'd i s', huit: 'ɥ i t',
  sept: 's e t', neuf: 'n ø f', cinq: 's E k', vingt: 'v E', cent: 's A', mille: 'm i l', ville: 'v i l', village: 'v i l a ʒ',
  tranquille: 't r A k i l', lille: 'l i l', bus: 'b y s', wifi: 'w i f i', ok: 'o k e', second: 's ə g O', seconde: 's ə g O d',
  oignon: 'o ɲ O', pays: 'p e i', yeux: 'j ø', gentil: 'ʒ A t i', vietnam: 'v j e t n a m', taïwan: 't a i w a n', parfum: 'p a r f U',
  mer: 'm e r', cher: 'ʃ e r', chère: 'ʃ e r', fer: 'f e r', hiver: 'i v e r', super: 's y p e r', amer: 'a m e r', ver: 'v e r',
  plus: 'p l y', tous: 't u', fait: 'f e', renault: 'r ə n o', peugeot: 'p ø ʒ o',
}).map(([w, p]) => [w, p.split(' ')]));

// 연음: 다음 낱말이 모음으로 시작하면 끝소리를 넘긴다 (les amis 레 자미)
const LIAISON = {};
for (const w of 'les des ces mes tes ses nos vos leurs aux eux nous vous ils elles quels quelles deux trois six dix très plus chez dans sans'.split(' ')) LIAISON[w] = 'z';
for (const w of 'est sont cest cet tout petit grand quand dont comment'.split(' ')) LIAISON[w] = 't';
for (const w of 'un mon ton son en on aucun'.split(' ')) LIAISON[w] = 'n'; // bien · rien 뒤는 하기도 안 하기도 해서 뺀다

/** 낱말 하나(소문자, 아포스트로피 · 붙임표 없음) → { ph: 소리 기호들, silent: 끝의 묵음 자음 글자 } */
function g2p(w) {
  if (WORDS[w]) return { ph: WORDS[w], silent: '' };
  const s = w, n = s.length;
  const sil = new Array(n).fill(false);
  const keep = new Array(n).fill(false);
  const asE = new Array(n).fill(false); // -er · -ez · -et 의 e → é
  const vowelsBefore = (k) => [...s.slice(0, k)].some(isVL);
  // 끝 -e · -es (여러 음절이면 묵음, 그 앞 자음은 소리 남: tête 테트 · toilettes 투알레트)
  const endSil = /es$/.test(s) && vowelsBefore(n - 2) ? 2 : /e$/.test(s) && vowelsBefore(n - 1) ? 1 : 0;
  for (let k = n - endSil; k < n; k++) sil[k] = true;
  if (endSil) for (let k = n - endSil - 1; k >= 0 && !isVL(s[k]); k--) keep[k] = true;
  // -er(s) · -ez · -et(s) (envers · univers의 -vers는 [vɛʁ])
  let m;
  if ((m = s.match(/er(s?)$/)) && n > 3 && !/vers$/.test(s)) { const e = n - 2 - m[1].length; asE[e] = true; for (let k = e + 1; k < n; k++) sil[k] = true; }
  else if (/ez$/.test(s) && n > 2) { asE[n - 2] = true; sil[n - 1] = true; }
  else if ((m = s.match(/et(s?)$/)) && n > 3) { const e = n - 2 - m[1].length; asE[e] = true; for (let k = e + 1; k < n; k++) sil[k] = true; }
  // 끝 묵음 자음 (s t d x z p g, 비모음 뒤 c) — c r f l q k b 등은 소리 남
  for (let k = n - 1; k >= 0 && !isVL(s[k]); k--) {
    if (sil[k] || keep[k]) continue;
    if ('stdxzpg'.includes(s[k]) || (s[k] === 'c' && s[k - 1] === 'n')) sil[k] = true;
    else break;
  }
  const silent = [...s].map((c, k) => (sil[k] && !isVL(c) ? c : '')).join('').slice(-1);

  const out = [];
  const nasalAt = (j) => 'nm'.includes(s[j] || '_') && !isVL(s[j + 1]) && s[j + 1] !== 'n' && s[j + 1] !== 'm';
  const ILL_PLAIN = /^(?:vill|mill|tranquill|lill|distill|oscill)/.test(s);
  let i = 0;
  while (i < n) {
    if (sil[i]) { i++; continue; }
    const c = s[i], c1 = s[i + 1] || '', c2 = s[i + 2] || '';
    const rest = s.slice(i);
    // ---------- 모음 ----------
    if (rest.startsWith('eau')) { out.push('o'); i += 3; continue; }
    if (c === 'a' || c === 'à' || c === 'â') {
      if (c === 'a' && c1 === 'u') { out.push('o'); i += 2; continue; }
      if (c === 'a' && (c1 === 'i' || c1 === 'î') && (rest.startsWith('aill') || rest === 'ail')) { out.push('a'); i++; continue; }
      if (c === 'a' && c1 === 'i' && nasalAt(i + 2)) { out.push('E'); i += 3; continue; }
      if (c === 'a' && (c1 === 'i' || c1 === 'î')) { out.push('e'); i += 2; continue; }
      if (c === 'a' && c1 === 'y') { out.push('e'); if (isVL(c2)) out.push('j'); i += 2; continue; }
      if (c === 'a' && nasalAt(i + 1)) { out.push('A'); i += 2; continue; }
      out.push('a'); i++; continue;
    }
    if (c === 'e' || c === 'œ') {
      if (c === 'œ' || (c1 === 'u' || c1 === 'û')) {
        out.push('ø'); i += c === 'œ' && c1 === 'u' ? 2 : c === 'œ' ? 1 : 2; continue;
      }
      if (c1 === 'i' && (rest.startsWith('eill') || rest === 'eil')) { out.push('e'); i++; continue; }
      if (c1 === 'i' && nasalAt(i + 2)) { out.push('E'); i += 3; continue; }
      if (c1 === 'i' || c1 === 'î') { out.push('e'); i += 2; continue; }
      if (c1 === 'y') { out.push('e'); if (isVL(c2)) out.push('j'); i += 2; continue; }
      // en: 보통 앙, -ien(s) · -éen · -yen 은 앵 (bien 비앵 · coréen 코레앵 · moyen) — -ience · -ient 은 앙 (science)
      if (nasalAt(i + 1) && !asE[i]) { out.push('iéy'.includes(s[i - 1]) && /^(?:s?$)/.test(s.slice(i + 2)) ? 'E' : 'A'); i += 2; continue; }
      out.push(eSound(s, i, asE, sil)); i++; continue;
    }
    if ('éèêë'.includes(c)) { out.push('e'); i++; continue; }
    if (c === 'o' || c === 'ô') {
      if (c === 'o' && (c1 === 'u' || c1 === 'ù' || c1 === 'û')) {
        if (s.slice(i + 2, i + 5) === 'ill') { out.push('u'); i += 2; continue; }
        if (isVL(c2) && !sil[i + 2]) { out.push('w'); i += 2; continue; } // jouer · ouest
        out.push('u'); i += 2; continue;
      }
      if (c === 'o' && c1 === 'i' && nasalAt(i + 2)) { out.push('w', 'E'); i += 3; continue; }
      if (c === 'o' && (c1 === 'i' || c1 === 'î')) { out.push('w', 'a'); i += 2; continue; }
      if (c === 'o' && c1 === 'y') { out.push('w', 'a'); if (isVL(c2)) out.push('j'); i += 2; continue; }
      if (c === 'o' && c1 === 'o') { out.push('u'); i += 2; continue; }
      if (c === 'o' && nasalAt(i + 1)) { out.push('O'); i += 2; continue; }
      out.push('o'); i++; continue;
    }
    if (c === 'i' || c === 'î' || c === 'ï' || c === 'y') {
      if (c === 'i' && c1 === 'l' && c2 === 'l' && !ILL_PLAIN) { if (!isVL(s[i - 1])) out.push('i'); out.push('j'); i += 3; continue; } // fille · travailler
      if (c === 'i' && c1 === 'l' && i + 2 === n && isVL(s[i - 1])) { out.push('j'); i += 2; continue; }                // soleil · travail
      if ((c === 'i' || c === 'y') && nasalAt(i + 1)) { out.push('E'); i += 2; continue; }
      if ((c === 'i' || c === 'y') && isVL(c1) && !sil[i + 1]) { out.push('j'); i++; continue; }                          // piano · Lyon · -tion
      out.push('i'); i++; continue;
    }
    if (c === 'u' || c === 'û' || c === 'ù' || c === 'ü') {
      if (c === 'u' && rest === 'um' && n > 3) { out.push('o', 'm'); i += 2; continue; }  // minimum · album (라틴말)
      if (c === 'u' && nasalAt(i + 1)) { out.push('U'); i += 2; continue; }
      if (c === 'u' && rest.startsWith('ueil')) { out.push('ø', 'j'); i += 4; continue; }  // accueil
      if (c === 'ù') { out.push('u'); i++; continue; }
      if (c === 'u' && c1 === 'i') { out.push('ɥ'); i++; continue; }                           // huit · nuit · cuisine
      if (c === 'u' && isVL(c1) && !sil[i + 1]) { out.push('ɥ'); i++; continue; }              // nuage
      out.push('y'); i++; continue;
    }
    // ---------- 자음 ----------
    if (c === 'h') { i++; continue; }
    if (c === c1 && !'cs'.includes(c) && !isVL(c)) { i++; continue; } // 겹자음은 한 번 (다음 글자가 읽는다)
    switch (c) {
      case 'c':
        if (c1 === 'h') { out.push(c2 === 'r' || c2 === 'l' ? 'k' : 'ʃ'); i += 2; continue; }
        if (c1 === 'k') { out.push('k'); i += 2; continue; }
        if (c1 === 'c') { out.push(...(SOFT.includes(c2) ? ['k', 's'] : ['k'])); i += 2; continue; }
        out.push(SOFT.includes(c1) && c1 ? 's' : 'k'); i++; continue;
      case 'ç': out.push('s'); i++; continue;
      case 'g':
        if (c1 === 'n') { out.push('ɲ'); i += 2; continue; }
        if (c1 === 'u' && SOFT.includes(c2) && c2) { out.push('g'); i += 2; continue; }
        if (c1 === 'e' && 'aouâô'.includes(c2) && c2) { out.push('ʒ'); i += 2; continue; }
        out.push(SOFT.includes(c1) && c1 ? 'ʒ' : 'g'); i++; continue;
      case 'j': out.push('ʒ'); i++; continue;
      case 'p': out.push(c1 === 'h' ? 'f' : 'p'); i += c1 === 'h' ? 2 : 1; continue;
      case 'q': out.push('k'); i += c1 === 'u' ? 2 : 1; continue;
      case 't':
        if (/^ti(?:on|el|al|en[ct])/.test(rest) && s[i - 1] !== 's') { out.push('s'); i++; continue; }
        out.push('t'); i += c1 === 'h' ? 2 : 1; continue;
      case 's':
        if (c1 === 'c' && c2 === 'h') { out.push('ʃ'); i += 3; continue; }
        if (c1 === 's') { out.push('s'); i += 2; continue; }
        if (c1 === 'c' && SOFT.includes(c2) && c2) { out.push('s'); i += 2; continue; }
        out.push(isVL(s[i - 1]) && isVL(c1) ? 'z' : 's'); i++; continue;
      case 'x':
        if (i === 1 && s[0] === 'e' && isVL(c1)) out.push('g', 'z'); else out.push('k', 's');
        i++; continue;
      case 'w': out.push('w'); i++; continue;
      case 'r': out.push('r'); i++; continue;
      default:
        if ('bdfklmnvz'.includes(c)) out.push(c);
        i++;
    }
  }
  return { ph: out, silent };
}

/** 받침 없는 e(약한 모음 자리)의 소리: 낱말 끝 → ə(한 음절 낱말), 자음 하나 + 모음 앞 → ə, 자음 둘 이상 · 끝 자음 → e */
function eSound(s, i, asE, sil) {
  if (asE[i]) return 'e';
  let j = i + 1;
  while (j < s.length && !isVL(s[j])) j++;
  const cons = s.slice(i + 1, j);
  if (!cons) return i === s.length - 1 ? 'ə' : 'e';
  if (j >= s.length || [...cons].every((_, k) => sil[i + 1 + k])) return 'e';
  if (cons.length === 1) return cons === 'x' ? 'e' : 'ə';
  return LIQUID.test(cons) ? 'ə' : 'e';
}

/** 낱말 가운데 약한 e 빠짐: 모음 + 자음 하나 + ə + 자음 (seulement → sølmA · acheter → aʃte) */
function dropSchwa(ph) {
  const out = [];
  for (let k = 0; k < ph.length; k++) {
    if (ph[k] === 'ə' && k >= 2 && isC(ph[k - 1]) && isV(ph[k - 2]) && isC(ph[k + 1])) continue;
    out.push(ph[k]);
  }
  return out;
}

// ---------- 소리 → 한글 ----------
// 첫소리 번호 (ㄱ0 ㄴ2 ㄷ3 ㄹ5 ㅁ6 ㅂ7 ㅅ9 ㅇ11 ㅈ12 ㅋ15 ㅌ16 ㅍ17)
const ONSET = { p: 17, b: 7, t: 16, d: 3, k: 15, g: 0, f: 17, v: 7, s: 9, z: 12, ʃ: 9, ʒ: 12, m: 6, n: 2, ɲ: 2, l: 5, r: 5 };
// 모음 → [중성, 받침] (ㅏ0 ㅐ1 ㅑ2 ㅒ3 ㅔ5 ㅖ7 ㅗ8 ㅘ9 ㅚ11 ㅛ12 ㅜ13 ㅝ14 ㅞ15 ㅟ16 ㅠ17 ㅡ18 ㅣ20 · ㅇ받침 21)
const V = { a: [0], e: [5], i: [20], o: [8], u: [13], y: [16], ø: [11], ə: [18], A: [0, 21], E: [1, 21], O: [8, 21], U: [11, 21] };
const VY = { a: [2], e: [7], i: [20], o: [12], u: [17], y: [16], ø: [11], ə: [17], A: [2, 21], E: [3, 21], O: [12, 21], U: [11, 21] }; // ʃ · ɲ · 모음 사이 j 뒤
const VZ = { ...V, ə: [13] };                                                                                                    // ʒ 뒤 (je 주)
const VW = { a: [9], e: [15], i: [16], o: [14], u: [13], y: [16], ø: [15], ə: [13], A: [9, 21], E: [10, 21], O: [14, 21], U: [15, 21] }; // 자음 없이 오는 w
const VOICELESS = new Set(['p', 't', 'k', 'f', 's', 'ʃ']);
const compose = (x) => String.fromCharCode(0xac00 + (x.L * 21 + x.V) * 28 + x.T);

function syllables(ph) {
  const syl = [];
  const push = (L, [Vi, T = 0], extra = {}) => syl.push({ L, V: Vi, T, ...extra });
  let edge = false; // 붙임표 경계 바로 뒤
  for (let i = 0; i < ph.length; i++) {
    const p = ph[i], n1 = ph[i + 1];
    if (p === '|') { edge = true; continue; }
    const atEdge = edge;
    edge = false;
    if (isV(p)) { push(11, V[p]); continue; }
    if (p === 'j') {
      if (isV(n1) && i > 0 && isV(ph[i - 1]) && n1 !== 'ø' && n1 !== 'ə') { push(11, VY[n1]); i++; continue; } // payer 페예
      push(11, isV(n1) || i < ph.length - 1 ? [20] : [17]);                                                     // 끝 j → 유 (travail 트라바유)
      continue;
    }
    if (p === 'w') {
      if (isV(n1)) { push(11, VW[n1]); i++; continue; } // oui 위 · ouest 웨스트
      push(11, [13]); continue;
    }
    if (p === 'ɥ') { push(11, [16]); if (n1 === 'i') i++; continue; }
    // 자음
    const prev = syl.at(-1);
    if (isV(n1)) {
      const table = p === 'ʃ' || p === 'ɲ' ? VY : p === 'ʒ' ? VZ : V;
      if (p === 'l' && prev && !prev.T && !atEdge) prev.T = 8; // 모음 앞 l → ㄹㄹ (Élysées 엘리제 · plage 플라주)
      push(ONSET[p], table[n1]);
      i++;
      continue;
    }
    if (n1 === 'j' && isV(ph[i + 2])) { if (p === 'l' && prev && !prev.T && !atEdge) prev.T = 8; push(ONSET[p], [20]); i++; continue; } // bien 비앵 · Lyon 리옹
    if (n1 === 'w') { if (p === 'l' && prev && !prev.T && !atEdge) prev.T = 8; push(ONSET[p], [13]); i++; continue; }                   // croissant 크루아상 · moi 무아
    if (n1 === 'ɥ') { push(ONSET[p], [16]); i += ph[i + 2] === 'i' ? 2 : 1; continue; }                                   // nuit 뉘 · cuisine 퀴진
    // 받침 또는 '으' 음절
    const open = prev && !prev.T && !prev.ep;
    if (p === 'm' && prev && !prev.T) { prev.T = 16; continue; }
    if (p === 'n' && prev && !prev.T) { prev.T = 4; continue; }
    if (p === 'l' && prev && !prev.T) { prev.T = 8; continue; }
    if ('ptk'.includes(p) && open && prev.V !== 18 && VOICELESS.has(n1)) { prev.T = { p: 17, t: 19, k: 1 }[p]; continue; } // 악시옹 · 셉탕브르
    if (p === 'ʃ') { push(9, [17], { ep: true }); continue; }  // 슈
    if (p === 'ʒ') { push(12, [13], { ep: true }); continue; } // 주
    if (p === 'ɲ') { push(2, [17], { ep: true }); continue; }  // 뉴
    push(ONSET[p] ?? 11, [18], { ep: true });
  }
  return syl.map(compose).join('');
}

const WORD = /[\p{L}'’-]+/gu;

// 엘리지옹: l' d' j' … 는 자음 소리만 다음 낱말 앞에 붙인다 (l'oignon 로뇽 · c'est 세 · s'il 실). aujourd'hui 같은 것은 한 낱말로
const ELIDE = { l: 'l', d: 'd', j: 'ʒ', m: 'm', n: 'n', s: 's', t: 't', c: 's', qu: 'k', jusqu: 'ʒ y s k', lorsqu: 'l o r s k', puisqu: 'p ɥ i s k' };
function elided(part) {
  const [a, b, ...more] = part.split("'");
  if (b && !more.length && ELIDE[a]) { const r = g2p(b); return { ph: [...ELIDE[a].split(' '), ...r.ph], silent: r.silent }; }
  return g2p(part.replace(/'/g, ''));
}

/** 프랑스어 글 → 한글 발음 (낱말 띄어쓰기 · 문장 부호 · 숫자는 그대로, 연음은 다음 낱말 첫소리로) */
export function frToHangul(text) {
  if (!text) return '';
  const src = String(text).normalize('NFC');
  const words = [...src.matchAll(WORD)];
  // 낱말마다 소리 (엘리지옹은 붙이고, 붙임표 낱말은 이어 읽는다)
  const items = words.map((m) => {
    const parts = m[0].toLowerCase().replace(/’/g, "'").split('-').filter(Boolean);
    let ph = [];
    let silent = '';
    parts.forEach((part, k) => {
      const r = elided(part);
      if (k && silent && isV(r.ph[0])) ph.push('sxz'.includes(silent) ? 'z' : 't'); // Champs-Élysées · comprend-il
      else if (k) ph.push('|');                                                      // 붙임표 경계 (Emballez-le 앙발레르: ㄹㄹ로 잇지 않음)
      ph.push(...r.ph);
      silent = r.silent;
    });
    return { m, ph, key: parts.join('').replace(/'/g, '') };
  });
  // 연음: 띄어쓰기만 사이에 있고 다음 낱말이 모음으로 시작하면
  for (let k = 0; k + 1 < items.length; k++) {
    const a = items[k], b = items[k + 1];
    const gap = src.slice(a.m.index + a.m[0].length, b.m.index);
    const link = LIAISON[a.key];
    if (link && /^\s+$/.test(gap) && b.ph.length && (isV(b.ph[0]) || 'jwɥ'.includes(b.ph[0]))) b.ph.unshift(link);
  }
  let out = '', last = 0;
  for (const it of items) {
    out += src.slice(last, it.m.index);
    const ph = dropSchwa(it.ph);
    out += ph.length ? syllables(ph) : it.m[0];
    last = it.m.index + it.m[0].length;
  }
  return out + src.slice(last);
}

export default {
  sound: false,
  hangul: (text) => frToHangul(text),
  roman: null,
};
