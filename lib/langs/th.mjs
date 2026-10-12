// 태국어 — 서버 쪽 정보 (번역 지시문 · 받아쓰기 · 숫자 읽기 · 소리 표기 · 사진 읽는 법). 모양은 ./index.mjs 설명
// 소리 표기(로마자) 방식 · 한글 바꾸기는 화면과 같은 것 (public/js/read/th.js — 모델 답을 점검할 때도 그 읽기를 쓴다)
import { cleanOutput, SCRIPT_RE } from '../text.mjs';
import { normalizeThaiRoman, thaiSoundStats } from '../../public/js/read/th.js';

// ---------- 숫자 ----------
// 낱말로 쓴 수: หนึ่ง 1 … เก้า 9, สิบ 10 (ยี่สิบ 20 · สิบเอ็ด 11), ร้อย 100, พัน 1000, หมื่น 1만, แสน 10만, ล้าน 100만.
// 띄어 쓰지 않아도 읽는다 (สองร้อยห้าสิบบาท = 250). พันห้า처럼 끝 단위를 줄인 말은 1500과 1005 둘 다.
// 다른 낱말 속의 같은 글자(สามารถ · ห้าง · ห้าม · เก้าอี้ · พันธุ์ · แสนดี)는 숫자로 보지 않는다:
// 한 낱말짜리 수는 뒤에 세는 말(บาท · ชิ้น · คน …)이나 띄어쓰기 · 문장 끝이 올 때만, 뒤 글자가 모음 · 성조 부호면 다른 음절의 일부.
const DIGIT = { ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5, หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9 };
const UNIT = { สิบ: 10, ร้อย: 100, พัน: 1000, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6 };
const WORDS = [...Object.keys(DIGIT), ...Object.keys(UNIT)];
const RUN_SRC = `(?:${WORDS.join('|')})+`;
const TOKEN = new RegExp(WORDS.join('|'), 'g');
const COUNTER = ['บาท', 'สตางค์', 'ชิ้น', 'อัน', 'ตัว', 'คน', 'ท่าน', 'ขวด', 'แก้ว', 'จาน', 'ถ้วย', 'ชาม', 'ห่อ', 'กล่อง', 'ถุง', 'แพ็ก', 'แพ็ค', 'แพค',
  'ลัง', 'โหล', 'คู่', 'ใบ', 'เล่ม', 'ด้าม', 'เส้น', 'แผ่น', 'ผืน', 'คัน', 'ลูก', 'เม็ด', 'ซอง', 'กระป๋อง', 'ชุด', 'เครื่อง', 'ห้อง', 'เตียง', 'ไม้',
  'ก้อน', 'ช้อน', 'แท่ง', 'ม้วน', 'ที่', 'วัน', 'คืน', 'เดือน', 'ปี', 'ชั่วโมง', 'ชม', 'นาที', 'วินาที', 'โมง', 'ทุ่ม', 'สัปดาห์', 'อาทิตย์', 'ครั้ง', 'รอบ',
  'กิโล', 'กก', 'กรัม', 'ลิตร', 'มิล', 'เมตร', 'เซน', 'ไซซ์', 'ไซส์', 'เปอร์เซ็นต์', 'ดอลลาร์', 'หยวน', 'วอน', 'เยน', 'ลีรา', 'รูเบิล', 'ยูโร', 'เท่า',
  'ล็อต', 'แบบ', 'สี', 'ฉบับ', 'หน่วย', 'ตลับ', 'หลอด', 'กระปุก', 'ถัง', 'กระสอบ', 'ตัน', 'นิ้ว', 'ฟุต', 'หลา', 'โล', 'ออเดอร์'];
const AFTER_OK = new RegExp(`^(?:$|[\\s\\d.,!?;:)\\]"'%/–—-]|[A-Za-z]|(?:${COUNTER.join('|')}))`);
const MARK = /^[ะ-ฺ็-๎]/;      // 모음 · 성조 부호 (앞 글자와 한 음절)
const NOT_NUMBER = /ผูกพัน|โกหก/g;                // 낱말 끝이 수 낱말과 같은 것 (묶다 · 거짓말)

/** 수 낱말 덩이 → 값들 (หนึ่งร้อยห้าสิบ → [150], พันห้า → [1005, 1500]) */
function runValues(tokens) {
  let total = 0, section = 0, num = null, lastUnit = 0, afterUnit = false;
  for (const t of tokens) {
    if (t in DIGIT) { num = DIGIT[t]; continue; }
    const u = UNIT[t];
    if (u === 1e6) { total = (total + section + (num ?? 0) || 1) * 1e6; section = 0; }
    else section += (num ?? 1) * u;
    num = null; lastUnit = u; afterUnit = true;
  }
  const plain = total + section + (num ?? 0);
  const alts = [plain];
  if (afterUnit && num && lastUnit >= 100) alts.push(total + section + num * (lastUnit / 10)); // พันห้า = 1500 (줄인 말)
  return alts;
}
/** 덩이를 숫자 하나씩으로: 수 글자가 단위 없이 이어지면(สามสี่วัน = 3~4일) 따로 */
function splitRun(tokens) {
  const out = [];
  let cur = [];
  for (const t of tokens) {
    if (t in DIGIT && cur.length && cur.at(-1) in DIGIT && t !== 'เอ็ด') { out.push(cur); cur = []; }
    cur.push(t);
  }
  out.push(cur);
  return out;
}

function numbers(text) {
  const s = String(text ?? '').replace(NOT_NUMBER, (w) => ' '.repeat(w.length));
  const out = [];
  for (const m of s.matchAll(new RegExp(RUN_SRC, 'g'))) {
    const run = m[0];
    const after = s.slice(m.index + run.length);
    if (/[เแโใไ]$/.test(s[m.index - 1] || '') || MARK.test(after)) continue; // 다른 음절의 일부
    const tokens = run.match(TOKEN);
    if (tokens[0] in UNIT && /[\d๐-๙]\s*$/.test(s.slice(0, m.index))) continue;          // 1.5 ล้าน: 숫자 쪽(decimals)이 센다
    if (tokens.length === 1 && (run === 'เอ็ด' || run === 'ยี่' || !AFTER_OK.test(after))) continue;
    for (const part of splitRun(tokens)) out.push({ alts: runValues(part), word: true });
  }
  return out;
}

// 소수로 읽는 말을 먼저 숫자로: 1.5 ล้าน = 1500000 · 2 กิโลครึ่ง = 2.5 · สองกิโลครึ่ง = 2.5 · พันครึ่ง = 1500 · ชั่วโมงครึ่ง = 1.5 · สองจุดห้า = 2.5
const HALF_UNIT = '(กิโลกรัม|กิโลเมตร|กิโล|ชั่วโมง|โมง|บาท|ลิตร|เมตร|ปี|เดือน|วัน|สัปดาห์|อาทิตย์|ชิ้น|อัน|แก้ว|ขวด|ช้อน|ถ้วย|จาน|นาที|โล)';
const round = (x) => Math.round(x * 1000) / 1000;
function decimals(text) {
  return String(text ?? '')
    .replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50))
    .replace(/(\d+(?:\.\d+)?)\s*(พัน|หมื่น|แสน|ล้าน)(?!ธ)/g, (m, n, u) => String(round(Number(n) * UNIT[u])))
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${HALF_UNIT}?\\s*ครึ่ง`, 'g'), (m, n, u = '') => `${round(Number(n) + 0.5)}${u}`)
    .replace(new RegExp(`(${RUN_SRC})${HALF_UNIT}?ครึ่ง`, 'g'), (m, run, u = '') => {
      const tokens = run.match(TOKEN);
      const v = runValues(tokens)[0];
      const big = !u && UNIT[tokens.at(-1)] >= 100 ? UNIT[tokens.at(-1)] / 2 : 0.5; // พันครึ่ง = 1000 + 500
      return `${round(v + big)}${u}`;
    })
    .replace(new RegExp(`(^|[^\\d.])${HALF_UNIT}ครึ่ง`, 'g'), (m, a, u) => `${a}1.5${u}`)
    .replace(new RegExp(`(${RUN_SRC})จุด((?:${Object.keys(DIGIT).join('|')})+)`, 'g'), (m, run, d) => `${runValues(run.match(TOKEN))[0]}.${d.match(TOKEN).map((t) => DIGIT[t]).join('')}`)
    .replace(/(\d+)\s*จุด\s*(\d+)/g, '$1.$2');
}

// ---------- 소리 표기 (/api/sound · 사진 읽기) ----------
const LABEL = /^\s*(?:romani[sz]ation|rtgs|reading|pronunciation|transliteration|คำอ่าน)\s*[:：-]\s*/i;
// 짧은 영어 낱말(nice · are · to)은 태국어 음절 꼴로도 읽혀서, 태국어 소리 표기에 나올 리 없는 흔한 영어 낱말을 따로 센다 (읽기 대신 번역한 답)
const ENGLISH = new Set(('the you your are is was were be been how what where when why who which this that these those it its of and for with have has '
  + 'nice meet thank thanks please very much many hello hi sorry excuse can could would will does did not yes okay good morning here there want need '
  + 'like buy sell cost price from they them their we our us he she his her him').split(' '));
/** 모델 답 → 로마자 소리 표기만. 타이 문자가 남았거나, 태국어 소리로 읽히는 낱말이 3/4이 안 되면(영어로 옮긴 답 등) 빈 값 */
function cleanSound(raw, text = '') {
  let s = cleanOutput(raw, text).split('\n')[0].replace(LABEL, '');
  s = s.replace(/[(（][^)）]*[฀-๿][^)）]*[)）]/g, ' ');   // (สวัสดี) 같은 원문 덧붙임
  s = normalizeThaiRoman(s).replace(/฿/g, ' ').replace(/[“”«»]/g, '"').replace(/\s+/g, ' ').replace(/\s+([,.?!:;])/g, '$1').trim();
  if (SCRIPT_RE.Thai.test(s) || !/^[\p{Script=Latin}0-9\s,.?!:;'’"()%\-–—…/&+]+$/u.test(s)) return '';
  const { words, parsed } = thaiSoundStats(s, text);
  const english = (s.toLowerCase().match(/[a-z]+/g) || []).filter((w) => ENGLISH.has(w)).length;
  return words && parsed - english >= words * 0.75 ? s : '';
}
/** 음절 수가 글 길이에 맞나 (모델이 뒤를 빼먹거나 덧붙였는지 — 넉넉하게): 자음 글자 4개에 1음절 이상, 자음 글자 수 이하 */
function soundMatches(sound, text) {
  const t = String(text ?? '');
  const consonants = (t.match(/[ก-ฮ]/g) || []).length;
  const extra = (t.match(/ๆ/g) || []).length * 3 + (t.match(/ฯ/g) || []).length * 8 + (t.match(/[0-9๐-๙]/g) || []).length * 4 + (t.match(/[A-Za-z]+/g) || []).length * 3;
  const n = thaiSoundStats(sound, t).syllables;
  return n >= Math.floor(consonants / 4) && n <= consonants + extra + 1;
}

export default {
  // 말하는 사람의 성별을 몰라서 성별로 갈리는 말끝(ครับ 남 · ค่ะ/คะ 여)과 "나"(ผม 남 · ดิฉัน 여)를 넣지 않는다 — 틀린 성별보다 빼는 것이 덜 어색하다
  register: [
    'Use polite Thai that fits any speaker: do NOT add the gender-specific particles ครับ / ค่ะ / คะ, and avoid gendered "I" (ผม / ดิฉัน) — leave "I" out where natural, otherwise use ฉัน. Keep it polite with neutral words (คุณ, กรุณา, ขอ…หน่อย, …ได้ไหม).',
    'Use casual, friendly Thai between friends (เรา for "I", นะ / ไหม where natural), without ครับ / ค่ะ / คะ.',
  ],
  script: 'Thai must be written in Thai script (no romanization).',
  // Whisper가 조용한 녹음에서 지어내는 태국어 영상 끝인사 · 구독 권유 · 자막 표시
  hallucinations: [/^ขอบคุณที่(?:รับชม|ติดตาม)/, /กดติดตาม|กดไลก์|กดไลค์|กดแชร์|กดกระดิ่ง|กดซับ/, /^ซับไตเติ้ล/, /^คำบรรยาย(?:โดย|ไทย)/, /^แล้วพบกันใหม่(?:ใน)?(?:ตอนหน้า|คลิปหน้า|ครั้งหน้า)/],
  numbers,
  decimals,
  none: /^(?:ไม่มี|ไม่ระบุ|ไม่ได้ระบุ|ไม่ทราบ|ไม่มีข้อมูล|ยังไม่ระบุ)$/,
  sound: {
    validate: (text) => (SCRIPT_RE.Thai.test(text) ? null : { error: '태국어 글이 아니에요.', code: 'unsupported_lang' }),
    messages: (text) => [
      {
        role: 'system',
        content: [
          'Write how the Thai text is pronounced, in Latin letters (romanization by sound, not by spelling).',
          'Rules:',
          '- Use the Royal Thai General System (RTGS) with two changes: write จ as j (ch is only for ฉ ช ฌ), and write the vowel ɔ (ขอ, ของ, ร้อน, เกาะ, ก็) as ɔ — o is only for โ and the hidden short o (คน khon).',
          '- k t p (ก ต ป) are unaspirated, kh th ph (ข ค ฆ, ถ ท ธ ฐ, ผ พ ภ) aspirated. Vowels: a i u e o ɔ, ae (แ), ue (อึ อือ), oe (เออ เอิ), ia, uea, ua. No tone marks, no long-vowel marks.',
          '- Write sounds, not letters: final consonants as k t p n m ng, hidden vowels (สบาย sa-bai, ถนน tha-non), no silent letters.',
          '- Hyphens between the syllables of one word, spaces between words, e.g. "sa-wat-di", "khɔp-khun mak", "chiang-mai", "tom-yam-kung", "jɔt trong ni".',
          '- Keep numbers as digits 0-9 (also for Thai digits), keep Latin letters and punctuation (, . ? !). Output ONLY the romanization, nothing else.',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ],
    clean: cleanSound,
    matches: soundMatches,
  },
  photoRead: 'Thai → romanization by sound: RTGS but จ = j and the vowel ɔ (ขอ, ร้อน) = ɔ, no tone marks, hyphens between syllables (e.g. "khao-phat kung", "khɔp-khun")',
};
