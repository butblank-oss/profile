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
  // edit: 'spec' 은 프로파일의 입력칸, 'note' 는 소감 textarea 를 가리킨다.
  // 나머지(서비스명·판매채널·과금형태·나라장터)는 문서에서 끌어온 값이라
  // 여기서 고치지 않는다 — 고치려면 문서를 고쳐야 한다.
  const COLS = [
    { key: 'name',     label: '서비스명',        pin: true },
    { key: 'channel',  label: '판매채널' },
    { key: 'billing',  label: '과금형태' },
    { key: 'game',     label: '게임 구성 · 수',  edit: 'spec' },
    { key: 'download', label: '앱 다운로드수',   edit: 'spec', num: true },
    { key: 'rating',   label: '스토어 평점',     edit: 'spec', num: true },
    { key: 'contract', label: '나라장터 계약',   num: true },
    { key: 'updated',  label: '최근 업데이트',   edit: 'spec' },
    { key: 'admin',    label: '기관용 관리·리포트', edit: 'spec' },
    // 비고 성격이라 맨 뒤. 셀이 길어서 앞에 두면 다른 열이 밀린다.
    { key: 'note',     label: '사용소감 정리',   edit: 'note', wide: true },
  ];
  const EDITABLE = COLS.filter((c) => c.edit);
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

      const slot = {};   // 저장 키. 입력칸이 없으면 값이 없다.
      const base = {};   // HTML 에 박힌 기본값 — 내보낼 때 바뀐 것만 고르려고 들고 있는다.
      const spec = (k) => {
        const f = specOf(sec, SPEC[k]);
        if (!f) return '';
        const key = sec.id + ':' + f.index;
        slot[k] = key;
        base[k] = f.el.value.trim();
        // 그 사람이 고친 값이 있으면 그것을 쓴다. 키 규칙은 프로파일 페이지와 동일.
        const saved = store.spec[key];
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
        slot: slot,
        base: base,
        baseNote: note ? note.value.trim() : '',
        hasNote: !!note,
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

  // ── 저장 ────────────────────────────────────────────────────────────────
  // 프로파일 페이지와 같은 localStorage 키에 쓴다. 그래서 여기서 채우든
  // 프로파일에서 채우든 양쪽에 똑같이 보인다. 다른 저장소를 쓰면 두 화면이
  // 어긋난다.
  function save(bucket, key, value) {
    const name = bucket === 'note' ? 'cp-notes-v1' : 'cp-spec-v1';
    let store = {};
    try { store = JSON.parse(localStorage.getItem(name) || '{}') || {}; } catch (e) {}
    store[key] = value;
    try {
      localStorage.setItem(name, JSON.stringify(store));
      return true;
    } catch (err) {
      // 저장 실패를 삼키면 "적었는데 사라졌다" 가 된다.
      const box = el('error');
      box.textContent = '입력을 저장하지 못했습니다. 브라우저 저장소가 가득 찼거나 ' +
        '시크릿 모드일 수 있습니다. 새로고침하면 방금 적은 내용이 사라집니다.';
      box.style.display = '';
      console.error('[comparison] save', err);
      return false;
    }
  }

  function applyEdit(row, col, value) {
    const v = value.trim();
    if (col.edit === 'note') {
      if (!row.hasNote) return false;
      if (!save('note', row.id, v)) return false;
      row.noteFull = v;
      row.note = summarize(v, 3);
    } else {
      const key = row.slot[col.key];
      if (!key) return false;            // 그 섹션엔 해당 입력칸이 없다
      if (!save('spec', key, v)) return false;
      row[col.key] = v;
    }
    return true;
  }

  // 아직 안 채운 칸. 입력칸이 있는데 값이 비어 있는 것만 센다 —
  // 입력칸 자체가 없는 섹션을 '할 일' 로 세면 영영 안 줄어든다.
  function blanks() {
    const out = [];
    state.rows.forEach((r) => {
      EDITABLE.forEach((c) => {
        const can = c.edit === 'note' ? r.hasNote : !!r.slot[c.key];
        if (!can) return;
        const v = c.edit === 'note' ? r.noteFull : r[c.key];
        if (!String(v || '').trim()) out.push({ row: r, col: c });
      });
    });
    return out;
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
    editing: null,
    todoOpen: false,
    rowsOn: null,      // null 이면 전체. Set 이면 그 업체만.
    onePage: false,
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

  // 입력 상자 하나. 체크리스트와 표 안에서 같은 것을 쓴다.
  function makeInput(row, col, opts) {
    const multi = col.edit === 'note';
    const inp = document.createElement(multi ? 'textarea' : 'input');
    if (!multi) inp.type = 'text';
    inp.value = (multi ? row.noteFull : row[col.key]) || '';
    inp.placeholder = opts && opts.placeholder || '입력하면 저장됩니다';
    const paint = () => {
      inp.style.borderStyle = inp.value.trim() ? 'solid' : 'dashed';
      inp.style.background = inp.value.trim() ? '#fff' : '#f5f5f7';
    };
    inp.style.cssText =
      'display:block;width:100%;box-sizing:border-box;font-family:inherit;font-size:15px;' +
      'line-height:1.5;color:#1d1d1f;border:1px dashed #d2d2d7;border-radius:8px;padding:9px 12px;' +
      (multi ? 'min-height:84px;resize:vertical;' : '');
    paint();
    let t = null;
    inp.addEventListener('input', () => {
      paint();
      clearTimeout(t);
      // 한 글자마다 쓰지 않고 잠깐 모아서 쓴다.
      t = setTimeout(() => {
        applyEdit(row, col, inp.value);
        renderTodo();
        if (opts && opts.onSave) opts.onSave();
      }, 350);
    });
    inp.addEventListener('blur', () => {
      clearTimeout(t);
      applyEdit(row, col, inp.value);
      renderTodo();
      if (opts && opts.onSave) opts.onSave();
    });
    return inp;
  }

  function renderTodo() {
    const list = blanks();
    el('todoCount').textContent = list.length ? list.length + '칸 남음' : '모두 채웠습니다';
    const box = el('todo');
    if (!state.todoOpen) { box.style.display = 'none'; return; }
    box.style.display = '';
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div style="font-size:15px;color:#6e6e73">비어 있는 칸이 없습니다.</div>';
      return;
    }
    // 업체별로 묶는다. 항목별로 묶으면 같은 앱을 여러 번 찾아봐야 한다.
    const byRow = new Map();
    list.forEach((b) => {
      if (!byRow.has(b.row)) byRow.set(b.row, []);
      byRow.get(b.row).push(b.col);
    });
    byRow.forEach((cols, row) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:16px;padding:20px 22px;margin-bottom:12px';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin-bottom:14px';
      const nm = document.createElement('a');
      nm.href = './competitor-profiles.html#' + row.id;
      nm.textContent = row.name;
      nm.style.cssText = 'font-size:17px;font-weight:700;color:#1d1d1f;text-decoration:none';
      const sub = document.createElement('span');
      sub.textContent = row.sub;
      sub.style.cssText = 'font-size:13px;color:#86868b';
      const cnt = document.createElement('span');
      cnt.textContent = cols.length + '칸';
      cnt.style.cssText = 'font-size:13px;font-weight:600;color:#b25000;background:#fdf1e9;border-radius:99px;padding:3px 10px';
      head.append(nm, sub, cnt);
      card.appendChild(head);

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px 16px';
      cols.forEach((c) => {
        const cell = document.createElement('div');
        if (c.edit === 'note') cell.style.gridColumn = '1/-1';
        const lb = document.createElement('div');
        lb.textContent = c.label;
        lb.style.cssText = 'font-size:13px;font-weight:600;color:#6e6e73;margin-bottom:6px';
        cell.appendChild(lb);
        cell.appendChild(makeInput(row, c, {
          placeholder: c.edit === 'note' ? '직접 써 보고 느낀 점을 적어 주세요' : '찾아서 입력',
          onSave: renderTable,
        }));
        grid.appendChild(cell);
      });
      card.appendChild(grid);
      box.appendChild(card);
    });
  }

  // 채운 값을 파일로 뽑는다. localStorage 는 이 브라우저에만 있어서, 저장소에
  // 반영하려면 값을 밖으로 꺼내야 한다.
  function exportEdits() {
    const out = { specs: [], notes: [] };
    state.rows.forEach((r) => {
      EDITABLE.forEach((c) => {
        if (c.edit === 'note') {
          if (r.hasNote && r.noteFull !== r.baseNote) {
            out.notes.push({ section: r.id, name: r.name, value: r.noteFull });
          }
          return;
        }
        const key = r.slot[c.key];
        if (!key) return;
        if ((r[c.key] || '') !== (r.base[c.key] || '')) {
          out.specs.push({ key: key, section: r.id, name: r.name, label: c.label, value: r[c.key] });
        }
      });
    });
    const n = out.specs.length + out.notes.length;
    if (!n) { alert('저장소에 있는 값과 달라진 것이 없습니다.'); return; }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'comparison-edits.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 선택한 업체만. 처음엔 전체를 본다.
  function visibleRows() {
    if (!state.rowsOn) return state.rows;
    return state.rows.filter((r) => state.rowsOn.has(r.id));
  }

  function renderRowTags() {
    const box = el('rowTags');
    box.innerHTML = '';
    const chip = (label, on, onClick, tone) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-pressed', String(!!on));
      const c = tone || '#0071e3';
      b.style.cssText =
        'font-family:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;' +
        'cursor:pointer;transition:background .12s,color .12s;white-space:nowrap;border:1px solid ' +
        (on ? c : '#d2d2d7') + ';background:' + (on ? c : '#fff') + ';color:' + (on ? '#fff' : '#6e6e73');
      b.addEventListener('click', onClick);
      box.appendChild(b);
      return b;
    };

    chip('전체', !state.rowsOn, () => { state.rowsOn = null; saveRows(); renderRowTags(); renderTable(); }, '#1d1d1f');
    // 칸별로 한 번에 고르기. 채널끼리 비교하는 일이 잦다.
    const lanes = [...new Set(state.rows.map((r) => r.channel))].filter(Boolean);
    lanes.forEach((ln) => {
      const ids = state.rows.filter((r) => r.channel === ln).map((r) => r.id);
      const on = !!state.rowsOn && ids.every((i) => state.rowsOn.has(i)) && state.rowsOn.size === ids.length;
      const [, fg] = CH_COLOR[ln] || ['#f0f0f2', '#6e6e73'];
      chip(ln + ' ' + ids.length, on, () => {
        state.rowsOn = new Set(ids); saveRows(); renderRowTags(); renderTable();
      }, fg);
    });

    const sep = document.createElement('span');
    sep.style.cssText = 'width:100%;height:0';
    box.appendChild(sep);

    state.rows.forEach((r) => {
      const on = !state.rowsOn || state.rowsOn.has(r.id);
      chip(r.name.length > 12 ? r.name.slice(0, 12) + '…' : r.name, on, () => {
        // 전체 상태에서 하나를 끄면 '나머지 전부' 로 시작한다.
        if (!state.rowsOn) state.rowsOn = new Set(state.rows.map((x) => x.id));
        if (state.rowsOn.has(r.id)) state.rowsOn.delete(r.id); else state.rowsOn.add(r.id);
        if (!state.rowsOn.size) state.rowsOn = null;      // 다 끄면 전체로 되돌린다
        saveRows(); renderRowTags(); renderTable();
      });
    });
  }

  function saveRows() {
    try {
      if (state.rowsOn) localStorage.setItem('cmp-rows-v1', JSON.stringify([...state.rowsOn]));
      else localStorage.removeItem('cmp-rows-v1');
    } catch (e) {}
  }

  // 표를 화면 한 장에 밀어 넣는다. 밀도를 줄여도 넘치면 통째로 축소한다.
  function fitOnePage() {
    const wrap = el('tableWrap');
    const t = el('table');
    t.style.transform = '';
    t.style.width = '';
    wrap.style.height = '';
    // 한 장 모드에서는 머리말·설명을 접는다. 이걸 두면 표가 쓸 수 있는 높이가
    // 화면의 3분의 1도 안 남아서, 아무리 줄여도 한 장에 들어가지 않는다.
    ['pageHead', 'pageNotes'].forEach((id) => {
      const n = el(id);
      if (n) n.style.display = state.onePage ? 'none' : '';
    });
    ['rowTagsLabel', 'colTagsLabel'].forEach((id) => {
      const n = el(id);
      if (n) n.style.marginBottom = state.onePage ? '4px' : '';
    });
    ['rowTags', 'tags'].forEach((id) => {
      const n = el(id);
      if (n) n.style.marginBottom = state.onePage ? '8px' : '';
    });
    if (!state.onePage) { el('fitNote').textContent = ''; return; }
    const availW = wrap.clientWidth;
    const availH = Math.max(240, window.innerHeight - wrap.getBoundingClientRect().top - 24);
    const measure = () => {
      const r = t.getBoundingClientRect();
      return [Math.max(t.scrollWidth, Math.ceil(r.width)),
              Math.max(t.scrollHeight, Math.ceil(r.height))];
    };
    const [w, h] = measure();
    if (!w || !h) return;
    // 세로가 모자라 줄인 경우 가로가 남아 보이지만, 표를 넓게 깔아도 이득이
    // 없다 — 행 높이가 2줄 클램프로 고정이라 줄바꿈이 줄어들 여지가 없다.
    // 넓히면 가로 스크롤만 생겨서 그대로 비율 축소만 한다.
    const kW = availW / w, kH = availH / h;
    const k = Math.min(1, kW, kH);
    // 무엇 때문에 줄었는지 알려 준다. 세로가 모자라면 컬럼을 아무리 꺼도
    // 커지지 않는다 — 높이는 업체 수만 따르기 때문이다.
    const how = kH < kW ? '업체를 줄이면' : '컬럼을 줄이면';

    // 알아볼 수 없을 만큼 줄이지는 않는다. 그보다 작아져야 한다면 맞추기를
    // 포기하고 무엇을 줄여야 하는지 안내한다.
    const MIN = 0.45;
    if (k < MIN) {
      el('fitNote').textContent =
        '한 장에 넣으려면 ' + Math.round(k * 100) + '% 까지 줄여야 해서 맞추지 않았습니다 · ' + how + ' 들어갑니다';
      return;
    }
    if (k < 1) {
      t.style.transformOrigin = 'top left';
      t.style.transform = 'scale(' + k + ')';
      wrap.style.height = Math.ceil(h * k) + 'px';
    }
    el('fitNote').textContent = k < 1
      ? Math.round(k * 100) + '% 로 축소해 맞췄습니다 · ' + how + ' 더 크게 볼 수 있습니다'
      : '한 장에 들어갑니다';
  }

  function sorted() {
    const { key, dir } = state.sort;
    const col = COLS.find((c) => c.key === key) || {};
    return visibleRows().slice().sort((a, b) => {
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
    // 한 장 모드: 글자·여백을 줄이고 긴 셀은 두 줄로 자른다. 그래도 넘치면
    // fitOnePage() 가 통째로 축소한다.
    const tight = state.onePage;
    const PAD = tight ? '7px 8px' : '14px 10px';
    const FS = tight ? '13px' : '15px';
    t.style.minWidth = tight ? '0' : '900px';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    cols.forEach((c) => {
      const th = document.createElement('th');
      const active = state.sort.key === c.key;
      th.style.cssText =
        'text-align:' + (c.num ? 'right' : 'left') + ';font-size:' + (tight ? '12px' : '13px') + ';font-weight:600;' +
        'color:' + (active ? '#0071e3' : '#86868b') + ';padding:' + (tight ? '7px 8px' : '12px 10px') + ';white-space:nowrap;' +
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
          'padding:' + PAD + ';border-bottom:1px solid #f0f0f2;font-size:' + FS + ';vertical-align:top;' +
          'line-height:' + (tight ? '1.35' : '1.5') + ';' +
          (c.num ? 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;' : '');
        if (tight) td.style.maxWidth = c.wide ? '220px' : '150px';

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
          } else if (tight) {
            td.textContent = r.note;
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
        // 채울 수 있는 칸은 그 자리에서 고친다. 표 → 프로파일 → 다시 표 로
        // 오갈 필요가 없다.
        const can = !tight && c.edit && (c.edit === 'note' ? r.hasNote : !!r.slot[c.key]);
        if (can && state.editing !== r.id + ':' + c.key) {
          td.style.cursor = 'text';
          td.title = '클릭하면 여기서 바로 입력';
          if (!r[c.key] && c.edit !== 'note') td.style.background = '#fbfbfd';
          td.addEventListener('click', () => {
            state.editing = r.id + ':' + c.key;
            renderTable();
            const f = document.querySelector('[data-editing] input,[data-editing] textarea');
            if (f) { f.focus(); f.select && f.select(); }
          });
        } else if (can) {
          td.textContent = '';
          td.setAttribute('data-editing', '');
          td.appendChild(makeInput(r, c, {
            onSave: () => { state.editing = null; renderTable(); renderTodo(); },
          }));
        }
        if (c.wide && !tight) td.style.minWidth = '260px';
        // 두 줄까지만. 자르지 않으면 긴 셀 하나가 표 전체 높이를 정해 버린다.
        // td 자체가 아니라 안쪽 div 를 자른다 — td 의 display 를 바꾸면
        // 테이블 셀이 아니게 되어 폭·높이 계산이 통째로 깨진다.
        if (tight) {
          const clamp = document.createElement('div');
          clamp.style.cssText =
            'display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;' +
            'overflow:hidden;line-height:1.35';
          while (td.firstChild) clamp.appendChild(td.firstChild);
          td.appendChild(clamp);
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);

    const vis = visibleRows();
    const filled = (k) => vis.filter((r) => r[k]).length;
    el('summary').textContent =
      (state.rowsOn ? vis.length + '곳 (전체 ' + state.rows.length + '곳 중)' : vis.length + '곳') +
      ' · ' + cols.length + '개 컬럼 · 다운로드 ' + filled('download') + '곳 · 평점 ' + filled('rating') +
      '곳 · 게임 구성 ' + filled('game') + '곳 · 소감 ' + filled('noteFull') + '곳 채워짐';
    fitOnePage();
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
      try {
        const sv = JSON.parse(localStorage.getItem('cmp-rows-v1') || 'null');
        if (Array.isArray(sv) && sv.length) {
          const known = new Set(state.rows.map((r) => r.id));
          const keep = sv.filter((i) => known.has(i));
          state.rowsOn = keep.length && keep.length < state.rows.length ? new Set(keep) : null;
        }
      } catch (e) {}
      renderRowTags();
      renderTable();
      renderTodo();
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
    el('export').addEventListener('click', exportEdits);
    el('onePage').addEventListener('click', () => {
      state.onePage = !state.onePage;
      el('onePage').textContent = state.onePage ? '한 장 보기 끄기' : '한 장에 보기';
      el('onePage').style.background = state.onePage ? '#1d1d1f' : '#fff';
      el('onePage').style.color = state.onePage ? '#fff' : '#1d1d1f';
      el('onePage').style.borderColor = state.onePage ? '#1d1d1f' : '#d2d2d7';
      renderTable();
    });
    window.addEventListener('resize', fitOnePage);
    el('todoToggle').addEventListener('click', () => {
      state.todoOpen = !state.todoOpen;
      el('todoToggle').textContent = state.todoOpen ? '채울 목록 접기' : '채울 목록 열기';
      renderTodo();
      if (state.todoOpen) el('todo').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    refresh();
  });
})();
