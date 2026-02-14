# 글 작성/제목/편집 결함 수정 설계서

**날짜:** 2026-02-14
**범위:** 24개 이슈 전체 수정
**접근:** 6개 Phase로 영역별 순차 구현

---

## Phase 1: 제목 + 저장 동기화 (5개)

### 1. 중복 onTitleChange (HIGH)
- `blocks.js:9`와 `sidebar.js:228`에 동일 함수 존재
- `main.js:14`는 blocks.js에서 import
- **수정:** sidebar.js의 중복 export 제거

### 2. 제목 composition 핸들러 없음 (MEDIUM)
- 한국어 입력 시 `oninput="onTitleChange()"` 이 composition 중에도 발생
- **수정:** setupListeners()에서 pageTitle에 compositionstart/end 리스너 추가, composition 중 onTitleChange 호출 방지

### 3. Enter 빈 페이지 포커스 실패 (MEDIUM)
- 블록 없으면 focusBlock(0,0) 실패
- **수정:** 블록 존재 확인, 없으면 빈 text 블록 생성 후 포커스

### 4. saveDoc()가 autoSaveTimer 안 지움 (MEDIUM)
- 수동 저장 직후 auto-save가 덮어쓸 수 있음
- **수정:** saveDoc() 시작에 `clearTimeout(state.autoSaveTimer)` 추가

### 5. collectBlocks DOM/state 불일치 (MEDIUM)
- DOM과 state가 동시에 사용되어 불일치 가능
- **수정:** editMode일 때만 DOM에서 content 수집, 아니면 state 사용

---

## Phase 2: IME/한국어 입력 (3개)

### 6. input 이벤트에 isComposing 가드 없음 (MEDIUM)
- input 리스너에서 48글자 분할, 슬래시 필터 등이 composition 중에도 실행
- **수정:** `if(state.isComposing) return` 가드를 48글자 분할 로직 앞에 추가

### 7. 48글자 분할이 textContent 사용 → 서식 손실 (HIGH)
- `el.textContent = keep` 으로 HTML 태그 전부 제거됨
- bold, italic, color 등 서식 모두 사라짐
- **수정:** innerHTML 기반 분할로 변경. 텍스트 노드를 순회하며 48글자 지점 계산

### 8. compositionend 슬래시 필터 중복 (LOW)
- compositionend에서 슬래시 메뉴 필터가 input과 중복 실행
- **수정:** compositionend에서 슬래시 필터 제거 (input에서 이미 처리)

---

## Phase 3: 키보드 동작 (5개)

### 9. paste 멀티라인 첫 chunk 손실 (MEDIUM)
- insertText로 첫 chunk DOM 삽입 후 renderBlocks 호출 → DOM 초기화됨
- **수정:** 첫 chunk도 state에 직접 설정

### 10. Backspace 스킵 로직 커서 고정 (MEDIUM)
- 이전 블록이 모두 콘텐츠 타입이면 prevIdx=-1, 포커스 실패
- **수정:** prevIdx<0이면 idx-1로 폴백 (타입 무관)

### 11. Delete 병합 HTML 깨짐 (MEDIUM)
- `b.content = el.innerHTML + (nextB.content||'')` 직접 연결
- **수정:** 병합 전 불필요한 wrapper 태그 정리

### 12. Enter 분할 후 커서 위치 (MEDIUM)
- 새 블록 포커스 시 position 명시 안 됨
- **수정:** insertBlock 후 focusBlock(idx+1, 0) 명시

### 13. 블록 타입 변경 toggle innerContent 손실 (MEDIUM)
- toggle → text → toggle 변경 시 innerContent 사라짐
- **수정:** changeBlockType에서 toggle 필드 보존 로직 추가

---

## Phase 4: 드래그앤드롭 (3개)

### 14. 드래그 전 DOM→state 동기화 안 됨 (CRITICAL)
- 편집 중인 블록을 드래그하면 DOM 내용이 state에 반영 안 됨
- **수정:** reorderBlock 호출 전 syncBlocksFromDOM() 추가

### 15. 드롭 위치 계산 오류 (MEDIUM)
- off-by-one 에러 가능
- **수정:** 위치 계산 로직 검증 및 수정

### 16. 파일 드롭 시 indicator 미제거 (LOW)
- 파일 드롭 경로에서 drag indicator 제거 누락
- **수정:** 파일 드롭 핸들러에도 indicator 제거 추가

---

## Phase 5: 서식/스타일링 (4개)

### 17. 컬러 피커 열면 selection 사라짐 (HIGH)
- 모달 열릴 때 focus 이동으로 selection 해제
- **수정:** savedSelection 복원을 applyColor에서 강화, restoreSelection 후 execCommand

### 18. execCommand 빈 선택 시 무반응 (MEDIUM)
- 텍스트 선택 없이 서식 버튼 클릭 시 아무 일 없음
- **수정:** 선택 없으면 현재 커서 위치의 단어 자동 선택

### 19. 서식 적용 후 포커스 손실 (MEDIUM)
- Ctrl+B/I/U 후 커서 위치 이동 가능
- **수정:** execCommand 후 selection 복원

### 20. foreColor 브라우저 호환성 (MEDIUM)
- hex 색상이 일부 브라우저에서 안 됨
- **수정:** 현재 hex가 주요 브라우저에서 동작하므로 유지 (YAGNI)

---

## Phase 6: 포커스/이벤트 관리 (4개)

### 21. 48글자 분할 후 커서 사라짐 (HIGH)
- renderBlocks 후 old DOM 참조가 stale
- **수정:** input 이벤트에서 renderBlocks 호출 후 즉시 return, focusBlock 타이밍 보장

### 22. focusBlock 30ms 타이밍 (MEDIUM)
- 느린 환경에서 DOM ready 전 focus 시도
- **수정:** 30ms → requestAnimationFrame 또는 50ms로 변경 검토

### 23. 뷰 모드 클릭 이벤트 처리 (MEDIUM)
- 뷰 모드에서 block-content 클릭 시 불필요한 이벤트 발생
- **수정:** setupBlockEvents에서 editMode 체크 강화

### 24. focusBlock silent catch (LOW)
- catch(ex){} 에서 에러 무시
- **수정:** console.warn 추가

---

## 수정 파일 목록

| 파일 | Phase | 수정 내용 |
|------|-------|-----------|
| `src/editor/listeners.js` | 1,2,3,4,6 | 키보드/입력/드래그 이벤트 핸들러 수정 |
| `src/editor/blocks.js` | 1,3,4,6 | focusBlock, changeBlockType, collectBlocks, reorderBlock |
| `src/editor/renderer.js` | 6 | setupBlockEvents 가드 |
| `src/ui/sidebar.js` | 1 | 중복 onTitleChange 제거, saveDoc autoSaveTimer 정리 |
| `src/ui/toolbar.js` | 5 | fmtCmd, applyColor 선택 복원 |
