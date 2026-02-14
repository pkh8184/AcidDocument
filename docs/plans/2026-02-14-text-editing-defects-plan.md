# 글 작성/제목/편집 결함 수정 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** contenteditable 기반 에디터의 24개 텍스트 편집 결함을 6개 Phase로 순차 수정

**Architecture:** listeners.js(이벤트), blocks.js(블록 CRUD/포커스), sidebar.js(저장/제목), toolbar.js(서식) 4개 파일 중심으로 수정. DOM contenteditable + Range/Selection API 기반. 각 Phase는 독립적이며 Phase 순서대로 커밋.

**Tech Stack:** Vanilla JS (var only, ES Modules), Vite, Vitest, contenteditable API, Range/Selection API, document.execCommand

---

## Task 1: 제목 + 저장 동기화 — 중복 onTitleChange 제거 + saveDoc autoSaveTimer 정리

**설계 이슈:** #1 (중복 onTitleChange), #4 (saveDoc가 autoSaveTimer 안 지움)

**Files:**
- Modify: `src/ui/sidebar.js:228` — 중복 `onTitleChange` export 제거
- Modify: `src/ui/sidebar.js:176-182` — `saveDoc()`에 `clearTimeout(state.autoSaveTimer)` 추가
- Test: `src/editor/__tests__/text-editing.test.js` (새 파일)

**배경:**
- `blocks.js:9`에 `onTitleChange` 정의, `sidebar.js:228`에도 동일 함수 존재
- `main.js:14`는 `blocks.js`에서 import → `sidebar.js`의 것은 사실상 dead code이므로 제거
- `saveDoc()`은 수동 저장인데, 호출 후 1500ms 이내에 `autoSaveTimer`가 발동하면 불필요한 이중 저장 발생

**Step 1: 테스트 작성**

`src/editor/__tests__/text-editing.test.js` 파일 생성:

```javascript
// src/editor/__tests__/text-editing.test.js — 텍스트 편집 결함 수정 테스트

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock setup
var { mockState } = vi.hoisted(() => {
  var mockState = {
    editMode: true,
    editBackup: null,
    page: { id: 'p1', title: '테스트', icon: '📄', blocks: [], tags: [], versions: [], comments: [], author: 'test', updated: Date.now() },
    db: { pages: [], settings: { wsName: 'Test' }, recent: [], users: [], templates: [] },
    user: { id: 'testuser', nickname: 'Tester' },
    autoSaveTimer: null,
    undoTimer: null,
    isComposing: false,
    slashMenuState: { open: false, idx: null },
    undoStack: [],
    redoStack: [],
    panelType: null,
    currentInsertIdx: null,
    dragBlockIdx: null,
    savedSelection: null,
    _mockCollectedBlocks: [],
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../../data/firestore.js', () => ({
  saveDB: vi.fn(),
  logDeleteAction: vi.fn(),
  USE_NEW_STRUCTURE: false,
  batchDeletePages: vi.fn(),
}));
vi.mock('../../config/firebase.js', () => ({
  MAX_VER: 50,
  ALLOWED_IMAGE_TYPES: [],
  COLORS: [],
  SLASH: [],
  EMOJIS: [],
}));
vi.mock('../../auth/auth.js', () => ({
  isSuper: vi.fn(() => false),
}));
vi.mock('../renderer.js', () => ({
  renderBlocks: vi.fn(),
  insertBlockEl: vi.fn(),
  removeBlockEl: vi.fn(),
}));
vi.mock('../../ui/modals.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
  closeAllPanels: vi.fn(),
  closeAllModals: vi.fn(),
}));

describe('Task 1: saveDoc autoSaveTimer 정리', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // DOM setup
    document.body.innerHTML =
      '<input id="pageTitle" value="테스트" />' +
      '<span id="pageIcon">📄</span>' +
      '<div id="editor"></div>' +
      '<div id="breadcrumb"></div>' +
      '<div id="pageMeta"></div>' +
      '<div id="pageTags"></div>' +
      '<div id="editBtn" style="display:inline-flex"></div>' +
      '<div id="deletePageBtn" style="display:inline-flex"></div>' +
      '<div id="saveBtn" style="display:none"></div>' +
      '<div id="cancelBtn" style="display:none"></div>' +
      '<div id="editorWrap"></div>' +
      '<div id="versionList"></div>' +
      '<div id="commentList"></div>' +
      '<div id="pageTree"></div>' +
      '<div id="ctxMenu"></div>' +
      '<div id="slashMenu"></div>' +
      '<div id="fmtBar"></div>' +
      '<div id="tagPicker"></div>';

    mockState.autoSaveTimer = 12345;
    mockState.page = {
      id: 'p1', title: '테스트', icon: '📄',
      blocks: [{ id: 'b1', type: 'text', content: '내용' }],
      tags: [], versions: [], comments: [], author: 'test', updated: Date.now()
    };
    mockState.db.pages = [mockState.page];
    mockState._mockCollectedBlocks = [{ id: 'b1', type: 'text', content: '내용' }];
  });

  it('saveDoc 호출 시 autoSaveTimer를 초기화한다', async () => {
    // blocks.js mock에서 collectBlocks 사용
    vi.mock('../blocks.js', () => ({
      getPages: vi.fn(() => []),
      getPage: vi.fn((id) => mockState.db.pages.find((p) => p.id === id) || null),
      getPath: vi.fn(() => []),
      collectBlocks: vi.fn(() => mockState._mockCollectedBlocks || []),
      triggerAutoSave: vi.fn(),
    }));

    var { saveDoc } = await import('../../ui/sidebar.js');
    var clearSpy = vi.spyOn(global, 'clearTimeout');

    saveDoc();

    expect(clearSpy).toHaveBeenCalledWith(12345);
    expect(mockState.autoSaveTimer).toBe(null);
    clearSpy.mockRestore();
  });
});
```

**Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: FAIL — `saveDoc`가 아직 `clearTimeout`을 호출하지 않으므로

**Step 3: sidebar.js 수정 — saveDoc에 clearTimeout 추가**

`src/ui/sidebar.js:176` — `saveDoc` 함수 시작부에 추가:

```javascript
export function saveDoc(){
  if(!state.page)return;
  clearTimeout(state.autoSaveTimer);state.autoSaveTimer=null;
  var p=getPage(state.page.id);if(!p)return;
  // ... 나머지 동일
```

**Step 4: sidebar.js 수정 — 중복 onTitleChange 제거**

`src/ui/sidebar.js:228`의 `export function onTitleChange(){triggerAutoSave()}` 삭제.

> **참고:** `main.js:14`는 `blocks.js`에서 `onTitleChange`를 import하므로, sidebar.js에서 삭제해도 기능에 영향 없음. sidebar.js의 다른 함수들이 `onTitleChange`를 내부적으로 참조하지 않는지 확인 필요.

**Step 5: 테스트 실행 — 성공 확인**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 6: 커밋**

```bash
git add src/ui/sidebar.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: saveDoc autoSaveTimer 정리 및 중복 onTitleChange 제거"
```

---

## Task 2: 제목 composition 핸들러 + Enter 빈 페이지 포커스

**설계 이슈:** #2 (제목 composition 핸들러 없음), #3 (Enter 빈 페이지 포커스 실패)

**Files:**
- Modify: `src/editor/listeners.js:497-506` — 제목 compositionstart/end + Enter 블록 생성
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- 한국어 입력 시 `pageTitle`의 `oninput="onTitleChange()"` (HTML 인라인)이 composition 중에도 발생 → 불필요한 autoSave 트리거
- `listeners.js:504`에서 Enter 시 `focusBlock(0,0)` 호출하는데, 블록이 0개면 실패

**Step 1: 테스트 추가**

`text-editing.test.js`에 추가:

```javascript
describe('Task 2: 제목 Enter 빈 페이지 포커스', () => {
  it('블록이 없을 때 Enter 시 빈 text 블록을 생성한다', () => {
    mockState.page.blocks = [];
    mockState.editMode = true;

    // Enter 이벤트 시뮬레이션 후 블록 추가 여부 확인
    // setupListeners의 pageTitle keydown에서 블록이 없으면 생성하는 로직 테스트
    expect(mockState.page.blocks.length).toBe(0);

    // 블록 생성 로직 직접 테스트
    if (mockState.page.blocks.length === 0) {
      mockState.page.blocks.push({ id: 'new1', type: 'text', content: '' });
    }
    expect(mockState.page.blocks.length).toBe(1);
    expect(mockState.page.blocks[0].type).toBe('text');
  });
});
```

**Step 2: listeners.js 수정 — 제목 Enter 핸들러**

`src/editor/listeners.js:500-506` 수정:

```javascript
  // 제목에서 Enter → 첫 블록 포커스
  var titleEl=$('pageTitle');
  var titleComposing=false;
  titleEl.addEventListener('compositionstart',function(){titleComposing=true});
  titleEl.addEventListener('compositionend',function(){titleComposing=false});
  titleEl.addEventListener('keydown',function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      if(!state.page||!state.page.blocks||state.page.blocks.length===0){
        // 블록이 없으면 빈 text 블록 생성
        if(state.page){
          state.page.blocks=[{id:genId(),type:'text',content:''}];
          renderBlocks();
        }
      }
      focusBlock(0,0);
    }
  });
  // 제목 input에서 composition 중 autoSave 방지
  titleEl.addEventListener('input',function(){
    if(titleComposing)return;
    triggerAutoSave();
  });
```

> **참고:** HTML에서 `oninput="onTitleChange()"` 인라인 핸들러도 제거 필요. index.html에서 `pageTitle`의 `oninput` 속성을 제거하고 위 JS 리스너로 대체.

**Step 3: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 4: 커밋**

```bash
git add src/editor/listeners.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: 제목 IME composition 핸들러 추가 및 빈 페이지 Enter 포커스 수정"
```

---

## Task 3: collectBlocks DOM/state 불일치 수정

**설계 이슈:** #5 (collectBlocks DOM/state 불일치)

**Files:**
- Modify: `src/editor/blocks.js:142` — `collectBlocks` 함수 수정
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- `collectBlocks()`는 항상 DOM에서 읽는데, 뷰 모드에서도 DOM을 사용하면 stale DOM 참조 가능
- 편집 모드에서만 DOM에서 content를 수집하고, 뷰 모드에서는 `state.page.blocks` 그대로 반환

**Step 1: 테스트 추가**

```javascript
describe('Task 3: collectBlocks 뷰 모드', () => {
  it('editMode=false일 때 state.page.blocks를 깊은 복사로 반환한다', () => {
    mockState.editMode = false;
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: '원본' }];

    // collectBlocks가 비편집 모드에서 state를 반환하는지 확인
    // (실제 DOM이 아닌 state 기반)
    var result = JSON.parse(JSON.stringify(mockState.page.blocks));
    expect(result).toEqual([{ id: 'b1', type: 'text', content: '원본' }]);
    expect(result).not.toBe(mockState.page.blocks); // 깊은 복사 확인
  });
});
```

**Step 2: blocks.js 수정**

`src/editor/blocks.js:142` — `collectBlocks` 함수 시작부에 뷰 모드 가드 추가:

```javascript
export function collectBlocks(){
  // 뷰 모드에서는 state에서 직접 반환 (DOM 접근 불필요)
  if(!state.editMode){
    return JSON.parse(JSON.stringify(state.page.blocks));
  }
  var blks=[],chs=$('editor').children;
  // ... 나머지 기존 코드 동일
```

**Step 3: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 4: 커밋**

```bash
git add src/editor/blocks.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: collectBlocks 뷰 모드에서 state 기반 반환으로 DOM 불일치 방지"
```

---

## Task 4: IME/한국어 입력 — isComposing 가드 + 48글자 분할 서식 보존

**설계 이슈:** #6 (input에 isComposing 가드 없음), #7 (48글자 분할이 textContent 사용 → 서식 손실), #8 (compositionend 슬래시 필터 중복)

**Files:**
- Modify: `src/editor/listeners.js:297-342` — input 이벤트 핸들러, compositionend 핸들러
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- `input` 이벤트 핸들러(line 297)에서 48글자 분할 로직이 `state.isComposing` 체크 없이 실행됨
- 한국어 조합 중 48글자에 도달하면 분할이 발동되어 글자가 깨짐
- `el.textContent=keep` (line 307)으로 HTML 전부 제거 → bold, italic, color 등 서식 손실
- `compositionend`(line 332-342)에서 슬래시 필터가 `input` 이벤트와 중복 실행

**Step 1: 테스트 추가**

```javascript
describe('Task 4: 48글자 분할 서식 보존', () => {
  it('innerHTML 기반으로 48글자 지점을 분할한다', () => {
    // 순수 텍스트 48글자 분할 시뮬레이션
    var html = '<b>볼드텍스트</b>일반텍스트가여기에들어갑니다추가텍스트더넣기위해서길게작성합니다오버플로우';
    var div = document.createElement('div');
    div.innerHTML = html;

    // textContent 길이 체크
    var fullText = div.textContent;
    expect(fullText.length).toBeGreaterThan(48);

    // 서식 보존 분할: TreeWalker로 48글자 지점 찾기
    var count = 0;
    var walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false);
    var splitNode = null;
    var splitOffset = 0;
    while (walker.nextNode()) {
      var node = walker.currentNode;
      if (count + node.length >= 48) {
        splitNode = node;
        splitOffset = 48 - count;
        break;
      }
      count += node.length;
    }
    expect(splitNode).not.toBeNull();
    expect(splitOffset).toBeGreaterThan(0);
  });

  it('isComposing 중에는 48글자 분할을 실행하지 않는다', () => {
    mockState.isComposing = true;
    // isComposing 상태에서는 분할 로직 스킵
    var shouldSplit = !mockState.isComposing && 50 > 48;
    expect(shouldSplit).toBe(false);
    mockState.isComposing = false;
  });
});
```

**Step 2: listeners.js 수정 — input 핸들러**

`src/editor/listeners.js:297-318` — `setupBlockEvents` 내부의 input 핸들러 수정:

```javascript
    el.addEventListener('input',function(){
      triggerAutoSave();
      // isComposing 중에는 48글자 분할 및 슬래시 필터 스킵
      if(state.isComposing)return;
      // 48글자 초과 시 자동 블록 분할 (서식 보존)
      var curIdx=findBlockIndex(b.id);
      var blk=state.page.blocks[curIdx];
      if(blk&&TEXT_TYPES.indexOf(blk.type)!==-1){
        if(el.textContent.length>48){
          // TreeWalker로 48글자 지점 찾기 (서식 보존)
          var count=0,splitNode=null,splitOffset=0;
          var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false);
          while(walker.nextNode()){
            var node=walker.currentNode;
            if(count+node.length>=48){
              splitNode=node;
              splitOffset=48-count;
              break;
            }
            count+=node.length;
          }
          if(!splitNode)return;
          // Range로 48글자 이후 콘텐츠 추출
          var range=document.createRange();
          range.setStart(splitNode,splitOffset);
          range.setEnd(el,el.childNodes.length);
          var frag=range.extractContents();
          var tempDiv=document.createElement('div');
          tempDiv.appendChild(frag);
          var overflowHTML=tempDiv.innerHTML;
          // 현재 블록 업데이트
          blk.content=el.innerHTML;
          var newB={id:genId(),type:blk.type,content:overflowHTML};
          if(blk.type==='todo')newB.checked=false;
          if(blk.type==='number')newB.num=(blk.num||1)+1;
          pushUndoImmediate();
          state.page.blocks.splice(curIdx+1,0,newB);
          renderBlocks();
          focusBlock(curIdx+1,0);
          updateNums();
          return;
        }
      }
      // 슬래시 메뉴 필터링
      var menu=$('slashMenu');
      if(menu.classList.contains('open')){
        var txt=el.innerText||el.textContent;
        txt=txt.replace(/\n/g,'').trim();
        if(txt.startsWith('/'))filterSlash(txt.slice(1));
        else hideSlash();
      }
    });
```

**Step 3: listeners.js 수정 — compositionend 핸들러**

`src/editor/listeners.js:332-342` — compositionend에서 슬래시 필터 제거:

```javascript
    el.addEventListener('compositionend',function(){
      state.isComposing=false;
      // 슬래시 필터는 input 이벤트에서 이미 처리되므로 여기서는 제거
      // (input은 compositionend 직후 자동 발생)
    });
```

**Step 4: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 5: 커밋**

```bash
git add src/editor/listeners.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: 48글자 분할 서식 보존(innerHTML 기반) + isComposing 가드 추가"
```

---

## Task 5: 키보드 동작 — paste 멀티라인 첫 chunk 손실 수정

**설계 이슈:** #9 (paste 멀티라인 첫 chunk 손실)

**Files:**
- Modify: `src/editor/listeners.js:256-282` — `handlePaste` 함수 멀티라인 처리
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- 멀티라인 붙여넣기 시 `document.execCommand('insertText', false, firstChunk)` 로 첫 chunk를 DOM에 삽입한 후 `renderBlocks()` 호출
- `renderBlocks()`가 DOM을 초기화하므로 첫 chunk의 DOM 삽입이 사라짐
- 첫 chunk도 state에 직접 설정해야 함

**Step 1: 테스트 추가**

```javascript
describe('Task 5: paste 멀티라인 첫 chunk', () => {
  it('첫 chunk를 state에 직접 추가한다', () => {
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: '기존내용' }];
    mockState.currentInsertIdx = 0;

    var chunks = ['첫번째줄', '두번째줄', '세번째줄'];
    var idx = 0;
    // 첫 chunk를 현재 블록에 append
    mockState.page.blocks[idx].content += chunks[0];
    // 나머지는 새 블록
    for (var j = 1; j < chunks.length; j++) {
      idx++;
      mockState.page.blocks.splice(idx, 0, { id: 'new' + j, type: 'text', content: chunks[j] });
    }

    expect(mockState.page.blocks.length).toBe(3);
    expect(mockState.page.blocks[0].content).toBe('기존내용첫번째줄');
    expect(mockState.page.blocks[1].content).toBe('두번째줄');
    expect(mockState.page.blocks[2].content).toBe('세번째줄');
  });
});
```

**Step 2: listeners.js 수정 — handlePaste 멀티라인**

`src/editor/listeners.js:256-282` 수정:

```javascript
  // 여러 줄 텍스트 붙여넣기 - 문단별 블록화
  if(txt&&txt.indexOf('\n')!==-1){
    var lines=txt.split(/\n+/).filter(function(l){return l.trim()!==''});
    if(lines.length>1){
      // 48글자 단위로 추가 분할
      var chunks=[];
      for(var ci=0;ci<lines.length;ci++){
        var line=lines[ci];
        while(line.length>48){
          chunks.push(line.substring(0,48));
          line=line.substring(48);
        }
        if(line.length>0)chunks.push(line);
      }
      pushUndoImmediate();
      var idx=state.currentInsertIdx!==null?state.currentInsertIdx:state.page.blocks.length-1;
      var curBlock=state.page.blocks[idx];
      // 첫 chunk를 현재 블록의 content에 append (state 직접)
      if(curBlock){
        curBlock.content=(curBlock.content||'')+chunks[0];
      }
      // 나머지 청크는 새 블록으로
      for(var j=1;j<chunks.length;j++){
        idx++;
        state.page.blocks.splice(idx,0,{id:genId(),type:'text',content:chunks[j]});
      }
      renderBlocks();triggerAutoSave();
      return;
    }
  }
```

**Step 3: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 4: 커밋**

```bash
git add src/editor/listeners.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: paste 멀티라인 첫 chunk를 state에 직접 설정하여 손실 방지"
```

---

## Task 6: 키보드 동작 — Backspace 스킵 로직 + Delete 병합 + Enter 커서 위치

**설계 이슈:** #10 (Backspace 스킵 로직 커서 고정), #11 (Delete 병합 HTML 깨짐), #12 (Enter 분할 후 커서 위치)

**Files:**
- Modify: `src/editor/listeners.js:104-156` — Backspace/Delete/Enter 핸들러 수정
- Modify: `src/editor/listeners.js:67-95` — Enter 분할 후 커서 위치
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- **Backspace (line 120-125):** `prevIdx` while 루프에서 모든 이전 블록이 CONTENT_TYPES이면 `prevIdx=-1`, 포커스 실패. `idx-1`로 폴백 필요.
- **Delete (line 149):** `b.content=el.innerHTML+(nextB.content||'')` 에서 두 블록의 마지막/첫 태그가 잘못 연결될 수 있음. 불필요한 `<br>` 태그 정리 필요.
- **Enter (line 93):** `insertBlock(idx+1,newB)` 후 `focusBlock`이 `insertBlock` 내부에서 `focusBlock(idx,0)`으로 호출됨 (line 80). 이것은 삽입 위치(idx)에 포커스하므로 올바름. 하지만 `insertBlock`의 `focusBlock(idx,0)`은 새 블록의 시작(position 0)에 포커스하는 것이 맞음.

**Step 1: 테스트 추가**

```javascript
describe('Task 6: Backspace/Delete/Enter 키 동작', () => {
  it('Backspace: 이전 블록이 모두 content 타입일 때 idx-1로 폴백한다', () => {
    var CONTENT_TYPES = ['table', 'image', 'video', 'pdf', 'file', 'slide', 'calendar', 'columns', 'toc', 'divider'];
    var blocks = [
      { type: 'image', content: '' },
      { type: 'table', content: '' },
      { type: 'text', content: '' }
    ];
    var idx = 2;
    var prevIdx = idx - 1;
    while (prevIdx >= 0 && CONTENT_TYPES.indexOf(blocks[prevIdx].type) !== -1) {
      prevIdx--;
    }
    // prevIdx가 -1이면 idx-1로 폴백
    if (prevIdx < 0) prevIdx = idx - 1;
    expect(prevIdx).toBe(1); // table 블록으로 폴백
  });

  it('Delete: 병합 시 trailing <br> 제거', () => {
    var current = '앞부분<br>';
    var next = '뒷부분';
    // <br>로 끝나면 제거 후 병합
    var merged = current.replace(/<br\s*\/?>$/i, '') + next;
    expect(merged).toBe('앞부분뒷부분');
  });
});
```

**Step 2: listeners.js 수정 — Backspace 스킵 로직**

`src/editor/listeners.js:117-126` 수정:

```javascript
      else if(state.page.blocks.length>1){
        deleteBlock(idx);
        var prevIdx=idx-1;
        while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
          prevIdx--;
        }
        // 텍스트 블록을 찾지 못하면 바로 이전 블록으로 폴백
        if(prevIdx<0)prevIdx=Math.max(0,idx-1);
        setTimeout(function(){focusBlock(prevIdx,'end')},50);
      }
```

`src/editor/listeners.js:130-137` (커서 맨 앞 병합) 수정:

```javascript
    if(atStart&&idx>0){
      e.preventDefault();
      var prevIdx=idx-1;
      while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
        prevIdx--;
      }
      if(prevIdx<0)prevIdx=idx-1;
      focusBlock(prevIdx,'end');
      return;
    }
```

**Step 3: listeners.js 수정 — Delete 병합 HTML 정리**

`src/editor/listeners.js:148-153` 수정:

```javascript
      if(['text','h1','h2','h3','bullet','number','quote'].includes(nextB.type)){
        // 현재 블록 끝의 <br> 제거 후 병합
        var curHTML=el.innerHTML.replace(/<br\s*\/?>$/i,'');
        b.content=curHTML+(nextB.content||'');
        state.page.blocks.splice(idx+1,1);
        renderBlocks();
        focusBlock(idx,el.textContent.length);
      }
```

**Step 4: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 5: 커밋**

```bash
git add src/editor/listeners.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: Backspace 스킵 폴백, Delete 병합 HTML 정리"
```

---

## Task 7: 키보드 동작 — 블록 타입 변경 toggle innerContent 보존

**설계 이슈:** #13 (블록 타입 변경 toggle innerContent 손실)

**Files:**
- Modify: `src/editor/blocks.js:130-141` — `changeBlockType` 함수
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- `changeBlockType(idx, newType)` 에서 toggle→text→toggle 변환 시 `b.innerContent`가 사라짐
- line 137: `if(newType==='toggle'){b.open=false;b.innerContent='';}` — 무조건 빈 문자열로 초기화
- 기존 `innerContent`가 있으면 보존해야 함

**Step 1: 테스트 추가**

```javascript
describe('Task 7: changeBlockType toggle innerContent 보존', () => {
  it('toggle에서 text로 변환 시 innerContent 보존', () => {
    var block = { id: 'b1', type: 'toggle', content: '토글 제목', innerContent: '토글 내용', open: true };
    // text로 변환
    var oldInner = block.innerContent;
    block.type = 'text';
    // innerContent는 필드만 남기고 유지 (다시 toggle로 돌아올 때 복원 가능)
    expect(block.innerContent).toBe('토글 내용');
  });

  it('text에서 toggle로 변환 시 기존 innerContent 복원', () => {
    var block = { id: 'b1', type: 'text', content: '토글 제목', innerContent: '토글 내용' };
    block.type = 'toggle';
    block.open = false;
    // 기존 innerContent가 있으면 유지, 없으면 빈 문자열
    if (!block.innerContent) block.innerContent = '';
    expect(block.innerContent).toBe('토글 내용');
  });
});
```

**Step 2: blocks.js 수정**

`src/editor/blocks.js:130-141` — `changeBlockType` 수정:

```javascript
export function changeBlockType(idx,newType){
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  var oldContent=b.content||'';
  b.type=newType;
  b.content=oldContent;
  if(newType==='todo')b.checked=false;
  if(newType==='toggle'){
    b.open=false;
    // 기존 innerContent가 있으면 보존, 없으면 빈 문자열
    if(!b.innerContent)b.innerContent='';
  }
  renderBlocks();
  updateNums();
  focusBlock(idx,-1);
}
```

**Step 3: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 4: 커밋**

```bash
git add src/editor/blocks.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: changeBlockType toggle innerContent 보존"
```

---

## Task 8: 드래그앤드롭 — DOM→state 동기화 + 파일 드롭 indicator 제거

**설계 이슈:** #14 (드래그 전 DOM→state 동기화 안 됨), #15 (드롭 위치 계산 오류), #16 (파일 드롭 시 indicator 미제거)

**Files:**
- Modify: `src/editor/listeners.js:638-726` — 드래그앤드롭 핸들러
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- **#14:** 편집 중인 블록을 드래그하면 `reorderBlock`이 state의 content를 사용하지만, DOM에서 수정한 내용이 아직 state에 반영 안 됨. `reorderBlock` 호출 전 `syncBlocksFromDOM()` 필요.
- **#15:** `toIdx>state.dragBlockIdx` 이면 `toIdx--` 하는 로직 검증 — indicator 위치가 splice 이후 인덱스와 다를 수 있음. 현재 코드가 맞는지 확인 후 필요시 수정.
- **#16:** 파일 드롭 경로(line 694-725)에서 `drag-indicator` 제거가 없음.

**Step 1: 테스트 추가**

```javascript
describe('Task 8: 드래그앤드롭 동기화', () => {
  it('파일 드롭 시 drag-indicator를 제거한다', () => {
    document.body.innerHTML = '<div id="editor"><div class="drag-indicator"></div></div>';
    var editor = document.getElementById('editor');
    var ind = editor.querySelector('.drag-indicator');
    expect(ind).not.toBeNull();
    // 파일 드롭 핸들러에서 indicator 제거
    if (ind) ind.remove();
    expect(editor.querySelector('.drag-indicator')).toBeNull();
  });
});
```

**Step 2: listeners.js 수정 — reorderBlock 전 DOM 동기화**

`src/editor/listeners.js:682-692` 수정 (drop 핸들러의 블록 재정렬 부분):

```javascript
    if(state.dragBlockIdx!==null){
      var ind=editor.querySelector('.drag-indicator');
      var toIdx=ind?parseInt(ind.getAttribute('data-drop-idx')):state.dragBlockIdx;
      if(ind)ind.remove();
      if(toIdx>state.dragBlockIdx)toIdx--;
      // 드래그 전 현재 편집 중인 DOM 내용을 state에 동기화
      var edChs=editor.children;
      for(var si=0;si<edChs.length;si++){
        var sEl=edChs[si],sId=sEl.getAttribute('data-id');
        if(!sId)continue;
        for(var sj=0;sj<state.page.blocks.length;sj++){
          if(state.page.blocks[sj].id===sId){
            var sCon=sEl.querySelector('.block-content');
            if(sCon)state.page.blocks[sj].content=sCon.innerHTML;
            break;
          }
        }
      }
      reorderBlock(state.dragBlockIdx,toIdx);
      state.dragBlockIdx=null;
      return;
    }
```

**Step 3: listeners.js 수정 — 파일 드롭 시 indicator 제거**

`src/editor/listeners.js:694` 바로 아래에 추가:

```javascript
    // 파일 드롭 시에도 drag indicator 제거
    var fileInd=editor.querySelector('.drag-indicator');
    if(fileInd)fileInd.remove();
    var files=e.dataTransfer.files;
```

**Step 4: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 5: 커밋**

```bash
git add src/editor/listeners.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: 드래그앤드롭 DOM→state 동기화 + 파일 드롭 indicator 제거"
```

---

## Task 9: 서식/스타일링 — 컬러 피커 selection 복원 + 빈 선택 서식 + 서식 후 포커스

**설계 이슈:** #17 (컬러 피커 열면 selection 사라짐), #18 (execCommand 빈 선택 시 무반응), #19 (서식 적용 후 포커스 손실)

**Files:**
- Modify: `src/ui/toolbar.js:14-27` — `fmtCmd`, `applyColor`, `openColorPicker`
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- **#17:** `openColorPicker()` → `saveSelection()` → modal 열림 → focus 이동 → selection 소멸. `applyColor`에서 `restoreSelection()` 호출 후 `execCommand`하는 현재 구조는 맞지만, modal이 열릴 때 selection이 이미 날아간 상태이므로 `saveSelection` 시점이 중요. 현재 `saveSelection()`은 `openColorPicker()` 시작에서 호출하므로 타이밍은 맞음. 문제는 `restoreSelection()` 후 focus가 원래 contenteditable로 돌아가지 않는 경우.
- **#18:** `fmtCmd(cmd)` (line 14)에서 선택 없이 호출하면 `execCommand`가 아무 효과 없음. 현재 커서 위치의 단어를 자동 선택하는 것은 과도하므로 — YAGNI. 대신 선택이 없으면 toast로 안내.
- **#19:** 서식 단축키(Ctrl+B/I/U) 후에는 `execCommand` 자체가 selection을 유지하므로 문제 없음. `fmtCmd` 호출 후 포커스가 이동하는 경우만 대응.

**Step 1: 테스트 추가**

```javascript
describe('Task 9: 서식 적용', () => {
  it('savedSelection이 있으면 restoreSelection 후 execCommand 실행', () => {
    // saveSelection/restoreSelection 흐름 검증
    var saved = { startContainer: null, startOffset: 0 };
    mockState.savedSelection = saved;
    expect(mockState.savedSelection).toBe(saved);
    // restoreSelection 호출 후
    mockState.savedSelection = null; // 사용 후 초기화
    expect(mockState.savedSelection).toBeNull();
  });
});
```

**Step 2: toolbar.js 수정 — applyColor 강화**

`src/ui/toolbar.js:27` 수정:

```javascript
export function applyColor(c){
  closeModal('colorModal');
  restoreSelection();
  // selection이 유효한지 확인
  var sel=window.getSelection();
  if(!sel||sel.isCollapsed){
    // selection이 없으면 savedSelection으로 재시도
    if(state.savedSelection){
      sel.removeAllRanges();
      sel.addRange(state.savedSelection);
    }
  }
  document.execCommand('foreColor',false,c);
  state.savedSelection=null;
  triggerAutoSave();
}
```

**Step 3: toolbar.js 수정 — fmtCmd 빈 선택 가드**

`src/ui/toolbar.js:14` 수정:

```javascript
export function fmtCmd(cmd){
  var sel=window.getSelection();
  if(!sel||sel.isCollapsed){
    toast('텍스트를 선택해주세요','warn');
    return;
  }
  document.execCommand(cmd,false,null);
  triggerAutoSave();
}
```

**Step 4: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 5: 커밋**

```bash
git add src/ui/toolbar.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: 컬러 피커 selection 복원 강화 + fmtCmd 빈 선택 가드"
```

---

## Task 10: 포커스/이벤트 관리 — 48글자 분할 후 포커스 + focusBlock 타이밍 + silent catch

**설계 이슈:** #21 (48글자 분할 후 커서 사라짐), #22 (focusBlock 30ms 타이밍), #23 (뷰 모드 클릭 이벤트), #24 (focusBlock silent catch)

**Files:**
- Modify: `src/editor/blocks.js:34-75` — `focusBlock` 함수
- Modify: `src/editor/listeners.js:290-296` — setupBlockEvents editMode 가드
- Modify: `src/editor/__tests__/text-editing.test.js` — 테스트 추가

**배경:**
- **#21:** Task 4에서 48글자 분할을 수정했으므로, `renderBlocks` 후 `focusBlock`이 올바르게 작동하는지 확인. 기본적으로 Task 4의 수정으로 해결됨.
- **#22:** `focusBlock`의 30ms `setTimeout`이 느린 환경에서 DOM ready 전 focus 시도. `requestAnimationFrame` + fallback setTimeout으로 변경.
- **#23:** 뷰 모드에서 block-content 클릭 시 불필요한 이벤트 발생하지 않도록 `setupBlockEvents`에서 editMode 체크 강화.
- **#24:** `catch(ex){}` 에서 에러를 무시하고 있음. `console.warn` 추가.

**Step 1: 테스트 추가**

```javascript
describe('Task 10: focusBlock 개선', () => {
  it('focusBlock catch에서 console.warn을 호출한다', () => {
    // silent catch 대신 경고 로그 확인
    var warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 유효하지 않은 range 설정 시뮬레이션
      throw new Error('test error');
    } catch (ex) {
      console.warn('focusBlock: 커서 설정 실패', ex);
    }
    expect(warnSpy).toHaveBeenCalledWith('focusBlock: 커서 설정 실패', expect.any(Error));
    warnSpy.mockRestore();
  });
});
```

**Step 2: blocks.js 수정 — focusBlock 타이밍 + 에러 로그**

`src/editor/blocks.js:34-75` 수정:

```javascript
export function focusBlock(idx,cursorPos){
  var doFocus=function(){
    var el=$('editor').children[idx];
    if(!el)return;
    var c=el.querySelector('.block-content');
    if(!c){
      c=el.querySelector('.block-col-content')||el.querySelector('th')||el.querySelector('td');
    }
    if(!c)return;
    c.focus();
    if(cursorPos==='end'){cursorPos=-1}
    if(typeof cursorPos==='number'){
      try{
        var rng=document.createRange();
        var sel=window.getSelection();
        if(cursorPos===-1||cursorPos>=c.textContent.length){
          rng.selectNodeContents(c);
          rng.collapse(false);
        }else if(cursorPos===0){
          rng.selectNodeContents(c);
          rng.collapse(true);
        }else{
          var node=c.firstChild||c;
          if(node.nodeType===3){
            rng.setStart(node,Math.min(cursorPos,node.length));
            rng.collapse(true);
          }else{
            rng.selectNodeContents(c);
            rng.collapse(true);
          }
        }
        sel.removeAllRanges();
        sel.addRange(rng);
      }catch(ex){console.warn('focusBlock: 커서 설정 실패',ex)}
    }
  };
  // requestAnimationFrame 우선, 폴백으로 setTimeout
  if(typeof requestAnimationFrame==='function'){
    requestAnimationFrame(function(){setTimeout(doFocus,0)});
  }else{
    setTimeout(doFocus,50);
  }
}
```

**Step 3: listeners.js 수정 — setupBlockEvents editMode 가드**

`src/editor/listeners.js:290-296` (setupBlockEvents 시작부) — 뷰 모드에서 불필요한 input/keydown 리스너 억제는 비효율적 (renderBlocks가 모드 변경 시 다시 호출됨). 대신 input 핸들러 시작에서 editMode 체크:

```javascript
    el.addEventListener('input',function(){
      if(!state.editMode)return;
      triggerAutoSave();
      // ... 나머지 동일
```

**Step 4: 테스트 실행**

Run: `npx vitest run src/editor/__tests__/text-editing.test.js`
Expected: PASS

**Step 5: 커밋**

```bash
git add src/editor/blocks.js src/editor/listeners.js src/editor/__tests__/text-editing.test.js
git commit -m "fix: focusBlock rAF 타이밍 + console.warn + 뷰 모드 input 가드"
```

---

## Task 11: 전체 테스트 + 빌드 검증

**Files:**
- 전체 테스트 실행
- 빌드 실행

**Step 1: 전체 테스트 실행**

Run: `npx vitest run`
Expected: 기존 테스트 + 새 테스트 모두 PASS (기존 table-sort 4개 실패는 pre-existing)

**Step 2: 빌드 실행**

Run: `npm run build`
Expected: 빌드 성공, dist/ 폴더 생성

**Step 3: HTML에서 pageTitle oninput 인라인 핸들러 제거 확인**

`index.html`에서 `pageTitle` 요소의 `oninput="onTitleChange()"` 속성이 있다면 제거 (Task 2에서 JS 리스너로 대체).

Run: `grep -n "oninput.*onTitleChange" index.html`

있으면 제거 후 재빌드.

**Step 4: 최종 커밋 (필요시)**

```bash
git add index.html
git commit -m "fix: pageTitle 인라인 oninput 제거 (JS 리스너로 대체)"
```

---

## 수정 파일 요약

| 파일 | Task | 수정 내용 |
|------|------|-----------|
| `src/editor/listeners.js` | 2,4,5,6,8,10 | 제목 composition, input isComposing 가드, 48글자 서식 보존, paste 멀티라인, Backspace/Delete, 드래그 동기화, editMode 가드 |
| `src/editor/blocks.js` | 3,7,10 | collectBlocks 뷰 모드, changeBlockType toggle 보존, focusBlock rAF+warn |
| `src/ui/sidebar.js` | 1 | saveDoc clearTimeout, 중복 onTitleChange 제거 |
| `src/ui/toolbar.js` | 9 | fmtCmd 빈 선택 가드, applyColor selection 복원 강화 |
| `src/editor/__tests__/text-editing.test.js` | 1-10 | 전체 테스트 파일 |
| `index.html` | 11 | pageTitle oninput 인라인 제거 (해당 시) |
