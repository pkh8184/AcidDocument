# 편의성 기능 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Undo/Redo, 블록 드래그앤드롭, 페이지 링크/백링크, 테이블 정렬/필터 4가지 편의성 기능 추가

**Architecture:** 각 기능은 독립 모듈로 구현. Undo/Redo는 스냅샷 기반 히스토리 스택, 블록 D&D는 HTML5 Drag API, 페이지 링크는 슬래시 메뉴 확장, 테이블 정렬/필터는 기존 table.js 확장.

**Tech Stack:** Vanilla JS (var만, const/let/화살표함수 금지), Vitest(jsdom), Vite 7.3, Firebase Hosting

**코드 컨벤션:** 기존 코드 스타일 유지 — `var`, `function(){}`, ES modules, 한 줄 축약형

---

## Task 1: Undo/Redo 시스템

**Files:**
- Create: `src/editor/history.js`
- Create: `src/editor/__tests__/history.test.js`
- Modify: `src/data/store.js:4-30` — undoStack, redoStack 추가
- Modify: `src/editor/blocks.js:7-10` — triggerAutoSave에서 pushUndo 호출
- Modify: `src/editor/listeners.js:441-444` — Ctrl+Z/Y 단축키
- Modify: `src/editor/renderer.js` — 에디터 툴바에 Undo/Redo 버튼
- Modify: `index.html:88-93` — 에디터 툴바에 ↩↪ 버튼 추가

### Step 1: store.js에 상태 추가

`src/data/store.js` — state 객체에 추가:
```js
var state={
  // ... 기존 필드 유지
  undoStack:[],
  redoStack:[],
  undoTimer:null,
  // ... 기존 필드 유지
};
```

### Step 2: 테스트 작성

`src/editor/__tests__/history.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: { blocks: [{ id: 'b1', type: 'text', content: 'hello' }] },
    editMode: true,
    undoStack: [],
    redoStack: [],
    undoTimer: null,
    autoSaveTimer: null,
    currentInsertIdx: null,
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('./renderer-mock.js', () => ({}));

// DOM mock
function setupDOM() {
  document.body.innerHTML = '<div id="editor"><div class="block" data-id="b1" data-idx="0"><div class="block-content">hello</div></div></div>';
}

// collectBlocks mock — state.page.blocks의 deep copy 반환
function mockCollectBlocks() {
  return JSON.parse(JSON.stringify(mockState.page.blocks));
}

vi.mock('../renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../blocks.js', () => ({
  collectBlocks: vi.fn(() => mockCollectBlocks()),
  triggerAutoSave: vi.fn(),
  focusBlock: vi.fn(),
}));

import { pushUndo, undo, redo, clearHistory } from '../history.js';

describe('History (Undo/Redo)', () => {
  beforeEach(() => {
    mockState.page = { blocks: [{ id: 'b1', type: 'text', content: 'hello' }] };
    mockState.undoStack = [];
    mockState.redoStack = [];
    mockState.editMode = true;
    setupDOM();
  });

  it('pushUndo는 현재 상태를 undoStack에 저장', () => {
    pushUndo();
    expect(mockState.undoStack.length).toBe(1);
    expect(mockState.undoStack[0][0].content).toBe('hello');
  });

  it('pushUndo 시 redoStack 클리어', () => {
    mockState.redoStack = [[]];
    pushUndo();
    expect(mockState.redoStack.length).toBe(0);
  });

  it('undoStack 최대 50개 유지', () => {
    for (var i = 0; i < 55; i++) {
      mockState.page.blocks = [{ id: 'b' + i, type: 'text', content: 'v' + i }];
      pushUndo();
    }
    expect(mockState.undoStack.length).toBe(50);
  });

  it('undo는 이전 상태로 복원', () => {
    pushUndo();
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: 'changed' }];
    undo();
    expect(mockState.page.blocks[0].content).toBe('hello');
  });

  it('undo 시 현재 상태가 redoStack에 저장', () => {
    pushUndo();
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: 'changed' }];
    undo();
    expect(mockState.redoStack.length).toBe(1);
  });

  it('빈 undoStack에서 undo 호출해도 에러 없음', () => {
    expect(() => undo()).not.toThrow();
  });

  it('redo는 undo된 상태를 복원', () => {
    pushUndo();
    mockState.page.blocks = [{ id: 'b1', type: 'text', content: 'changed' }];
    undo();
    redo();
    expect(mockState.page.blocks[0].content).toBe('changed');
  });

  it('clearHistory는 양쪽 스택 모두 비움', () => {
    pushUndo();
    pushUndo();
    clearHistory();
    expect(mockState.undoStack.length).toBe(0);
    expect(mockState.redoStack.length).toBe(0);
  });

  it('editMode가 false면 pushUndo 무시', () => {
    mockState.editMode = false;
    pushUndo();
    expect(mockState.undoStack.length).toBe(0);
  });

  it('page가 null이면 undo 무시', () => {
    mockState.page = null;
    expect(() => undo()).not.toThrow();
  });
});
```

### Step 3: 테스트 실패 확인

Run: `npx vitest run src/editor/__tests__/history.test.js`
Expected: FAIL — `../history.js` 파일 없음

### Step 4: history.js 구현

`src/editor/history.js`:
```js
// src/editor/history.js — Undo/Redo 히스토리 관리

import state from '../data/store.js';
import {collectBlocks,focusBlock} from './blocks.js';
import {renderBlocks} from './renderer.js';

var MAX_UNDO=50;

export function pushUndo(){
  if(!state.editMode||!state.page)return;
  var snapshot=JSON.parse(JSON.stringify(state.page.blocks));
  state.undoStack.push(snapshot);
  if(state.undoStack.length>MAX_UNDO)state.undoStack.shift();
  state.redoStack=[];
}

// 구조 변경(블록 추가/삭제/이동) 전 호출 — 즉시 저장
export function pushUndoImmediate(){
  if(!state.editMode||!state.page)return;
  // DOM에서 현재 내용 수집 후 저장
  syncBlocksFromDOM();
  pushUndo();
}

// DOM → state 동기화 (undo 전 호출)
function syncBlocksFromDOM(){
  try{
    var synced=collectBlocks();
    if(synced&&synced.length>0)state.page.blocks=synced;
  }catch(e){}
}

export function undo(){
  if(!state.page||state.undoStack.length===0)return;
  syncBlocksFromDOM();
  var current=JSON.parse(JSON.stringify(state.page.blocks));
  state.redoStack.push(current);
  state.page.blocks=state.undoStack.pop();
  renderBlocks();
  if(state.page.blocks.length>0)focusBlock(0,0);
}

export function redo(){
  if(!state.page||state.redoStack.length===0)return;
  syncBlocksFromDOM();
  var current=JSON.parse(JSON.stringify(state.page.blocks));
  state.undoStack.push(current);
  state.page.blocks=state.redoStack.pop();
  renderBlocks();
  if(state.page.blocks.length>0)focusBlock(0,0);
}

export function clearHistory(){
  state.undoStack=[];
  state.redoStack=[];
}
```

### Step 5: 테스트 통과 확인

Run: `npx vitest run src/editor/__tests__/history.test.js`
Expected: PASS (10/10)

### Step 6: blocks.js 연동

`src/editor/blocks.js` 수정:

import 추가:
```js
import {pushUndo,pushUndoImmediate} from './history.js';
```

`insertBlock` 함수 수정 (line 75-79):
```js
export function insertBlock(idx,b){
  pushUndoImmediate();
  state.page.blocks.splice(idx,0,b);
  insertBlockEl(b,idx);
  focusBlock(idx,0);
}
```

`deleteBlock` 함수 수정 (line 83-97):
```js
export function deleteBlock(idx){
  pushUndoImmediate();
  if(state.page.blocks.length<=1){
    state.page.blocks[0]={id:genId(),type:'text',content:''};
    renderBlocks();
    focusBlock(0,0);
    return;
  }
  var blockId=state.page.blocks[idx].id;
  state.page.blocks.splice(idx,1);
  removeBlockEl(blockId);
  var newIdx=Math.min(idx,state.page.blocks.length-1);
  focusBlock(newIdx,-1);
}
```

`moveBlockUp` 함수 수정 (line 107-114):
```js
export function moveBlockUp(idx){
  if(idx<=0)return;
  pushUndoImmediate();
  var temp=state.page.blocks[idx];
  state.page.blocks[idx]=state.page.blocks[idx-1];
  state.page.blocks[idx-1]=temp;
  renderBlocks();
  focusBlock(idx-1);
}
```

`moveBlockDown` 함수 수정 (line 115-122):
```js
export function moveBlockDown(idx){
  if(idx>=state.page.blocks.length-1)return;
  pushUndoImmediate();
  var temp=state.page.blocks[idx];
  state.page.blocks[idx]=state.page.blocks[idx+1];
  state.page.blocks[idx+1]=temp;
  renderBlocks();
  focusBlock(idx+1);
}
```

`changeBlockType` 함수 수정 (line 123-133):
```js
export function changeBlockType(idx,newType){
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  var oldContent=b.content||'';
  b.type=newType;
  b.content=oldContent;
  if(newType==='todo')b.checked=false;
  if(newType==='toggle'){b.open=false;b.innerContent='';}
  renderBlocks();
  updateNums();
  focusBlock(idx,-1);
}
```

`triggerAutoSave`에 디바운싱된 undo push 추가 (line 7):
```js
export function triggerAutoSave(){
  if(!state.editMode)return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer=setTimeout(saveCurrent,1500);
  // 텍스트 입력 디바운싱 undo (500ms)
  clearTimeout(state.undoTimer);
  state.undoTimer=setTimeout(function(){pushUndo()},500);
}
```

### Step 7: listeners.js에 단축키 추가

`src/editor/listeners.js` 수정:

import에 추가:
```js
import {undo,redo} from './history.js';
```

`document.addEventListener('keydown', ...)` 내부에 추가 (line 441-444 사이):
```js
if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();return}
if((e.metaKey||e.ctrlKey)&&e.key==='y'){e.preventDefault();redo();return}
if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='z'){e.preventDefault();redo();return}
```

주의: 기존 `Ctrl+S`, `Ctrl+K`, `Ctrl+/` 핸들러보다 **앞에** 배치

### Step 8: 에디터 툴바에 버튼 추가

`index.html` — 에디터 툴바 영역 (line 88-93 사이), H3 버튼 뒤에:
```html
<div class="toolbar-divider"></div>
<div class="toolbar-group">
<button class="toolbar-btn" onclick="undo()" title="실행취소 (Ctrl+Z)">↩</button>
<button class="toolbar-btn" onclick="redo()" title="다시실행 (Ctrl+Y)">↪</button>
</div>
```

`src/main.js`에서 window에 undo/redo 노출 필요:
```js
import {undo,redo} from './editor/history.js';
window.undo=undo;
window.redo=redo;
```

### Step 9: 전체 테스트 + 빌드

Run: `npx vitest run && npx vite build`
Expected: 모든 테스트 PASS, 빌드 성공

### Step 10: 커밋

```bash
git add src/editor/history.js src/editor/__tests__/history.test.js src/data/store.js src/editor/blocks.js src/editor/listeners.js src/main.js index.html
git commit -m "feat: Undo/Redo 시스템 (Ctrl+Z/Y, 스냅샷 기반 히스토리)"
```

---

## Task 2: 블록 드래그앤드롭 재정렬

**Files:**
- Create: `src/editor/__tests__/dragdrop.test.js`
- Modify: `src/editor/renderer.js:219` — 핸들에 draggable 추가
- Modify: `src/editor/listeners.js` — 드래그 이벤트 핸들러
- Modify: `src/styles/main.css` — 드래그 인디케이터 스타일

### Step 1: 테스트 작성

`src/editor/__tests__/dragdrop.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: {
      blocks: [
        { id: 'b1', type: 'text', content: 'first' },
        { id: 'b2', type: 'text', content: 'second' },
        { id: 'b3', type: 'text', content: 'third' },
      ],
    },
    editMode: true,
    undoStack: [],
    redoStack: [],
    undoTimer: null,
    dragBlockIdx: null,
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../blocks.js', () => ({
  collectBlocks: vi.fn(() => JSON.parse(JSON.stringify(mockState.page.blocks))),
  triggerAutoSave: vi.fn(),
  focusBlock: vi.fn(),
}));
vi.mock('../history.js', () => ({
  pushUndoImmediate: vi.fn(),
}));

import { reorderBlock } from '../listeners.js';

describe('Block Drag & Drop', () => {
  beforeEach(() => {
    mockState.page.blocks = [
      { id: 'b1', type: 'text', content: 'first' },
      { id: 'b2', type: 'text', content: 'second' },
      { id: 'b3', type: 'text', content: 'third' },
    ];
  });

  it('블록을 아래로 이동 (0→2)', () => {
    reorderBlock(0, 2);
    expect(mockState.page.blocks[0].content).toBe('second');
    expect(mockState.page.blocks[1].content).toBe('third');
    expect(mockState.page.blocks[2].content).toBe('first');
  });

  it('블록을 위로 이동 (2→0)', () => {
    reorderBlock(2, 0);
    expect(mockState.page.blocks[0].content).toBe('third');
    expect(mockState.page.blocks[1].content).toBe('first');
    expect(mockState.page.blocks[2].content).toBe('second');
  });

  it('같은 위치면 변경 없음', () => {
    reorderBlock(1, 1);
    expect(mockState.page.blocks[0].content).toBe('first');
    expect(mockState.page.blocks[1].content).toBe('second');
    expect(mockState.page.blocks[2].content).toBe('third');
  });

  it('범위 밖 인덱스는 무시', () => {
    reorderBlock(0, 10);
    expect(mockState.page.blocks.length).toBe(3);
  });
});
```

### Step 2: 테스트 실패 확인

Run: `npx vitest run src/editor/__tests__/dragdrop.test.js`
Expected: FAIL — `reorderBlock` 없음

### Step 3: reorderBlock 구현

`src/editor/listeners.js`에 추가:

import에 추가:
```js
import {pushUndoImmediate} from './history.js';
```

함수 추가 (export):
```js
export function reorderBlock(fromIdx,toIdx){
  if(!state.page||!state.page.blocks)return;
  if(fromIdx===toIdx)return;
  if(fromIdx<0||fromIdx>=state.page.blocks.length)return;
  if(toIdx<0||toIdx>=state.page.blocks.length)return;
  pushUndoImmediate();
  var block=state.page.blocks.splice(fromIdx,1)[0];
  state.page.blocks.splice(toIdx,0,block);
  renderBlocks();
  triggerAutoSave();
}
```

### Step 4: 테스트 통과 확인

Run: `npx vitest run src/editor/__tests__/dragdrop.test.js`
Expected: PASS

### Step 5: renderer.js 수정 — 핸들에 draggable 추가

`src/editor/renderer.js` line 219 수정:
```js
// 기존:
div.innerHTML='<div class="block-handle"><button class="btn btn-i" tabindex="0" data-action="showBlockCtx" data-idx="'+idx+'">⋮</button></div>'+inner;

// 변경:
div.innerHTML='<div class="block-handle" draggable="true" data-drag-idx="'+idx+'"><button class="btn btn-i" tabindex="0" data-action="showBlockCtx" data-idx="'+idx+'">⋮</button></div>'+inner;
```

### Step 6: listeners.js에 드래그 이벤트 바인딩

`setupListeners()` 함수 내부에 추가 (에디터 드래그앤드롭 이미지 업로드 섹션 앞):
```js
// 블록 드래그앤드롭 재정렬
var editor=$('editor');
editor.addEventListener('dragstart',function(e){
  if(!state.editMode)return;
  var handle=e.target.closest('.block-handle[draggable]');
  if(!handle)return;
  state.dragBlockIdx=parseInt(handle.getAttribute('data-drag-idx'));
  var block=handle.closest('.block');
  if(block)block.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain','block');
});
editor.addEventListener('dragend',function(e){
  state.dragBlockIdx=null;
  $$('.block.dragging').forEach(function(el){el.classList.remove('dragging')});
  var ind=editor.querySelector('.drag-indicator');
  if(ind)ind.remove();
});
editor.addEventListener('dragover',function(e){
  if(state.dragBlockIdx===null)return;
  // 이미지 드롭은 별도 처리이므로 block 드래그일 때만
  if(!e.dataTransfer.types.includes('text/plain'))return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  // 드롭 위치 인디케이터
  var blocks=editor.children;
  var ind=editor.querySelector('.drag-indicator');
  if(!ind){ind=document.createElement('div');ind.className='drag-indicator';editor.appendChild(ind)}
  var targetIdx=-1;
  for(var i=0;i<blocks.length;i++){
    if(blocks[i].classList.contains('drag-indicator'))continue;
    var rect=blocks[i].getBoundingClientRect();
    if(e.clientY<rect.top+rect.height/2){targetIdx=i;break}
  }
  if(targetIdx===-1)targetIdx=blocks.length;
  // 인디케이터 위치
  if(targetIdx<blocks.length&&blocks[targetIdx]&&!blocks[targetIdx].classList.contains('drag-indicator')){
    editor.insertBefore(ind,blocks[targetIdx]);
  }else{
    editor.appendChild(ind);
  }
  ind.setAttribute('data-drop-idx',targetIdx);
});
editor.addEventListener('drop',function(e){
  if(state.dragBlockIdx===null)return;
  if(!e.dataTransfer.types.includes('text/plain'))return;
  e.preventDefault();
  var ind=editor.querySelector('.drag-indicator');
  var toIdx=ind?parseInt(ind.getAttribute('data-drop-idx')):state.dragBlockIdx;
  if(ind)ind.remove();
  // fromIdx 이후의 toIdx 보정
  if(toIdx>state.dragBlockIdx)toIdx--;
  reorderBlock(state.dragBlockIdx,toIdx);
  state.dragBlockIdx=null;
});
```

### Step 7: store.js에 dragBlockIdx 추가

`src/data/store.js`에 추가:
```js
dragBlockIdx:null,
```

### Step 8: CSS 스타일 추가

`src/styles/main.css`에 추가:
```css
.block.dragging{opacity:0.4;background:var(--accM)}
.drag-indicator{height:3px;background:var(--acc);border-radius:2px;margin:2px 0;pointer-events:none;transition:all .1s}
```

### Step 9: 전체 테스트 + 빌드

Run: `npx vitest run && npx vite build`
Expected: 모든 테스트 PASS, 빌드 성공

### Step 10: 커밋

```bash
git add src/editor/listeners.js src/editor/renderer.js src/editor/__tests__/dragdrop.test.js src/styles/main.css src/data/store.js
git commit -m "feat: 블록 드래그앤드롭 재정렬"
```

---

## Task 3: 페이지 링크 + 백링크

**Files:**
- Create: `src/features/pagelink.js`
- Create: `src/features/__tests__/pagelink.test.js`
- Modify: `src/config/firebase.js:25` — SLASH 배열에 pagelink 추가
- Modify: `src/ui/toolbar.js:48-57` — execSlash에 pagelink 처리
- Modify: `src/editor/listeners.js` — page-link 클릭 이벤트
- Modify: `index.html` — 페이지 링크 선택 모달
- Modify: `src/main.js` — window에 함수 노출
- Modify: `src/styles/main.css` — 페이지 링크 스타일

### Step 1: 테스트 작성

`src/features/__tests__/pagelink.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: { id: 'p1', blocks: [{ id: 'b1', type: 'text', content: '' }] },
    db: {
      pages: [
        { id: 'p1', title: '현재 페이지', deleted: false, blocks: [{ id: 'b1', type: 'text', content: '<a class="page-link" data-page-id="p2">📄 대상 페이지</a>' }] },
        { id: 'p2', title: '대상 페이지', deleted: false, blocks: [{ id: 'b2', type: 'text', content: 'hello' }] },
        { id: 'p3', title: '삭제된 페이지', deleted: true, blocks: [] },
      ],
    },
    editMode: true,
    slashMenuState: { open: false, idx: null },
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../../editor/blocks.js', () => ({
  focusBlock: vi.fn(),
  triggerAutoSave: vi.fn(),
}));
vi.mock('../../editor/renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../../ui/modals.js', () => ({
  openModal: vi.fn(),
  closeModal: vi.fn(),
}));

import { getBacklinks, searchPages, insertPageLink } from '../pagelink.js';

describe('Page Link', () => {
  beforeEach(() => {
    mockState.page = { id: 'p2', blocks: [{ id: 'b2', type: 'text', content: '' }] };
    mockState.slashMenuState = { idx: 0 };
  });

  it('searchPages는 삭제되지 않은 페이지만 반환', () => {
    var results = searchPages('');
    expect(results.length).toBe(2); // p1, p2만
  });

  it('searchPages는 제목으로 필터', () => {
    var results = searchPages('대상');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('p2');
  });

  it('getBacklinks는 현재 페이지를 참조하는 페이지 목록 반환', () => {
    var backlinks = getBacklinks('p2');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0].id).toBe('p1');
  });

  it('참조가 없으면 빈 배열 반환', () => {
    var backlinks = getBacklinks('p1');
    expect(backlinks.length).toBe(0);
  });

  it('insertPageLink는 블록에 링크 삽입', () => {
    insertPageLink('p1', '현재 페이지');
    expect(mockState.page.blocks[0].content).toContain('page-link');
    expect(mockState.page.blocks[0].content).toContain('data-page-id="p1"');
  });
});
```

### Step 2: 테스트 실패 확인

Run: `npx vitest run src/features/__tests__/pagelink.test.js`
Expected: FAIL

### Step 3: pagelink.js 구현

`src/features/pagelink.js`:
```js
// src/features/pagelink.js — 페이지 링크 + 백링크

import state from '../data/store.js';
import {$,esc} from '../utils/helpers.js';
import {renderBlocks} from '../editor/renderer.js';
import {focusBlock,triggerAutoSave} from '../editor/blocks.js';
import {openModal,closeModal} from '../ui/modals.js';

export function searchPages(query){
  var q=(query||'').toLowerCase().trim();
  var results=[];
  for(var i=0;i<state.db.pages.length;i++){
    var p=state.db.pages[i];
    if(p.deleted)continue;
    if(!q||p.title.toLowerCase().indexOf(q)!==-1){
      results.push(p);
    }
  }
  return results;
}

export function getBacklinks(pageId){
  var links=[];
  for(var i=0;i<state.db.pages.length;i++){
    var p=state.db.pages[i];
    if(p.deleted||p.id===pageId)continue;
    var found=false;
    for(var j=0;j<(p.blocks||[]).length;j++){
      if((p.blocks[j].content||'').indexOf('data-page-id="'+pageId+'"')!==-1){found=true;break}
    }
    if(found)links.push(p);
  }
  return links;
}

export function insertPageLink(pageId,pageTitle){
  var idx=state.slashMenuState.idx;
  if(idx===null||!state.page||!state.page.blocks[idx])return;
  var tag='<a class="page-link" contenteditable="false" data-page-id="'+esc(pageId)+'">📄 '+esc(pageTitle)+'</a>&nbsp;';
  state.page.blocks[idx].content=(state.page.blocks[idx].content||'')+tag;
  state.page.blocks[idx].type=state.page.blocks[idx].type||'text';
  renderBlocks();focusBlock(idx,'end');triggerAutoSave();
  state.slashMenuState.idx=null;
}

export function openPageLinkPicker(){
  renderPageLinkList('');
  $('pageLinkSearch').value='';
  openModal('pageLinkModal');
}

export function renderPageLinkList(query){
  var pages=searchPages(query);
  var html='';
  if(pages.length===0){
    html='<div style="text-align:center;color:var(--t4);padding:20px">페이지 없음</div>';
  }else{
    for(var i=0;i<pages.length;i++){
      var p=pages[i];
      html+='<div class="nav-item" onclick="selectPageLink(\''+esc(p.id)+'\',\''+esc(p.title)+'\')">';
      html+='<span class="nav-icon">'+p.icon+'</span>';
      html+='<span class="nav-text">'+esc(p.title)+'</span>';
      html+='</div>';
    }
  }
  $('pageLinkList').innerHTML=html;
}

export function renderBacklinks(){
  if(!state.page)return;
  var links=getBacklinks(state.page.id);
  var el=$('backlinks');
  if(!el)return;
  if(links.length===0){el.style.display='none';return}
  el.style.display='block';
  var html='<div class="backlinks-title">🔗 백링크 ('+links.length+')</div>';
  for(var i=0;i<links.length;i++){
    var p=links[i];
    html+='<div class="backlink-item" onclick="loadPage(\''+p.id+'\')">'+p.icon+' '+esc(p.title)+'</div>';
  }
  el.innerHTML=html;
}
```

### Step 4: 테스트 통과 확인

Run: `npx vitest run src/features/__tests__/pagelink.test.js`
Expected: PASS

### Step 5: SLASH 배열에 pagelink 추가

`src/config/firebase.js` line 25 — '기타' 섹션에 추가:
```js
{t:'pagelink',c:'🔗',n:'페이지 링크',d:'다른 페이지 연결'}
```

### Step 6: toolbar.js execSlash에 pagelink 처리 추가

`src/ui/toolbar.js` — execSlash 함수 내부 (line 56 부근, mention 다음):
```js
if(type==='pagelink'){state.slashMenuState.idx=idx;import('../features/pagelink.js').then(function(m){m.openPageLinkPicker()});return}
```

### Step 7: index.html에 모달 + 백링크 영역 추가

페이지 링크 선택 모달 (line 268 부근, userTagModal 뒤에):
```html
<div class="modal-bg" id="pageLinkModal" role="dialog" aria-modal="true" aria-labelledby="pageLinkModal-title" onclick="if(event.target===this)closeModal('pageLinkModal')"><div class="modal" style="max-width:400px"><div class="modal-head"><h2 id="pageLinkModal-title">🔗 페이지 링크</h2><button class="btn btn-i btn-g" onclick="closeModal('pageLinkModal')">✕</button></div><div class="modal-body"><input type="text" id="pageLinkSearch" placeholder="페이지 검색..." oninput="filterPageLinks(this.value)" style="margin-bottom:12px"><div id="pageLinkList"></div></div></div></div>
```

백링크 영역 — editor 아래 (line 136, `</div>` 닫기 전):
```html
<div class="backlinks" id="backlinks" style="display:none"></div>
```

### Step 8: listeners.js에 page-link 클릭 이벤트

`setupListeners()` 내부 — document click 핸들러에 추가:
```js
// 페이지 링크 클릭
if(e.target.classList.contains('page-link')){
  e.preventDefault();
  var pid=e.target.getAttribute('data-page-id');
  if(pid){import('../ui/sidebar.js').then(function(m){m.loadPage(pid)})}
}
```

### Step 9: main.js에 window 함수 노출

```js
import {openPageLinkPicker,renderPageLinkList,insertPageLink,renderBacklinks} from './features/pagelink.js';
window.selectPageLink=function(id,title){closeModal('pageLinkModal');insertPageLink(id,title)};
window.filterPageLinks=function(q){renderPageLinkList(q)};
```

`loadPage` 호출 후 `renderBacklinks()` 호출 추가 (sidebar.js의 loadPage 함수에서 renderBlocks 이후).

### Step 10: CSS 추가

`src/styles/main.css`:
```css
.page-link{color:var(--acc);text-decoration:none;padding:2px 6px;background:var(--accM);border-radius:4px;cursor:pointer;font-weight:500}.page-link:hover{text-decoration:underline}
.backlinks{margin-top:32px;padding-top:24px;border-top:1px solid var(--bdr)}
.backlinks-title{font-size:13px;font-weight:600;color:var(--t4);margin-bottom:12px}
.backlink-item{padding:8px 12px;border-radius:var(--rad);cursor:pointer;font-size:14px;color:var(--t2)}.backlink-item:hover{background:var(--bg3);color:var(--t1)}
```

### Step 11: 전체 테스트 + 빌드

Run: `npx vitest run && npx vite build`
Expected: PASS, 빌드 성공

### Step 12: 커밋

```bash
git add src/features/pagelink.js src/features/__tests__/pagelink.test.js src/config/firebase.js src/ui/toolbar.js src/editor/listeners.js index.html src/main.js src/styles/main.css
git commit -m "feat: 페이지 링크 + 백링크"
```

---

## Task 4: 테이블 정렬/필터

**Files:**
- Create: `src/editor/__tests__/table-sort.test.js`
- Modify: `src/editor/table.js` — sortTable, filterTable 함수
- Modify: `src/editor/renderer.js` — 헤더에 정렬 아이콘, 도구바에 필터 버튼
- Modify: `src/editor/listeners.js` — 정렬/필터 이벤트 위임
- Modify: `src/styles/main.css` — 정렬/필터 UI 스타일

### Step 1: 테스트 작성

`src/editor/__tests__/table-sort.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(() => {
  var mockState = {
    page: {
      blocks: [{
        id: 'tbl1',
        type: 'table',
        rows: [
          ['이름', '점수', '등급'],
          ['김', '90', 'A'],
          ['이', '70', 'C'],
          ['박', '80', 'B'],
        ],
        sortCol: null,
        sortDir: null,
        filterCol: null,
        filterQuery: '',
      }],
    },
    editMode: true,
  };
  return { mockState };
});

vi.mock('../../data/store.js', () => ({ default: mockState }));
vi.mock('../renderer.js', () => ({ renderBlocks: vi.fn() }));
vi.mock('../blocks.js', () => ({
  triggerAutoSave: vi.fn(),
  findBlock: vi.fn((id) => mockState.page.blocks.find((b) => b.id === id) || null),
}));
vi.mock('../../ui/modals.js', () => ({ openModal: vi.fn(), closeModal: vi.fn() }));

import { sortTable, filterTableRows } from '../table.js';

describe('Table Sort', () => {
  beforeEach(() => {
    mockState.page.blocks[0].rows = [
      ['이름', '점수', '등급'],
      ['김', '90', 'A'],
      ['이', '70', 'C'],
      ['박', '80', 'B'],
    ];
  });

  it('열 기준 오름차순 정렬 (텍스트)', () => {
    sortTable('tbl1', 0, 'asc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[0][0]).toBe('이름'); // 헤더 유지
    expect(rows[1][0]).toBe('김');
    expect(rows[2][0]).toBe('박');
    expect(rows[3][0]).toBe('이');
  });

  it('열 기준 내림차순 정렬', () => {
    sortTable('tbl1', 0, 'desc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[1][0]).toBe('이');
    expect(rows[2][0]).toBe('박');
    expect(rows[3][0]).toBe('김');
  });

  it('숫자 열 정렬', () => {
    sortTable('tbl1', 1, 'asc');
    var rows = mockState.page.blocks[0].rows;
    expect(rows[1][1]).toBe('70');
    expect(rows[2][1]).toBe('80');
    expect(rows[3][1]).toBe('90');
  });

  it('헤더 행은 항상 첫번째 유지', () => {
    sortTable('tbl1', 0, 'asc');
    expect(mockState.page.blocks[0].rows[0][0]).toBe('이름');
  });
});

describe('Table Filter', () => {
  beforeEach(() => {
    mockState.page.blocks[0].rows = [
      ['이름', '점수', '등급'],
      ['김', '90', 'A'],
      ['이', '70', 'C'],
      ['박', '80', 'B'],
    ];
  });

  it('필터링 결과 반환 (표시할 행 인덱스)', () => {
    var visible = filterTableRows('tbl1', 2, 'A');
    expect(visible).toEqual([0, 1]); // 헤더 + 김
  });

  it('빈 쿼리는 모든 행 반환', () => {
    var visible = filterTableRows('tbl1', 0, '');
    expect(visible.length).toBe(4);
  });

  it('매칭 없으면 헤더만 반환', () => {
    var visible = filterTableRows('tbl1', 0, 'zzz');
    expect(visible).toEqual([0]);
  });
});
```

### Step 2: 테스트 실패 확인

Run: `npx vitest run src/editor/__tests__/table-sort.test.js`
Expected: FAIL

### Step 3: table.js에 sortTable, filterTableRows 구현

`src/editor/table.js`에 추가:

import에 추가 (이미 있으면 스킵):
```js
import {findBlock} from './blocks.js';
```

함수 추가:
```js
export function sortTable(id,colIdx,dir){
  var b=null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){b=state.page.blocks[i];break}}
  if(!b||!b.rows||b.rows.length<2)return;
  // DOM에서 현재 데이터 수집
  var rows=collectTableData(id);
  if(rows)b.rows=rows;
  var header=b.rows[0];
  var data=b.rows.slice(1);
  data.sort(function(a,b){
    var va=(a[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var vb=(b[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    // 숫자 비교 시도
    var na=parseFloat(va),nb=parseFloat(vb);
    if(!isNaN(na)&&!isNaN(nb)){
      return dir==='asc'?na-nb:nb-na;
    }
    // 문자열 비교
    if(dir==='asc')return va.localeCompare(vb,'ko');
    return vb.localeCompare(va,'ko');
  });
  b.rows=[header].concat(data);
  b.sortCol=colIdx;
  b.sortDir=dir;
  renderBlocks();triggerAutoSave();
}

export function filterTableRows(id,colIdx,query){
  var b=null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){b=state.page.blocks[i];break}}
  if(!b||!b.rows)return[];
  var q=(query||'').toLowerCase().trim();
  var visible=[0]; // 헤더 항상 포함
  if(!q){
    for(var i=0;i<b.rows.length;i++)visible.push(i);
    return visible;
  }
  for(var i=1;i<b.rows.length;i++){
    var val=(b.rows[i][colIdx]||'').replace(/<[^>]*>/g,'').toLowerCase();
    if(val.indexOf(q)!==-1)visible.push(i);
  }
  return visible;
}
```

### Step 4: 테스트 통과 확인

Run: `npx vitest run src/editor/__tests__/table-sort.test.js`
Expected: PASS

### Step 5: renderer.js — 테이블 헤더에 정렬 버튼, 도구바에 필터 버튼

`src/editor/renderer.js` — table 렌더링 부분에서 헤더(th) 렌더링 시:

기존 th 렌더링에 정렬 아이콘 추가:
```js
// th에 정렬 버튼 추가 (편집 모드일 때)
if(state.editMode){
  // 각 th 뒤에 정렬 아이콘
  // data-action="sortTable" data-block-id="..." data-col="..."
}
```

구체적으로: 기존 th 렌더링 코드에서 `inner+='<th'` 부분 뒤에, 편집 모드일 때 정렬 버튼을 th 안에 추가:
```html
<span class="sort-btn" data-action="sortTable" data-block-id="ID" data-col="COL">⇅</span>
```

도구바 버튼 추가 (기존 테이블 도구바에):
```html
<button class="btn btn-sm btn-s" data-action="openTableFilter" data-block-id="ID">필터</button>
```

### Step 6: listeners.js에 이벤트 위임 추가

에디터 click delegation에 추가:
```js
case'sortTable':
  import('../editor/table.js').then(function(m){
    var col=parseInt(target.dataset.col);
    var curDir=target.dataset.sortDir||'asc';
    var newDir=curDir==='asc'?'desc':'asc';
    target.dataset.sortDir=newDir;
    m.sortTable(target.dataset.blockId,col,newDir);
  });
  break;
```

### Step 7: CSS 추가

`src/styles/main.css`:
```css
.sort-btn{cursor:pointer;font-size:11px;color:var(--t4);margin-left:4px;user-select:none}.sort-btn:hover{color:var(--acc)}
.sort-btn.asc::after{content:'↑'}.sort-btn.desc::after{content:'↓'}
```

### Step 8: 전체 테스트 + 빌드

Run: `npx vitest run && npx vite build`
Expected: PASS, 빌드 성공

### Step 9: 커밋

```bash
git add src/editor/table.js src/editor/__tests__/table-sort.test.js src/editor/renderer.js src/editor/listeners.js src/styles/main.css
git commit -m "feat: 테이블 정렬/필터"
```

---

## 최종 확인

### 전체 빌드 + 배포

```bash
npx vitest run && npx vite build && npx firebase-tools deploy --only hosting
```

### 기능 체크리스트

- [ ] Ctrl+Z/Y로 Undo/Redo 동작
- [ ] 에디터 툴바 ↩↪ 버튼 동작
- [ ] 블록 핸들 드래그로 순서 변경
- [ ] 슬래시 메뉴 → 페이지 링크 → 페이지 선택 → 링크 삽입
- [ ] 페이지 링크 클릭 → 해당 페이지 이동
- [ ] 백링크 섹션 표시
- [ ] 테이블 헤더 정렬 버튼 동작
- [ ] 테이블 필터 동작
