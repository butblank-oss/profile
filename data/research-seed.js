/**
 * research-seed.js — 리서치 초기값 (아직 비어 있음)
 *
 * 프로토타입에서 채워 둔 스크린샷·소감·입력값을 이 파일로 옮기면, 사이트를
 * 처음 여는 브라우저에 그 값이 기본으로 채워진다. 지금은 비어 있어서 아무
 * 효과가 없다 — 모든 칸이 빈 상태로 시작한다.
 *
 * 채우는 방법: scripts/make-seed.js 참고.
 *
 * 주의: 이 파일은 저장소에 커밋되고 사이트로 서비스된다. 즉 URL을 아는
 * 사람에게 그대로 노출된다. 외부에 보이면 곤란한 메모는 넣지 말 것.
 */
window.__RESEARCH_SEED = {
  shots: {},   // { '.image-slots.<n>.state.json': '<JSON 문자열>' }
  notes: null, // cp-notes-v1       — 직접 사용 소감
  spec: null,  // cp-spec-v1        — 추가 확인 항목
  order: null, // cp-shot-order-v1  — 스크린샷 순서
};
