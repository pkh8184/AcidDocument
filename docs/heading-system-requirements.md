# 제목(H1/H2/H3) 및 텍스트 블록 시스템 요구사항 분석서 v2

> 작성일: 2026-02-14
> 대상 파일: listeners.js, blocks.js, renderer.js, sidebar.js, history.js
> 블록 타입: `h1`, `h2`, `h3` + 관련 TEXT_TYPES 전체

---

## 1. 아키텍처 핵심 문제: 클로저 스테일 (CLOSURE-01)

### 1.1 문제 원인

```
renderer.js:232 — setupBlockEvents(div, b, idx)
  → listeners.js:324 — el.addEventListener('keydown', function(e){ handleKey(e, b, idx, el) })
```

`b`와 `idx`는 **renderBlocks() 호출 시점**의 값이 클로저에 캡처됨.
`insertBlockEl`/`removeBlockEl`은 DOM의 `data-idx` 속성만 갱신하고 **클로저는 갱신하지 않음**.

### 1.2 재현 시나리오

```
1. 페이지: [text_0, h1_1]  (renderBlocks 시 h1의 클로저 idx=1)
2. text_0 중간에서 Enter → insertBlock(1, newText) 실행
3. 결과: [text_0_before, newText_1, h1_2]
   - DOM data-idx: 0, 1, 2 (insertBlockEl이 갱신)
   - h1의 클로저: idx=1 (stale! 실제는 2)
4. h1 끝에서 Enter 누름 → handleKey(e, b, idx=1, el) 호출
5. line 105: state.page.blocks[1].content = el.innerHTML
   → h1의 내용이 newText_1에 저장됨 (잘못된 블록!)
6. line 113: insertBlock(2, newB)
   → 새 블록이 idx=2에 삽입 = h1 앞에 생성됨!
```

**이것이 "제목 맨 뒤에서 Enter 시 위에 블록 생성"의 원인.**

### 1.3 수정 방법

handleKey 시작부에서 DOM의 data-idx로 현재 idx를 재계산:

```javascript
export function handleKey(e,b,idx,el){
  // CLOSURE-01 fix: 클로저의 stale idx 대신 DOM에서 현재 idx 조회
  var blockEl=el.closest('.block');
  if(blockEl){
    idx=parseInt(blockEl.getAttribute('data-idx'));
    if(state.page&&state.page.blocks[idx]){
      b=state.page.blocks[idx];
    }
  }
  ...
```

### 1.4 영향 범위

handleKey 내부의 모든 핸들러(Enter, Backspace, Delete, Arrow, Tab, Slash)가 수정됨.
`setupBlockEvents` 내 다른 클로저(todo checkbox의 `b.checked`, toggle의 `b.open` 등)는 별도 검토 필요하나 현재 치명적 문제 없음.

---

## 2. Enter 키 결함

### ENT-01: 빈 리스트 아이템 Enter → 빈 리스트 유지 + text 생성 (잘못됨)

**현재 동작** (listeners.js:107-109):
```javascript
if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&el.textContent.trim()!==''){
  newType=b.type;
}
```
빈 bullet에서 Enter → newType='text' → 빈 bullet 유지 + 아래에 빈 text 생성.

**기대 동작 (Notion)**: 빈 리스트 아이템에서 Enter → **해당 리스트 아이템을 text로 변환** (리스트 탈출).

**심각도**: 중간

### ENT-02: 제목 중간 Enter 시 서식 태그 잔류

`<b>제|목</b>` 상태에서 Enter → "목"이 `<b>목</b>` HTML로 새 text 블록에 들어감. 브라우저 기본 동작이므로 허용.

**심각도**: 낮음 (허용)

---

## 3. Backspace 키 결함

### BS-01: 내용 있는 h1/h2/h3 맨 앞 Backspace → 포커스만 이동 (타입 변환 안 됨)

**현재 코드** (listeners.js:148-157):
```javascript
if(isAtStart(el)&&idx>0){
  e.preventDefault();
  var prevIdx=idx-1;
  while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){ prevIdx--; }
  if(prevIdx<0)prevIdx=Math.max(0,idx-1);
  focusBlock(prevIdx,'end');
  return;
}
```

**기대 동작 (Notion)**: 내용 있는 제목 맨 앞에서 Backspace → **text로 타입 변환 (내용 유지, 커서 맨 앞)**.

**심각도**: **높음**

### BS-04: 내용 있는 text 맨 앞 Backspace + 이전 블록 text → 병합 안 됨

현재: 이전 블록으로 포커스만 이동. 내용은 병합되지 않음.

**기대 동작**: 현재 text 내용을 이전 text 블록 끝에 병합, 현재 블록 삭제.

**심각도**: **높음**

### BS-05: idx=0 제목에서 커서 맨 앞 Backspace → 아무 동작 없음

`if(isAtStart(el)&&idx>0)` — idx===0이면 조건 실패.
빈 블록일 때는 line 128-133의 타입 변환이 처리하지만, **내용 있는 첫 번째 제목**에서는 아무 일도 안 됨.

**기대 동작**: idx=0이어도 h1/h2/h3 맨 앞 Backspace → text 변환.

**심각도**: 중간

---

## 4. Delete 키 결함

### DEL-04: Delete 병합 시 todo 타입 누락

**현재 코드** (listeners.js:165):
```javascript
if(['text','h1','h2','h3','bullet','number','quote'].includes(nextB.type)){
```

`todo`가 빠져 있음. h1 끝에서 Delete, 다음 블록이 todo → 아무 동작 없음.

**심각도**: 중간

---

## 5. Tab 키 결함

### TAB-02: Shift+Tab (내어쓰기) 미구현

Tab은 4칸 스페이스 삽입하지만 Shift+Tab은 아무 동작 없음.

**심각도**: 중간

---

## 6. 붙여넣기 결함

### PASTE-01: 멀티라인 붙여넣기 커서 위치 무시

**현재 코드** (listeners.js:286-288):
```javascript
var idx=state.currentInsertIdx!==null?state.currentInsertIdx:state.page.blocks.length-1;
var curBlock=state.page.blocks[idx];
if(curBlock){
  curBlock.content=(curBlock.content||'')+lines[0];
}
```

첫 줄을 블록 content 끝에 append. 커서가 중간에 있어도 끝에 붙음.

**심각도**: 중간

---

## 7. 블록 컨텍스트 메뉴 결함

### CTX-01: H3 버튼 누락

sidebar.js:366-367에 H1, H2만 있고 H3 없음. 슬래시 메뉴에는 H3 있음.

**심각도**: 높음

---

## 8. 결함 요약 (우선순위순)

| 우선순위 | ID | 결함 | 파일 |
|---|---|---|---|
| **치명** | CLOSURE-01 | stale closure idx → Enter 시 블록 위치 오류 | listeners.js |
| **높음** | BS-01 | 내용 있는 제목 맨 앞 BS → 타입 변환 안 됨 | listeners.js |
| **높음** | BS-04 | text 맨 앞 BS + 이전 text → 병합 안 됨 | listeners.js |
| **높음** | CTX-01 | 컨텍스트 메뉴 H3 누락 | sidebar.js |
| **중간** | BS-05 | idx=0 제목 맨 앞 BS → 무동작 | listeners.js |
| **중간** | ENT-04 | 빈 리스트 Enter → text 변환 안 됨 | listeners.js |
| **중간** | DEL-04 | Delete 병합 todo 누락 | listeners.js |
| **중간** | TAB-02 | Shift+Tab 미구현 | listeners.js |
| **중간** | PASTE-01 | 멀티라인 붙여넣기 커서 무시 | listeners.js |
| 낮음 | ENT-02 | 제목 중간 Enter 서식 잔류 | 허용 |

---

## 9. 수정 계획

### Phase 1: CLOSURE-01 (근본 원인)
handleKey 시작부에서 DOM data-idx로 idx/b 재계산.

### Phase 2: Backspace 전면 수정 (BS-01, BS-04, BS-05)
isAtStart 분기 재구성:
1. 서식 블록(h1/h2/h3/quote/bullet/number/todo) → text 변환 (idx 무관)
2. text 블록 + 이전 text 블록 → 병합
3. text 블록 + 이전 콘텐츠 블록 → 포커스 이동

### Phase 3: Enter/Delete/Tab/Paste 수정
- ENT-04: 빈 리스트 Enter → 현재 블록 text 변환 (새 블록 생성 X)
- DEL-04: todo를 병합 대상에 추가
- TAB-02: Shift+Tab 내어쓰기
- PASTE-01: 커서 위치에서 분할 후 삽입

### Phase 4: CTX-01
sidebar.js에 H3 버튼 추가.
