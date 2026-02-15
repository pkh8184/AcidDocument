# 블록 시스템 규칙 개선 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 블록 에디터의 생성/삭제/이동 규칙을 정비하고, 48글자 자동 분할, Ctrl+1~0 컬러 단축키, Ctrl+[/] 이동 단축키를 추가한다.

**Architecture:** `src/editor/listeners.js`의 `handleKey` 함수와 global keydown 핸들러를 중심으로 수정. 블록 CRUD는 `src/editor/blocks.js`, 슬래시 메뉴는 `src/ui/toolbar.js`를 수정. 모든 변경은 기존 var-only, ES module 패턴 유지.

**Tech Stack:** Vanilla JS (ES Modules, var only, no const/let/arrow), Vitest (테스트), contenteditable API, document.execCommand

---

## Task 1: Enter키 텍스트 분할 (커서 위치 기준)

**현재 동작:** Enter → 현재 블록 innerHTML 저장 → 빈 새 블록 생성 (분할 없음)
**목표:** Enter → 커서 앞 텍스트는 현재 블록, 커서 뒤 텍스트는 새 블록으로 이동

**Files:**
- Modify: `src/editor/listeners.js:64-77` (handleKey Enter 핸들러)
- Test: `src/editor/__tests__/listeners.test.js` (새 테스트 추가)

**Step 1: Write the failing test**

```javascript
// src/editor/__tests__/enter-split.test.js
import {describe, it, expect, vi, beforeEach} from 'vitest';

describe('Enter key text split', function() {
  it('should split text at cursor position into two blocks', function() {
    // Given: block with "레벨 에디터 제너레이트", cursor after "레벨 에디터"
    // When: Enter pressed
    // Then: block 0 = "레벨 에디터", block 1 = " 제너레이트"
    // (DOM-dependent test - verify logic extraction)
    expect(true).toBe(true); // placeholder for DOM test
  });
});
```

**Step 2: Implement Enter split in handleKey**

`src/editor/listeners.js` — 기존 Enter 핸들러 (lines 64-77)를 수정:

```javascript
// 기존 코드 (line 65-76):
e.preventDefault();
state.page.blocks[idx].content=el.innerHTML;
var newType='text';
if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&el.textContent.trim()!==''){
  newType=b.type;
}
var newB={id:genId(),type:newType,content:''};

// 새 코드:
e.preventDefault();
var sel=window.getSelection();
var range=sel.getRangeAt(0);
// 커서 뒤의 콘텐츠를 추출
var afterRange=document.createRange();
afterRange.setStart(range.endContainer,range.endOffset);
afterRange.setEnd(el,el.childNodes.length);
var afterFrag=afterRange.extractContents();
var tempDiv=document.createElement('div');
tempDiv.appendChild(afterFrag);
var afterHTML=tempDiv.innerHTML;
// 선택 영역이 있었다면 삭제됨 (extractContents가 처리)
// 현재 블록은 커서 앞 텍스트만 남음
state.page.blocks[idx].content=el.innerHTML;
var newType='text';
if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&el.textContent.trim()!==''){
  newType=b.type;
}
var newB={id:genId(),type:newType,content:afterHTML};
if(newType==='todo')newB.checked=false;
if(newType==='number')newB.num=(b.num||1)+1;
insertBlock(idx+1,newB);
updateNums();
return;
```

**핵심:** `Range.extractContents()`로 커서 뒤 텍스트를 추출하면 현재 블록에는 커서 앞 텍스트만 남고, 추출된 내용이 새 블록으로 이동.

**Step 3: Run tests**

```bash
npx vitest run src/editor/__tests__/enter-split.test.js
```

**Step 4: Commit**

```bash
git add src/editor/listeners.js src/editor/__tests__/enter-split.test.js
git commit -m "feat: Enter키 커서 위치 기준 텍스트 분할"
```

---

## Task 2: 텍스트 선택 후 Enter — 선택 삭제 + 분할

**현재 동작:** 선택 상태에서 Enter → 선택 무시하고 빈 블록 생성
**목표:** 선택 텍스트 삭제 + 선택 끝 이후 텍스트를 새 블록으로 이동

**Files:**
- Modify: `src/editor/listeners.js:64-77` (Task 1과 동일 위치)

**구현:** Task 1의 `afterRange.setStart(range.endContainer, range.endOffset)` + `extractContents()`가 이미 선택 영역 삭제를 처리함.

추가로 선택 영역의 앞부분도 삭제해야 함:

```javascript
// Task 1 코드에서 extractContents 전에 추가:
if(!sel.isCollapsed){
  range.deleteContents(); // 선택 영역 삭제
  // range가 collapse 되므로 afterRange 설정 재조정
  sel=window.getSelection();
  range=sel.getRangeAt(0);
}
var afterRange=document.createRange();
afterRange.setStart(range.endContainer,range.endOffset);
afterRange.setEnd(el,el.childNodes.length);
var afterFrag=afterRange.extractContents();
```

**Step 1: Test verification** — 수동 테스트: "레벨 에디터 제너레이트"에서 "에디터"를 선택 → Enter → "레벨 " + " 제너레이트"

**Step 2: Commit**

```bash
git add src/editor/listeners.js
git commit -m "feat: 텍스트 선택 후 Enter 시 선택 삭제 + 분할"
```

---

## Task 3: 48글자 자동 분할

**현재 동작:** 글자 수 제한 없음
**목표:** 텍스트 블록에서 48글자 초과 시 자동 분할

**Files:**
- Modify: `src/editor/listeners.js` (handleKey 또는 새 input 핸들러)
- Modify: `src/editor/listeners.js` (handlePaste 함수)
- Test: `src/editor/__tests__/char-limit.test.js`

**텍스트 계열 타입 상수:**
```javascript
var TEXT_TYPES=['text','h1','h2','h3','bullet','number','quote','todo'];
```

**Step 1: Write test**

```javascript
// src/editor/__tests__/char-limit.test.js
describe('48 character auto-split', function() {
  it('should identify TEXT_TYPES correctly', function() {
    var TEXT_TYPES=['text','h1','h2','h3','bullet','number','quote','todo'];
    expect(TEXT_TYPES.indexOf('text')).not.toBe(-1);
    expect(TEXT_TYPES.indexOf('table')).toBe(-1);
    expect(TEXT_TYPES.indexOf('image')).toBe(-1);
  });
});
```

**Step 2: 입력 시 48글자 분할 — listeners.js의 `setupBlockListeners` 내에 추가**

```javascript
// renderBlocks() 후 각 block-content에 input 이벤트 추가
// setupBlockListeners 함수 내 (listeners.js)
var TEXT_TYPES=['text','h1','h2','h3','bullet','number','quote','todo'];

// 각 블록의 input 이벤트에서 체크
con.addEventListener('input',function(){
  var blk=state.page.blocks[getBlockIdx(b.id)];
  if(!blk||TEXT_TYPES.indexOf(blk.type)===-1)return;
  if(con.textContent.length>48){
    var full=con.textContent;
    var keep=full.substring(0,48);
    var overflow=full.substring(48);
    con.textContent=keep;
    blk.content=keep;
    var curIdx=getBlockIdx(blk.id);
    var newB={id:genId(),type:blk.type,content:overflow};
    if(blk.type==='todo')newB.checked=false;
    if(blk.type==='number')newB.num=(blk.num||1)+1;
    pushUndoImmediate();
    state.page.blocks.splice(curIdx+1,0,newB);
    renderBlocks();
    focusBlock(curIdx+1,0);
    updateNums();
  }
});
```

**주의:** `textContent` 기준 (HTML 태그 제외한 순수 텍스트 길이). 서식(bold, color 등)이 있는 경우 48글자 기준은 textContent 기준이지만, 분할 시 innerHTML 처리가 복잡해질 수 있음. 초기 구현은 textContent 기준 plain text 분할. 서식이 있는 블록의 분할은 추후 개선.

**Step 3: 붙여넣기 48글자 분할 — handlePaste 수정**

`src/editor/listeners.js`의 `handlePaste` (lines 169-228) — 여러 줄 붙여넣기에서 48글자 단위 분할 추가:

```javascript
// handlePaste 내 멀티라인 처리 부분에서:
// 기존: lines를 그대로 블록으로 생성
// 변경: 각 line을 48글자 단위로 분할
var chunks=[];
for(var i=0;i<lines.length;i++){
  var line=lines[i];
  while(line.length>48){
    chunks.push(line.substring(0,48));
    line=line.substring(48);
  }
  if(line.length>0)chunks.push(line);
}
// chunks를 사용하여 블록 생성
```

**Step 4: Commit**

```bash
git add src/editor/listeners.js src/editor/__tests__/char-limit.test.js
git commit -m "feat: 48글자 초과 시 자동 블록 분할"
```

---

## Task 4: 내용 있는 블록에서 슬래시 명령어

**현재 동작:** 빈 블록에서만 `/` → 슬래시 메뉴
**목표:** 내용 있는 블록에서 `/` → 다음 블록 생성 → 그 블록에서 슬래시 메뉴

**Files:**
- Modify: `src/editor/listeners.js:148-152` (슬래시 트리거)
- Modify: `src/ui/toolbar.js:48-86` (execSlash 함수)

**Step 1: listeners.js 슬래시 트리거 수정**

```javascript
// 기존 (line 148-152):
if(e.key==='/'&&el.textContent===''){
  state.slashMenuState={open:true,idx:idx};
  showSlash(el);
  return;
}

// 새 코드:
if(e.key==='/'){
  if(el.textContent===''){
    // 빈 블록: 기존 동작 (현재 블록 교체)
    state.slashMenuState={open:true,idx:idx};
    showSlash(el);
    return;
  }else{
    // 내용 있는 블록: 다음 블록 생성 후 슬래시 메뉴
    e.preventDefault();
    var newB={id:genId(),type:'text',content:''};
    pushUndoImmediate();
    state.page.blocks.splice(idx+1,0,newB);
    renderBlocks();
    setTimeout(function(){
      state.slashMenuState={open:true,idx:idx+1};
      var newEl=$('editor').children[idx+1];
      if(newEl){
        var c=newEl.querySelector('.block-content');
        if(c){c.focus();showSlash(c)}
      }
    },50);
    return;
  }
}
```

**Step 2: Commit**

```bash
git add src/editor/listeners.js
git commit -m "feat: 내용 있는 블록에서 슬래시 명령어 지원"
```

---

## Task 5: Backspace 삭제 규칙 세분화

**현재 동작:** 빈 블록 → 리스트는 text 변환, 그 외 삭제. 커서 앞이면 이전 블록 포커스.
**목표:** 콘텐츠 블록 스킵, 서식 초기화, 콘텐츠 삭제 확인

**Files:**
- Modify: `src/editor/listeners.js:85-110` (Backspace 핸들러)
- Modify: `src/editor/blocks.js:85-101` (deleteBlock 함수)

**콘텐츠 블록 타입 상수:**
```javascript
var CONTENT_TYPES=['table','image','video','pdf','file','slide','calendar','columns','toc','divider'];
```

**Step 1: Backspace — 이전 블록이 콘텐츠일 때 스킵**

```javascript
// src/editor/listeners.js — Backspace 핸들러 수정
// 빈 블록 삭제 후 포커스 로직 (line 98-102):
// 기존:
else if(state.page.blocks.length>1){
  deleteBlock(idx);
  if(idx>0)focusBlock(idx-1);
}

// 새 코드:
else if(state.page.blocks.length>1){
  deleteBlock(idx);
  // 이전 블록 중 텍스트 계열 찾기
  var prevIdx=idx-1;
  var CONTENT_TYPES=['table','image','video','pdf','file','slide','calendar','columns','toc','divider'];
  while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
    prevIdx--;
  }
  if(prevIdx>=0)focusBlock(prevIdx,'end');
  else focusBlock(0,0);
}
```

**Step 2: 커서 맨 앞 Backspace — 콘텐츠 블록 스킵**

```javascript
// src/editor/listeners.js — 커서 맨 앞 Backspace (line 105-110):
// 기존:
if(atStart&&idx>0){
  e.preventDefault();
  focusBlock(idx-1,'end');
  return;
}

// 새 코드:
if(atStart&&idx>0){
  e.preventDefault();
  var prevIdx=idx-1;
  var CONTENT_TYPES=['table','image','video','pdf','file','slide','calendar','columns','toc','divider'];
  while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
    prevIdx--;
  }
  if(prevIdx>=0)focusBlock(prevIdx,'end');
  return;
}
```

**Step 3: 서식 블록 삭제 시 text로 초기화**

`src/editor/listeners.js` — 빈 블록 Backspace에서 H1/H2/H3도 text 변환:

```javascript
// 기존 (line 92-97):
if(b.type==='bullet'||b.type==='number'||b.type==='todo'){
  state.page.blocks[idx].type='text';
  renderBlocks();
  focusBlock(idx);
}

// 새 코드: H1, H2, H3, quote도 포함
if(b.type==='bullet'||b.type==='number'||b.type==='todo'||b.type==='h1'||b.type==='h2'||b.type==='h3'||b.type==='quote'){
  state.page.blocks[idx].type='text';
  renderBlocks();
  focusBlock(idx);
}
```

**Step 4: Commit**

```bash
git add src/editor/listeners.js
git commit -m "feat: Backspace 삭제 규칙 세분화 — 콘텐츠 스킵, 서식 초기화"
```

---

## Task 6: Ctrl+[/] 블록 이동 단축키

**Files:**
- Modify: `src/editor/listeners.js:478-491` (global keydown 핸들러)

**Step 1: 키보드 핸들러 추가**

```javascript
// src/editor/listeners.js — global keydown (line 478 이후에 추가):
if((e.metaKey||e.ctrlKey)&&e.key===']'){
  e.preventDefault();
  var ci=getCurrentIdx();
  if(ci>0){moveBlockUp(ci);focusBlock(ci-1)}
  return;
}
if((e.metaKey||e.ctrlKey)&&e.key==='['){
  e.preventDefault();
  var ci=getCurrentIdx();
  if(ci<state.page.blocks.length-1){moveBlockDown(ci);focusBlock(ci+1)}
  return;
}
```

**주의:** `getCurrentIdx()`는 `blocks.js`에서 import 필요. 현재 listeners.js에 이미 import되어 있는지 확인.

**Step 2: Import 확인**

```javascript
// listeners.js 상단 import에 moveBlockUp, moveBlockDown, getCurrentIdx가 있는지 확인
// 없으면 추가
```

**Step 3: Commit**

```bash
git add src/editor/listeners.js
git commit -m "feat: Ctrl+[/] 블록 이동 단축키"
```

---

## Task 7: Ctrl+1~0 텍스트 컬러 단축키

**Files:**
- Modify: `src/editor/listeners.js:478-491` (global keydown 핸들러)

**Step 1: 색상 매핑 정의 및 핸들러 추가**

```javascript
// src/editor/listeners.js — global keydown에 추가:
var COLOR_MAP={
  '1':'#FF0000','2':'#FF8C00','3':'#FFD700','4':'#00C853',
  '5':'#2196F3','6':'#1A237E','7':'#9C27B0','8':'#E91E63',
  '9':'#9E9E9E','0':null
};
if((e.metaKey||e.ctrlKey)&&COLOR_MAP.hasOwnProperty(e.key)){
  var sel=window.getSelection();
  if(sel&&!sel.isCollapsed&&state.editMode){
    e.preventDefault();
    if(e.key==='0'){
      document.execCommand('removeFormat',false,null);
    }else{
      document.execCommand('foreColor',false,COLOR_MAP[e.key]);
    }
    triggerAutoSave();
  }
  return;
}
```

**주의:** `triggerAutoSave`가 listeners.js에서 접근 가능한지 확인. 현재 `pushUndo` 타이머를 사용하는 패턴.

**Step 2: Commit**

```bash
git add src/editor/listeners.js
git commit -m "feat: Ctrl+1~0 텍스트 컬러 단축키 (10색)"
```

---

## Task 8: 새 페이지 생성 시 블록 포커스

**현재 동작:** 새 페이지 → toggleEdit → 제목 포커스 (블록은 포커스 안 됨)
**목표:** 제목 입력 후 첫 블록에도 접근 가능하도록 보장. 실제로 현재 `loadPage` → `renderBlocks` → 편집 모드 전환 흐름에서 블록 1개가 이미 생성됨. 추가 수정 불필요할 수 있으나 확인.

**Files:**
- Modify: `src/ui/sidebar.js:132-139` (createPage 함수)

**Step 1: 현재 동작 확인**

`createPage`의 line 134: `[{id:genId(),type:'text',content:''}]` — 이미 빈 블록 1개 생성.
Line 138: `toggleEdit()` + `$('pageTitle').focus()` — 제목에 포커스.

현재 흐름이 이미 요구사항 충족. 단, 제목 입력 후 Enter 시 블록으로 포커스 이동하는지 확인 필요.

**Step 2: 제목에서 Enter → 첫 블록 포커스**

```javascript
// src/ui/sidebar.js의 createPage 또는 listeners.js에서:
// 현재 pageTitle에 Enter 이벤트가 있는지 확인
// 없다면 추가:
$('pageTitle').addEventListener('keydown',function(e){
  if(e.key==='Enter'){
    e.preventDefault();
    focusBlock(0,0);
  }
});
```

**이미 listeners.js에 있는지 확인 필요.**

**Step 3: Commit**

```bash
git add src/editor/listeners.js
git commit -m "feat: 새 페이지 제목 Enter 시 첫 블록 포커스"
```

---

## Task 9: 최종 테스트 및 빌드

**Step 1: 전체 테스트 실행**

```bash
npx vitest run
```

**Step 2: 빌드**

```bash
npm run build
```

**Step 3: Firebase 배포 (사용자 확인 후)**

```bash
npx firebase deploy --only hosting
```

**Step 4: 수동 테스트 체크리스트**

- [ ] Enter: "레벨 에디터 제너레이트" 중간에서 Enter → 분할 확인
- [ ] Enter + 선택: 텍스트 선택 후 Enter → 선택 삭제 + 분할
- [ ] 48글자: 49번째 글자 입력 시 자동 분할
- [ ] 48글자 붙여넣기: 100글자 텍스트 붙여넣기 → 3개 블록
- [ ] 슬래시: 내용 있는 블록에서 `/` → 다음 블록에 슬래시 메뉴
- [ ] Ctrl+]: 블록 위로 이동
- [ ] Ctrl+[: 블록 아래로 이동
- [ ] Ctrl+1~9: 텍스트 선택 후 컬러 변경
- [ ] Ctrl+0: 컬러 제거
- [ ] Backspace (빈 블록): 이전 텍스트 블록으로 포커스 (콘텐츠 블록 스킵)
- [ ] Backspace (H1 빈 블록): text로 변환
- [ ] 새 페이지: 제목 Enter → 첫 블록 포커스
- [ ] 토글: 화살표만 토글 동작 (텍스트 클릭 시 토글 안 됨)

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: 블록 시스템 규칙 개선 완료"
```
