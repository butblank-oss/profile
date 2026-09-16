/**
 * research-seed.js — 리서치 초기값 (자동 생성 · 직접 고치지 말 것)
 *
 * 사이트를 처음 여는 브라우저에 아래 값이 기본으로 깔린다. 이미 손댄 자리는
 * 건드리지 않는다 — 규칙은 assets/slot-store.js 의 시드 절 참고.
 *
 * 지금 담는 건 스크린샷 순서뿐이다. 사용자가 드래그로 바꿔 둔 순서는
 * localStorage 에만 있어서 HTML 로 옮길 자리가 없기 때문이다.
 *   - 스크린샷 자체는 screenshots/*.webp 파일 + <image-slot src> 로 들어갔다
 *   - 소감·입력칸은 HTML 에 직접 박혀 있다 (textarea 내용 / input value)
 * 그래서 shots·notes·spec 은 비어 있다.
 *
 * 다시 만들려면: node scripts/make-seed.js <research-backup.json>
 */
window.__RESEARCH_SEED = {
  "shots": {},
  "notes": null,
  "spec": null,
  "order": "{\"funwave\": [\"fw1\", \"fw3\", \"fw2\", \"fw4\", \"fw5\", \"fw6\", \"fw7\", \"fw8\", \"fw9\", \"fw10\"], \"hayat\": [\"hyt7\", \"hyt5\", \"hyt6\", \"hyt3\", \"hyt1\", \"hyt2\", \"hyt4\", \"hyt8\", \"hyt9\", \"hyt10\"], \"brainfit45\": [\"brainfit454\", \"brainfit455\", \"brainfit456\", \"brainfit457\", \"brainfit451\", \"brainfit453\", \"brainfit452\", \"brainfit458\", \"brainfit459\", \"brainfit4510\"]}"
};
