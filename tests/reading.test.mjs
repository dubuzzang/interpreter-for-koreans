import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trToHangul, koToRoman, readingFor } from '../public/js/reading.js';

// Merhaba 앱과 같은 결과
const TR = {
  merhaba: '메르하바', günaydın: '귀나이든', teşekkür: '테셱퀴르', ederim: '에데림', nasılsın: '나슬슨', evet: '에벳', hayır: '하이으르',
  lütfen: '뤼트펜', Türkiye: '튀르키예', İstanbul: '이스탄불', çay: '차이', kahve: '카흐베', ekmek: '에크멕', değil: '데일',
  öğretmen: '외레트멘', renk: '렝크', tamam: '타맘', kebap: '케밥', simit: '시밋', şeker: '셰케르', affedersiniz: '아페데르시니즈',
};

test('튀르키예어 → 한글 발음', () => {
  for (const [tr, ko] of Object.entries(TR)) assert.equal(trToHangul(tr), ko, tr);
  assert.equal(trToHangul('Merhaba, nasılsın?'), '메르하바, 나슬슨?');
  assert.equal(trToHangul('Bu ne kadar?'), '부 네 카다르?');
  assert.equal(trToHangul("İstanbul'da"), '이스탄불다');
  assert.equal(trToHangul('3 lira'), '3 리라');
  assert.equal(trToHangul(''), '');
});

test('한국어 → 로마자 (연음 · 콧소리되기 · ㄹㄹ · ㅎ)', () => {
  assert.equal(koToRoman('안녕하세요'), 'Annyeonghaseyo');
  assert.equal(koToRoman('감사합니다.'), 'Gamsahamnida.');
  assert.equal(koToRoman('한국어'), 'Hangugeo');
  assert.equal(koToRoman('좋아요'), 'Joayo');
  assert.equal(koToRoman('있어요'), 'Isseoyo');
  assert.equal(koToRoman('없어요'), 'Eopseoyo');
  assert.equal(koToRoman('빨리'), 'Ppalli');
  assert.equal(koToRoman('설날'), 'Seollal');
  assert.equal(koToRoman('좋다'), 'Jota');
  assert.equal(koToRoman('화장실이 어디예요?'), 'Hwajangsiri eodiyeyo?');
  assert.equal(koToRoman('네. 감사합니다.'), 'Ne. Gamsahamnida.');
  assert.equal(koToRoman('Wi-Fi 비밀번호'), 'Wi-Fi bimilbeonho');
});

test('읽는 법은 필요한 사람에게만: 튀르키예어는 한국 사용자에게 한글로, 한국어는 상대에게 로마자로', () => {
  assert.equal(readingFor('Merhaba', 'tr', 'ko'), '메르하바');
  assert.equal(readingFor('Merhaba', 'tr', 'en'), '');
  assert.equal(readingFor('안녕하세요', 'ko', 'tr'), 'Annyeonghaseyo');
  assert.equal(readingFor('안녕하세요', 'ko', 'ko'), '');
  assert.equal(readingFor('Hello', 'en', 'ko'), '');
});
