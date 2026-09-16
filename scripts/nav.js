#!/usr/bin/env node
/**
 * nav.js — 모든 페이지에 같은 상단바를 넣는다.
 *
 *   node scripts/nav.js
 *
 * 상단바는 한 군데(이 파일)에서만 정의한다. 페이지마다 손으로 적어 두면
 * 메뉴가 하나 늘 때마다 다섯 군데를 고쳐야 하고, 한 곳을 빠뜨리면 그 페이지만
 * 메뉴가 다르다. 페이지 사이를 오가며 알아채기 어려운 종류의 어긋남이다.
 *
 * <nav data-globalnav> 가 이미 있으면 통째로 갈아 끼운다.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const ITEMS = [
  ['index.html', '시장조사', true],          // true = 메인(굵게)
  ['competitor-profiles.html', '경쟁사 프로파일'],
  ['comparison.html', '비교표'],
  ['market-analysis.html', '시장 분석'],
  ['contract-analysis-deck.html', '계약 분석 덱'],
];

function navFor(page) {
  const links = ITEMS.map(([href, label, main]) => {
    const on = href === page;
    const size = main ? '15px' : '14px';
    const weight = main || on ? '700' : '400';
    const color = on ? '#0071e3' : main ? '#1d1d1f' : '#6e6e73';
    return '<a href="./' + href + '" style="font-size:' + size + ';font-weight:' + weight +
      ';color:' + color + ';flex:none;text-decoration:none"' + (on ? ' aria-current="page"' : '') +
      '>' + label + '</a>';
  }).join('\n');
  return '<nav data-globalnav style="position:fixed;top:0;left:0;right:0;z-index:60;height:56px;' +
    'background:rgba(255,255,255,.9);backdrop-filter:saturate(180%) blur(20px);' +
    '-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(0,0,0,.08)">\n' +
    '<div style="max-width:1400px;margin:0 auto;padding:0 24px;display:flex;align-items:center;' +
    'gap:20px;height:56px;overflow-x:auto;white-space:nowrap">\n' + links + '\n</div>\n</nav>\n';
}

const OLD = /<nav data-globalnav[\s\S]*?<\/nav>\n?/;

let n = 0;
for (const [page] of ITEMS) {
  const p = path.join(root, page);
  if (!fs.existsSync(p)) { console.warn('  없음: ' + page); continue; }
  let s = fs.readFileSync(p, 'utf8');
  const nav = navFor(page);
  const before = s;
  s = OLD.test(s) ? s.replace(OLD, nav) : s.replace(/<body>\n/, '<body>\n' + nav);
  if (s !== before) { fs.writeFileSync(p, s); n++; console.log('  ' + page); }
}
console.log(n ? n + '개 페이지 갱신' : '바뀐 것 없음');
