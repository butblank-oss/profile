#!/usr/bin/env node
/**
 * make-seed.js — 프로토타입 백업을 사이트 시드로 변환한다.
 *
 *   node scripts/make-seed.js research-backup.json
 *
 * 입력은 프로토타입 페이지 콘솔에서 받아 낸 백업이다:
 *   { shots: { '<파일명>': '<JSON 문자열>' }, notes, spec, order }
 * 출력은 data/research-seed.js — window.__RESEARCH_SEED 를 동기적으로 심는
 * 평범한 스크립트다. fetch 가 아니라 script 인 이유는, 페이지 하단 로직이
 * DOMContentLoaded 에 localStorage 를 읽어서 비동기로는 늦기 때문이다.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('사용법: node scripts/make-seed.js <research-backup.json>');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const SIDECAR = /^\.image-slots(\.\d+)?\.state\.json$/;

const shots = {};
let images = 0;
for (const [name, value] of Object.entries(raw.shots || {})) {
  if (!SIDECAR.test(name)) {
    console.warn('건너뜀 (사이드카 파일명이 아님): ' + name);
    continue;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    console.warn('건너뜀 (JSON 파싱 실패): ' + name);
    continue;
  }
  if (!parsed || typeof parsed !== 'object' || !Object.keys(parsed).length) continue;
  shots[name] = text;
  images += Object.keys(parsed).length;
}

const str = (v) => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));
const count = (v) => { try { return Object.keys(JSON.parse(v || '{}')).length; } catch (e) { return 0; } };

const seed = {
  shots,
  notes: str(raw.notes),
  spec: str(raw.spec),
  order: str(raw.order),
};

const out = `/**
 * research-seed.js — 리서치 초기값 (자동 생성 · 직접 고치지 말 것)
 *
 * scripts/make-seed.js 가 프로토타입 백업에서 만들어 낸 파일이다.
 * 사이트를 처음 여는 브라우저에 아래 값이 기본으로 채워진다. 이미 입력한
 * 자리는 건드리지 않는다 — 규칙은 assets/slot-store.js 의 시드 절 참고.
 *
 * 주의: 저장소에 커밋되고 사이트로 서비스된다. URL을 아는 사람에게 그대로
 * 노출되므로, 외부에 보이면 곤란한 메모는 넣지 말 것.
 */
window.__RESEARCH_SEED = ${JSON.stringify(seed, null, 2)};
`;

const dest = path.join(__dirname, '..', 'data', 'research-seed.js');
fs.writeFileSync(dest, out);

console.log('data/research-seed.js 생성됨');
console.log('  스크린샷   ' + images + '장 (샤드 ' + Object.keys(shots).length + '개)');
console.log('  소감       ' + count(seed.notes) + '개 섹션');
console.log('  입력칸     ' + count(seed.spec) + '개');
console.log('  순서       ' + count(seed.order) + '개 섹션');
console.log('  파일 크기  ' + (out.length / 1024 / 1024).toFixed(2) + ' MB');
