# 표(Table) 기능 전체 리뷰 — 2026-04-19

> 범위: 표(Table) 블록의 구조 · 기능 · 조작 방식 전수 리뷰
> 관련 파일: `src/editor/table.js`, `src/editor/renderer.js`, `src/editor/listeners.js`, `src/editor/blocks.js`, `src/ui/toolbar.js`, `src/styles/main.css`, `index.html`, `src/editor/__tests__/table-sort.test.js`, `src/features/export.js`, `src/utils/sanitize.js`

---

## 1. 개요 — 표 기능 한눈에 보기

AcidDocument의 표 블록은 Notion과 유사한 "편집 가능한 셀 + 측면 패널" 구조로 구현되어 있습니다. 코드를 모르는 분을 위한 비유: 엑셀처럼 셀을 클릭해 글자를 쓰고, 셀에서 우클릭을 하면 오른쪽에서 설정 패널이 슥 나오는 형태입니다.

### 1.1 데이터 모델 (블록 객체가 갖는 필드)
| 필드 | 의미 | 예시 |
|------|------|------|
| `type` | 항상 `'table'` | `'table'` |
| `rows` | 2차원 배열, 첫 행이 헤더 | `[['이름','점수'],['김','90']]` |
| `colWidths` | 열 너비 백분율 (합 100) | `[40, 30, 30]` |
| `cellStyles` | 셀별 배경색 (`"행-열"` → `{bg:'#색'}`) | `{'1-0':{bg:'#f00'}}` |
| `rowColors` | 행별 배경색 (`행번호` → `'#색'`) | `{1:'#f00'}` |
| `colColors` | 열별 배경색 | `{0:'#00f'}` |
| `headerColor` | 헤더(0행) 배경색 | `'#eee'` |
| `tableAlign` | 가로 맞춤 (`left`기본 · `center` · `right`) | `'center'` |
| `tableVAlign` | 세로 맞춤 (`top`기본 · `middle` · `bottom`) | `'middle'` |
| `sortCol` / `sortDir` | 마지막 정렬 상태 | `0`, `'asc'` |

### 1.2 실행 흐름 (표 생성 → 편집 → 저장)
```
[슬래시 메뉴 "표"]
   ↓ showTableGrid(idx)         ── toolbar.js (10×10 그리드 UI)
[사용자가 크기 선택 클릭]
   ↓ createTable(idx, r, c)     ── table.js
[rows 초기화 → renderBlocks → 첫 셀 focus]
   ↓ 사용자가 셀에 입력
[input 이벤트 → triggerAutoSave]   ── listeners.js
[Tab/Enter/화살표 → focusCell 이동]
[우클릭 / 일반 클릭(패널 열려있을 때) → showTablePanel]
[패널 버튼 → 행/열 삽입·삭제, 색상, 정렬, 맞춤]
[자동저장(1.5s) → saveCurrent → collectPage → collectTableData] ── blocks.js
```

### 1.3 주요 모듈 역할 분담
| 파일 | 역할 | 핵심 함수 |
|------|------|-----------|
| `src/editor/table.js` | 표 상태 변경 로직 전부 + 측면 패널 | `createTable`, `addTblRow/Col`, `insertRowAt/ColAt`, `deleteRow/Col`, `sortTable`, `showTablePanel`, `setupTableResize` |
| `src/editor/renderer.js` | 블록 → HTML 변환 (`case 'table':`) | L215~252 |
| `src/editor/listeners.js` | 셀 키보드/마우스/우클릭 바인딩 | L612~774 (셀 핸들러), L1094(행 추가 위임) |
| `src/editor/blocks.js` | 자동저장 시 DOM → 데이터 수집 | L208~222 (`collectPage` 내부) |
| `src/ui/toolbar.js` | 표 생성 시 10×10 그리드 셀렉터 | `showTableGrid` L158~215 |
| `index.html` | `#tablePanel` DOM 골격 | L159~162 |
| `src/styles/main.css` | 표 외형 + 패널 외형 | L174~215 |

### 1.4 지원 조작 방식 요약
- **생성**: 슬래시 메뉴(`/표`) → 10×10 그리드에서 크기 선택 (최대 10×10)
- **셀 편집**: 클릭 후 입력, `contenteditable` 방식
- **커서 이동**: Tab · Shift+Tab · Enter · Shift+Enter · 화살표 4방향 · Escape
- **서식**: Ctrl+B / Ctrl+I / Ctrl+U (셀 내부), Ctrl+A (셀 전체 선택)
- **행 추가**: 마지막 행에서 Enter · Tab / 하단 호버 시 `+ 행 추가` 버튼 / 패널 버튼
- **열 조작**: 패널에서만 가능 (단축키 없음)
- **열 너비**: 헤더 오른쪽 테두리 드래그
- **우클릭**: 측면 패널 오픈 (`showTablePanel`)
- **삭제**: 패널 "표 삭제" → 확인 모달
- **정렬**: 패널 "열 N 오름/내림차순" (숫자 자동 감지)
- **배경색**: 셀 · 행 · 열 각각 (우선순위: 셀 > 행 > 열 > 헤더)

---

## 2. 강점 (잘된 점)

### 2.1 모듈 분리 깔끔
`table.js` 459줄 안에 생성 · 편집 · 색상 · 정렬 · 패널까지 단일 책임 범위로 잘 묶여 있음. Phase 3 리팩토링(도메인별 파일 분리)의 성과가 명확.

### 2.2 이벤트 위임 모범 적용 (패널)
`initTablePanel()` (L342~381) — 패널 내부 모든 버튼을 단일 `click` 핸들러로 처리. `data-tbl-action="..."` 방식으로 22개 동작(정렬·삽입·색상·맞춤 등)을 분기. **Phase 5-2 이벤트 위임 원칙을 표 기능에서는 제대로 지킨 유일한 사례**. 다른 블록들이 따라가야 할 모범.

### 2.3 정렬 시 스타일 재매핑
`sortTable` (L198~225) — 정렬 후 `rowColors` · `cellStyles` 키를 원본→새 위치로 재매핑. 엑셀의 "정렬하면 색도 같이 따라가는" 기대와 일치. 테스트도 `table-sort.test.js`에 케이스 7개 보유.

### 2.4 Undo/Redo 통합
모든 변경 함수가 첫 줄에 `pushUndoImmediate()` 호출. Phase 8 Undo 시스템이 준비되면 바로 연결 가능.

### 2.5 키보드 내비게이션 충실
Tab · Shift+Tab · Enter · Shift+Enter · 화살표 · Escape · Ctrl+B/I/U/A — 엑셀 사용자가 기대하는 단축키를 대부분 커버 (L649~768).

### 2.6 패널 상태 자동 갱신
`initTablePanel` 마지막 (L374~379) — 행/열 추가·삭제 후 패널을 자동 재렌더링하여 크기 표시를 갱신. 작은 디테일이지만 UX에 크게 기여.

---

## 3. Critical 이슈 (즉시 수정 필요)

### 3.1 `renderer.js:238` — **스타일 속성 XSS 벡터**
```js
var cellStyle=bgColor?'background:'+bgColor+';':'';
if(b.tableAlign)cellStyle+='text-align:'+b.tableAlign+';';
...
inner+='<'+tag+ce+' data-row="'+r+'" data-col="'+c+'"'+(cellStyle?' style="'+cellStyle+'"':'')+'>'+
```
**문제**: `bgColor`, `tableAlign`, `tableVAlign`, `headerColor` 값이 **어떤 검증도 없이** HTML `style` 속성에 직접 문자열 결합됨. 색상 값이 `red;background:url(javascript:...)` 같은 형태로 저장되면 CSS injection → 오래된 브라우저에서 XSS 가능. `setCellColor(id,row,col,color)` 등은 `color` 파라미터를 어떤 화이트리스트도 거치지 않고 저장.

**비유**: 집 열쇠를 "빨간색"이라고 쓴 메모 자리에 누가 "빨간색; 대문도 함께 열림"이라고 적어놔도 그대로 받아들이는 상황.

**수정 방향**:
- `setCellColor`/`setRowColor`/`setColColor`에서 `COLORS` 배열 화이트리스트 또는 `/^#[0-9a-fA-F]{3,8}$/` 정규식 검증
- `tableAlign` → `['left','center','right']` 화이트리스트
- `tableVAlign` → `['top','middle','bottom']` 화이트리스트

### 3.2 `listeners.js:652` — **셀 `e.stopPropagation()`가 Undo 단축키 전부 차단**
```js
cell.addEventListener('keydown',function(e){
  if(!state.editMode)return;
  if(state.isComposing)return;
  e.stopPropagation();     // ← 무조건 호출
  ...
```
**문제**: 셀에 포커스 있을 때 모든 키 이벤트가 상위 리스너로 전파되지 않음. Phase 8에서 구현 예정인 전역 `Ctrl+Z` / `Ctrl+Shift+Z` (Undo/Redo) 또는 전역 `Ctrl+S`, `Ctrl+F` (검색) 등이 **표 안에서 작동하지 않음**. 다른 블록(`.block-content`)에선 `stopPropagation`을 호출하지 않아 일관성도 깨짐.

**비유**: 표에 글자 쓰다가 Ctrl+Z 누르면 "되돌리기"가 안 먹는 상황.

**수정 방향**: `stopPropagation`을 조건부로. 셀 내부에서 처리하는 Tab/Enter/화살표/Ctrl+B/I/U/A만 `stopPropagation`하고 나머지는 통과.

```js
var handled = false;
// ... 각 처리 블록에서 e.preventDefault() 후 handled = true 설정
if (handled) e.stopPropagation();
```

### 3.3 `table.js:80,91,100,113,130,143` — **DOM → state 동기화 이중 호출로 인한 Race**
```js
export function addTblRow(id){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;   // ← DOM에서 먼저 수집
  var cols=b.rows[0]?b.rows[0].length:3;
  ...
  b.rows.push(nr);
  renderBlocks();triggerAutoSave();                    // ← 전체 리렌더
}
```
**문제**: 모든 변경 함수가 `collectTableData()`로 **셀 DOM의 innerHTML을 다시 읽고 덮어쓴 뒤** 변경 → `renderBlocks()`로 **전체 페이지 재렌더**. 그런데 사용자가 IME 조합 중(`isComposing=true`) 패널 버튼을 클릭하면 조합 중인 글자가 확정되지 않은 상태로 수집되어 사라질 수 있음. 또한 자동저장(`blocks.js:208`의 `collectPage`)도 동일 로직을 중복 실행 → 같은 데이터가 짧은 시간에 2번 수집됨.

**비유**: 종이에 글자 쓰고 있는데 누가 "지금까지 쓴 거 깨끗이 베껴올게" 하고 가져가서 다시 주는 일이 1.5초마다 반복. 한글 조합(ㄱ+ㅏ → 가) 도중에 일어나면 "ㄱ"만 베껴갈 수 있음.

**수정 방향**:
- `state.isComposing` 체크 → 조합 중이면 작업 지연 또는 차단
- 셀 입력은 `input` 이벤트에서 해당 셀만 `b.rows[r][c] = sanitizeHTML(e.target.innerHTML)`로 직접 반영하고, `collectTableData`는 명시적 필요시만 호출 (현재 매 패널 조작마다 수집하는 패턴 재검토)

### 3.4 `listeners.js:1117` — **포맷 바 감추기에서 `th/td` 하드코딩**
```js
if(!$('fmtBar').contains(e.target)&&!e.target.closest('.block-content')
   &&!e.target.closest('.block-col-content')
   &&!e.target.closest('th')&&!e.target.closest('td'))hideFmtBar();
```
**문제**: 전역 클릭 리스너가 `th`/`td`를 태그 이름으로 직접 체크. 나중에 다른 블록(차트·캘린더 등)에서 `<table>`을 사용하면 포맷 바가 엉뚱하게 표시되지 않음.

**수정 방향**: `.block-table th`/`.block-table td` 또는 `[data-row][data-col]` 선택자 사용.

---

## 4. Important 이슈 (Phase 8 전 수정 권장)

### 4.1 `table.js:261` — 패널 상태가 모듈 전역 변수 (멀티 패널 불가)
```js
var panelState={blockId:null,row:0,col:0};
```
단일 패널만 가정. Phase 8 "블록 드래그앤드롭"과 충돌 위험 — 표를 드래그하는 동안 패널이 열려 있으면 `blockId`는 옛 위치를 가리킴. 또한 표 2개가 동시에 우클릭되면 마지막 것만 유효.
→ `panel.dataset.blockId` 등 DOM에 저장하거나, 표 블록 자체의 임시 상태로 이동.

### 4.2 `table.js:42~54` — `createTable`이 기존 블록 내용을 덮어씀
```js
export function createTable(idx,numRows,numCols){
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  b.type='table';b.content='';    // ← 기존 text 블록의 content 파괴
  b.rows=[];
  ...
}
```
슬래시 메뉴가 text 블록을 table로 변환하는 전제인데, 사용자가 이미 긴 글을 쓴 블록에서 `/표`를 입력하면 **그 글이 사라짐**. Undo는 가능하지만 경고 없음.
→ 빈 블록에서만 변환 허용 또는 "이 블록 내용이 사라집니다" 확인.

### 4.3 `table.js:97,110` — `insertRowAt(afterRow=-1)` 로직 모호
```js
var insertIdx=Math.max(afterRow+1,0);
```
패널에서 "⬆ 위에 행"을 누르면 `insertRowAt(bid, row-1)`이 호출되는데 (`L353`), 현재 행이 `row=0`(헤더)이면 `afterRow=-1` → `insertIdx=0` → **헤더 위에 행 삽입**. 하지만 코드상 첫 행이 항상 `<th>`인 전제라 엉뚱한 결과(일반 행이 헤더처럼 렌더링됨). Phase 4의 `rowColors` 인덱스도 재조정 없이 의미 깨짐.
→ 헤더 행 위 삽입 차단 또는 새 행이 헤더가 되도록 인덱스 shift.

### 4.4 `table.js:133,134,148,149` — 키 재매핑 코드가 읽기 어려움
삭제 시 `rowColors` · `cellStyles` 인덱스 재조정 로직이 **한 줄에 3중 if-else**로 압축:
```js
if(b.cellStyles){var ns={};for(var k in b.cellStyles){var p=k.split('-');var ri=parseInt(p[0]),ci=parseInt(p[1]);if(ri<row)ns[k]=b.cellStyles[k];else if(ri>row)ns[(ri-1)+'-'+ci]=b.cellStyles[k]}b.cellStyles=ns}
```
같은 패턴이 `deleteRow`/`deleteCol`/`sortTable`에 **4번 중복**. 헬퍼 함수 분리 필요.
→ `remapRowIndex(obj, deletedRow)`, `remapCellIndex(obj, deletedRow/Col)` 유틸.

### 4.5 `table.js:412~418` — 리사이즈 종료 시 `colWidths` 정규화 버그 가능성
```js
cur.colWidths[colIdx]=tbl?Math.round(th.offsetWidth/tbl.offsetWidth*100):Math.floor(100/(...));
normalizeColWidths(cur);
```
단일 열만 업데이트하고 `normalizeColWidths`로 전체 합을 100으로 맞춤. 결과적으로 **나머지 열들의 이전 너비까지 비례 축소**되어 사용자가 보는 값과 달라짐. 리사이즈 후 저장→새로고침하면 너비가 "점점 엉뚱해지는" 누적 오차.
→ 정규화 방식을 "드래그한 열의 증감량을 이웃 열에서만 보상"하는 방식으로 변경.

### 4.6 `table.js:208~213` — 정렬 시 태그 제거 로직이 entity 처리 누락
```js
var va=(a[colIdx]||'').replace(/<[^>]*>/g,'').trim();
var na=parseFloat(va);
```
`"&nbsp;90&nbsp;"` → `"\u00a090\u00a0"` → `parseFloat` 성공 — OK.
그러나 `"<b>9</b><b>0</b>"` 태그가 중간에 섞여 있으면 `"90"` 추출 OK, `"<b>9,000</b>"` → `"9,000"` → `parseFloat` = `9` (,000 무시). 숫자 감지가 천 단위 콤마에서 오동작.
→ `replace(/,/g,'')` 추가 또는 `Intl.NumberFormat` 파서.

### 4.7 `listeners.js:615` — 셀 input 이벤트가 `triggerAutoSave`만 호출
```js
cell.addEventListener('input',triggerAutoSave);
```
셀 변경 시 `b.rows`는 즉시 갱신되지 않음. `triggerAutoSave` → 1.5초 후 `collectPage` → `collectTableData` 경로로만 반영. 그 사이에 패널 조작(예: 행 추가)이 일어나면 `collectTableData`가 호출되어 **최신 입력이 반영되긴 하지만**, 이 구조가 암묵적이라 미래의 수정에서 깨지기 쉬움.
→ 입력 즉시 `findBlock(id).rows[r][c] = ...` 반영 (Phase 5-1에서 시도한 부분 렌더링 철학과 일치).

### 4.8 `toolbar.js:175` — 10×10 고정, 넓은 표 생성 불가
```js
for(var r=0;r<10;r++){for(var c=0;c<10;c++){
```
최초 생성 시 최대 10행 10열. 큰 표는 생성 후 행/열 추가로만 확장 가능 → 사용자 번거로움. Notion은 그리드 가장자리에서 더 끌면 확장됨.

### 4.9 `listeners.js:1094` — `addTblRow` 외에는 모두 우클릭 패널로만 접근 가능
```js
case'addTblRow':addTblRow(blockId);break;
case'deleteTable':deleteTable(blockId);break;
```
하단 `+ 행 추가` 버튼(호버 표시)만 외부 접근. **열 추가가 표 하단에 노출되지 않음** — 사용자가 존재를 모름. 우상단에 `+ 열 추가`가 없음.
→ `.tbl-add-col`(표 오른쪽 세로 버튼) 추가 권장.

### 4.10 `table.js:249~258` — 표 삭제 확인 핸들러를 `state`에 저장
```js
state._deleteTableConfirm=function(){...};
openModal('deleteConfirmModal');
```
글로벌 state에 콜백을 임시 저장. 모달 확인 버튼 쪽 코드에서 `state._deleteTableConfirm?.()`를 호출하는 구조. 이 패턴이 "이미지 삭제", "페이지 삭제" 등과 섞이면 실수로 덮어써질 수 있음.
→ 모달에 `.onConfirm` 속성을 붙이거나 Promise 기반 confirm 유틸.

### 4.11 접근성 (Phase 7 성과의 누락)
현재 표 마크업:
- `<table>`에 `role="table"` 없음 (암묵적 role이지만 `aria-label` 없음)
- 셀이 `contenteditable="true"`만 가짐 → 스크린리더가 "편집 가능" 알림만, "행 2, 열 1" 같은 위치 정보 없음
- 정렬 상태(`sortCol`/`sortDir`)가 `<th>`의 `aria-sort`로 반영되지 않음
- 패널 버튼에 `aria-label` 없음 (`⫷` 이모지만으로는 스크린리더 이해 불가)

### 4.12 `modals.js` — 표 삭제 확인 모달 vs 일반 확인 모달 분기 없음
`deleteConfirmModal`이 공용 모달이라 "이미지 삭제"와 메시지는 분리되나 콜백 저장 위치가 달라 유지보수 시 혼동.

---

## 5. Minor 이슈

### 5.1 `table.js` 전반 — `var` 사용
Phase 2에서 `let/const` 전환했다면 표 모듈만 `var` 잔존. 호이스팅 버그 위험은 없으나 일관성 깨짐.

### 5.2 `listeners.js:624` — `document.getElementById('tablePanel')` vs `$('tablePanel')`
프로젝트 유틸 `$`가 있는데 일부만 사용.

### 5.3 `table.js:272` — 템플릿 문자열 미사용
```js
html+='<div class="tbl-panel-info">셀 ('+(row+1)+', '+(col+1)+') · '+size.rows+'×'+size.cols+'</div>';
```
→ 백틱 템플릿으로 가독성 ↑.

### 5.4 `table.js:302~315` — 색상 스와치 3블록 완전 중복
셀·행·열 배경색 렌더링 3번 반복. 하나의 헬퍼로:
```js
function renderColorSwatches(actionName){...}
```

### 5.5 `listeners.js:716~728` — Backspace/Delete 빈 셀 무시 로직 중복
```js
if(e.key==='Backspace'){if(cell.textContent===''||cell.innerHTML==='<br>'){e.preventDefault();return}}
if(e.key==='Delete'){if(cell.textContent===''||cell.innerHTML==='<br>'){e.preventDefault();return}}
```
→ `if((e.key==='Backspace'||e.key==='Delete')&&isCellEmpty(cell))`.

### 5.6 `renderer.js:216` — 기본값 `[['','',''],['','','']]`이 2×3
`createTable`은 최소 1×1도 허용하나 렌더러 기본값이 2×3이라 데이터 불일치 시 혼란.

### 5.7 `table.js:12~16` — `normalizeColWidths`가 부동소수점 `total===100` 비교
```js
if(total>0&&total!==100){...}
```
반올림 후 `99`나 `101`이 자주 발생 → 매번 재정규화. 허용 오차(`Math.abs(total-100)>1`) 권장.

### 5.8 `table.js:298` — 행 삭제 버튼에 행 번호 표시, 하지만 헤더 행(row=0)도 삭제 가능
```js
if(size.rows>1)html+='<button ... data-tbl-action="deleteRow">행 삭제 (행 '+(row+1)+')</button>';
```
헤더를 삭제하면 다음 행이 자동으로 `<th>`로 렌더링. 의도된 동작인지 불명확.

### 5.9 테이블 패널이 우클릭으로만 열리는 점 — 발견성 낮음
키보드 전용 사용자가 패널을 어떻게 여는지 단서 없음.
→ 셀 포커스 시 `Alt+Enter` 같은 단축키 또는 표 우상단 `⚙` 아이콘 제안.

### 5.10 `table-sort.test.js` — 테스트 7개는 `sortTable`만 커버
`insertRowAt`, `deleteRow`, `setCellColor`, `normalizeColWidths`, `collectTableData` 등 테스트 없음. 특히 **"빈 셀 정렬"**, **"정렬 후 Undo"**, **"헤더 삭제 후 렌더링"** 등 엣지 케이스 누락.

### 5.11 `index.html:160` — 패널 닫기 버튼이 `onclick` 인라인
```html
<button class="btn btn-i btn-g" onclick="closeTablePanel()">✕</button>
```
Phase 5-2 이벤트 위임 원칙 위반 + CodeReview_2026-04-19에서 지적된 XSS/전역 노출 문제와 연결.

### 5.12 `main.css:182` — `:focus` 스타일이 `outline:none`
```css
.block-table th:focus,.block-table td:focus{box-shadow:inset 0 0 0 2px var(--acc);outline:none}
```
`box-shadow`로 대체되어 있으나 고대비 모드에서 보이지 않을 수 있음. Phase 7 a11y 체크 누락.

### 5.13 `main.css:179` — `position:sticky` 헤더
```css
.block-table th{...position:sticky;top:0;z-index:1;...}
```
페이지 스크롤 시 헤더 고정 — 좋은 UX. 그러나 `z-index:1`이라 다른 블록의 fmtBar · 패널과 겹칠 수 있음.

---

## 6. 조작 방식(UX) 상세 평가

### 6.1 장점
| 조작 | 평가 | 코멘트 |
|------|------|--------|
| Tab으로 셀 이동 + 마지막에서 자동 행 추가 | ⭐⭐⭐⭐⭐ | 엑셀 사용자 친화 |
| Enter로 아래 셀 이동 | ⭐⭐⭐⭐⭐ | Notion과 일치 |
| Shift+Enter 셀 내 줄바꿈 | ⭐⭐⭐⭐ | 표준적 |
| 화살표로 셀 이동 (`isAtStart`/`isAtEnd` 판정) | ⭐⭐⭐⭐ | 커서 위치 고려해 자연스러움 |
| 열 리사이즈 드래그 | ⭐⭐⭐ | 시각 피드백은 있으나 이웃 열 보상 없음 |
| 우클릭 패널 | ⭐⭐⭐⭐ | 기능 밀도 높음, 한 화면에 모두 노출 |
| 정렬 숫자 자동 감지 | ⭐⭐⭐⭐ | `parseFloat` 단순하나 실용적 |

### 6.2 개선 여지
| 조작 | 현재 | 제안 |
|------|------|------|
| **열 추가** | 패널에서만 | 표 오른쪽에 `+ 열 추가` 버튼 |
| **행 삽입 "위에"** | 패널 버튼 | 셀 좌측 호버 시 `+` 아이콘 |
| **다중 셀 선택** | ✗ 없음 | 드래그로 셀 범위 선택 → 일괄 색상/삭제 |
| **복사 붙여넣기** | 셀 내부만 | 셀 범위 복사 (탭 구분 텍스트) |
| **셀 병합** | ✗ | 스펙상 누락 — Phase 8 이후 검토 |
| **헤더 고정 on/off** | 항상 on | 설정 토글 |
| **열 너비 초기화** | ✗ | 패널에 "균등 분배" 버튼 |
| **행/열 드래그로 순서 변경** | ✗ | Phase 8 블록 D&D와 병행 검토 |

### 6.3 발견성 문제
- **패널 진입 경로**: 우클릭(데스크톱 한정) + 셀 클릭(패널 이미 열린 경우만). 모바일/터치 환경에서 길게 눌러 우클릭 대체가 되는지 테스트 필요.
- **하단 "+ 행 추가"가 호버 시에만 표시** (`opacity:0 → 1`) → 마우스 없는 환경에서 비가시.

---

## 7. 테스트 커버리지 분석

### 커버됨
- `sortTable` 텍스트/숫자 정렬 (오름·내림)
- 정렬 후 `rowColors` / `cellStyles` 키 재매핑
- 헤더 고정 확인

### 누락된 영역 (Phase 8 전 보강 권장)
1. `createTable` — 초기 rows 크기, type 변경 부작용
2. `insertRowAt(-1)` — 헤더 위 삽입 엣지 케이스
3. `deleteRow(0)` — 헤더 삭제 시 동작
4. `addTblRow` → IME 조합 중 호출 시 데이터 손실 여부
5. `normalizeColWidths` — 경계값(합=99/101, 빈 배열, 음수)
6. `collectTableData` — `col-resizer` 제거 확인 (간접 테스트만 존재)
7. `setCellColor`/`setRowColor`/`setColColor` — 색상 우선순위 (셀>행>열>헤더)
8. XSS 입력 (`<script>`, `style="..."`에 위험 값)
9. Undo 후 표 상태 복원 (`pushUndoImmediate` 통합 테스트)

---

## 8. Phase 8 착수 전 권장 우선순위

### Phase 8 작업과 직결되는 항목
Phase 8의 4개 태스크 중 **Undo/Redo**와 **테이블 정렬/필터**가 표 기능과 직결됩니다.

**반드시 선행:**
1. **[3.2] 셀 `stopPropagation()` 조건부 수정** — Undo/Redo 전역 단축키가 표 안에서도 작동해야 Phase 8-1이 성립
2. **[3.1] style 속성 XSS 화이트리스트** — 보안 필수
3. **[4.5] `colWidths` 리사이즈 보상 로직** — Undo 시 너비가 이상해지는 문제 예방

**Phase 8 중 병행 가능:**
4. **[4.11] 접근성 보강** — `aria-sort`, `aria-label`, 셀 위치 안내
5. **[4.7] 셀 input → 즉시 state 반영** — Phase 5-1 부분 렌더링 철학과 일치
6. **[4.9] `+ 열 추가` 버튼 노출** — Phase 8-2 블록 D&D와 묶어 UX 개선

**Phase 8.5(새 Phase)로 분리 제안:**
- **다중 셀 선택** + **범위 복사/붙여넣기** + **셀 병합** — 표 고급 기능 독립 페이즈
- 기존 **Minor 이슈 전반 리팩토링** (중복 제거, `var` → `let/const`, 템플릿 문자열)

---

## 9. 종합 결론

### 현재 상태
- **기능 완성도**: 80% (기본 CRUD, 정렬, 색상, 맞춤, 리사이즈 모두 존재)
- **코드 품질**: 70% (모듈 분리·이벤트 위임은 모범적, 그러나 DOM↔state 동기화 이중 호출·중복 로직 산재)
- **UX**: 75% (엑셀 단축키 충실, 패널 발견성·열 추가 노출·다중 선택 부재로 감점)
- **보안**: 60% (HTML은 DOMPurify로 방어, 그러나 style 속성·색상 입력은 무방비)
- **접근성**: 40% (Phase 7에서 표만 누락된 것으로 보임 — `aria-sort`, `aria-label` 필요)
- **테스트**: 25% (정렬만 커버, 나머지 기능 무시)

### 비유로 정리
지금의 표 기능은 **"잘 만든 스위스 군용 나이프"**인데, 칼날(핵심 편집)은 잘 들고 가위(정렬)도 쓸만하지만, **손잡이 한쪽이 살짝 덜 조여져 있고(stopPropagation 문제)** 칼 재질에 **녹슬 가능성(XSS 가능성)** 이 있으며, **왼손잡이용 가이드(접근성)** 가 없는 상태입니다.

### Phase 8 착수 가능 여부
**가능.** 단, 위 "반드시 선행" 3건([3.1], [3.2], [4.5])은 Phase 8-1(Undo/Redo) 구현 시작 **전** 또는 첫 커밋에 포함시키는 것이 안전합니다. Phase 8-4(테이블 정렬/필터)는 현재 `sortTable`이 이미 존재하므로 **"필터 추가 + 정렬 UI 개선"** 성격으로 재정의하고, 그 과정에서 [4.6] 숫자 파싱 개선과 [4.11] 접근성 보강을 함께 처리할 것을 권장합니다.
