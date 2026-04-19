# 표 열 너비 개선 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 또는 superpowers:subagent-driven-development 사용하여 태스크 단위 실행. Claude.md 규칙에 따라 각 태스크 완료 후 `/verification-before-completion` 실행.

**Goal:** 표 열 너비의 드래그 누적 오차·자동저장 진동 문제를 해결하고, 패널에서도 너비를 정확히 조정할 수 있는 UI 추가.

**Architecture:** 기존 `setupTableResize` 드래그 핸들러의 계산식만 "이웃 열 보상" 방식으로 교체, `blocks.js`의 자동저장 경로에 게이팅 조건 추가, `showTablePanel`에 "열 너비" 섹션 신규 추가. 데이터 모델 불변.

**Tech Stack:** Vanilla JS (ES6 modules), CSS3, Vitest

**Related Design:** `docs/plans/2026-04-19-table-width-improvement-design.md`

**Branch:** `feat/table-width-improvement` (Claude.md: 작업 시작 전 새 원격 브랜치 생성)

---

## 컨텍스트

### 현재 파일 구조
- `src/editor/table.js:12-16` — `normalizeColWidths`
- `src/editor/table.js:110-123` — `insertColAt` (평균값 계산 버그)
- `src/editor/table.js:384-424` — `setupTableResize` (드래그 핸들러)
- `src/editor/table.js:264-326` — `showTablePanel` (패널 HTML 생성)
- `src/editor/table.js:342-381` — `initTablePanel` (패널 이벤트 위임)
- `src/editor/blocks.js:208-221` — `collectPage` 내 table 처리 (자동저장 덮어쓰기)
- `src/editor/renderer.js:215-252` — table 렌더러
- `src/styles/main.css:174-215` — 표 + 패널 CSS
- `src/editor/__tests__/table-sort.test.js` — 기존 테스트 7개

### 현재 데이터 모델 (불변)
```javascript
{id, type:'table', rows:[[...]], colWidths:[40,30,30], cellStyles, rowColors, colColors, tableAlign, tableVAlign, sortCol, sortDir}
```

### 새 내부 상수 (table.js 상단에 추가)
```javascript
var MIN_COL_PCT = 5;    // 열 최소 너비 %
var MAX_COL_PCT = 80;   // 패널 입력 최대 %
```

---

## Task 1: 테스트 파일 생성 — 열 너비 동작 스펙 정의

**Files:**
- Create: `src/editor/__tests__/table-width.test.js`

**Context:** TDD 시작점. Task 2~6의 동작을 먼저 테스트로 정의하고 구현이 따라가는 방식.

**Step 1: 신규 테스트 파일 작성 (모든 테스트는 처음엔 FAIL 예정)**

```javascript
// src/editor/__tests__/table-width.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(function() {
  var mockState = {
    page: { blocks: [{
      id: 'tbl1', type: 'table',
      rows: [['a','b','c'],['1','2','3']],
      colWidths: [40, 30, 30],
    }]},
    editMode: true,
  };
  return { mockState: mockState };
});

vi.mock('../../data/store.js', function() { return { default: mockState }; });
vi.mock('../renderer.js', function() { return { renderBlocks: vi.fn() }; });
vi.mock('../blocks.js', function() {
  return {
    triggerAutoSave: vi.fn(),
    findBlock: vi.fn(function(id) {
      for (var i=0; i<mockState.page.blocks.length; i++) {
        if (mockState.page.blocks[i].id===id) return mockState.page.blocks[i];
      }
      return null;
    }),
  };
});
vi.mock('../../ui/modals.js', function() { return { openModal: vi.fn() }; });
vi.mock('../../utils/helpers.js', function() {
  return { $: vi.fn(function() { return null; }), toast: vi.fn() };
});
vi.mock('../../config/firebase.js', function() { return { COLORS: [] }; });
vi.mock('../history.js', function() { return { pushUndoImmediate: vi.fn() }; });

import {
  resizeColWithNeighborCompensation,
  setColWidth,
  distributeColsEvenly,
  clearColWidths,
  insertColAt,
} from '../table.js';

describe('Column Width', function() {
  beforeEach(function() {
    mockState.page.blocks[0].rows = [['a','b','c'],['1','2','3']];
    mockState.page.blocks[0].colWidths = [40, 30, 30];
  });

  describe('resizeColWithNeighborCompensation', function() {
    it('열 0을 +10 증가 → 열 1이 -10 감소', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 50);
      expect(mockState.page.blocks[0].colWidths).toEqual([50, 20, 30]);
    });
    it('열 0 증가 요청이 이웃 최소치(5%) 초과 시 그 다음 열에서 차감', function() {
      mockState.page.blocks[0].colWidths = [40, 10, 50];
      resizeColWithNeighborCompensation('tbl1', 0, 55);
      // 열 0 +15 → 열 1에서 -5(최소 5% 도달) → 열 2에서 나머지 -10
      expect(mockState.page.blocks[0].colWidths).toEqual([55, 5, 40]);
    });
    it('마지막 열 리사이즈 시 왼쪽 이웃 보상', function() {
      resizeColWithNeighborCompensation('tbl1', 2, 40);
      expect(mockState.page.blocks[0].colWidths).toEqual([40, 20, 40]);
    });
    it('합계는 항상 100 유지', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 55);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(sum).toBe(100);
    });
    it('조작 안 한 열은 값 불변 (이웃 외)', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 45);
      expect(mockState.page.blocks[0].colWidths[2]).toBe(30); // 열 2 불변
    });
    it('MIN 이하로는 내려가지 않음', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 3);
      expect(mockState.page.blocks[0].colWidths[0]).toBe(5);
    });
  });

  describe('setColWidth (패널 입력)', function() {
    it('지정값으로 설정하고 이웃 보상 적용', function() {
      setColWidth('tbl1', 1, 50);
      expect(mockState.page.blocks[0].colWidths[1]).toBe(50);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(sum).toBe(100);
    });
    it('MIN/MAX 범위로 클램프', function() {
      setColWidth('tbl1', 0, 200);
      expect(mockState.page.blocks[0].colWidths[0]).toBeLessThanOrEqual(80);
      setColWidth('tbl1', 0, 1);
      expect(mockState.page.blocks[0].colWidths[0]).toBeGreaterThanOrEqual(5);
    });
  });

  describe('distributeColsEvenly', function() {
    it('3열을 33.33 / 33.33 / 33.34로 균등 분배', function() {
      distributeColsEvenly('tbl1');
      var cw = mockState.page.blocks[0].colWidths;
      expect(cw.length).toBe(3);
      var sum = cw.reduce(function(a,b){return a+b},0);
      expect(Math.round(sum)).toBe(100);
      expect(Math.abs(cw[0]-cw[1])).toBeLessThan(0.1);
    });
  });

  describe('clearColWidths', function() {
    it('colWidths 필드를 완전히 제거', function() {
      clearColWidths('tbl1');
      expect(mockState.page.blocks[0].colWidths).toBeUndefined();
    });
  });

  describe('insertColAt — colWidths 평균 계산', function() {
    it('기존 길이 기준으로 평균 계산 (bug fix)', function() {
      // 3열 [40,30,30]에 1번 위치에 삽입 → 4열이 됨
      // 기존 버그: Math.floor(100/4)=25 삽입 후 합=125 → 정규화로 전체 왜곡
      // 수정: Math.floor(100/3)=33 삽입 후 합=133 → 정규화로 약 [30,25,22,22]
      insertColAt('tbl1', 0);
      var cw = mockState.page.blocks[0].colWidths;
      expect(cw.length).toBe(4);
      expect(Math.round(cw.reduce(function(a,b){return a+b},0))).toBe(100);
    });
  });
});
```

**Step 2: 테스트 실행 — 모두 FAIL 확인**

Run: `npm test -- table-width`
Expected: 각 export 함수가 아직 정의되지 않아 import 에러 발생.

**Step 3: 커밋**

```bash
git add src/editor/__tests__/table-width.test.js
git commit -m "test: 표 열 너비 동작 스펙 테스트 추가 (Task 1)"
```

---

## Task 2: `resizeColWithNeighborCompensation` 구현

**Files:**
- Modify: `src/editor/table.js:12-16` (MIN 상수 추가)
- Modify: `src/editor/table.js` (새 export 함수 추가, `normalizeColWidths` 아래)

**Context:** 드래그와 패널 입력이 공유할 핵심 로직. 한 열을 목표값으로 맞추면서 이웃에서 차감.

**Step 1: 상수 + 함수 추가 — table.js 상단 수정**

기존 `table.js:11-16`:
```javascript
// colWidths 합계 100% 정규화
function normalizeColWidths(b){
  if(!b.colWidths||!b.colWidths.length)return;
  var total=0;for(var k=0;k<b.colWidths.length;k++)total+=b.colWidths[k];
  if(total>0&&total!==100){for(var k=0;k<b.colWidths.length;k++)b.colWidths[k]=Math.round(b.colWidths[k]/total*100)}
}
```

교체:
```javascript
// 열 너비 상수
var MIN_COL_PCT = 5;
var MAX_COL_PCT = 80;

// colWidths 합계 100% 정규화 (허용 오차 0.5 이내면 건드리지 않음, 레거시 보정용)
function normalizeColWidths(b){
  if(!b.colWidths||!b.colWidths.length)return;
  var total=0;for(var k=0;k<b.colWidths.length;k++)total+=b.colWidths[k];
  if(total>0&&Math.abs(total-100)>0.5){
    for(var k=0;k<b.colWidths.length;k++)b.colWidths[k]=b.colWidths[k]/total*100;
  }
}

// colWidths가 없거나 길이가 안 맞으면 균등값으로 초기화 (모듈 내부 헬퍼 — Task 5 setupTableResize 내부에서도 직접 호출)
function ensureColWidths(b){
  if(!b.rows||!b.rows[0])return;
  var n=b.rows[0].length;
  if(!b.colWidths||b.colWidths.length!==n){
    b.colWidths=[];
    var even=100/n;
    for(var i=0;i<n;i++)b.colWidths.push(even);
  }
}

// 한 열을 목표값으로 설정하고 이웃에서 차감/보충
export function resizeColWithNeighborCompensation(blockId,colIdx,targetPct){
  var b=findBlock(blockId);if(!b||!b.rows)return;
  ensureColWidths(b);
  var n=b.colWidths.length;
  var target=Math.max(MIN_COL_PCT,Math.min(MAX_COL_PCT,targetPct));
  var delta=target-b.colWidths[colIdx];
  if(Math.abs(delta)<0.01)return;
  // 보상 방향: 마지막 열이면 왼쪽으로, 아니면 오른쪽으로
  var dir=colIdx<n-1?1:-1;
  b.colWidths[colIdx]=target;
  var remaining=delta;
  var i=colIdx+dir;
  while(Math.abs(remaining)>0.01&&i>=0&&i<n){
    var cur=b.colWidths[i];
    var canTake=delta>0?(cur-MIN_COL_PCT):(MAX_COL_PCT-cur);
    var take=Math.min(Math.abs(remaining),Math.max(0,canTake));
    b.colWidths[i]=delta>0?cur-take:cur+take;
    remaining=delta>0?remaining-take:remaining+take;
    i+=dir;
  }
  // 여전히 remaining이 있으면 목표 조정 (이웃 한계 초과 시 target 자체 제한)
  if(Math.abs(remaining)>0.01){
    b.colWidths[colIdx]=target-remaining;
  }
}
```

**Step 2: 테스트 실행 — `resizeColWithNeighborCompensation` 테스트 PASS 확인**

Run: `npm test -- table-width -t resizeCol`
Expected: 6개 테스트 PASS.

**Step 3: 커밋**

```bash
git add src/editor/table.js
git commit -m "feat: 열 너비 이웃 보상 리사이즈 함수 추가 (Task 2)"
```

---

## Task 3: `setColWidth` · `distributeColsEvenly` · `clearColWidths` 구현

**Files:**
- Modify: `src/editor/table.js` (Task 2 추가 함수 아래)

**Step 1: 3개 함수 추가**

```javascript
// 패널에서 특정 열 너비 직접 지정 (undo + autosave 포함)
export function setColWidth(blockId,colIdx,targetPct){
  var b=findBlock(blockId);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(blockId);
  resizeColWithNeighborCompensation(blockId,colIdx,targetPct);
  renderBlocks();triggerAutoSave();
}

// 균등 분배 (모든 열 100/N)
export function distributeColsEvenly(blockId){
  var b=findBlock(blockId);if(!b||!b.rows||!b.rows[0])return;
  pushUndoImmediate();b=findBlock(blockId);
  var n=b.rows[0].length;
  var even=100/n;
  b.colWidths=[];
  for(var i=0;i<n;i++)b.colWidths.push(even);
  renderBlocks();triggerAutoSave();toast('너비 균등 분배');
}

// colWidths 제거 (자동 맞춤 상태로 복귀)
export function clearColWidths(blockId){
  var b=findBlock(blockId);if(!b)return;
  pushUndoImmediate();b=findBlock(blockId);
  delete b.colWidths;
  renderBlocks();triggerAutoSave();toast('너비 자동 맞춤');
}
```

**Step 2: 테스트 실행 — 모든 Column Width 테스트 PASS 확인**

Run: `npm test -- table-width`
Expected: `setColWidth`, `distributeColsEvenly`, `clearColWidths` 테스트 PASS.

**Step 3: 커밋**

```bash
git add src/editor/table.js
git commit -m "feat: 패널용 열 너비 조정 함수 3종 추가 (Task 3)"
```

---

## Task 4: `insertColAt` 평균값 버그 수정

**Files:**
- Modify: `src/editor/table.js:110-123`

**Context:** 기존 코드는 `splice` 이후 길이로 평균을 계산해 합계가 133% 등으로 왜곡.

**Step 1: 기존 `insertColAt` 교체**

기존 `table.js:110-123`:
```javascript
export function insertColAt(id,afterCol){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var insertIdx=Math.max(afterCol+1,0);
  for(var j=0;j<b.rows.length;j++)b.rows[j].splice(insertIdx,0,'');
  // colWidths 조정
  if(b.colWidths&&b.colWidths.length){
    var avg=Math.floor(100/(b.rows[0].length));
    b.colWidths.splice(insertIdx,0,avg);
    normalizeColWidths(b);
  }
  renderBlocks();triggerAutoSave();
}
```

교체:
```javascript
export function insertColAt(id,afterCol){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var insertIdx=Math.max(afterCol+1,0);
  var prevLen=b.rows[0]?b.rows[0].length:0;
  for(var j=0;j<b.rows.length;j++)b.rows[j].splice(insertIdx,0,'');
  // colWidths 조정: 새 열에 (100/신규길이) 할당, 나머지는 비례 축소
  if(b.colWidths&&b.colWidths.length){
    var newLen=prevLen+1;
    var newColPct=100/newLen;
    var scale=(100-newColPct)/100;
    for(var k=0;k<b.colWidths.length;k++)b.colWidths[k]=b.colWidths[k]*scale;
    b.colWidths.splice(insertIdx,0,newColPct);
    normalizeColWidths(b);
  }
  renderBlocks();triggerAutoSave();
}
```

**Step 2: 테스트 실행 — `insertColAt` 테스트 PASS 확인**

Run: `npm test -- table-width -t insertColAt`
Expected: PASS, 합계 100.

**Step 3: 기존 `table-sort.test.js` 포함 전체 회귀 확인**

Run: `npm test`
Expected: 85 (기존) + 신규 Column Width 테스트 모두 PASS.

**Step 4: 커밋**

```bash
git add src/editor/table.js
git commit -m "fix: insertColAt 평균값 계산 오류 수정 (Task 4)"
```

---

## Task 5: `setupTableResize` 드래그 핸들러를 이웃 보상 방식으로 교체

**Files:**
- Modify: `src/editor/table.js:384-424`

**Context:** 드래그 중에도 `%` 기반으로 계산하도록 변경. 종료 시 `normalizeColWidths` 호출 제거 (이웃 보상이 이미 합 100 유지).

**Step 1: 기존 `setupTableResize` 교체**

기존 `table.js:384-424`:
```javascript
export function setupTableResize(div){
  var resizers=div.querySelectorAll('.col-resizer');
  resizers.forEach(function(resizer){
    var colIdx=parseInt(resizer.getAttribute('data-col'));
    var startX,startW,th;
    resizer.addEventListener('mousedown',function(e){
      e.preventDefault();e.stopPropagation();
      th=div.querySelector('th[data-col="'+colIdx+'"]');
      if(!th)return;
      startX=e.pageX;startW=th.offsetWidth;
      resizer.classList.add('active');
      pushUndoImmediate();
      document.addEventListener('mousemove',onMouseMove);
      document.addEventListener('mouseup',onMouseUp);
    });
    function onMouseMove(e){
      if(!th)return;
      var w=Math.max(50,startW+(e.pageX-startX));
      th.style.width=w+'px';
      var tbl=div.querySelector('table');
      if(tbl){var cols=tbl.querySelectorAll('col');if(cols[colIdx])cols[colIdx].style.width=w+'px'}
      var tds=div.querySelectorAll('td[data-col="'+colIdx+'"]');
      tds.forEach(function(td){td.style.width=w+'px'});
    }
    function onMouseUp(){
      resizer.classList.remove('active');
      document.removeEventListener('mousemove',onMouseMove);
      document.removeEventListener('mouseup',onMouseUp);
      if(th){
        var bid=div.getAttribute('data-id');
        var cur=findBlock(bid);if(!cur)return;
        if(!cur.colWidths)cur.colWidths=[];
        var tbl=div.querySelector('table');
        cur.colWidths[colIdx]=tbl?Math.round(th.offsetWidth/tbl.offsetWidth*100):Math.floor(100/(cur.rows&&cur.rows[0]?cur.rows[0].length:3));
        normalizeColWidths(cur);
        triggerAutoSave();
      }
    }
  });
}
```

교체:
```javascript
export function setupTableResize(div){
  var resizers=div.querySelectorAll('.col-resizer');
  resizers.forEach(function(resizer){
    var colIdx=parseInt(resizer.getAttribute('data-col'));
    var startX,startPct,bid,tblWidth,undoPushed=false;
    resizer.addEventListener('mousedown',function(e){
      e.preventDefault();e.stopPropagation();
      bid=div.getAttribute('data-id');
      var cur=findBlock(bid);if(!cur||!cur.rows)return;
      ensureColWidths(cur);
      var tbl=div.querySelector('table');
      tblWidth=tbl?tbl.offsetWidth:0;
      if(!tblWidth)return;
      startX=e.pageX;startPct=cur.colWidths[colIdx];
      resizer.classList.add('active');
      pushUndoImmediate();undoPushed=true;
      document.addEventListener('mousemove',onMouseMove);
      document.addEventListener('mouseup',onMouseUp);
    });
    function onMouseMove(e){
      var cur=findBlock(bid);if(!cur||!tblWidth)return;
      var deltaPx=e.pageX-startX;
      var deltaPct=deltaPx/tblWidth*100;
      var target=startPct+deltaPct;
      resizeColWithNeighborCompensation(bid,colIdx,target);
      // 실시간 반영: <col> 요소 업데이트
      var tbl=div.querySelector('table');
      if(tbl){
        var cols=tbl.querySelectorAll('col');
        for(var i=0;i<cols.length&&i<cur.colWidths.length;i++){
          cols[i].style.width=cur.colWidths[i]+'%';
        }
      }
    }
    function onMouseUp(){
      resizer.classList.remove('active');
      document.removeEventListener('mousemove',onMouseMove);
      document.removeEventListener('mouseup',onMouseUp);
      if(undoPushed){triggerAutoSave();undoPushed=false}
    }
  });
}
```

**Step 2: 수동 테스트 — dev 서버 실행 후 드래그 10회 반복**

Run: `npm run dev`

브라우저에서:
1. 새 표 3×3 생성
2. 열 0을 오른쪽으로 10회 드래그 후 열 2 값 확인 → **드래그 전 값과 동일해야 함** (이전 버그: 조금씩 바뀜)
3. 마지막 열 드래그 시 왼쪽 이웃이 감소해야 함
4. 창 크기 변경 시 비율 유지 확인

**Step 3: 커밋**

```bash
git add src/editor/table.js
git commit -m "refactor: 드래그 리사이즈를 이웃 보상 방식으로 교체, 누적 오차 제거 (Task 5)"
```

---

## Task 6: 자동저장 게이팅 — `blocks.js` 수정

**Files:**
- Modify: `src/editor/blocks.js:208-222`

**Context:** `b.colWidths`가 이미 있으면 DOM 측정값으로 덮어쓰지 않도록. 드래그/패널 조작은 이미 `colWidths`를 직접 갱신.

**Step 1: 기존 table 수집 블록 교체**

기존 `blocks.js:208-222`:
```javascript
if(b.type==='table'){
  var rows=[],trs=el.querySelectorAll('tr'),cws=[],tbl=el.querySelector('table'),tblW=tbl?tbl.offsetWidth:0;
  for(var ri=0;ri<trs.length;ri++){
    var cls=[],tds=trs[ri].querySelectorAll('th,td');
    for(var ci=0;ci<tds.length;ci++){
      var cellClone=tds[ci].cloneNode(true);
      var cellResizers=cellClone.querySelectorAll('.col-resizer');
      for(var cr=0;cr<cellResizers.length;cr++)cellResizers[cr].parentNode.removeChild(cellResizers[cr]);
      cls.push(sanitizeHTML(cellClone.innerHTML));
      if(ri===0&&tds[ci].offsetWidth&&tblW)cws[ci]=Math.round(tds[ci].offsetWidth/tblW*100)
    }
    rows.push(cls)
  }
  b.rows=rows;if(cws.length)b.colWidths=cws
}
```

교체:
```javascript
if(b.type==='table'){
  var rows=[],trs=el.querySelectorAll('tr'),cws=[],tbl=el.querySelector('table'),tblW=tbl?tbl.offsetWidth:0;
  var hasExistingColWidths=!!(b.colWidths&&b.colWidths.length);
  for(var ri=0;ri<trs.length;ri++){
    var cls=[],tds=trs[ri].querySelectorAll('th,td');
    for(var ci=0;ci<tds.length;ci++){
      var cellClone=tds[ci].cloneNode(true);
      var cellResizers=cellClone.querySelectorAll('.col-resizer');
      for(var cr=0;cr<cellResizers.length;cr++)cellResizers[cr].parentNode.removeChild(cellResizers[cr]);
      cls.push(sanitizeHTML(cellClone.innerHTML));
      // colWidths는 state가 소스 오브 트루스: 기존 값이 없을 때만 DOM에서 추출
      if(!hasExistingColWidths&&ri===0&&tds[ci].offsetWidth&&tblW)cws[ci]=tds[ci].offsetWidth/tblW*100
    }
    rows.push(cls)
  }
  b.rows=rows;
  if(!hasExistingColWidths&&cws.length)b.colWidths=cws;
}
```

**Step 2: 수동 테스트 — 자동저장 진동 없음 확인**

Run: `npm run dev`

브라우저에서:
1. 표 생성 후 콘솔에서 `state.page.blocks.find(b=>b.type==='table').colWidths` 값 기록
2. 10초 대기 (자동저장 여러 번 발생)
3. 다시 같은 값 조회 → **변화 0** 확인

**Step 3: 커밋**

```bash
git add src/editor/blocks.js
git commit -m "fix: 자동저장이 colWidths를 DOM으로 덮어쓰지 않도록 게이팅 (Task 6)"
```

---

## Task 7: 패널에 "열 너비" 섹션 추가 — HTML 생성

**Files:**
- Modify: `src/editor/table.js:264-326` (`showTablePanel`)

**Context:** "정렬" 섹션 **앞**에 열 너비 섹션 삽입. 숫자 입력 + 슬라이더 + 균등/자동 버튼 4개 요소.

**Step 1: `showTablePanel`에 열 너비 섹션 HTML 추가**

`table.js:318` 직전("정렬" 섹션 시작 전)에 삽입:

기존:
```javascript
  // 정렬
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">정렬 (열 '+(col+1)+')</div>';
```

위에 삽입:
```javascript
  // 열 너비 (size.cols가 0인 경우는 이 섹션을 렌더링하지 않음)
  var curColWidth=size.cols>0?(b.colWidths&&b.colWidths[col]!=null?b.colWidths[col]:(100/size.cols)):0;
  if(size.cols>0){
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">열 너비 (열 '+(col+1)+')</div>';
  html+='<div class="tbl-panel-width">';
  html+='<input type="number" class="tbl-width-input" data-tbl-action="widthInput" min="5" max="80" step="0.5" value="'+curColWidth.toFixed(1)+'" aria-label="열 '+(col+1)+' 너비 퍼센트"> <span class="tbl-width-unit">%</span>';
  html+='<input type="range" class="tbl-width-slider" data-tbl-action="widthSlider" min="5" max="80" step="0.5" value="'+curColWidth.toFixed(1)+'" aria-label="열 '+(col+1)+' 너비 슬라이더">';
  html+='</div>';
  html+='<div class="tbl-panel-grid">';
  html+='<button class="tbl-panel-btn" data-tbl-action="distributeEvenly">균등 분배</button>';
  html+='<button class="tbl-panel-btn" data-tbl-action="clearColWidths">자동 맞춤</button>';
  html+='</div></div>';
  }
  // 정렬
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">정렬 (열 '+(col+1)+')</div>';
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공, 번들 크기 약간 증가 (< 1KB).

**Step 3: 커밋**

```bash
git add src/editor/table.js
git commit -m "feat: 패널에 열 너비 조정 UI 섹션 추가 (Task 7)"
```

---

## Task 8: 패널 이벤트 위임에 열 너비 액션 4종 연결

**Files:**
- Modify: `src/editor/table.js:342-381` (`initTablePanel`)

**Context:** 숫자 입력과 슬라이더는 `change` / `input` 이벤트라 기존 `click` 위임만으로는 부족. 별도 리스너 추가 + 기존 switch에 `distributeEvenly`, `clearColWidths` 케이스 추가.

**Step 1: `initTablePanel` 교체 (두 가지 이벤트 위임)**

기존 `table.js:342-381`:
```javascript
export function initTablePanel(){
  var panel=$('tablePanel');
  if(!panel)return;
  panel.addEventListener('click',function(e){
    ...
  });
}
```

교체:
```javascript
export function initTablePanel(){
  var panel=$('tablePanel');
  if(!panel)return;

  // 숫자/슬라이더 입력 디바운스 (500ms) — Phase 8 Undo와 호환
  var widthInputTimer=null;

  // state의 colWidths로 input/slider 값 재동기화 (클램프 후 desync 방지)
  // 포커스된 요소는 건드리지 않아 커서 점프 방지
  function syncWidthInputsFromState(){
    var bid=panelState.blockId,col=panelState.col;
    var b=findBlock(bid);
    if(!b||!b.colWidths||b.colWidths[col]==null)return;
    var v=b.colWidths[col];
    var inputs=panel.querySelectorAll('[data-tbl-action="widthInput"],[data-tbl-action="widthSlider"]');
    inputs.forEach(function(el){
      if(document.activeElement!==el)el.value=v.toFixed(1);
    });
  }

  // input 이벤트(타이핑/드래그 중): 양방향 시각 동기화만 + 디바운스 후 저장
  function scheduleWidthSave(target){
    var bid=panelState.blockId,col=panelState.col;
    if(!bid)return;
    var v=parseFloat(target.value);
    if(isNaN(v))return;
    // 입력과 슬라이더 양방향 시각 동기화 (포커스 요소 제외)
    var allInputs=panel.querySelectorAll('[data-tbl-action="widthInput"],[data-tbl-action="widthSlider"]');
    allInputs.forEach(function(el){if(el!==target&&document.activeElement!==el)el.value=v});
    clearTimeout(widthInputTimer);
    widthInputTimer=setTimeout(function(){
      setColWidth(bid,col,v);
      syncWidthInputsFromState();   // 클램프 결과 반영
    },500);
  }

  panel.addEventListener('input',function(e){
    var el=e.target.closest('[data-tbl-action]');
    if(!el)return;
    var action=el.getAttribute('data-tbl-action');
    if(action==='widthInput'||action==='widthSlider')scheduleWidthSave(el);
  });

  // change 이벤트(blur/Enter/슬라이더 release): 디바운스 취소하고 즉시 확정
  // ※ applyWidth 재호출 금지 — setTimeout과 중복 저장되면 Undo 스택에 2번 쌓임
  panel.addEventListener('change',function(e){
    var el=e.target.closest('[data-tbl-action]');
    if(!el)return;
    var action=el.getAttribute('data-tbl-action');
    if(action==='widthInput'||action==='widthSlider'){
      clearTimeout(widthInputTimer);
      var bid=panelState.blockId,col=panelState.col;
      var v=parseFloat(el.value);
      if(!isNaN(v)&&bid){
        setColWidth(bid,col,v);
        syncWidthInputsFromState();
      }
    }
  });

  panel.addEventListener('click',function(e){
    var btn=e.target.closest('[data-tbl-action]');
    if(!btn)return;
    var action=btn.getAttribute('data-tbl-action');
    // 숫자/슬라이더 입력은 click 위임에서 제외
    if(action==='widthInput'||action==='widthSlider')return;
    var color=btn.hasAttribute('data-color')?btn.getAttribute('data-color'):null;
    var bid=panelState.blockId,row=panelState.row,col=panelState.col;
    if(!bid)return;
    switch(action){
      case'insertRowBefore':insertRowAt(bid,row-1);break;
      case'insertRowAfter':insertRowAt(bid,row);break;
      case'insertColBefore':insertColAt(bid,col-1);break;
      case'insertColAfter':insertColAt(bid,col);break;
      case'deleteRow':deleteRow(bid,row);break;
      case'deleteCol':deleteCol(bid,col);break;
      case'setCellColor':setCellColor(bid,row,col,color||null);break;
      case'setRowColor':setRowColor(bid,row,color||null);break;
      case'setColColor':setColColor(bid,col,color||null);break;
      case'clearColors':clearCellColors(bid,row,col);break;
      case'sortAsc':sortTable(bid,col,'asc');break;
      case'sortDesc':sortTable(bid,col,'desc');break;
      case'alignLeft':setTableAlign(bid,'left');break;
      case'alignCenter':setTableAlign(bid,'center');break;
      case'alignRight':setTableAlign(bid,'right');break;
      case'valignTop':setTableVAlign(bid,'top');break;
      case'valignMiddle':setTableVAlign(bid,'middle');break;
      case'valignBottom':setTableVAlign(bid,'bottom');break;
      case'distributeEvenly':distributeColsEvenly(bid);break;
      case'clearColWidths':clearColWidths(bid);break;
      case'deleteTable':deleteTable(bid);closeTablePanel();return;
    }
    var b=findBlock(bid);
    if(b&&b.rows){
      if(action==='deleteRow'&&row>=b.rows.length)panelState.row=b.rows.length-1;
      if(action==='deleteCol'&&col>=b.rows[0].length)panelState.col=b.rows[0].length-1;
      showTablePanel(panelState.blockId,panelState.row,panelState.col);
    }
  });
}
```

**Step 2: 수동 테스트 — 패널에서 너비 조정**

1. 표 3×3 생성, 우클릭으로 패널 오픈
2. 숫자 입력 `50` → 슬라이더 자동 이동, 500ms 후 표 적용 확인
3. 슬라이더 드래그 → 숫자 입력 동기화
4. "균등 분배" 클릭 → 33.33 / 33.33 / 33.34 적용
5. "자동 맞춤" 클릭 → `colWidths` 필드 제거, 균등 렌더링 유지

**Step 3: 커밋**

```bash
git add src/editor/table.js
git commit -m "feat: 패널 열 너비 입력 이벤트 위임 연결 (Task 8)"
```

---

## Task 9: 열 너비 섹션 CSS 추가

**Files:**
- Modify: `src/styles/main.css:205-209` (tbl-panel-align 아래)

**Step 1: 열 너비 UI 스타일 추가**

`main.css:209` `.tbl-align-sep` 규칙 아래에 추가:

```css
/* 열 너비 조정 UI */
.tbl-panel-width{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.tbl-width-input{width:72px;padding:6px 8px;border:1px solid var(--bdr);border-radius:var(--rad);background:var(--bg3);color:var(--t1);font-size:13px}
.tbl-width-input:focus{outline:2px solid var(--acc);outline-offset:-1px}
.tbl-width-unit{color:var(--t3);font-size:13px}
.tbl-width-slider{flex:1;min-width:100px;accent-color:var(--acc)}
```

**Step 2: 빌드 + 수동 확인**

Run: `npm run build && npm run dev`

브라우저에서 패널 열어 "열 너비" 섹션 시각 확인.

**Step 3: 커밋**

```bash
git add src/styles/main.css
git commit -m "style: 열 너비 조정 UI CSS 추가 (Task 9)"
```

---

## Task 10: max-width 제약 추가 (레이아웃 안전망)

**Files:**
- Modify: `src/styles/main.css:178`

**Step 1: 셀 최대 너비 추가**

기존 `main.css:178`:
```css
.block-table th,.block-table td{padding:8px 12px;border:1px solid var(--bdr);outline:none;position:relative;vertical-align:top;min-width:50px;word-wrap:break-word;font-size:14px;line-height:1.5}
```

교체:
```css
.block-table th,.block-table td{padding:8px 12px;border:1px solid var(--bdr);outline:none;position:relative;vertical-align:top;min-width:50px;max-width:1200px;word-wrap:break-word;overflow-wrap:break-word;font-size:14px;line-height:1.5}
```

**Step 2: 수동 테스트 — 긴 텍스트 셀이 창을 넘어가지 않음 확인**

1. 셀에 300자 이상 텍스트 붙여넣기
2. 셀이 1200px에서 줄바꿈 확인
3. 표 전체가 가로 스크롤(`overflow-x:auto`)로 처리되는지 확인

**Step 3: 커밋**

```bash
git add src/styles/main.css
git commit -m "style: 표 셀 max-width 제약으로 레이아웃 깨짐 방지 (Task 10)"
```

---

## Task 11: 통합 회귀 테스트 + 최종 검증

**Files:**
- Modify: `src/editor/__tests__/table-width.test.js` (통합 시나리오 추가)

**Context:** 여러 동작 조합 시 일관성 확인.

**Step 1: 통합 테스트 케이스 추가**

`table-width.test.js` 파일 상단 import 수정 — `sortTable` 추가:
```javascript
import {
  resizeColWithNeighborCompensation,
  setColWidth,
  distributeColsEvenly,
  clearColWidths,
  insertColAt,
  sortTable,
} from '../table.js';
```

파일 끝 `});` 앞에 추가:
```javascript
  describe('통합 시나리오', function() {
    it('드래그 → 실제 정렬 → 드래그 반복 시 colWidths 일관성 유지', function() {
      resizeColWithNeighborCompensation('tbl1', 0, 50);
      var before = mockState.page.blocks[0].colWidths.slice();
      // 정렬은 rows만 바꾸고 colWidths는 건드리지 않아야 함
      sortTable('tbl1', 0, 'asc');
      expect(mockState.page.blocks[0].colWidths).toEqual(before);
      // 정렬 후 두 번째 드래그도 정상 동작
      resizeColWithNeighborCompensation('tbl1', 1, 25);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(Math.round(sum)).toBe(100);
    });
    it('균등 분배 → 자동 맞춤 → 균등 분배 순서 이상 없음', function() {
      distributeColsEvenly('tbl1');
      clearColWidths('tbl1');
      expect(mockState.page.blocks[0].colWidths).toBeUndefined();
      distributeColsEvenly('tbl1');
      expect(mockState.page.blocks[0].colWidths.length).toBe(3);
    });
    it('insertColAt 후 resizeColWithNeighborCompensation 정상 동작', function() {
      insertColAt('tbl1', 0);
      expect(mockState.page.blocks[0].colWidths.length).toBe(4);
      resizeColWithNeighborCompensation('tbl1', 0, 40);
      var sum = mockState.page.blocks[0].colWidths.reduce(function(a,b){return a+b},0);
      expect(Math.round(sum)).toBe(100);
    });
  });
```

**주의**: `sortTable` 호출을 위해 테스트 초기 상태 `rows` 데이터가 2행 이상이어야 함(`sortTable`은 `rows.length<2`면 return). `beforeEach`의 기본 상태 `[['a','b','c'],['1','2','3']]`는 2행이므로 OK.

**Step 2: 전체 테스트 실행**

Run: `npm test`
Expected: 기존 85 + 신규 Column Width 13+ 테스트 모두 PASS.

**Step 3: 최종 수동 QA 체크리스트 (Claude.md: 사전 QA)**

- [ ] 새 표 생성 → 3×3, 열 너비 33.33씩
- [ ] 드래그 10회 반복 → 조작 안 한 열 값 변화 0%
- [ ] 마지막 열 드래그 → 왼쪽 이웃 감소
- [ ] 패널 숫자 입력 50 → 슬라이더 동기화 → 500ms 후 표 반영
- [ ] 슬라이더 드래그 → 숫자 동기화
- [ ] "균등 분배" → 33.33 / 33.33 / 33.34
- [ ] "자동 맞춤" → `colWidths` 삭제 확인 (console)
- [ ] 자동저장 10초 대기 후 `colWidths` 진동 없음
- [ ] 열 삽입 후 합계 100 유지
- [ ] 정렬 수행 후 `colWidths` 불변
- [ ] 페이지 저장 → 새로고침 → 너비 복원 확인
- [ ] 큰 셀 텍스트 → `max-width` 발동, 가로 스크롤
- [ ] 모바일 화면(태블릿 해상도) → 레이아웃 깨짐 없음
- [ ] 다크/라이트 테마에서 패널 입력 UI 가독성
- [ ] `/verification-before-completion` 스킬 실행

**Step 4: Phase 8과의 호환성 확인 (수동)**

Phase 8 태스크가 아직 미착수이므로 충돌 예방 차원만 확인:
- `pushUndoImmediate` 호출 위치가 모든 변경 함수 상단에 있음 → Phase 8-1 Undo 기반 가능
- `.col-resizer`의 `e.stopPropagation()` 유지 → Phase 8-2 블록 D&D 이벤트 겹침 방지
- `colWidths` 필드 보존 → Phase 8-4 정렬/필터와 무관

**Step 5: 최종 커밋**

```bash
git add src/editor/__tests__/table-width.test.js
git commit -m "test: 열 너비 통합 시나리오 테스트 추가 (Task 11)"
```

---

## Task 12: Phase 진행 기록 업데이트

**Files:**
- Modify: `AcidDocument/WorkProgress/Phase_8_2026-02-09.md` (기존 Phase 8 파일에 사전 작업 섹션 추가)

**Context:** Claude.md 규칙 — "작업중이거나 이미 작업했던 Phase를 다시 작업하는 경우 해당 Phase의 md파일을 찾아 그 파일에 기록". 이번 작업은 **Phase 8 착수 전 사전 개선**으로, Phase 8의 일부로 간주. 따라서 기존 [`Phase_8_2026-02-09.md`](AcidDocument/WorkProgress/Phase_8_2026-02-09.md)에 섹션을 추가해 기록.

**Step 1: 기존 Phase_8 파일에 사전 작업 섹션 추가**

기존 파일 끝 `## 진행 기록` 섹션 아래에 추가:

```markdown
## 사전 작업 (2026-04-19): 표 열 너비 개선

**Branch:** `feat/table-width-improvement` (Phase 8 본 작업 전 선행)
**Status:** 완료

### 배경
2026-04-19 코드 리뷰(`docs/reviews/TableReview_2026-04-19.md`)에서 발견된 표 열 너비 관련 결함을 Phase 8 Undo/Redo 및 정렬/필터 태스크 진행 전에 해결. Phase 8-4(정렬/필터)의 기반이 되는 표 안정화 작업.

### 완료 태스크
- [x] Task 1: 열 너비 테스트 스펙 (TDD)
- [x] Task 2: `resizeColWithNeighborCompensation` 구현
- [x] Task 3: `setColWidth` / `distributeColsEvenly` / `clearColWidths`
- [x] Task 4: `insertColAt` 평균값 계산 버그 수정
- [x] Task 5: `setupTableResize` 이웃 보상 방식 교체
- [x] Task 6: 자동저장 `colWidths` 게이팅
- [x] Task 7: 패널 열 너비 섹션 HTML
- [x] Task 8: 패널 이벤트 위임 연결 (debounce + sync)
- [x] Task 9: 열 너비 UI CSS
- [x] Task 10: 셀 `max-width` 제약
- [x] Task 11: 통합 테스트 + 수동 QA

### 해결된 결함
- [TableReview 4.5] 드래그 리사이즈 누적 오차 (전체 비례 축소 → 이웃 보상)
- [TableReview 5.7] `normalizeColWidths` 부동소수점 비교 (허용 오차 0.5)
- [TableReview Important B] 자동저장이 `colWidths`를 DOM에서 재덮어쓰는 진동
- [TableReview 5.6] 셀 `max-width` 없음

### 신규 기능
- 패널에서 숫자 입력 + 슬라이더로 정확한 % 지정 (디바운스 500ms)
- "균등 분배" 버튼 (100/N)
- "자동 맞춤" 버튼 (`colWidths` 삭제로 시스템 자동 분배)

### Phase 8 본 작업과의 관계
- **Phase 8-1 Undo/Redo**: 이 작업에서 `setColWidth`의 debounce로 Undo 스택 1회만 쌓도록 구현 → 본 작업 호환
- **Phase 8-2 블록 D&D**: `.col-resizer`의 `stopPropagation` 유지로 이벤트 겹침 방지
- **Phase 8-4 정렬/필터**: `sortTable`과 `colWidths` 격리 보장 — 정렬이 너비에 영향 없음을 테스트로 검증

**관련 문서**:
- `docs/reviews/TableReview_2026-04-19.md` — 리뷰 원본
- `docs/plans/2026-04-19-table-width-improvement-design.md` — 설계
- `docs/plans/2026-04-19-table-width-improvement-plan.md` — 실행 계획
```

**Step 2: `workprogress_summary.md` 별도 수정 불필요**
Claude.md 규칙상 summary는 지시 사항 파일이며 Phase 기록은 개별 Phase 파일에 적재.

**Step 3: 최종 푸시 (사용자 확인 후)**

Claude.md 규칙: 커밋/푸시 전 사용자 확인 필요.
```bash
# 사용자 확인 후에만 실행
git push -u origin feat/table-width-improvement
```

---

## 자체 검토 (Self-Review)

### Spec 커버리지
- ✅ 드래그 누적 오차 해결 (Task 2, 5)
- ✅ 자동저장 덮어쓰기 해결 (Task 6)
- ✅ 패널에서 정확한 조정 (Task 7, 8, 9)
- ✅ 표에서 조정 개선 (Task 5)
- ✅ 기존 기능 충돌 분석 (Design 문서 + Task 11 Step 4)
- ✅ 리그레션 테스트 (Task 11)
- ✅ max-width 제약 (Task 10)
- ✅ insertColAt 버그 (Task 4)

### 타입 일관성
- `resizeColWithNeighborCompensation(blockId, colIdx, targetPct)` — Task 2 정의, Task 5·11에서 동일 시그니처 사용 ✓
- `setColWidth(blockId, colIdx, targetPct)` — Task 3 정의, Task 8에서 호출 ✓
- `distributeColsEvenly(blockId)` — Task 3 정의, Task 8·11에서 호출 ✓
- `clearColWidths(blockId)` — Task 3 정의, Task 8·11에서 호출 ✓
- `ensureColWidths(b)` — Task 2 내부 헬퍼, Task 5의 `setupTableResize`에서 동일 파일 모듈 레벨 함수로 직접 호출 ✓
- `syncWidthInputsFromState()` — Task 8 내부 헬퍼, 동일 함수 내 `scheduleWidthSave` / change 핸들러에서 호출 ✓
- `MIN_COL_PCT=5`, `MAX_COL_PCT=80` — Task 2 정의, Task 3·7에서 참조 ✓

### 플레이스홀더 스캔
- "TODO" / "later" / "appropriate error handling" — 없음 ✓
- 모든 코드 블록이 실제 구현 포함 ✓
- 테스트 케이스 실제 assertion 포함 ✓

### 프로젝트 규칙 (Claude.md) 준수 확인
- ✅ 한글 설명
- ✅ 새 원격 브랜치 생성 (`feat/table-width-improvement`)
- ✅ TDD (Task 1이 테스트 먼저)
- ✅ 커밋 전 사용자 확인 지시
- ✅ 기능 구조 불변 (데이터 모델 동일, 드래그 UX 동일)
- ✅ 사전 QA 체크리스트 (Task 11 Step 3)
- ✅ Phase 기록 파일 생성 (Task 12)
- ✅ String 하드코딩 — toast 메시지는 기존 패턴 유지 (프로젝트 전반이 인라인 문자열 사용)

### 기존 기능과의 충돌 최종 체크
| 기능 | 영향 | 완화 |
|------|------|------|
| `sortTable` | `rows` 순서만 바뀜 | `colWidths` 무관, Task 11에서 테스트 |
| `addTblRow/Col`, `deleteRow/Col` | `colWidths` 직접 관리 | Task 4에서 `insertColAt` 수정, 나머지는 기존 로직 유지 |
| Undo/Redo (Phase 8 예정) | `pushUndoImmediate` 기존 위치 유지 | 패널 입력은 `debounce 500ms` (Task 8) |
| 블록 D&D (Phase 8 예정) | `.col-resizer` `stopPropagation` 기존 유지 | Task 5 코드에 보존 |
| IME 조합 | 리사이즈는 mouse 이벤트 | 영향 없음 |
| export PDF/HTML | `<colgroup><col style="width:%">` 이식 | 영향 없음, 기존 로직 그대로 |
| `columns` 블록 | `setupColResize` 별개 함수 | 영향 없음 |

### 추가 안전 장치
- Task 11의 통합 시나리오 테스트 3개가 **드래그→실제 sortTable→드래그**, **균등→자동→균등**, **삽입 후 리사이즈** 조합 커버
- 자동저장 게이팅(Task 6)은 **처음 저장 시에는 기존 경로 유지**해 하위 호환성 보장
- Task 8의 `syncWidthInputsFromState`로 MIN/MAX 클램프 후 UI가 state와 항상 일치
- Task 8의 change 핸들러는 debounce 타이머를 **취소만 하고** `scheduleWidthSave` 재호출 금지 → Undo 중복 쌓임 방지

### 2차 재검토 (2026-04-19 반영 완료)
최초 플랜에서 발견된 6개 결함 모두 수정:
1. ✅ Task 5 — `ensureColWidthsPublic` 불필요 래퍼 제거, `ensureColWidths` 직접 호출
2. ✅ Task 7 — `size.cols===0` 엣지 케이스 가드(`if(size.cols>0){...}`)
3. ✅ Task 8 — change 핸들러의 `applyWidth` 재호출 제거 (Undo 중복 방지)
4. ✅ Task 8 — `syncWidthInputsFromState` 헬퍼로 클램프 후 input/slider 값 재동기
5. ✅ Task 11 — 통합 테스트가 실제 `sortTable` 호출하도록 변경 + 두 번째 드래그 검증 추가
6. ✅ Task 12 — 신규 Phase 파일 생성 대신 기존 `Phase_8_2026-02-09.md` 섹션 추가 (Claude.md 규칙 준수)

---

## 실행 옵션

계획 저장 완료: `docs/plans/2026-04-19-table-width-improvement-plan.md`

Claude.md 규칙에 따라 실행 시:
1. **Subagent-Driven** (`/subagent-driven-development`) — 각 태스크별 fresh 에이전트, 태스크 간 리뷰
2. **Inline Execution** (`/executing-plans`) — 현 세션에서 일괄 체크포인트 실행

어느 방식으로 진행할지는 사용자 결정.
