# AcidDocument 편집기 요구사항 분석서

> **목적**: 편집기의 모든 동작 경로를 전수조사하여, 현재 결함과 미구현 기능을 정확히 식별한다.
> **기준 코드**: `listeners.js`, `blocks.js`, `renderer.js`, `history.js`, `media.js`, `toolbar.js`, `table.js`, `sidebar.js`
> **작성일**: 2026-02-14

---

## 목차

1. [아키텍처 개요](#1-아키텍처-개요)
2. [핵심 결함: DOM ↔ State 동기화](#2-핵심-결함-dom--state-동기화)
3. [renderBlocks() 호출 경로 전수조사](#3-renderblocks-호출-경로-전수조사)
4. [클로저 스테일 참조 문제](#4-클로저-스테일-참조-문제)
5. [커서 위치 감지 결함 (atStart/atEnd)](#5-커서-위치-감지-결함-atstartend)
6. [Enter 키 요구사항](#6-enter-키-요구사항)
7. [Backspace 키 요구사항](#7-backspace-키-요구사항)
8. [Delete 키 요구사항](#8-delete-키-요구사항)
9. [Tab 키 요구사항](#9-tab-키-요구사항)
10. [텍스트 입력 / AutoSave 요구사항](#10-텍스트-입력--autosave-요구사항)
11. [포커스 관리 요구사항](#11-포커스-관리-요구사항)
12. [블록 일괄선택 요구사항](#12-블록-일괄선택-요구사항)
13. [클립보드 (붙여넣기/드래그) 요구사항](#13-클립보드-붙여넣기드래그-요구사항)
14. [미디어/콘텐츠 블록 삽입 요구사항](#14-미디어콘텐츠-블록-삽입-요구사항)
15. [버전 관리 요구사항](#15-버전-관리-요구사항)
16. [키보드 동작 우선순위](#16-키보드-동작-우선순위)
17. [결함 요약 및 우선순위](#17-결함-요약-및-우선순위)

---

## 1. 아키텍처 개요

### 1.1 데이터 모델

```
state.page.blocks = [
  { id: string, type: string, content: string, ...typeSpecificProps }
]
```

- **TEXT_TYPES**: `text`, `h1`, `h2`, `h3`, `bullet`, `number`, `quote`, `todo`
- **CONTENT_TYPES**: `table`, `image`, `video`, `pdf`, `file`, `slide`, `calendar`, `columns`, `toc`, `divider`
- 추가 타입: `toggle`, `callout`, `code`, `bookmark`, `chart-bar`, `chart-pie`, `chart-line`

### 1.2 핵심 모듈 의존 관계

```
listeners.js (이벤트) → blocks.js (CRUD) → renderer.js (렌더링)
     ↓                       ↓                    ↓
history.js (Undo)      store.js (상태)      setupBlockEvents() ← listeners.js
```

### 1.3 편집 모드 생명주기

```
보기 모드 → toggleEdit() → 편집 모드
  ├─ saveAndExit() → saveDoc() + exitEditMode() → 보기 모드
  └─ cancelEdit() → editBackup 복원 → 보기 모드
```

### 1.4 데이터 흐름 (편집 중)

```
사용자 타이핑 → DOM 변경 (contenteditable)
                  ↓
              input 이벤트 → triggerAutoSave()
                              ├─ undoTimer (500ms) → pushUndo() → collectBlocks() → state 스냅샷
                              └─ autoSaveTimer (1500ms) → saveCurrent() → collectBlocks() → DB 저장
```

**핵심 원칙**: DOM이 source of truth. state.page.blocks는 collectBlocks()를 통해서만 동기화됨.

---

## 2. 핵심 결함: DOM ↔ State 동기화

### 2.1 근본 원인

`renderBlocks()`는 `state.page.blocks` 배열을 읽어 DOM을 **전체 재생성**한다. 사용자가 타이핑한 내용은 DOM에만 존재하고, `triggerAutoSave()`의 디바운스 타이머(500ms/1500ms)가 만료되기 전에는 state에 반영되지 않는다.

**따라서**: `renderBlocks()` 호출 전에 반드시 `syncBlocksFromDOM()`(또는 `pushUndoImmediate()`)을 호출해야 한다. 그렇지 않으면 **디바운스 대기 중인 DOM 변경 내용이 전부 유실**된다.

### 2.2 syncBlocksFromDOM / pushUndoImmediate 메커니즘

```
pushUndoImmediate()
  → clearTimeout(undoTimer)
  → syncBlocksFromDOM()
       → collectBlocks()  // DOM → 새 배열 생성
       → state.page.blocks = 새 배열  // ⚠️ 배열 자체가 교체됨
  → pushUndo()  // 스냅샷 저장
```

**중요**: `syncBlocksFromDOM()` 후 `state.page.blocks`는 **새 배열의 새 객체들**이다. 이전 배열/객체를 가리키는 변수는 모두 **스테일(stale)** 상태가 된다.

### 2.3 수정 완료된 결함 (2건)

| 위치 | 결함 | 수정 내용 |
|------|------|-----------|
| `listeners.js:112` | Backspace 타입변환 시 `pushUndoImmediate()` 누락 → h1→text 변환 시 다른 블록 데이터 유실 | `pushUndoImmediate()` 추가 후 `state.page.blocks[idx]`로 접근 |
| `listeners.js:151` | Delete 병합 시 `pushUndoImmediate()` 누락 → 병합 시 다른 블록 데이터 유실 + 스테일 참조 사용 | `pushUndoImmediate()` 추가 후 sync된 state에서 재참조 |

### 2.4 미수정 결함 (20건+) — renderBlocks() 동기화 누락

아래 모든 경로에서 `renderBlocks()`가 **`pushUndoImmediate()` 없이** 호출되어, 편집 중인 텍스트 블록의 내용이 유실될 수 있다.

#### 2.4.1 이미지 붙여넣기 (listeners.js)

| 라인 | 경로 | 심각도 |
|------|------|--------|
| 242 | 이미지 붙여넣기 (Storage 업로드 후 콜백) | **높음** |
| 254 | 이미지 붙여넣기 (DataURL 변환 후 콜백) | **높음** |

**재현 시나리오**: 블록 A에 텍스트 입력 중 → 이미지 붙여넣기 → `state.page.blocks`에 이미지 블록 삽입 → `renderBlocks()` → 블록 A의 미저장 텍스트 유실

#### 2.4.2 파일 드롭 (listeners.js)

| 라인 | 경로 | 심각도 |
|------|------|--------|
| 724 | 일반 파일 드롭 (`reader.onload` 콜백) | **높음** |

#### 2.4.3 미디어 블록 삽입 (media.js — insertMediaBlock 경유)

| 라인 | 함수 | 심각도 |
|------|------|--------|
| 43 | `addImageBlock()` | **높음** |
| 202 | `insertSlide()` | **높음** |
| 236 | `addSlideImageSrc()` | 중간 |
| 246 | `removeSlideImage()` | 중간 |
| 286 | `addVideoBlock()` | **높음** |
| 301 | `addPdfBlock()` | **높음** |
| 321 | `submitBookmark()` | **높음** |
| 330 | `submitFile()` | **높음** |

#### 2.4.4 미디어 속성 변경 (media.js)

| 라인 | 함수 | 심각도 |
|------|------|--------|
| 102 | `setImageScale()` | 중간 |
| 183 | `slideNav()` | 낮음 (표시 상태만) |
| 187 | `slideTo()` | 낮음 |
| 192 | `setSlideAuto()` | 낮음 |
| 337 | `setCalloutIcon()` | 중간 |
| 339 | `submitCodeLang()` | 중간 |

#### 2.4.5 슬래시 메뉴 실행 (toolbar.js)

| 라인 | 함수 | 심각도 |
|------|------|--------|
| 90 | `execSlash()` — 블록 타입 변환 | **높음** |
| 119 | `insertEmoji()` | **높음** |
| 147 | `insertMention()` | **높음** |

**재현 시나리오**: 블록 A에 텍스트 입력 → 블록 B에서 슬래시 메뉴로 타입 변환 → `renderBlocks()` → 블록 A의 미저장 텍스트 유실

#### 2.4.6 캘린더/차트 (calendar.js, chart.js)

| 파일:라인 | 함수 | 심각도 |
|-----------|------|--------|
| calendar.js:116 | 캘린더 이벤트 추가 | 중간 |
| calendar.js:182 | 캘린더 이벤트 수정 | 중간 |
| calendar.js:190 | 캘린더 이벤트 삭제 | 중간 |
| chart.js:110 | `updateChartData()` | 중간 |
| chart.js:111 | `addChartData()` | 중간 |
| chart.js:112 | `removeChartData()` | 중간 |

#### 2.4.7 페이지 링크 (pagelink.js)

| 파일:라인 | 함수 | 심각도 |
|-----------|------|--------|
| pagelink.js:42 | 페이지 링크 삽입 | **높음** |

### 2.5 동기화 결함 수정 원칙

모든 `renderBlocks()` 호출 전에 다음 가드를 적용해야 한다:

```javascript
// 편집 모드일 때만 동기화 필요
if (state.editMode) {
  pushUndoImmediate();  // syncBlocksFromDOM() + undo 스냅샷
}
```

**예외**: 다음 경우는 동기화 불필요
- `state.editMode === false` (보기 모드)
- `state.page.blocks`를 직접 교체하는 경우 (버전 복원, 편집 취소)
- 편집 모드 진입 직후 (`toggleEdit()` — 백업 직후)

---

## 3. renderBlocks() 호출 경로 전수조사

### 3.1 동기화 완료 경로 (✅)

| 파일:라인 | 함수 | 동기화 방법 |
|-----------|------|-------------|
| listeners.js:27 | `reorderBlock()` | `pushUndoImmediate()` (24행) |
| listeners.js:114 | Backspace 타입변환 | `pushUndoImmediate()` (112행) |
| listeners.js:151-159 | Delete 병합 | `pushUndoImmediate()` (151행) |
| listeners.js:197 | 슬래시 메뉴 (빈 블록) | `pushUndoImmediate()` (195행) |
| listeners.js:280 | 여러 줄 붙여넣기 | `pushUndoImmediate()` (268행) |
| blocks.js:90 | `deleteBlock()` | `pushUndoImmediate()` (86행) |
| blocks.js:118 | `moveBlockUp()` | `pushUndoImmediate()` (114행) |
| blocks.js:127 | `moveBlockDown()` | `pushUndoImmediate()` (123행) |
| blocks.js:138 | `changeBlockType()` | `pushUndoImmediate()` (131행) |
| history.js:40 | `undo()` | `syncBlocksFromDOM()` (36행) |
| history.js:52 | `redo()` | `syncBlocksFromDOM()` (47행) |
| table.js 전체 | 표 조작 함수들 | `pushUndoImmediate()` 또는 `collectTableData()` |

### 3.2 동기화 불필요 경로 (N/A)

| 파일:라인 | 함수 | 이유 |
|-----------|------|------|
| sidebar.js:156 | `loadPage()` | 새 페이지 로드, editMode=false |
| sidebar.js:171 | `loadPageWithoutPush()` | 동일 |
| sidebar.js:200 | `toggleEdit()` | 편집 진입, 백업 직후 |
| sidebar.js:213 | `cancelEdit()` | 백업에서 복원 |
| sidebar.js:233 | `exitEditMode()` | 편집 종료 |
| versions.js:11 | `restoreVer()` | 버전 데이터로 교체 |

### 3.3 동기화 누락 경로 (❌) — 2.4절 참조

총 **20개 이상** 경로. 모든 항목은 2.4절에 상세 기술.

---

## 4. 클로저 스테일 참조 문제

### 4.1 문제 설명

`setupBlockEvents(div, b, idx)` 함수는 블록 DOM 요소에 이벤트 핸들러를 바인딩한다. 이때 `b`(블록 객체)와 `idx`(인덱스)는 클로저로 캡처된다.

```javascript
// renderer.js:232
setupBlockEvents(div, b, idx);  // b와 idx가 클로저로 캡처됨

// listeners.js:309
el.addEventListener('keydown', function(e) { handleKey(e, b, idx, el) });
```

### 4.2 스테일 발생 조건

| 함수 | 부분 업데이트 | 스테일 영향 |
|------|-------------|------------|
| `insertBlockEl()` | 새 블록만 DOM에 삽입, `data-idx` 속성만 갱신 | 삽입 위치 이후 모든 블록의 클로저 `idx`가 1 부족 |
| `removeBlockEl()` | 삭제 블록만 DOM에서 제거, `data-idx` 속성만 갱신 | 삭제 위치 이후 모든 블록의 클로저 `idx`가 1 초과 |

### 4.3 영향 분석

`insertBlock()` 호출 후 (Enter 키 등):
- 삽입 위치 **이전** 블록: 클로저 `idx` 정확 ✅
- **새로 생성된** 블록: 클로저 `idx` 정확 ✅ (`createBlockEl`에서 새로 바인딩)
- 삽입 위치 **이후** 블록: 클로저 `idx` = 실제 인덱스 - 1 ❌

**잘못된 `idx`로 인한 결과**:
- `state.page.blocks[idx].content = el.innerHTML` → **잘못된 블록에 content 덮어쓰기**
- `insertBlock(idx+1, newB)` → **잘못된 위치에 블록 삽입**
- `deleteBlock(idx)` → **잘못된 블록 삭제**

### 4.4 완화 요인

- 대부분의 구조 변경 후 `renderBlocks()`가 호출되어 전체 재생성
- `pushUndoImmediate()` → `syncBlocksFromDOM()` → `collectBlocks()`가 DOM에서 content를 읽으므로, 잘못된 state 쓰기가 덮어써짐
- 사용자가 삽입 직후 다른 블록에서 구조 변경을 하는 경우에만 발생

### 4.5 `b` 객체 스테일

`syncBlocksFromDOM()` 후 `state.page.blocks`는 새 배열로 교체된다. 클로저의 `b`는 이전 배열의 이전 객체를 가리킨다.

**영향받는 핸들러**:
- `todo` 체크박스: `b.checked = cb.checked` → 스테일 객체에 쓰기 (BUT `collectBlocks()`가 DOM에서 재수집하므로 실질적 영향 없음)
- `toggle` 화살표: `findBlock(b.id)`로 현재 state에서 재검색하여 우회 ✅
- `columns` input: `findBlock(blockId)`로 현재 state에서 재검색하여 우회 ✅

---

## 5. 커서 위치 감지 결함 (atStart/atEnd)

### 5.1 현재 구현

```javascript
// listeners.js:106
var atStart = sel.anchorOffset === 0 && sel.isCollapsed;
// listeners.js:146
var atEnd = sel.anchorOffset === el.textContent.length && sel.isCollapsed;
```

### 5.2 결함: 리치 텍스트에서 오동작

`sel.anchorOffset`은 **anchor 노드 내부의 오프셋**이다. 리치 텍스트(bold, italic, color 등)에서 anchor 노드는 `<b>`, `<span>` 등의 내부 텍스트 노드가 될 수 있다.

**예시**: `<b>Hello</b> World` (총 textContent 길이 = 11)

| 커서 위치 | anchor 노드 | anchorOffset | el.textContent.length | 감지 결과 |
|-----------|------------|-------------|----------------------|-----------|
| "Hello" 앞 | `<b>` 내 텍스트노드 | 0 | 11 | `atStart = true` ✅ |
| " World" 끝 | `<b>` 뒤 텍스트노드 | 6 | 11 | `atEnd = false` ❌ **오류** |
| `<b>` 뒤 텍스트노드 시작 | `<b>` 뒤 텍스트노드 | 0 | 11 | `atStart = true` ❌ **오류** |

### 5.3 영향

- **atEnd 오탐**: Delete 키로 다음 블록과 병합이 안 됨 (커서가 블록 끝인데 감지 실패)
- **atStart 오탐**: Backspace로 이전 블록 이동이 블록 중간에서 발생 (커서가 `<b>` 태그 경계에 있을 때)
- **ArrowUp/Down**: 잘못된 블록 이동 트리거

### 5.4 수정 방안

```javascript
// Range 기반 정확한 위치 판별
function isAtStart(el) {
  var sel = window.getSelection();
  if (!sel.isCollapsed || !sel.rangeCount) return false;
  var range = sel.getRangeAt(0);
  var testRange = document.createRange();
  testRange.selectNodeContents(el);
  testRange.setEnd(range.startContainer, range.startOffset);
  return testRange.toString().length === 0;
}

function isAtEnd(el) {
  var sel = window.getSelection();
  if (!sel.isCollapsed || !sel.rangeCount) return false;
  var range = sel.getRangeAt(0);
  var testRange = document.createRange();
  testRange.setStart(range.endContainer, range.endOffset);
  testRange.selectNodeContents(el);
  testRange.setEnd(el, el.childNodes.length);
  return testRange.toString().length === 0;
}
```

---

## 6. Enter 키 요구사항

### 6.1 전제 조건

- `state.isComposing === true` → 무시 (IME 가드)
- 슬래시 메뉴 열림 → 선택 항목 실행 (`execSlash`)
- `state.editMode === true` + `contenteditable === true`

### 6.2 분기 흐름

```
Enter (Shift 없음) 입력
  ├─ @태그 패턴 감지? (/@([^@<>\s]+)$/)
  │    └─ 인라인 태그 <span> 변환, 커서를 끝으로
  └─ 블록 분할
       ├─ 선택 영역 있음? → deleteContents() 후 진행
       ├─ 커서 뒤 콘텐츠 extractContents() → afterHTML
       ├─ 현재 블록 content = el.innerHTML (커서 앞)
       ├─ 새 블록 타입 결정
       │    ├─ bullet/number/todo + 비어있지 않음 → 같은 타입
       │    └─ 그 외 → text
       └─ insertBlock(idx+1, newB)
            → pushUndoImmediate() → splice → insertBlockEl → focusBlock
```

### 6.3 상세 규칙

| # | 조건 | 동작 | 포커스 |
|---|------|------|--------|
| E1 | `@태그` 패턴 | `<span class="inline-tag">` 생성 | 태그 뒤 끝 |
| E2 | 선택 영역 있음 | `deleteContents()` 후 분할 | 새 블록 시작 |
| E3 | 빈 bullet/number/todo | 새 블록 `type=text` | 새 블록 시작 |
| E4 | 내용 있는 bullet | 새 블록도 `bullet` | 새 블록 시작 |
| E5 | 내용 있는 number | 새 블록 `number`, `num=현재+1` | 새 블록 시작 |
| E6 | 내용 있는 todo | 새 블록 `todo`, `checked=false` | 새 블록 시작 |
| E7 | 커서 맨 앞 | 현재='', 새=기존 전부 | 새 블록 시작 |
| E8 | 커서 맨 끝 | 현재=기존, 새='' | 새 블록 시작 |
| E9 | 커서 중간 | Range 기반 분할 | 새 블록 시작 |

### 6.4 Enter 결함

| # | 결함 | 심각도 | 상태 |
|---|------|--------|------|
| E-D1 | 85행 `state.page.blocks[idx].content=el.innerHTML`은 redundant. `insertBlock`의 `pushUndoImmediate()`가 state를 교체하므로 이 쓰기는 버려짐. 해를 끼치진 않으나 혼란 유발 | 낮음 | 미수정 |
| E-D2 | `b.type` 판별(87행)이 클로저 `b` 사용. sync 전이므로 현재는 정상이나, `pushUndoImmediate()` 호출 순서 변경 시 스테일 참조 가능 | 낮음 | 주의 |
| E-D3 | 빈 리스트 블록에서 Enter 시 새 블록은 `text`가 되지만, 빈 블록 자체는 그대로 남음. Notion처럼 빈 블록을 `text`로 변환하는 것이 더 직관적 | 낮음 | 설계 |

### 6.5 특수 영역 Enter

| 영역 | 동작 | 구현 위치 |
|------|------|-----------|
| 토글 body | `insertLineBreak` (줄바꿈만) | listeners.js:377 |
| 컬럼 content | `insertLineBreak` (줄바꿈만) | listeners.js:454 |
| 제목 (`pageTitle`) | 첫 블록 포커스 (없으면 생성) | listeners.js:480 |
| 테이블 셀 | keydown 미등록 → 브라우저 기본 | - |

### 6.6 Shift+Enter

브라우저 기본 동작 허용 → `<br>` 삽입 (줄바꿈)

---

## 7. Backspace 키 요구사항

### 7.1 분기 흐름

```
Backspace 입력
  ├─ 슬래시 메뉴 열림? → '/' 삭제 여부 체크, 메뉴 닫기
  ├─ 블록 비어있음? (textContent === '' || innerHTML === '<br>')
  │    ├─ 서식 블록? (bullet/number/todo/h1~h3/quote)
  │    │    └─ pushUndoImmediate() → type='text' → renderBlocks() → focusBlock(idx)
  │    └─ text 블록?
  │         ├─ 유일한 블록? → 아무 동작 없음
  │         └─ 블록 2개 이상? → deleteBlock(idx) → 이전 TEXT_TYPES 블록 끝 포커스
  ├─ 커서 맨 앞 (atStart) + 이전 블록 존재?
  │    └─ CONTENT_TYPES 스킵 → 이전 TEXT_TYPES 블록 끝으로 포커스 (병합 없음)
  └─ 그 외 → 브라우저 기본 (문자 삭제)
```

### 7.2 상세 규칙

| # | 조건 | 동작 | 포커스 |
|---|------|------|--------|
| B1 | 빈 서식 블록 | `pushUndoImmediate()`, `type='text'`, `renderBlocks()` | idx |
| B2 | 빈 text 블록, 2개 이상 | `deleteBlock(idx)` | 이전 TEXT_TYPES 끝 |
| B3 | 빈 text 블록, 유일 | 아무 동작 없음 | 현재 |
| B4 | 커서 맨 앞, 이전=TEXT_TYPES | 포커스만 이동 | 이전 블록 끝 |
| B5 | 커서 맨 앞, 이전=CONTENT_TYPES | CONTENT_TYPES 스킵 | 더 이전 블록 끝 |
| B6 | 커서 맨 앞, 모든 이전=CONTENT_TYPES | fallback `Math.max(0, idx-1)` | 직전 블록 |
| B7 | 커서 중간/끝 | 브라우저 기본 | 현재 |

### 7.3 CONTENT_TYPES 스킵 로직

```
prevIdx = idx - 1
while (prevIdx >= 0 && CONTENT_TYPES.includes(blocks[prevIdx].type)):
    prevIdx--
if (prevIdx < 0):
    prevIdx = Math.max(0, idx - 1)
```

### 7.4 Backspace 결함

| # | 결함 | 심각도 | 상태 |
|---|------|--------|------|
| B-D1 | 비어있지 않은 블록에서 Backspace → **이전 블록과 병합 없음**. 포커스만 이동. Notion/Google Docs는 현재 블록 내용을 이전 블록에 append | 중간 | 미구현 |
| B-D2 | `atStart` 감지가 `sel.anchorOffset === 0` 기반 → 리치 텍스트에서 오탐 (5절 참조) | **높음** | 미수정 |
| B-D3 | B2에서 `deleteBlock(idx)` 후 커서를 이전 TEXT_TYPES 끝으로 이동하는데, `deleteBlock` 내부에서 이미 `focusBlock(newIdx, -1)` 호출 → `setTimeout` 기반 포커스 경합 가능 | 중간 | 미수정 |

---

## 8. Delete 키 요구사항

### 8.1 분기 흐름

```
Delete 입력
  ├─ 커서 맨 끝 (atEnd) + 다음 블록 존재?
  │    ├─ 다음 블록 = text/h1~h3/bullet/number/quote?
  │    │    └─ pushUndoImmediate() → sync 후 state 재참조
  │    │         → 현재 trailing <br> 제거
  │    │         → 현재 content += 다음 content
  │    │         → 다음 블록 splice 삭제
  │    │         → renderBlocks() → focusBlock(idx, curTextLen)
  │    └─ 다음 블록 = todo 또는 CONTENT_TYPES?
  │         └─ 아무 동작 없음
  └─ 그 외 → 브라우저 기본 (문자 삭제)
```

### 8.2 상세 규칙

| # | 조건 | 동작 | 포커스 |
|---|------|------|--------|
| D1 | 커서 끝 + 다음=병합 가능 | 현재 블록에 합침, 다음 삭제 | 합침 지점 |
| D2 | 커서 끝 + 다음=todo | 아무 동작 없음 | 현재 |
| D3 | 커서 끝 + 다음=CONTENT_TYPES | 아무 동작 없음 | 현재 |
| D4 | 마지막 블록 | 아무 동작 없음 | 현재 |
| D5 | 커서 중간/앞 | 브라우저 기본 | 현재 |

### 8.3 병합 시 HTML 처리

```javascript
pushUndoImmediate();
var curBlock = state.page.blocks[idx];        // sync 후 재참조
var nextBlock = state.page.blocks[idx + 1];   // sync 후 재참조
var curContent = (curBlock.content || '').replace(/<br\s*\/?>$/i, '');
var curTextLen = curContent.replace(/<[^>]*>/g, '').length;
curBlock.content = curContent + (nextBlock.content || '');
state.page.blocks.splice(idx + 1, 1);
```

### 8.4 Delete 결함

| # | 결함 | 심각도 | 상태 |
|---|------|--------|------|
| D-D1 | `atEnd` 감지가 `sel.anchorOffset === el.textContent.length` 기반 → 리치 텍스트에서 오동작 (5절 참조) | **높음** | 미수정 |
| D-D2 | `todo` 블록이 병합 대상에서 제외됨. 의도적이나 UX상 todo 내용만 텍스트로 병합하는 것이 자연스러울 수 있음 | 낮음 | 설계 |
| D-D3 | `curTextLen`은 HTML 태그 제거 후 순수 텍스트 길이. `focusBlock(idx, curTextLen)`에서 이 값이 DOM의 텍스트 노드 오프셋과 일치하지 않을 수 있음 (여러 텍스트 노드 존재 시) | 중간 | 미수정 |

---

## 9. Tab 키 요구사항

### 9.1 현재 동작

| 키 | 동작 | 구현 |
|----|------|------|
| Tab | 4칸 스페이스 삽입 | `document.execCommand('insertText', false, '    ')` |
| Shift+Tab | **미구현** | 브라우저 기본 (포커스 이동) |

### 9.2 미구현 기능

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| Shift+Tab 들여쓰기 해제 | 행 시작의 4칸 스페이스 제거 | 중간 |
| 리스트 indent/outdent | bullet/number 블록의 계층 구조 | 낮음 |
| 테이블 셀 이동 | Tab=다음 셀, Shift+Tab=이전 셀 | 중간 |

---

## 10. 텍스트 입력 / AutoSave 요구사항

### 10.1 input 이벤트 흐름

```
사용자 타이핑
  ├─ compositionstart → state.isComposing = true
  ├─ (한글 조합 중 input)
  │    ├─ triggerAutoSave() ✅
  │    └─ isComposing → 슬래시 필터링 스킵
  ├─ compositionend → state.isComposing = false
  └─ input (일반 문자)
       ├─ triggerAutoSave() ✅
       └─ 슬래시 메뉴 열림?
            ├─ '/'로 시작 → filterSlash()
            └─ 아님 → hideSlash()
```

### 10.2 triggerAutoSave 동작

```javascript
function triggerAutoSave() {
  if (!state.editMode) return;
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(saveCurrent, 1500);   // DB 저장
  clearTimeout(state.undoTimer);
  state.undoTimer = setTimeout(function() { pushUndo() }, 500);  // Undo 스냅샷
}
```

- 연속 입력 시 타이머가 리셋 → **마지막 입력 후 500ms** 뒤 undo 스냅샷, **1500ms** 뒤 DB 저장
- `pushUndo()`는 `syncBlocksFromDOM()` 없이 직접 `JSON.parse(JSON.stringify(state.page.blocks))`를 스냅샷
  - ⚠️ 이 시점에 state.page.blocks의 content는 마지막 sync 시점의 값
  - BUT 500ms 전 input이 없으면 정상 (autoSave의 1500ms가 먼저 collectBlocks 호출)

### 10.3 특수 영역 input

| 영역 | 핸들러 | state 업데이트 |
|------|--------|---------------|
| `.block-content` | triggerAutoSave + 슬래시 필터 | collectBlocks()에서 일괄 수집 |
| 토글 body | `blk.innerContent = innerHTML`, triggerAutoSave | 직접 state 업데이트 + collectBlocks |
| 컬럼 | `blk.columns[idx] = innerHTML`, triggerAutoSave | 직접 state 업데이트 + collectBlocks |
| 테이블 셀 | triggerAutoSave | collectBlocks()에서 수집 |
| 이미지 캡션 | triggerAutoSave | collectBlocks()에서 수집 |
| 제목 | titleComposing 가드 + triggerAutoSave | saveCurrent()에서 읽음 |

### 10.4 입력 관련 결함

| # | 결함 | 심각도 | 상태 |
|---|------|--------|------|
| I-D1 | `pushUndo()`(500ms 타이머)는 `syncBlocksFromDOM()` 없이 state를 스냅샷 → undo 시 최신 DOM 내용이 아닌 이전 sync 시점의 내용이 복원될 수 있음 | 중간 | 미수정 |
| I-D2 | 토글 body와 컬럼의 input 핸들러가 `findBlock(b.id)`로 state를 직접 업데이트하지만, `b.id`의 `b`는 클로저 캡처된 객체 → sync 후 스테일 (다만 `findBlock`이 현재 state를 검색하므로 실질적 영향 없음) | 낮음 | 정상 |

---

## 11. 포커스 관리 요구사항

### 11.1 focusBlock(idx, cursorPos) 동작

```
1. requestAnimationFrame → setTimeout(0) (이중 비동기)
2. editor.children[idx] 탐색
3. 포커스 대상 우선순위: .block-content → .block-col-content → th → td
4. el.focus()
5. cursorPos 기반 Range 설정
```

| cursorPos | 동작 |
|-----------|------|
| `0` | `selectNodeContents(c).collapse(true)` — 시작 |
| `-1` 또는 `'end'` | `selectNodeContents(c).collapse(false)` — 끝 |
| 양수 N | `firstChild` 텍스트 노드에서 `setStart(node, N)` |
| 미지정 | `focus()` 만 |

### 11.2 포커스 추적

- `editor`의 `focusin` → `state.currentInsertIdx` 업데이트
- 블록 없으면 `state.page.blocks.length - 1` fallback

### 11.3 포커스 결함

| # | 결함 | 심각도 | 상태 |
|---|------|--------|------|
| F-D1 | `focusBlock`의 `cursorPos=양수N`은 `firstChild`만 검사. 여러 자식 노드(리치 텍스트)에서 정확한 위치 지정 불가 | 중간 | 미수정 |
| F-D2 | `renderBlocks()` 후 호출자가 `focusBlock()` 명시적 호출 필요 — 일부 경로에서 누락 가능 | 중간 | 부분 |
| F-D3 | 모달 열림/닫힘 후 포커스 복원 없음 | 낮음 | 미구현 |
| F-D4 | 이중 비동기 (`rAF + setTimeout`) 타이밍이 다른 비동기 포커스 이동과 경합 가능 | 낮음 | 설계 |

### 11.4 블록 타입별 포커스 대상

| 블록 타입 | 포커스 대상 | contenteditable |
|-----------|-----------|-----------------|
| text, h1~h3, bullet, number, quote | `.block-content` | 편집 모드 true |
| todo | `.block-content` | 편집 모드 true |
| toggle | head/body `.block-content` | 편집 모드 true |
| callout | `.block-content` | 편집 모드 true |
| code | `.block-content` (monospace) | 편집 모드 true |
| columns | `.block-col-content` | 편집 모드 true |
| table | `th`, `td` | 편집 모드 true |
| image | caption (true), wrap (tabindex) | 부분 |
| file | wrap (tabindex) | false |
| divider, toc, calendar, chart | 포커스 불가 | false |

---

## 12. 블록 일괄선택 요구사항

### 12.1 현재 상태: **미구현**

### 12.2 기존 선택 동작

| 동작 | 설명 |
|------|------|
| 텍스트 드래그 | 단일 블록 내 브라우저 기본, 서식바 표시 |
| 블록 간 드래그 | contenteditable 범위 초과 시 불안정 |
| Ctrl+A | 현재 블록 전체 선택 또는 페이지 전체 |

### 12.3 구현 필요 기능

| 기능 | 설명 |
|------|------|
| Shift+ArrowUp/Down | 블록 단위 다중 선택 |
| Ctrl+A 두 번 | 전체 블록 선택 |
| 선택 블록 Backspace/Delete | 일괄 삭제 |
| 선택 블록 드래그 | 일괄 이동 |
| 선택 블록 타입 변환 | 일괄 변환 |

---

## 13. 클립보드 (붙여넣기/드래그) 요구사항

### 13.1 붙여넣기 분기

```
handlePaste(e)
  ├─ 이미지 파일? → Storage/DataURL → 이미지 블록 삽입
  │    ⚠️ pushUndoImmediate() 없이 renderBlocks() 호출 — 데이터 유실 결함
  ├─ 여러 줄 텍스트? (줄바꿈 포함)
  │    └─ pushUndoImmediate() → 첫 줄은 현재 블록에 append → 나머지 줄은 새 블록
  └─ 단일 줄 텍스트? → document.execCommand('insertText') + triggerAutoSave
```

### 13.2 붙여넣기 결함

| # | 결함 | 심각도 | 상태 |
|---|------|--------|------|
| P-D1 | 이미지 붙여넣기 경로에서 `pushUndoImmediate()` 누락 | **높음** | 미수정 |
| P-D2 | 여러 줄 붙여넣기에서 `curBlock.content += lines[0]` — state에서 읽은 content에 append. sync 직후이므로 정상이나, DOM의 현재 커서 위치를 무시하고 content 끝에 추가함 | 중간 | 설계 |
| P-D3 | HTML 붙여넣기(`text/html`)가 무시됨 — `text/plain`만 처리. 다른 앱에서 서식 복사 시 서식 유실 | 낮음 | 미구현 |

### 13.3 드래그앤드롭

| 동작 | 구현 | 동기화 |
|------|------|--------|
| 블록 핸들 드래그 | DOM content → state 수동 동기화 후 `reorderBlock()` | ✅ |
| 이미지 파일 드롭 | Storage/DataURL → 이미지 블록 삽입 | ❌ 누락 |
| PDF 파일 드롭 | DataURL → PDF 블록 삽입 | ❌ 확인 필요 |
| 일반 파일 드롭 | DataURL → 파일 블록 삽입, `renderBlocks()` | ❌ 누락 |

---

## 14. 미디어/콘텐츠 블록 삽입 요구사항

### 14.1 insertMediaBlock 경로

```javascript
function insertMediaBlock(b) {
  if (slashMenuState.idx !== null) {
    blocks[slashMenuState.idx] = b;       // 슬래시 메뉴 위치의 블록 교체
  } else if (currentInsertIdx !== null) {
    blocks.splice(currentInsertIdx + 1, 0, b);  // 현재 위치 아래 삽입
  } else {
    blocks.push(b);                       // 맨 끝에 추가
  }
}
```

### 14.2 미디어 삽입 결함 (공통)

**모든 `insertMediaBlock()` 호출 경로에서 `pushUndoImmediate()` 누락.**

영향받는 함수:
- `addImageBlock()`, `addVideoBlock()`, `addPdfBlock()`
- `submitBookmark()`, `submitFile()`, `insertSlide()`

**수정 필요**: `insertMediaBlock()` 함수 시작에 `pushUndoImmediate()` 추가

### 14.3 execSlash 결함

`toolbar.js:69-90`에서 슬래시 메뉴로 블록 타입 변환 시:

```javascript
var b = state.page.blocks[idx];
b.type = type;
b.content = '';
// ... type별 속성 설정 ...
renderBlocks();  // ❌ pushUndoImmediate() 없음
```

다른 블록에서 편집 중인 텍스트가 유실됨.

---

## 15. 버전 관리 요구사항

### 15.1 버전 생성

- **시점**: `saveDoc()` 호출 시 (수동 저장, 편집 모드 종료)
- **자동 저장(`saveCurrent()`)은 버전을 생성하지 않음**
- **중복 방지**: 마지막 버전과 `JSON.stringify(blocks)` 비교, 같으면 스킵
- **최대 버전 수**: `MAX_VER = 10`, 초과 시 가장 오래된 버전 삭제

### 15.2 수정 완료된 결함

| 결함 | 수정 |
|------|------|
| `saveCurrent()`에 `editMode` 가드 없음 | `!state.editMode` 체크 추가 |
| 페이지 이동 시 `autoSaveTimer` 미정리 | `loadPage()`/`loadPageWithoutPush()`에 `clearTimeout` 추가 |
| 저장 시 매번 중복 버전 생성 | `JSON.stringify` 비교로 중복 방지 |

### 15.3 버전 복원

```
restoreVer(vid)
  → 버전의 blocks를 deep copy
  → state.page.blocks 교체
  → renderBlocks() + saveDoc()
  → 패널 닫기
```

---

## 16. 키보드 동작 우선순위

```
keydown 이벤트
  │
  ├─ 1순위: isComposing 가드 (IME 중 → 전체 무시)
  │
  ├─ 2순위: 슬래시 메뉴 열린 상태
  │    ├─ ArrowUp/Down → 메뉴 선택 이동
  │    ├─ Enter → 선택 항목 실행
  │    ├─ Escape → 메뉴 닫기
  │    ├─ Backspace → '/' 삭제 감지
  │    └─ 일반 문자 → 필터링
  │
  ├─ 3순위: 블록 keydown (handleKey)
  │    ├─ Enter → 블록 분할
  │    ├─ Backspace → 타입 변환/삭제/포커스 이동
  │    ├─ Delete → 다음 블록 병합
  │    ├─ ArrowUp/Down → 블록 간 이동
  │    ├─ '/' → 슬래시 메뉴 열기
  │    ├─ Tab → 스페이스 삽입
  │    └─ Ctrl+B/I/U → 서식
  │
  └─ 4순위: 전역 keydown (document)
       ├─ Ctrl+Z → Undo
       ├─ Ctrl+Y / Ctrl+Shift+Z → Redo
       ├─ Ctrl+S → 저장
       ├─ Ctrl+K → 검색
       ├─ Ctrl+]/[ → 블록 이동
       ├─ Ctrl+1~9/0 → 텍스트 색상/초기화
       ├─ Ctrl+/ → 단축키 도움말
       └─ Escape → 모달/메뉴 닫기
```

---

## 17. 결함 요약 및 우선순위

### 17.1 높음 — 데이터 유실 위험

| ID | 결함 | 영향 범위 | 상태 |
|----|------|-----------|------|
| SYNC-01 | `renderBlocks()` 전 `pushUndoImmediate()` 누락 (20+ 경로) | 편집 중 미디어 삽입, 슬래시 메뉴 실행 시 텍스트 유실 | **미수정** |
| SYNC-02 | 이미지 붙여넣기 시 동기화 누락 (listeners.js:242,254) | 이미지 붙여넣기 시 편집 중 텍스트 유실 | **미수정** |
| SYNC-03 | 파일 드롭 시 동기화 누락 (listeners.js:724) | 파일 드롭 시 편집 중 텍스트 유실 | **미수정** |
| CURSOR-01 | `atStart`/`atEnd` 감지 오류 (리치 텍스트) | Backspace/Delete/ArrowUp/Down 오동작 | **미수정** |

### 17.2 중간 — 기능 결함

| ID | 결함 | 영향 | 상태 |
|----|------|------|------|
| MERGE-01 | Backspace로 이전 블록과 병합 없음 | UX 불편 (Notion과 다른 동작) | 미구현 |
| FOCUS-01 | `focusBlock(idx, N)` — 리치 텍스트에서 정확한 위치 지정 불가 | Delete 병합 후 커서 위치 부정확 | 미수정 |
| STALE-01 | `insertBlockEl`/`removeBlockEl` 후 이후 블록의 클로저 `idx` 스테일 | 연속 구조 변경 시 잘못된 블록 조작 가능 | 미수정 |
| TAB-01 | 테이블 셀 간 Tab 이동 미구현 | 테이블 편집 UX 불편 | 미구현 |
| PASTE-01 | 여러 줄 붙여넣기 시 커서 위치 무시, content 끝에 append | 중간 삽입 불가 | 설계 |
| UNDO-01 | `pushUndo()`(500ms 타이머)가 sync 없이 state 스냅샷 | undo 시 최신 내용 미반영 가능 | 미수정 |

### 17.3 낮음 — 개선 사항

| ID | 결함 | 상태 |
|----|------|------|
| SHIFT-TAB | Shift+Tab 들여쓰기 해제 | 미구현 |
| SELECT-01 | 블록 일괄선택 | 미구현 |
| PASTE-HTML | HTML 서식 붙여넣기 | 미구현 |
| FOCUS-MODAL | 모달 닫기 후 포커스 복원 | 미구현 |
| ENTER-LIST | 빈 리스트 Enter 시 블록 자체를 text로 변환 | 설계 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-14 | 초판: 동작 규칙 정의서 작성 |
| 2026-02-14 | v2: 전수조사 기반 요구사항 분석서로 전면 개편. 동기화 결함 20건+, 커서 감지 결함, 클로저 스테일 문제 추가 |
