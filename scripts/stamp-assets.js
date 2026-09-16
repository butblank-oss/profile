#!/usr/bin/env node
/**
 * stamp-assets.js — 로컬 스크립트 주소에 버전 꼬리표를 붙인다.
 *
 *   node scripts/stamp-assets.js
 *
 * GitHub Pages 는 정적 파일에 cache-control: max-age=600 을 준다. HTML 과 JS 는
 * 따로 캐시되므로, 새 HTML 이 옛 JS 를 물고 도는 구간이 생긴다. 실제로 상단 탭은
 * 보이는데 '볼 업체' 칩은 안 그려지는 상태가 나왔다.
 *
 * 주소가 바뀌면 브라우저는 다른 파일로 보고 새로 받는다. 그래서 파일 내용이
 * 바뀔 때마다 ?v= 를 파일 내용 해시로 다시 붙인다. 내용이 그대로면 해시도
 * 그대로라 불필요한 재다운로드가 없다.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
const REF = /(<script\s+src="\.\/)([^"?]+\.js)(?:\?v=[^"]*)?(")/g;

let changed = 0;
for (const page of pages) {
  const p = path.join(root, page);
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(REF, (m, a, file, z) => {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) {
      console.warn('  없는 파일 참조: ' + file + ' (' + page + ')');
      return m;
    }
    const h = crypto.createHash('sha1').update(fs.readFileSync(target)).digest('hex').slice(0, 8);
    return a + file + '?v=' + h + z;
  });
  if (after !== before) {
    fs.writeFileSync(p, after);
    changed++;
    console.log('  ' + page);
  }
}
console.log(changed ? changed + '개 파일 갱신' : '바뀐 것 없음');
