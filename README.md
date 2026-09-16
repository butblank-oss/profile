# 인지장애 B2G 시장·경쟁사 분석

조달청 나라장터 계약원장에서 추출한 인지·치매 관련 계약 112건과, 내부 전략 덱·공개
자료를 근거로 만든 시장 분석·경쟁사 리서치 문서입니다. 정적 사이트로 서비스합니다.

## 페이지

| 경로 | 내용 |
|---|---|
| `index.html` | 목차 · 데이터 출처 3층 구조 |
| `competitor-profiles.html` | 경쟁사 17곳 프로파일 + 계약원장 명단 (주력 문서) |
| `market-analysis.html` | 수요 모수 → TAM/SAM → 조달 실집행 + 포지셔닝 맵 2종 |
| `contract-analysis-deck.html` | 16:9 발표 슬라이드 14장 (참고용 초기 산출물) |
| `data/contracts_raw.csv` | 나라장터 계약원장 112건 원본 (2024.01–2026.08) |

## 리서치 워크스페이스

`competitor-profiles.html` 은 읽기용 문서가 아니라 **계속 채워 나가는 도구**입니다.

- **스크린샷** — 슬롯에 이미지를 끌어다 놓거나 클릭해서 선택. 섹션당 10칸이고 빈 칸은
  항상 1개만 보입니다. 채우면 다음 칸이 열립니다. 드래그로 순서를 바꾸고, 클릭하면
  라이트박스(`←` `→` 이동, `Esc` 닫기)가 열립니다.
- **입력칸 · 소감칸** — 타이핑하는 즉시 저장됩니다. 값이 들어가면 테두리가 점선에서
  실선으로 바뀝니다.

### 저장 위치

입력값과 이미지는 **보고 있는 브라우저에만** 저장됩니다. 서버로 올라가지 않습니다.

| 데이터 | 저장소 | 키 |
|---|---|---|
| 스크린샷 이미지·리프레임 | IndexedDB `dementia-research` / `image-slots` | `.image-slots.<0-23>.state.json` |
| 추가 확인 항목 입력값 | localStorage | `cp-spec-v1` |
| 직접 사용 소감 | localStorage | `cp-notes-v1` |
| 스크린샷 순서 | localStorage | `cp-shot-order-v1` |

따라서 **다른 기기·다른 브라우저에서는 보이지 않고**, 브라우저 사이트 데이터를 지우면
함께 사라집니다. 시크릿 모드에서는 저장이 막혀 화면 우하단에 경고 배너가 뜹니다.
여러 사람이 함께 채워야 한다면 서버 API + 오브젝트 스토리지로 옮겨야 합니다.

이미지는 저장 전에 캔버스로 리샘플됩니다 — 긴 변 1800px, WebP 품질 0.92.

## 초기값 옮겨 심기 (시드)

프로토타입에서 이미 채워 둔 스크린샷·메모를 사이트로 옮기려면 `data/research-seed.js`
에 넣습니다. 이 값은 **아직 아무것도 입력하지 않은 브라우저**에만 깔립니다.

프로토타입 페이지를 원래 보던 브라우저에서 열고, 개발자도구 콘솔에 붙여넣습니다.

```js
(async () => {
  const shots = {};
  for (let i = -1; i < 24; i++) {
    const f = i < 0 ? '.image-slots.state.json' : `.image-slots.${i}.state.json`;
    try { const r = await fetch(f); if (r.ok) shots[f] = await r.text(); } catch (e) {}
  }
  const blob = new Blob([JSON.stringify({
    shots,
    notes: localStorage.getItem('cp-notes-v1'),
    spec:  localStorage.getItem('cp-spec-v1'),
    order: localStorage.getItem('cp-shot-order-v1'),
  })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'research-backup.json';
  a.click();
})()
```

받은 파일을 시드로 변환해 커밋합니다.

```
node scripts/make-seed.js research-backup.json
```

### 시드가 기존 값을 덮지 않는 규칙

한 번이라도 손댄 자리는 사용자 값이 이깁니다. 안 그러면 지운 이미지가 새로고침마다
되살아납니다.

- **이미지** — IndexedDB 에 해당 샤드 레코드가 없을 때만 시드를 읽습니다. `image-slot.js`
  는 변경 시 샤드를 통째로 다시 쓰므로, 한 장만 지워도 그 샤드는 IndexedDB 차지가 되어
  시드가 비껴갑니다.
- **텍스트** — localStorage 에 그 키가 아예 없을 때만 넣습니다.

### 주의

`data/research-seed.js` 는 저장소에 커밋되고 사이트로 서비스됩니다. **URL을 아는 사람에게
그대로 노출됩니다.** 외부에 보이면 곤란한 메모는 시드에 넣지 마십시오. 이미지가 많으면
파일이 수십 MB가 되어 첫 로딩이 느려집니다.

## 디자인 핸드오프와의 관계

프로토타입(`*.dc.html`)을 마크업·인라인 스타일 그대로 이식했습니다. 걷어낸 것은 호스트
전용 래퍼뿐입니다.

| 프로토타입 | 이 저장소 |
|---|---|
| `<script src="./support.js">` (프로토타입 런타임) | 제거 |
| `<x-dc>` 문서 래퍼 | 제거 |
| `<helmet>` | `<head>` 로 승격 |
| `<script type="text/x-dc">` + `DCLogic` 베이스 | 빈 `DCLogic` 스텁 + 부트스트랩을 붙인 평범한 `<script>` |
| `<x-import from="./deck-stage.js">` | `<deck-stage>` 커스텀 엘리먼트 + `<script src>` |
| `omelette.writeFile` / 사이드카 `fetch` | `assets/slot-store.js` (IndexedDB) |

`assets/image-slot.js` 와 `assets/deck-stage.js` 는 **원본 그대로**입니다. 영속화는
컴포넌트를 고치는 대신 같은 두 접점(사이드카 `fetch`, `omelette.writeFile`)을
`assets/slot-store.js` 가 IndexedDB 로 갈아끼우는 방식으로 대체했습니다. 이 스크립트는
반드시 `image-slot.js` 보다 먼저 로드되어야 합니다 — `image-slot.js` 가 첫 렌더에서
`writeFile` 존재 여부로 편집 가능 여부를 판정하기 때문입니다.

## 수치를 인용하기 전에

문서에 실린 수치는 확실성이 세 층으로 갈립니다. 출처 표기를 떼고 인용하지 마십시오.

- **수요 모수** (치매 100만 · MCI 300만) — 로완 공동대표 GISC 2025 발표. 발표자 주장이며
  미검증이고, 1,140만의 20%가 300만이 아니라는 계산 오류를 포함합니다.
- **TAM 16.2조 / SAM 24.6억** — TAM은 건보공단 통계연보 실집행(공식 통계),
  SAM은 256곳 × 960만 **가정치**입니다.
- **계약 7.68억 · 46곳 · 중간값 794만** — 나라장터 계약원장 기준으로 검증됨. 다만 금액은
  용역 43건, 건수는 112건 기준이라 모수가 다릅니다.

국가 치매관리비용 22조 9,000억은 의도적으로 제외했습니다. 환자 수 × 1인당 사회적 비용
추정치이며 정부 집행 예산이 아니어서, 조달 시장과 나란히 놓으면 수치가 왜곡됩니다.

2026년은 8월까지만 집계되어 연간 비교에 쓸 수 없습니다.

## 공개 범위

내부 전략 자료입니다. 모든 페이지에 `noindex, nofollow` 가 붙어 있고 `robots.txt` 는
전체를 `Disallow` 합니다. GitHub Pages 로 서비스하면 **URL을 아는 사람은 누구나 볼 수
있습니다** — 검색에 안 걸릴 뿐 비공개가 아닙니다. 접근 제한이 필요하면 비공개 저장소 +
인증이 붙는 호스팅으로 옮기십시오.

## 로컬 실행

빌드가 없습니다. 정적 파일을 그대로 서빙하면 됩니다.

```
python3 -m http.server 8000
```

`file://` 로 직접 열어도 대부분 동작하지만, IndexedDB 오리진이 달라져 저장이 기기별로
갈립니다. HTTP 로 여십시오.
