/**
 * comparison.js — 경쟁사 비교 테이블
 *
 * 데이터를 따로 들고 있지 않다. [테이블 갱신하기] 를 누를 때마다
 * competitor-profiles.html 을 다시 읽어서 표를 새로 만든다. 그래서 프로파일에
 * 뭘 입력하든 첨부하든, 여기서 갱신만 누르면 그대로 반영된다.
 *
 * 값은 두 겹이다. 아래쪽이 이긴다.
 *   1) HTML  — 저장소에 커밋된 기본값 (input value / textarea 내용 / image-slot src)
 *   2) 브라우저 — 그 사람이 고친 값 (localStorage) · 넣은 사진 (IndexedDB)
 * 프로파일 페이지의 복원 규칙과 같다.
 */
(() => {
  'use strict';

  const SRC = './competitor-profiles.html';
  // 프로파일이 아닌 섹션. 인덱스 표·구분 배너·계약원장 명단.
  const NOT_PROFILE = new Set(['index', 'scope', 'roster']);

  // 컬럼 정의. key 는 저장·정렬에 쓰고, get 은 한 프로파일에서 값을 뽑는다.
  // num 이 있으면 숫자로 정렬한다(문자 정렬이면 '10만' 이 '4.0' 보다 앞에 온다).
  const COLS = [
    { key: 'name',     label: '서비스명',        pin: true },
    { key: 'channel',  label: '판매채널' },
    { key: 'billing',  label: '과금형태' },
    { key: 'game',     label: '게임 구성 · 수' },
    { key: 'download', label: '앱 다운로드수',   num: true },
    { key: 'rating',   label: '스토어 평점',     num: true },
    { key: 'contract', label: '나라장터 계약',   num: true },
    { key: 'updated',  label: '최근 업데이트' },
    { key: 'admin',    label: '기관용 관리·리포트' },
    // 비고 성격이라 맨 뒤. 셀이 길어서 앞에 두면 다른 열이 밀린다.
    { key: 'note',     label: '사용소감 정리',   wide: true },
  ];
  const DEFAULT_ON = COLS.map((c) => c.key);

  // ── 값 뽑기 ─────────────────────────────────────────────────────────────
  // 입력칸 라벨은 섹션마다 다르다. 위치(sid:N)가 아니라 라벨로 찾는다.
  // 같은 뜻을 다르게 적은 것들이 있어 여러 후보를 둔다.
  const SPEC = {
    download: [/앱 설치 수/, /앱 다운로드 수/],
    rating:   [/앱 스토어 평점/],
    game:     [/게임 구성/, /콘텐츠 종류/],
    updated:  [/최근 업데이트/],
    admin:    [/기관용 관리/, /관리자·리포트/, /기관용 관리 기능/],
  };

  function specOf(sec, pats) {
    const inputs = [...sec.querySelectorAll('input[data-spec]')];
    for (const pat of pats) {
      const hit = inputs.find((i) => {
        const l = i.previousElementSibling;
        return l && pat.test(l.textContent);
      });
      if (hit) return { el: hit, index: inputs.indexOf(hit) + 1 };
    }
    return null;
  }

  // 숫자 비교용 키. '10만' → 100000, '1억 2,676만' → 126760000, '4.0' → 4.
  // 정렬에만 쓰고 화면에는 원문을 그대로 보여 준다.
  function toNumber(raw) {
    if (!raw) return null;
    const t = String(raw).replace(/[\s,]/g, '');
    if (/^[-—–]$/.test(t)) return null;
    let total = 0, matched = false;
    const eok = t.match(/([\d.]+)억/);
    if (eok) { total += parseFloat(eok[1]) * 1e8; matched = true; }
    const man = t.match(/([\d.]+)만/);
    if (man) { total += parseFloat(man[1]) * 1e4; matched = true; }
    if (matched) return total;
    const plain = t.match(/-?[\d.]+/);
    return plain ? parseFloat(plain[0]) : null;
  }

  // 소감 추출 요약. AI 가 다시 쓰는 게 아니라 원문에서 앞쪽을 그대로 뽑는다
  // — 조사 내용이 바뀌어 보이면 안 되기 때문이다.
  function summarize(text, max) {
    const t = (text || '').trim();
    if (!t) return '';
    const bullets = t.split(/\n+/).map((l) => l.replace(/^[-·•*]\s*/, '').trim()).filter(Boolean);
    const parts = bullets.length > 1
      ? bullets
      : t.split(/(?<=[.!?。])\s+/).map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
      if (out.length >= (max || 3)) break;
      out.push(p);
    }
    return out.join(' · ');
  }

  // ── 문서에서 한 줄씩 만들기 ─────────────────────────────────────────────
  function readDoc(doc, store) {
    // 인덱스 표에서 과금 주체·나라장터를 끌어온다. 이 두 값은 입력칸이 아니라
    // 표에만 있어서, 섹션 id 로 해당 행을 찾아 쓴다.
    const fromIndex = {};
    doc.querySelectorAll('#index tbody tr').forEach((tr) => {
      const a = tr.querySelector('a[href^="#"]');
      if (!a) return;
      const td = tr.querySelectorAll('td');
      fromIndex[a.getAttribute('href').slice(1)] = {
        billing: td[3] ? td[3].textContent.trim() : '',
        contract: td[4] ? td[4].textContent.trim() : '',
      };
    });

    const rows = [];
    doc.querySelectorAll('section[id]').forEach((sec) => {
      if (NOT_PROFILE.has(sec.id)) return;
      const h2 = sec.querySelector('h2');
      if (!h2) return;

      const badge = sec.querySelector('span[style*="border-radius:99px"]');
      // 서비스명은 H2 바로 다음이 아닐 수 있다 — 하야트처럼 관계 안내 배너가
      // 사이에 끼는 프로파일이 있다. 형제 순서 대신 스타일 시그니처로 찾는다.
      const sub = sec.querySelector('div[style*="font-size:clamp(19px,2.2vw,24px)"]');
      const note = sec.querySelector('textarea[data-note]');
      const idx = fromIndex[sec.id] || {};

      const spec = (k) => {
        const f = specOf(sec, SPEC[k]);
        if (!f) return '';
        // 그 사람이 고친 값이 있으면 그것을 쓴다. 키 규칙은 프로파일 페이지와 동일.
        const saved = store.spec[sec.id + ':' + f.index];
        return (saved != null ? saved : f.el.value).trim();
      };

      const noteText = (store.notes[sec.id] != null
        ? store.notes[sec.id]
        : (note ? note.value : '')).trim();

      rows.push({
        id: sec.id,
        name: h2.textContent.trim(),
        sub: sub ? sub.textContent.trim() : '',
        channel: badge ? badge.textContent.trim() : '',
        billing: idx.billing || '',
        contract: idx.contract || '',
        game: spec('game'),
        download: spec('download'),
        rating: spec('rating'),
        updated: spec('updated'),
        admin: spec('admin'),
        note: summarize(noteText, 3),
        noteFull: noteText,
        shots: sec.querySelectorAll('image-slot[src], image-slot[data-filled]').length,
      });
    });
    return rows;
  }

  // 그 사람이 브라우저에 저장해 둔 수정분.
  function readStore() {
    const get = (k) => {
      try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; }
      catch (e) { return {}; }
    };
    return { spec: get('cp-spec-v1'), notes: get('cp-notes-v1') };
  }

  // ── 화면 ────────────────────────────────────────────────────────────────
  const CH_COLOR = {
    '지자체 예산': ['#f4ecfa', '#8944ab'],
    '경로 다름':   ['#e9f6ec', '#1d7a3e'],
    '개인 B2C':    ['#e6f4f5', '#0a7e8c'],
    '돌봄기관':     ['#fdf1e9', '#b25000'],
    '병 · 의원':   ['#e8f1fd', '#0071e3'],
  };

  const state = {
    rows: [],
    on: new Set(DEFAULT_ON),
    sort: { key: 'name', dir: 1 },
    expanded: new Set(),
  };

  const el = (id) => document.getElementById(id);

  function renderTags() {
    const box = el('tags');
    box.innerHTML = '';
    COLS.forEach((c) => {
      const b = document.createElement('button');
      const on = state.on.has(c.key);
      b.type = 'button';
      b.textContent = c.label;
      b.setAttribute('aria-pressed', String(on));
      b.style.cssText =
        'font-family:inherit;font-size:14px;font-weight:600;padding:7px 14px;border-radius:99px;' +
        'cursor:pointer;transition:background .12s,color .12s;border:1px solid ' +
        (on ? '#0071e3' : '#d2d2d7') + ';background:' + (on ? '#0071e3' : '#fff') +
        ';color:' + (on ? '#fff' : '#6e6e73');
      if (c.pin) { b.disabled = true; b.style.cursor = 'default'; b.style.opacity = '.55'; }
      b.addEventListener('click', () => {
        if (c.pin) return;
        if (state.on.has(c.key)) state.on.delete(c.key); else state.on.add(c.key);
        try { localStorage.setItem('cmp-cols-v1', JSON.stringify([...state.on])); } catch (e) {}
        renderTags(); renderTable();
      });
      box.appendChild(b);
    });
  }

  function sorted() {
    const { key, dir } = state.sort;
    const col = COLS.find((c) => c.key === key) || {};
    return state.rows.slice().sort((a, b) => {
      if (col.num) {
        const x = toNumber(a[key]), y = toNumber(b[key]);
        // 값이 없는 행은 방향과 상관없이 항상 아래로 — 빈칸이 1위가 되면 표를 못 읽는다.
        if (x == null && y == null) return a.name.localeCompare(b.name, 'ko');
        if (x == null) return 1;
        if (y == null) return -1;
        return (x - y) * dir;
      }
      const x = (a[key] || ''), y = (b[key] || '');
      if (!x && !y) return a.name.localeCompare(b.name, 'ko');
      if (!x) return 1;
      if (!y) return -1;
      return x.localeCompare(y, 'ko') * dir;
    });
  }

  function renderTable() {
    const cols = COLS.filter((c) => state.on.has(c.key));
    const t = el('table');
    t.innerHTML = '';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    cols.forEach((c) => {
      const th = document.createElement('th');
      const active = state.sort.key === c.key;
      th.style.cssText =
        'text-align:' + (c.num ? 'right' : 'left') + ';font-size:13px;font-weight:600;' +
        'color:' + (active ? '#0071e3' : '#86868b') + ';padding:12px 10px;white-space:nowrap;' +
        'border-bottom:1px solid #d2d2d7;cursor:pointer;user-select:none;position:sticky;top:0;background:#fff';
      th.textContent = c.label + (active ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : '');
      th.title = '클릭하면 정렬';
      th.addEventListener('click', () => {
        if (state.sort.key === c.key) state.sort.dir *= -1;
        else state.sort = { key: c.key, dir: c.num ? -1 : 1 };
        renderTable();
      });
      hr.appendChild(th);
    });
    thead.appendChild(hr); t.appendChild(thead);

    const tb = document.createElement('tbody');
    sorted().forEach((r) => {
      const tr = document.createElement('tr');
      cols.forEach((c) => {
        const td = document.createElement('td');
        td.style.cssText =
          'padding:14px 10px;border-bottom:1px solid #f0f0f2;font-size:15px;vertical-align:top;' +
          'line-height:1.5;' + (c.num ? 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;' : '');

        if (c.key === 'name') {
          const a = document.createElement('a');
          a.href = './competitor-profiles.html#' + r.id;
          a.textContent = r.name;
          a.style.cssText = 'font-weight:600;color:#0071e3;text-decoration:none';
          td.appendChild(a);
          if (r.sub) {
            const d = document.createElement('div');
            d.textContent = r.sub;
            d.style.cssText = 'font-size:13px;color:#86868b;margin-top:4px';
            td.appendChild(d);
          }
        } else if (c.key === 'channel') {
          const [bg, fg] = CH_COLOR[r.channel] || ['#f0f0f2', '#6e6e73'];
          const sp = document.createElement('span');
          sp.textContent = r.channel || '—';
          sp.style.cssText =
            'display:inline-block;font-size:13px;font-weight:600;padding:4px 10px;' +
            'border-radius:99px;white-space:nowrap;background:' + bg + ';color:' + fg;
          td.appendChild(sp);
        } else if (c.key === 'note') {
          if (!r.noteFull) {
            td.textContent = '—';
            td.style.color = '#aeaeb2';
          } else {
            const open = state.expanded.has(r.id);
            const p = document.createElement('div');
            p.textContent = open ? r.noteFull : r.note;
            p.style.whiteSpace = open ? 'pre-wrap' : '';
            td.appendChild(p);
            const more = document.createElement('button');
            more.type = 'button';
            more.textContent = open ? '접기' : '전문 보기';
            more.style.cssText =
              'margin-top:6px;border:0;background:transparent;padding:0;cursor:pointer;' +
              'font-family:inherit;font-size:13px;font-weight:600;color:#0071e3';
            more.addEventListener('click', () => {
              if (open) state.expanded.delete(r.id); else state.expanded.add(r.id);
              renderTable();
            });
            td.appendChild(more);
          }
        } else {
          const v = r[c.key];
          td.textContent = v || '—';
          if (!v) td.style.color = '#aeaeb2';
        }
        if (c.wide) td.style.minWidth = '260px';
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);

    const filled = (k) => state.rows.filter((r) => r[k]).length;
    el('summary').textContent =
      state.rows.length + '곳 · 다운로드 ' + filled('download') + '곳 · 평점 ' + filled('rating') +
      '곳 · 게임 구성 ' + filled('game') + '곳 · 소감 ' + filled('noteFull') + '곳 채워짐';
  }

  // ── 갱신 ────────────────────────────────────────────────────────────────
  async function refresh() {
    const btn = el('refresh');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '읽는 중…';
    el('error').style.display = 'none';
    try {
      // 캐시를 타면 방금 커밋한 내용이 안 보인다.
      const res = await fetch(SRC + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('프로파일 문서를 불러오지 못했습니다 (HTTP ' + res.status + ')');
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      state.rows = readDoc(doc, readStore());
      if (!state.rows.length) throw new Error('프로파일 섹션을 하나도 읽지 못했습니다.');
      renderTable();
      el('stamp').textContent = '갱신 ' + new Date().toLocaleString('ko-KR');
    } catch (err) {
      // 실패를 삼키지 않는다 — 조용히 옛 표가 남아 있으면 그게 최신인 줄 안다.
      const box = el('error');
      box.textContent = '갱신하지 못했습니다. ' + err.message +
        ' (file:// 로 열면 브라우저가 문서 읽기를 막습니다. 웹 주소로 열어 주세요.)';
      box.style.display = '';
      console.error('[comparison]', err);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem('cmp-cols-v1') || 'null');
    if (Array.isArray(saved) && saved.length) state.on = new Set(saved.concat(['name']));
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', () => {
    renderTags();
    el('refresh').addEventListener('click', refresh);
    refresh();
  });
})();
