// 중국어 병음: 음절 나누기 · 한글 표기 · 화면 표시 (화면과 서버가 같이 쓴다 — 서버는 받은 병음의 음절 수가 한자 수와 맞는지 볼 때)
// 한글 표기는 국립국어원 외래어 표기법 「중국어의 주음 부호와 한글 대조표」를 따른다:
//   Běijīng → 베이징, Shànghǎi → 상하이, xièxie → 셰셰, duōshao qián → 둬사오 첸, Xí Jìnpíng → 시진핑
//   (ㅈ·ㅉ·ㅊ 뒤의 ㅑ·ㅖ·ㅛ·ㅠ는 ㅏ·ㅔ·ㅗ·ㅜ로: jiā → 자, jiě → 제, jiǔ → 주). 성조는 한글에 적지 않고 병음으로 같이 보인다.

// 표준 중국어 음절 (성조 없이). lue · nue는 lüe · nüe를 잘못 쓴 것도 받아 준다
const SYLLABLES = new Set(`
a ai an ang ao e ei en eng er o ou
yi ya yo ye yao you yan yin yang ying yong yu yue yuan yun wu wa wo wai wei wan wen wang weng
ba bai ban bang bao bei ben beng bi biao bie bian bin bing bo bu
pa pai pan pang pao pei pen peng pi piao pie pian pin ping po pou pu
ma mai man mang mao me mei men meng mi miao mie mian min ming miu mo mou mu
fa fan fang fei fen feng fo fou fu
da dai dan dang dao de dei den deng di dia diao die dian ding diu dong dou du duo dui duan dun
ta tai tan tang tao te tei teng ti tiao tie tian ting tong tou tu tuo tui tuan tun
na nai nan nang nao ne nei nen neng ni niao nie nian nin niang ning niu nong nou nu nuo nuan nun nü nüe nue
la lai lan lang lao le lei leng li lia liao lie lian lin liang ling liu lo long lou lu luo luan lun lü lüe lue
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
ji jia jiao jie jian jin jiang jing jiong jiu ju jue juan jun
qi qia qiao qie qian qin qiang qing qiong qiu qu que quan qun
xi xia xiao xie xian xin xiang xing xiong xiu xu xue xuan xun
zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo
cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo
sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo
ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo
ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo
sa sai san sang sao se sen seng si song sou su suan sui sun suo
`.trim().split(/\s+/));

/** 성조 부호를 뗀 소문자 (ü는 남긴다, v · u: 는 ü로) */
const plain = (w) => w.normalize('NFD').replace(/[\u0300\u0301\u0304\u030c]/g, '').normalize('NFC').toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü');

/** 한 낱말(성조 없음)을 음절로: 긴 음절부터 맞춰 보고, 뒤가 안 풀리면 짧게. 끝의 r은 얼화(nǎr · yìdiǎnr). 못 나누면 null */
function splitPlain(w) {
  const memo = new Map();
  const go = (i) => {
    if (i === w.length) return [];
    if (memo.has(i)) return memo.get(i);
    let res = null;
    for (let len = Math.min(6, w.length - i); len >= 1 && !res; len--) {
      const s = w.slice(i, i + len);
      if (SYLLABLES.has(s)) { const rest = go(i + len); if (rest) res = [s, ...rest]; }
    }
    if (!res && i > 0 && w.slice(i) === 'r') res = ['r'];
    memo.set(i, res);
    return res;
  };
  return go(0);
}

// 병음 낱말: 글자(성조 부호 포함)와 낱말 안의 '(Xī'ān)
const WORD = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;
/** 병음 낱말 하나 → 음절 목록. 병음이 아니면(WiFi · iPhone 같은 것) null */
export function splitPinyinWord(word) {
  if (/[A-Z]/.test(word.slice(1))) return null; // 가운데 대문자: 영어 이름
  const out = [];
  for (const piece of plain(word).split(/['’]/)) {
    const syls = splitPlain(piece);
    if (!syls) return null;
    out.push(...syls);
  }
  return out;
}

/** 병음 글에 든 음절 수 (병음이 아닌 낱말은 세지 않는다) */
export function pinyinSyllableCount(pinyin) {
  let n = 0;
  for (const w of String(pinyin ?? '').match(WORD) || []) n += splitPinyinWord(w)?.length || 0;
  return n;
}
/** 한자 수 */
export const hanCount = (text) => (String(text ?? '').match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;

// ---------- 병음 → 한글 ----------
// 한글 음절 = 0xAC00 + (초성 × 21 + 중성) × 28 + 종성
const INITIAL = { b: 7, p: 17, m: 6, f: 17, d: 3, t: 16, n: 2, l: 5, g: 0, k: 15, h: 18, j: 12, q: 14, x: 9, zh: 12, ch: 14, sh: 9, r: 5, z: 13, c: 14, s: 10 };
const A = 0, E = 5, YA = 2, EO = 4, YE = 7, O = 8, WA = 9, YO = 12, U = 13, WO = 14, WE = 15, WI = 16, YU = 17, EU = 18, I = 20; // 중성
const N = 4, L = 8, NG = 21; // 받침 ㄴ · ㄹ · ㅇ
// 운모 → 한글 덩이 [[중성, 받침], …] (첫 덩이에 성모, 다음 덩이는 ㅇ으로)
const FINALS = {
  a: [[A]], o: [[O]], e: [[EO]], ê: [[E]], er: [[EO, L]],
  ai: [[A], [I]], ei: [[E], [I]], ao: [[A], [O]], ou: [[EO], [U]],
  an: [[A, N]], en: [[EO, N]], ang: [[A, NG]], eng: [[EO, NG]], ong: [[U, NG]],
  i: [[I]], ɨ: [[EU]], // ɨ: zh · ch · sh · r · z · c · s 뒤의 i (즈 · 츠 · 스 · 르 · 쯔 · 츠 · 쓰)
  ia: [[YA]], io: [[YO]], ie: [[YE]], iao: [[YA], [O]], iu: [[YU]], ian: [[YE, N]], in: [[I, N]], iang: [[YA, NG]], ing: [[I, NG]], iong: [[YU, NG]],
  u: [[U]], ua: [[WA]], uo: [[WO]], uai: [[WA], [I]], ui: [[U], [I]], uan: [[WA, N]], un: [[U, N]], uang: [[WA, NG]],
  wei: [[WE], [I]], wen: [[WO, N]], weng: [[WO, NG]], // 성모 없이 홀로 쓸 때 (웨이 · 원 · 웡 ↔ 두이 · 둔)
  ü: [[WI]], üe: [[WE]], üan: [[WI], [A, N]], ün: [[WI, N]],
};
// 성모 없는 음절의 y · w 표기 → 운모
const ZERO = {
  yi: 'i', ya: 'ia', yo: 'io', ye: 'ie', yao: 'iao', you: 'iu', yan: 'ian', yin: 'in', yang: 'iang', ying: 'ing', yong: 'iong',
  yu: 'ü', yue: 'üe', yuan: 'üan', yun: 'ün', wu: 'u', wa: 'ua', wo: 'uo', wai: 'uai', wan: 'uan', wang: 'uang',
};
const PLAIN_AFTER_PALATAL = { [YA]: A, [YE]: E, [YO]: O, [YU]: U }; // ㅈ · ㅉ · ㅊ 뒤

function syllableHangul(syl) {
  const ini = (/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/.exec(syl) || [])[1] || '';
  let fin = ini ? syl.slice(ini.length) : (ZERO[syl] || syl);
  if (ini && 'jqx'.includes(ini)) fin = fin.replace(/^u/, 'ü');
  if ((ini === 'n' || ini === 'l') && fin === 'ue') fin = 'üe';
  if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(ini) && fin === 'i') fin = 'ɨ';
  const parts = FINALS[fin];
  if (!parts) return syl;
  return parts.map(([v, t = 0], k) => {
    const L0 = k || !ini ? 11 : INITIAL[ini];
    const vowel = !k && [12, 13, 14].includes(L0) ? PLAIN_AFTER_PALATAL[v] ?? v : v;
    return String.fromCharCode(0xac00 + (L0 * 21 + vowel) * 28 + t);
  }).join('');
}

/** 병음 → 한글 발음 (낱말 띄어쓰기 · 구두점은 그대로, 병음이 아닌 낱말도 그대로). 예) Nǐ hǎo! → 니 하오! */
export function pinyinToHangul(pinyin) {
  return String(pinyin ?? '').replace(WORD, (w) => {
    const syls = splitPinyinWord(w);
    if (!syls) return w;
    let out = '';
    for (const s of syls) {
      if (s === 'r') { // 얼화: 앞 음절에 ㄹ 받침 (받침이 이미 있으면 그대로)
        const last = out.charCodeAt(out.length - 1) - 0xac00;
        if (last >= 0 && last % 28 === 0) out = out.slice(0, -1) + String.fromCharCode(0xac00 + last + L);
        continue;
      }
      out += syllableHangul(s);
    }
    return out;
  });
}

/** 화면에 보일 병음: 문장 첫 글자는 대문자로 (nǐ hǎo. → Nǐ hǎo.) */
export const pinyinText = (pinyin) => String(pinyin ?? '').trim().replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
