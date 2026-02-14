# 글자 입력 런타임 오류 디버깅 계획서

> 작성일: 2026-02-14
> 목적: contenteditable 에디터의 잠재적 런타임 오류를 체계적으로 식별하고 방어 코드 적용

---

## 1. 이번 세션 수정 완료

| ID | 수정 내용 | 파일 |
|---|---|---|
| SCROLL-01 | 블록 사이 빈 공간 클릭 시 최하단 이동 방지 | listeners.js |
| SCROLL-02 | focusBlock에 preventScroll + 뷰포트 밖일 때만 smooth 스크롤 | blocks.js |
| RANGE-01 | Enter 핸들러 getRangeAt(0) 호출 전 rangeCount 검사 | listeners.js |

---

## 2. 런타임 오류 위험 매트릭스

### 2.1 치명 (CRITICAL) — 사용자 조작 중 즉시 에러 발생 가능

| ID | 에러 | 파일:라인 | 트리거 시나리오 | 에러 타입 | 상태 |
|---|---|---|---|---|---|
| ERR-01 | `getRangeAt(0)` rangeCount=0 | listeners.js:110,115 | Undo 직후 Enter, IME 종료 직후 Enter | DOMException | ✅ 수정 |
| ERR-02 | `state.page.blocks[idx]` 범위 초과 | listeners.js:101,154 | Undo로 블록 제거된 상태에서 키 입력 | TypeError | 🔲 방어 필요 |
| ERR-03 | 이미지 Paste Promise 완료 시 state 변경됨 | listeners.js:336-341 | 이미지 붙여넣기 → 즉시 블록 삭제 | TypeError | 🔲 방어 필요 |

### 2.2 높음 (HIGH) — 특정 조건에서 발생

| ID | 에러 | 파일:라인 | 트리거 시나리오 | 에러 타입 | 상태 |
|---|---|---|---|---|---|
| ERR-04 | focusBlock 유효하지 않은 인덱스 | blocks.js:37 | 블록 삭제 직후 focusBlock 호출 | TypeError | ✅ 기존 null 체크 |
| ERR-05 | 테이블 정렬/필터 시 컬럼 인덱스 초과 | table.js:179 | 컬럼 삭제 후 정렬 실행 | TypeError | 🔲 방어 필요 |
| ERR-06 | 드래그앤드롭 중 Undo → 인덱스 불일치 | listeners.js:810-823 | 드래그 시작 → Undo → 드롭 | RangeError | 🔲 방어 필요 |
| ERR-07 | IME compositionend 후 stale state | listeners.js:440-442 | 한글 입력 중 빠른 조작 | 데이터 손실 | 🔲 주의 관찰 |

### 2.3 중간 (MEDIUM)

| ID | 에러 | 파일:라인 | 트리거 시나리오 | 에러 타입 | 상태 |
|---|---|---|---|---|---|
| ERR-08 | `insertText` execCommand 비활성 Selection | listeners.js:310,415 | 에디터 미포커스 상태 Paste | InvalidStateError | 🔲 방어 필요 |
| ERR-09 | `insertLineBreak` 비지원 브라우저 | listeners.js:142 | 구버전 Firefox/Safari | 무동작 | 🔲 폴백 필요 |
| ERR-10 | Paste multiline pasteIdx 범위 초과 | listeners.js:376-398 | Paste 대상 블록이 삭제된 DOM | TypeError | 🔲 방어 필요 |
| ERR-11 | focusBlock setTimeout 중 DOM 재생성 | blocks.js:71 | renderBlocks 경쟁 조건 | 무동작 | ✅ null 체크 |
| ERR-12 | Delete 키 nextB undefined | listeners.js:215-216 | 블록 배열 변경 후 Delete | TypeError | 🔲 방어 필요 |

---

## 3. 방어 코드 적용 계획

### Phase 1: 즉시 적용 (치명/높음)

#### ERR-02: blocks[idx] 범위 검증
```javascript
// handleKey 시작부 CLOSURE-01 fix 강화
if(!isNaN(freshIdx)&&state.page&&state.page.blocks[freshIdx]){
  idx=freshIdx;
  b=state.page.blocks[idx];
}
// 추가: idx 유효성 최종 검증
if(!state.page||!state.page.blocks||!state.page.blocks[idx])return;
```

#### ERR-03: 비동기 Paste 안전 검증
```javascript
uploadToStorage(...).then(function(result){
  if(!state.page||!state.page.blocks)return; // 페이지 전환됨
  pushUndoImmediate();
  var idx=state.currentInsertIdx!==null?state.currentInsertIdx+1:state.page.blocks.length;
  idx=Math.min(idx,state.page.blocks.length); // 범위 초과 방지
  state.page.blocks.splice(idx,0,b);
  ...
});
```

#### ERR-05: 테이블 컬럼 인덱스 검증
```javascript
// sortTable, filterTableRows 시작부
if(col<0||col>=blk.rows[0].length)return;
```

#### ERR-06: 드래그앤드롭 인덱스 검증
```javascript
// drop 핸들러
if(state.dragBlockIdx>=state.page.blocks.length)return;
if(toIdx<0||toIdx>=state.page.blocks.length)toIdx=state.page.blocks.length-1;
```

### Phase 2: 안정성 강화 (중간)

#### ERR-08: execCommand 실패 폴백
```javascript
// insertText 실패 시 manual 삽입
if(!document.execCommand('insertText',false,txt)){
  var sel=window.getSelection();
  if(sel&&sel.rangeCount){
    var rng=sel.getRangeAt(0);
    rng.deleteContents();
    rng.insertNode(document.createTextNode(txt));
    rng.collapse(false);
  }
}
```

#### ERR-09: insertLineBreak 폴백
```javascript
if(!document.execCommand('insertLineBreak')){
  document.execCommand('insertHTML',false,'<br>');
}
```

#### ERR-10: Paste pasteIdx 검증
```javascript
if(pasteIdx<0||pasteIdx>=state.page.blocks.length)return;
```

#### ERR-12: Delete nextB null 체크
```javascript
var nextB=state.page.blocks[idx+1];
if(!nextB)return;
```

---

## 4. 최하단 이동(스크롤) 버그 분석

### 4.1 원인

```
사용자 클릭 (에디터 빈 공간)
  ↓
editorWrap click 핸들러 발동
  ↓
e.target === #editor (블록 사이 여백도 포함)
  ↓
focusBlock(마지막 블록, 끝) 호출
  ↓
c.focus() → 브라우저가 요소를 화면에 스크롤
  ↓
→ 최하단으로 이동!
```

### 4.2 수정

| 레이어 | 수정 내용 |
|---|---|
| 클릭 핸들러 | 클릭 Y좌표가 마지막 블록 하단보다 아래일 때만 반응 |
| focusBlock | `focus({preventScroll:true})` + 뷰포트 밖일 때만 `scrollIntoView({block:'nearest'})` |

---

## 5. 브라우저 호환성 위험

| API | Chrome | Firefox | Safari | Edge | 위험 |
|---|---|---|---|---|---|
| `focus({preventScroll})` | 64+ | 63+ | 15+ | 79+ | 낮음 |
| `execCommand('insertLineBreak')` | ✅ | ✅ | 부분적 | ✅ | 중간 |
| `execCommand('insertText')` | ✅ | ✅ | ✅ | ✅ | 낮음 |
| `Selection.getRangeAt()` | ✅ | ✅ | ✅ | ✅ | rangeCount=0일 때 에러 |
| `Range.extractContents()` | ✅ | ✅ | ✅ | ✅ | 낮음 |

---

## 6. 디버깅 시 확인 체크리스트

### 스크롤 관련
- [ ] 블록 사이 빈 공간 클릭 → 스크롤 안 됨
- [ ] 마지막 블록 아래 빈 공간 클릭 → 마지막 블록 포커스
- [ ] Enter로 새 블록 생성 → 불필요한 스크롤 없음
- [ ] Backspace로 블록 삭제 → 이전 블록 위치 유지
- [ ] Undo/Redo 후 → 현재 뷰포트 유지

### Selection/Range 관련
- [ ] Undo 직후 Enter → 에러 없음
- [ ] IME 입력 중 Enter → 에러 없음
- [ ] 빠른 연속 Enter (10회) → 에러 없음
- [ ] 전체 선택(Ctrl+A) 후 Enter → 에러 없음

### 비동기 경쟁 조건
- [ ] 이미지 붙여넣기 → 즉시 블록 삭제 → 에러 없음
- [ ] 드래그 시작 → Undo → 드롭 → 에러 없음
- [ ] 빠른 타이핑 중 자동 저장 → 데이터 손실 없음

### 테이블
- [ ] 컬럼 삭제 후 정렬 → 에러 없음
- [ ] 행 삭제 후 필터 → 에러 없음
- [ ] 너비 모달에서 잘못된 값 입력 → 에러 없음
