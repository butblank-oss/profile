/**
 * profile-edit.js — 프로파일 문서의 글을 그 자리에서 고친다.
 *
 * 입력칸·소감·스크린샷은 원래 고칠 수 있었지만 회사명·리드 문단·수치 카드·
 * 확인된 사실 표는 HTML 에 박혀 있어 손댈 수 없었다. 조사하다 보면 그쪽이 더
 * 자주 틀린다. 이 파일이 그 글들을 편집 가능하게 만든다.
 *
 * 저장은 localStorage 다. 그 브라우저에만 남으므로, 저장소에 넣으려면
 * [수정 내보내기] 로 받은 파일을 넘겨 HTML 을 고쳐 커밋해야 한다.
 */
(() => {
  'use strict';

  const KEY = 'cp-text-v1';
  // 이 태그들만 안에 들어 있으면 그 덩어리를 통째로 고치게 둔다. 문단 안의
  // 굵은 글씨까지 같이 편집되어야 자연스럽다.
  const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'A', 'BR', 'SMALL', 'SUP', 'SUB']);
  const SKIP = new Set(['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'OPTION', 'SCRIPT',
                        'STYLE', 'IMG', 'SVG', 'IMAGE-SLOT', 'NAV']);

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); return true; }
    catch (err) {
      alert('수정을 저장하지 못했습니다. 브라우저 저장 공간이 가득 찼거나 시크릿 모드일 수 있습니다.\n' +
            '새로고침하면 방금 고친 내용이 사라집니다.');
      console.error('[profile-edit]', err);
      return false;
    }
  }

  // 붙여넣기로 스크립트가 섞여 들어오는 것만 막는다. 인라인 style 은 이 문서의
  // 강조 방식이라 남긴다.
  function clean(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('script,style,iframe,object,embed,form').forEach((n) => n.remove());
    d.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => {
        if (/^on/i.test(a.name)) n.removeAttribute(a.name);
        if (a.name === 'href' && /^\s*javascript:/i.test(a.value)) n.removeAttribute('href');
      });
    });
    return d.innerHTML;
  }

  // 고칠 수 있는 덩어리를 찾는다. 키는 섹션 안에서의 등장 순서다.
  // HTML 구조가 바뀌면 키가 밀리므로, 고친 내용은 내보내서 HTML 에 반영해야
  // 오래 간다.
  function targets() {
    const out = [];
    document.querySelectorAll('section[id]').forEach((sec) => {
      let n = 0;
      sec.querySelectorAll('*').forEach((el) => {
        if (SKIP.has(el.tagName) || el.closest('image-slot') || el.closest('nav')) return;
        if (!el.textContent.trim()) return;
        // 블록 자식이 있으면 그 자식이 맡는다. 잎만 고른다.
        for (const c of el.children) if (!INLINE.has(c.tagName)) return;
        n += 1;
        out.push({ el: el, key: sec.id + '#' + n });
      });
    });
    return out;
  }

  let items = [];
  let on = false;

  function apply() {
    const store = load();
    let n = 0;
    items.forEach((it) => {
      if (it.orig == null) it.orig = it.el.innerHTML;
      const v = store[it.key];
      if (v != null && v !== it.el.innerHTML) { it.el.innerHTML = v; n += 1; }
      it.el.dataset.edited = v != null ? '1' : '';
    });
    return n;
  }

  function paint() {
    items.forEach((it) => {
      it.el.contentEditable = on ? 'true' : 'false';
      it.el.style.outline = on ? '1px dashed #c7c7cc' : '';
      it.el.style.outlineOffset = on ? '2px' : '';
      it.el.style.borderRadius = on ? '4px' : '';
      if (it.el.dataset.edited === '1') {
        it.el.style.background = on ? '#fffbe6' : '';
        it.el.style.boxShadow = on ? '' : 'inset 0 -2px 0 #ffe58a';
      } else {
        it.el.style.background = '';
        it.el.style.boxShadow = '';
      }
    });
    document.body.style.cursor = '';
  }

  function count() { return Object.keys(load()).length; }

  function bar() {
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:100000;display:flex;align-items:center;gap:8px;' +
      "font-family:'Paperlogy',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;" +
      'background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(20px);' +
      '-webkit-backdrop-filter:saturate(180%) blur(20px);border:1px solid #d2d2d7;' +
      'border-radius:99px;padding:8px 10px;box-shadow:0 8px 28px rgba(0,0,0,.12)';

    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'font-family:inherit;font-size:14px;font-weight:600;border-radius:99px;' +
        'padding:8px 16px;cursor:pointer;border:1px solid ' + (primary ? '#1d1d1f' : '#d2d2d7') +
        ';background:' + (primary ? '#1d1d1f' : '#fff') + ';color:' + (primary ? '#fff' : '#1d1d1f');
      box.appendChild(b);
      return b;
    };

    const toggle = mk('내용 수정');
    const tally = document.createElement('span');
    tally.style.cssText = 'font-size:13px;font-weight:600;color:#86868b;padding:0 4px';
    box.appendChild(tally);
    const out = mk('수정 내보내기');
    const undo = mk('되돌리기');

    const refresh = () => {
      const n = count();
      tally.textContent = n ? n + '곳 수정됨' : '수정 없음';
      out.style.display = n ? '' : 'none';
      undo.style.display = n ? '' : 'none';
      toggle.textContent = on ? '수정 끝내기' : '내용 수정';
      toggle.style.background = on ? '#0071e3' : '#fff';
      toggle.style.color = on ? '#fff' : '#1d1d1f';
      toggle.style.borderColor = on ? '#0071e3' : '#d2d2d7';
    };

    toggle.addEventListener('click', () => { on = !on; paint(); refresh(); });

    out.addEventListener('click', () => {
      const store = load();
      const rows = items.filter((it) => store[it.key] != null).map((it) => ({
        key: it.key,
        section: it.key.split('#')[0],
        before: it.orig,
        after: store[it.key],
      }));
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'profile-edits.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    undo.addEventListener('click', () => {
      if (!confirm('고친 내용을 모두 되돌립니다. 저장소에 반영하지 않은 수정은 사라집니다.')) return;
      try { localStorage.removeItem(KEY); } catch (e) {}
      items.forEach((it) => { if (it.orig != null) it.el.innerHTML = it.orig; it.el.dataset.edited = ''; });
      paint(); refresh();
    });

    document.addEventListener('input', (e) => {
      if (!on) return;
      const it = items.find((x) => x.el === e.target);
      if (!it) return;
      const store = load();
      const v = clean(it.el.innerHTML);
      if (v === it.orig) delete store[it.key]; else store[it.key] = v;
      if (save(store)) { it.el.dataset.edited = v === it.orig ? '' : '1'; refresh(); }
    });

    (document.body || document.documentElement).appendChild(box);
    return refresh;
  }

  function boot() {
    items = targets();
    apply();
    const refresh = bar();
    refresh();
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
