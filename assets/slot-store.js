/**
 * slot-store.js — <image-slot> 영속화 어댑터 (IndexedDB)
 *
 * 프로토타입의 image-slot.js 는 호스트 전용 API 두 가지에 의존한다.
 *   읽기: fetch('.image-slots.<n>.state.json')  — HTML 옆에 놓인 JSON 사이드카
 *   쓰기: window.omelette.writeFile(path, body) — 호스트 파일 저장 브리지
 *
 * 정적 사이트에는 둘 다 없다. image-slot.js 를 고치는 대신 같은 두 접점을
 * IndexedDB 로 갈아끼운다 — 그래서 image-slot.js 는 원본 그대로 쓴다.
 *
 * 이 파일은 반드시 image-slot.js 보다 먼저 로드되어야 한다.
 * (image-slot.js 는 첫 렌더에서 window.omelette.writeFile 존재 여부로
 *  편집 가능 여부를 판정한다.)
 *
 * 저장 실패는 절대 삼키지 않는다 — 핸드오프 문서가 명시한 요구사항이다.
 * writeFile 이 거부되면 화면 우하단에 배너를 띄우고 reject 한다.
 *
 * 시드(초기값)도 여기서 깐다. data/research-seed.js 가 프로토타입에서 옮겨 온
 * 이미지·메모를 window.__RESEARCH_SEED 에 심어 두면, 아직 아무것도 입력하지
 * 않은 브라우저에 그 값이 기본으로 채워진다. 자세한 규칙은 아래 시드 절에.
 */
(() => {
  'use strict';

  const DB_NAME = 'dementia-research';
  const DB_VERSION = 1;
  const STORE = 'image-slots';
  // image-slot.js 가 읽고 쓰는 사이드카 파일명. 호스트에서는 실제 파일이었고
  // 여기서는 IndexedDB 레코드의 키로만 쓰인다.
  const SIDECAR_RE = /(^|\/)\.image-slots(\.\d+)?\.state\.json(\?.*)?$/;

  // ── 시드 ────────────────────────────────────────────────────────────────
  // data/research-seed.js 가 없거나 비어 있으면 아래는 전부 no-op 이다.
  //
  // 시드는 "아직 손대지 않은 자리"에만 깔린다. 사용자가 한 번이라도 고친
  // 자리는 그 값이 이긴다 — 안 그러면 지운 이미지가 새로고침마다 되살아난다.
  //   이미지: IndexedDB 에 해당 샤드 레코드가 없을 때만 시드를 읽는다.
  //           image-slot.js 는 변경 시 샤드 통째로 다시 쓰므로, 한 장만 지워도
  //           그 샤드는 IndexedDB 차지가 되어 시드가 비껴간다.
  //   텍스트: localStorage 에 그 키가 아예 없을 때만 넣는다.
  const seed = self.__RESEARCH_SEED || {};
  const seedShots = seed.shots || {};

  // 텍스트 시드는 반드시 동기적으로 깔아야 한다. 페이지 하단 스크립트가
  // DOMContentLoaded 에 이 키들을 읽기 때문에, fetch 로 가져오면 늦는다.
  // (그래서 시드는 JSON 이 아니라 평범한 <script> 파일이다.)
  try {
    const LS = { 'cp-notes-v1': 'notes', 'cp-spec-v1': 'spec', 'cp-shot-order-v1': 'order' };
    for (const key in LS) {
      const v = seed[LS[key]];
      if (v != null && localStorage.getItem(key) === null) localStorage.setItem(key, v);
    }
  } catch (e) {
    // 시크릿 모드 등 저장소가 막힌 환경. 시드 없이 빈 문서로 진행한다.
    console.warn('[slot-store] 메모 초기값을 깔지 못했습니다.', e);
  }

  let dbP = null;

  function openDb() {
    if (dbP) return dbP;
    dbP = new Promise((resolve, reject) => {
      if (!self.indexedDB) { reject(new Error('이 브라우저는 IndexedDB 를 지원하지 않습니다.')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      // 시크릿 모드·저장소 차단 환경에서는 여기로 떨어진다.
      req.onerror = () => reject(req.error || new Error('IndexedDB 를 열 수 없습니다.'));
      req.onblocked = () => reject(new Error('IndexedDB 가 다른 탭에 의해 차단되었습니다.'));
    });
    return dbP;
  }

  function tx(mode, run) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.onabort = () => reject(t.error || new Error('저장소 트랜잭션이 중단되었습니다.'));
      t.onerror = () => reject(t.error || new Error('저장소 트랜잭션에 실패했습니다.'));
      t.oncomplete = () => resolve(req ? req.result : undefined);
    }));
  }

  const readKey = (key) => tx('readonly', (s) => s.get(key));
  const writeKey = (key, value) => tx('readwrite', (s) => s.put(value, key));

  // ── 저장 실패 배너 ────────────────────────────────────────────────────
  // 핸드오프 교훈 2: `.catch(() => {})` 가 "새로고침하면 사라지는" 버그의
  // 원인이었다. 실패는 반드시 눈에 보여야 한다.
  let banner = null;
  function reportError(message, err) {
    console.error('[slot-store] ' + message, err || '');
    if (!banner) {
      banner = document.createElement('div');
      banner.setAttribute('role', 'alert');
      banner.style.cssText =
        'position:fixed;right:20px;bottom:20px;z-index:100000;max-width:360px;' +
        "font-family:'Paperlogy',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;" +
        'background:#7a3700;color:#fff;border-radius:14px;padding:16px 18px;' +
        'font-size:15px;line-height:1.55;box-shadow:0 12px 40px rgba(0,0,0,.28)';
      const close = document.createElement('button');
      close.textContent = '✕';
      close.setAttribute('aria-label', '닫기');
      close.style.cssText =
        'position:absolute;top:10px;right:12px;border:0;background:transparent;' +
        'color:rgba(255,255,255,.7);font-size:15px;line-height:1;cursor:pointer';
      close.addEventListener('click', () => { banner.style.display = 'none'; });
      const text = document.createElement('div');
      text.dataset.text = '';
      text.style.paddingRight = '18px';
      banner.appendChild(text);
      banner.appendChild(close);
      (document.body || document.documentElement).appendChild(banner);
    }
    banner.style.display = '';
    banner.querySelector('[data-text]').textContent =
      '이미지를 저장하지 못했습니다. ' + message + ' 새로고침하면 방금 넣은 이미지가 사라집니다.';
  }

  // ── 읽기 접점: fetch 가로채기 ─────────────────────────────────────────
  // 사이드카 경로만 IndexedDB 로 돌리고 나머지 요청은 원본 fetch 로 넘긴다.
  const nativeFetch = self.fetch ? self.fetch.bind(self) : null;
  self.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!SIDECAR_RE.test(url)) {
      if (!nativeFetch) return Promise.reject(new Error('fetch 를 사용할 수 없습니다.'));
      return nativeFetch(input, init);
    }
    const key = url.replace(/^.*\//, '').replace(/\?.*$/, '');
    // IndexedDB 에 없으면 시드로, 시드에도 없으면 404 로 답한다
    // — 404 는 image-slot.js 의 `r.ok` 분기가 기대하는 "빈 사이드카" 신호다.
    const fallback = () => {
      const s = seedShots[key];
      if (s == null) return new Response('', { status: 404, statusText: 'Not Found' });
      return new Response(typeof s === 'string' ? s : JSON.stringify(s), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    return readKey(key).then(
      (body) => {
        if (body == null) return fallback();
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      // 읽기 실패는 배너까지 띄우지 않는다. 시드로 떨어질 뿐 데이터 유실이
      // 아니고, 뒤이은 쓰기가 실패하면 그때 배너가 뜬다.
      (err) => {
        console.warn('[slot-store] 저장된 이미지를 읽지 못했습니다.', err);
        return fallback();
      }
    );
  };

  // ── 쓰기 접점: omelette.writeFile 대체 ────────────────────────────────
  // image-slot.js 는 이 함수의 존재 여부로 편집 가능 여부를 판정하므로
  // 스크립트 평가 시점에 동기적으로 정의되어 있어야 한다.
  const omelette = self.omelette || (self.omelette = {});
  omelette.writeFile = function (path, content) {
    const key = String(path).replace(/^.*\//, '');
    if (!SIDECAR_RE.test(key)) {
      return Promise.reject(new Error('허용되지 않은 저장 경로: ' + path));
    }
    return writeKey(key, String(content)).catch((err) => {
      const quota = err && (err.name === 'QuotaExceededError' || err.code === 22);
      reportError(
        quota
          ? '브라우저 저장 공간이 가득 찼습니다. 이미지를 몇 장 지우고 다시 시도하세요.'
          : '브라우저 저장소에 접근할 수 없습니다 (시크릿 모드이거나 사이트 데이터가 차단된 상태일 수 있습니다).',
        err
      );
      throw err;
    });
  };
})();
