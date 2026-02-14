# AcidDocument 편집기 동작 스펙

> 이 문서는 AcidDocument 블록 에디터의 모든 입력/편집 동작을 정의합니다.
> 구현 코드와 1:1 대응되며, 새 기능 추가/버그 수정 시 이 문서를 기준으로 판단합니다.

---

## 1. 아키텍처 개요

### 1.1 블록 기반 구조

모든 콘텐츠는 **블록(block)** 단위로 관리됩니다. 각 블록은 고유 `id`, `type`, `content`를 가집니다.

```
state.page.blocks = [
  { id: "abc123", type: "text", content: "Hello" },
  { id: "def456", type: "h1", content: "Title" },
  ...
]
```

### 1.2 블록 타입 분류

| 분류 | 타입 | 키보드 편집 | 설명 |
|------|------|-------------|------|
| **TEXT_TYPES** | `text`, `h1`, `h2`, `h3`, `bullet`, `number`, `quote`, `todo` | O | contenteditable 텍스트 입력 가능 |
| **CONTENT_TYPES** | `table`, `image`, `video`, `pdf`, `file`, `slide`, `calendar`, `columns`, `toc`, `divider` | X (별도 UI) | 텍스트 편집 불가, 전용 UI로 조작 |

**특수 케이스:**
- `toggle`: TEXT_TYPES에 준하지만 head/body 이중 구조
- `callout`: TEXT_TYPES에 준하지만 아이콘+텍스트 구조
- `code`: TEXT_TYPES에 준하지만 monospace, pre-wrap 스타일
- `columns`: 각 컬럼 내부는 contenteditable (별도 이벤트 처리)

### 1.3 상태 관리

| 상태 변수 | 용도 |
|-----------|------|
| `state.editMode` | `true`: 편집 모드, `false`: 보기 모드 |
| `state.isComposing` | IME 조합 중 여부 (한글/일본어 등) |
| `state.currentInsertIdx` | 현재 포커스된 블록 인덱스 |
| `state.slashMenuState` | 슬래시 메뉴 상태 `{open, idx}` |
| `state.savedSelection` | 색상 피커용 Selection 백업 |
| `state.autoSaveTimer` | 자동 저장 디바운스 타이머 |
| `state.undoStack` / `state.redoStack` | Undo/Redo 스냅샷 |
| `state.dragBlockIdx` | 드래그 중인 블록 인덱스 |

---

## 2. 키보드 동작

### 2.1 Enter (새 블록 생성)

**조건:** `e.key === 'Enter' && !e.shiftKey`

| 상황 | 동작 |
|------|------|
| `@태그` 패턴 감지 (`/@([^@<>\s]+)$/`) | 인라인 태그 `<span class="inline-tag">` 생성, 새 블록 생성하지 않음 |
| 텍스트 선택 상태 | 선택 영역 삭제 후 분할 |
| 커서 위치에서 분할 | 커서 앞 = 현재 블록, 커서 뒤 = 새 블록 |
| 리스트 블록 (`bullet`/`number`/`todo`)이 비어있지 않으면 | 새 블록도 같은 타입 유지 |
| 리스트 블록이 비어있으면 | 새 블록은 `text` 타입 |

**새 블록 기본값:**
- `type`: 위 규칙에 따라 결정
- `content`: 커서 뒤 HTML
- `todo`인 경우: `checked: false`
- `number`인 경우: `num: (현재 num) + 1`

**후처리:** `insertBlock(idx+1, newB)` → `updateNums()`

### 2.2 Shift+Enter (줄바꿈)

**동작:** 브라우저 기본 동작 허용 (`<br>` 삽입)

### 2.3 Backspace

**조건:** `e.key === 'Backspace'`

| 상황 | 동작 |
|------|------|
| 블록이 비어있고 서식 블록일 때 | `text` 타입으로 변환, 삭제하지 않음 |
| 블록이 비어있고 `text`이고 첫 블록이 아닐 때 | 블록 삭제 → CONTENT_TYPES 스킵하여 이전 TEXT_TYPES 블록 끝으로 포커스 |
| 커서가 맨 앞이고 이전 블록이 있을 때 | 이전 TEXT_TYPES 블록 끝으로 포커스 (CONTENT_TYPES 스킵) |
| 그 외 | 브라우저 기본 동작 |

**서식 블록:** `bullet`, `number`, `todo`, `h1`, `h2`, `h3`, `quote`

**CONTENT_TYPES 스킵 로직:**
```
prevIdx = idx - 1
while (prevIdx >= 0 && CONTENT_TYPES에 해당) prevIdx--
if (prevIdx < 0) prevIdx = Math.max(0, idx - 1)  // fallback
```

### 2.4 Delete (다음 블록 병합)

**조건:** `e.key === 'Delete'`

| 상황 | 동작 |
|------|------|
| 커서가 맨 끝이고 다음 블록이 TEXT_TYPES일 때 | 현재 블록의 trailing `<br>` 제거 → 다음 블록 content를 현재 블록에 합침 → 다음 블록 삭제 |
| 다음 블록이 CONTENT_TYPES일 때 | 아무 동작 없음 |
| 그 외 | 브라우저 기본 동작 |

**병합 가능 타입:** `text`, `h1`, `h2`, `h3`, `bullet`, `number`, `quote`
(`todo`는 병합 대상에서 제외)

### 2.5 방향키

| 키 | 조건 | 동작 |
|----|------|------|
| `ArrowUp` | 커서가 맨 앞 (`anchorOffset === 0`) | 이전 블록 끝으로 포커스 |
| `ArrowDown` | 커서가 맨 끝 (`anchorOffset === textContent.length`) | 다음 블록 처음으로 포커스 |
| `ArrowLeft/Right` | — | 브라우저 기본 동작 |

### 2.6 Tab

**동작:** 4칸 스페이스 삽입 (`document.execCommand('insertText', false, '    ')`)

### 2.7 슬래시 메뉴 (`/`)

| 상황 | 동작 |
|------|------|
| 빈 블록에서 `/` 입력 | 현재 블록을 대상으로 슬래시 메뉴 열림 |
| 내용 있는 블록에서 `/` 입력 | 다음 위치에 새 빈 블록 생성 → 그 블록에서 슬래시 메뉴 열림 |

**슬래시 메뉴 키보드:**
- `ArrowDown/Up`: 항목 선택 이동
- `Enter`: 선택된 항목 실행
- `Escape`: 메뉴 닫기
- `Backspace`: `/` 앞까지 삭제되면 메뉴 닫기
- 일반 문자: 실시간 필터링

### 2.8 서식 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+B` | 볼드 토글 |
| `Ctrl+I` | 이탤릭 토글 |
| `Ctrl+U` | 밑줄 토글 |
| `Ctrl+1~9` | 텍스트 색상 적용 (선택 영역 필수) |
| `Ctrl+0` | 서식 초기화 (선택 영역 필수) |

**색상 매핑:**
```
1: #FF0000  2: #FF8C00  3: #FFD700  4: #00C853  5: #2196F3
6: #1A237E  7: #9C27B0  8: #E91E63  9: #9E9E9E  0: removeFormat
```

### 2.9 전역 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+K` | 검색 모달 열기 |
| `Ctrl+S` | 저장 후 편집 모드 종료 |
| `Ctrl+/` | 단축키 도움말 |
| `Ctrl+]` | 블록 위로 이동 |
| `Ctrl+[` | 블록 아래로 이동 |
| `Escape` | 모든 모달/패널/메뉴 닫기 + 이미지 뷰어 닫기 |

---

## 3. IME (한글 입력) 처리

### 3.1 Composition 이벤트

| 이벤트 | 동작 |
|--------|------|
| `compositionstart` | `state.isComposing = true` |
| `compositionend` | `state.isComposing = false` |

### 3.2 IME 가드

다음 동작은 `state.isComposing === true`일 때 **차단**됩니다:

- `handleKey()` 전체 (키보드 이벤트 핸들러)
- `input` 이벤트에서 슬래시 메뉴 필터링
- 제목(`pageTitle`) input 이벤트에서 autoSave 트리거

**이유:** 한글 조합 중 keydown 이벤트가 중복 발생하여 Enter/Backspace 등이 의도치 않게 실행되는 것을 방지

### 3.3 제목 필드 IME

제목 입력란은 별도의 `titleComposing` 변수로 독립 추적합니다.

---

## 4. 클립보드 동작

### 4.1 텍스트 붙여넣기 (Paste)

| 상황 | 동작 |
|------|------|
| 이미지 파일 | Storage 업로드 → 이미지 블록 생성 |
| 여러 줄 텍스트 (`\n` 포함) | 첫 줄: 현재 블록 content에 append (state 직접), 나머지: 각각 새 `text` 블록 생성 |
| 단일 줄 텍스트 | `document.execCommand('insertText')` |

**여러 줄 처리 상세:**
1. `pushUndoImmediate()` 호출
2. `\n+`로 분할 → 빈 줄 필터링
3. 첫 줄: `curBlock.content += lines[0]` (DOM이 아닌 state 직접 수정)
4. 나머지: `state.page.blocks.splice(idx, 0, {type:'text', content:lines[j]})`
5. `renderBlocks()` + `triggerAutoSave()`

### 4.2 HTML 붙여넣기

현재 HTML 붙여넣기는 plain text로 fallback합니다. (`e.clipboardData.getData('text/plain')` 우선)

---

## 5. 드래그 앤 드롭

### 5.1 블록 재정렬

| 단계 | 동작 |
|------|------|
| `dragstart` | `.block-handle[draggable]` 클릭 시, `state.dragBlockIdx` 설정, `.dragging` 클래스 추가 |
| `dragover` | 드롭 위치에 `.drag-indicator` 표시 |
| `drop` | DOM→state 동기화 (모든 블록의 `.block-content` innerHTML을 state에 반영) → `reorderBlock(fromIdx, toIdx)` |
| `dragend` | `state.dragBlockIdx = null`, `.dragging`/`.drag-indicator` 정리 |

**DOM→state 동기화 이유:** 드래그 중 편집한 내용이 reorder 시 renderBlocks()로 유실되는 것을 방지

### 5.2 파일 드롭

| 파일 타입 | 동작 |
|-----------|------|
| `image/*` | Storage 업로드 또는 base64 → 이미지 블록 추가 |
| `application/pdf` | base64 → PDF 블록 추가 |
| 기타 | base64 → 파일 블록 추가 |

드롭 완료 시 `.drag-indicator`가 남아있으면 제거합니다.

---

## 6. 포커스 관리

### 6.1 focusBlock(idx, cursorPos)

| cursorPos | 동작 |
|-----------|------|
| `0` | 블록 시작으로 커서 |
| `-1` 또는 `'end'` | 블록 끝으로 커서 |
| 양의 정수 | 해당 offset 위치로 커서 |
| 미지정 | 포커스만 (커서 위치 미지정) |

**타이밍:** `requestAnimationFrame` → `setTimeout(0)` 이중 비동기로 DOM 렌더링 완료 후 실행

**포커스 대상 우선순위:**
1. `.block-content`
2. `.block-col-content`
3. `th`
4. `td`

### 6.2 블록 추적

`editor`의 `focusin` 이벤트로 `state.currentInsertIdx`를 자동 갱신합니다.

### 6.3 제목 → 본문 전환

제목(`pageTitle`)에서 `Enter` 키를 누르면:
1. 블록이 없으면 빈 `text` 블록 생성
2. 첫 번째 블록(`idx=0`)으로 포커스

### 6.4 에디터 빈 공간 클릭

에디터 영역의 빈 공간을 클릭하면 마지막 블록 끝으로 포커스합니다.
블록이 없으면 새 `text` 블록을 생성합니다.

---

## 7. 자동 저장

### 7.1 triggerAutoSave()

```
편집 모드가 아니면 → 무시
autoSaveTimer 초기화 → 1500ms 후 saveCurrent() 실행
undoTimer 초기화 → 500ms 후 pushUndo() 실행
```

### 7.2 saveCurrent()

1. `collectBlocks()`로 DOM → state 동기화
2. 페이지 제목, 아이콘, 블록, 수정시간 업데이트
3. Firestore에 저장

### 7.3 수동 저장 (saveDoc)

수동 저장 시 `clearTimeout(state.autoSaveTimer); state.autoSaveTimer = null;`로 중복 autoSave를 방지합니다.

### 7.4 collectBlocks()

**보기 모드:** `state.page.blocks`의 deep copy 반환 (DOM 읽지 않음)

**편집 모드:** DOM의 각 블록 요소에서 현재 내용을 읽어 state와 병합:
- `toggle`: head `.block-content` + body `.block-content` + open 상태
- `todo`: checkbox checked 상태
- `image`: caption
- `table`: 모든 `tr > th/td` + sort 버튼/resizer HTML 제거 + colWidths 계산
- `columns`: `.block-col-content` + colWidths 계산
- 기본: `.block-content` innerHTML

---

## 8. Undo/Redo

### 8.1 구조

- 최대 50개 스냅샷 (`MAX_UNDO = 50`)
- 스냅샷 = `state.page.blocks`의 deep copy (JSON.parse/stringify)

### 8.2 저장 시점

| 함수 | 호출 시점 | 설명 |
|------|-----------|------|
| `pushUndo()` | `triggerAutoSave()` → 500ms 디바운스 | 텍스트 입력 중 자동 저장 |
| `pushUndoImmediate()` | `insertBlock`, `deleteBlock`, `dupBlock`, `moveBlock`, `reorderBlock`, `changeBlockType`, 멀티라인 paste | 구조 변경 전 즉시 저장 |

### 8.3 syncBlocksFromDOM()

Undo 실행 전 현재 DOM 내용을 state에 동기화합니다. `collectBlocks()`를 호출하여 편집 중인 텍스트가 유실되지 않도록 합니다.

### 8.4 Undo/Redo 실행

1. 현재 상태 → 반대 스택에 push
2. 해당 스택에서 pop → `state.page.blocks`에 적용
3. `renderBlocks()` → `focusBlock(0, 0)`

---

## 9. 서식바 (Format Bar)

### 9.1 표시 조건

텍스트를 드래그 선택(`mouseup`)하면 선택 영역 위에 서식바가 나타납니다.

**표시 조건:**
- `selection.rangeCount > 0`
- `selection.isCollapsed === false`
- `rect.width >= 5` (최소 선택 너비)

### 9.2 서식 명령 (fmtCmd)

`document.execCommand()` 기반. 텍스트가 선택되지 않은 상태에서 실행하면 `toast('텍스트를 선택해주세요', 'warn')` 경고.

### 9.3 색상 적용 (applyColor)

1. 색상 모달 열기 전 `saveSelection()`으로 현재 선택 범위 백업
2. 색상 선택 시 `restoreSelection()`으로 선택 범위 복원
3. 복원 실패 시 `state.savedSelection`으로 fallback 시도
4. `document.execCommand('foreColor', false, color)` 실행
5. `state.savedSelection = null` 정리

---

## 10. 특수 블록 동작

### 10.1 토글 (toggle)

| 요소 | 동작 |
|------|------|
| 화살표(`▶`) 클릭 | `b.open` 토글, head/body에 `.open` 클래스 토글 |
| head `.block-content` | 일반 텍스트 편집 (Enter로 새 블록 생성) |
| body `.block-content` | Enter → `insertLineBreak` (줄바꿈만, 새 블록 생성 안함) |
| body input | `blk.innerContent = bodyContent.innerHTML` 직접 업데이트 |

### 10.2 컬럼 (columns)

| 동작 | 설명 |
|------|------|
| Enter | `insertLineBreak` (줄바꿈만, 새 블록 생성 안함) |
| input | `blk.columns[colIdx] = el.innerHTML` 직접 업데이트 |
| 이벤트 전파 | `stopPropagation()` — 부모 블록 이벤트와 분리 |

### 10.3 테이블 (table)

| 동작 | 설명 |
|------|------|
| 셀 편집 | `th`/`td`에서 직접 contenteditable |
| 행/열 추가/삭제 | 전용 버튼 → `table.js` 모듈 |
| 정렬 | 헤더 sort 버튼 → `sortTable(blockId, col, dir)` |
| 필터 | 입력란 → `filterTableRows(blockId, col, query)` |
| 열 너비 | 모달 → `colWidths` 배열 (% 단위) |

### 10.4 이미지/파일 블록

- `Backspace`/`Delete` 키 → 블록 삭제
- 이미지 캡션은 별도 contenteditable

### 10.5 할일 (todo)

- 체크박스 `change` → `b.checked` 토글 + `.done` 클래스 토글
- 보기 모드에서 체크박스 클릭 → 편집 모드로 전환

### 10.6 편집 불가 블록 생성 규칙

`toc`, `divider`, `calendar`, `chart-*` 타입을 슬래시 메뉴로 생성하면, 바로 아래에 빈 `text` 블록을 자동 추가합니다. 포커스는 새로 생성된 빈 블록으로 이동합니다.

---

## 11. 보기/편집 모드 전환

### 11.1 편집 모드 진입

- 블록 더블클릭 시 편집 모드 자동 전환
- `state.editMode = true` → `renderBlocks()` (contenteditable 활성화)
- `state.editBackup`에 현재 상태 백업

### 11.2 보기 모드 복귀

- `Ctrl+S` 또는 저장 버튼
- `collectBlocks()`로 최종 DOM 동기화
- `state.editMode = false` → `renderBlocks()` (contenteditable 비활성화)

### 11.3 미저장 경고

`beforeunload` 이벤트에서 `state.editMode`이고 제목/아이콘이 변경되었으면 이탈 경고를 표시합니다.

---

## 12. 블록 CRUD 규칙

### 12.1 생성

| 함수 | 동작 |
|------|------|
| `insertBlock(idx, b)` | `pushUndoImmediate()` → splice → DOM 삽입 → `focusBlock(idx, 0)` |
| `addBlockBelow(idx)` | `insertBlock(idx+1, {type:'text', content:''})` |

### 12.2 삭제

| 상황 | 동작 |
|------|------|
| 마지막 1개 블록 | 내용만 비우기 (빈 text 블록 유지) |
| 그 외 | splice → DOM 제거 → `updateNums()` → 적절한 블록으로 포커스 |

### 12.3 복제

원본의 deep copy + 새 `id` 생성 → 바로 아래에 삽입

### 12.4 이동

인접한 블록과 위치 교환 → `renderBlocks()` → 이동된 위치로 포커스

### 12.5 타입 변환

`content` 유지, 타입별 초기값 설정:
- `todo`: `checked = false`
- `toggle`: `open = false`, `innerContent = ''` (기존값 있으면 유지)

---

## 13. 인라인 요소

### 13.1 인라인 태그 (@태그)

Enter 키로 `@text` 패턴을 감지하면 `<span class="inline-tag tag-blue">@text</span>` 변환

**태그 조작:**
- 클릭 시 태그 피커 열림 (편집 모드에서만)
- 색상 변경: `tag-{color}` 클래스 교체
- 삭제: 태그를 일반 텍스트로 교체

### 13.2 멘션 (@사용자)

슬래시 메뉴 → 멘션 선택 → 사용자 목록 모달 → `<span class="mention-tag">@userName</span>` 삽입

### 13.3 이모지

슬래시 메뉴 → 이모지 선택 → 이모지 피커 모달 → 현재 블록 content에 append

### 13.4 페이지 링크

슬래시 메뉴 → 페이지 링크 선택 → 페이지 선택 모달 → `<span class="page-link">` 삽입

---

## 14. 버전 관리

### 14.1 버전 구조

```
{
  id: genId(),           // 고유 ID
  date: Date.now(),      // 생성 시각 (ms)
  author: state.user.id, // 작성자 ID
  blocks: [...]          // 블록 스냅샷 (deep copy)
}
```

- 최대 **10개** 유지 (`MAX_VER = 10`), 초과 시 가장 오래된 버전 자동 삭제 (FIFO)
- 버전 번호 표시: `v(versions.length + 1)` (메타 영역)

### 14.2 버전 생성 시점

| 동작 | 버전 생성 | 설명 |
|------|-----------|------|
| **수동 저장** (`saveDoc()`) | O | Ctrl+S, 저장 버튼, 페이지 이탈 시 저장 선택 |
| **자동 저장** (`saveCurrent()`) | X | 1.5초 디바운스, DB만 업데이트 |
| **버전 복원** (`restoreVer()`) | O | 복원 후 `saveDoc()` 호출 → 새 버전 기록 |

### 14.3 중복 버전 방지

`saveDoc()` 실행 시 마지막 버전과 현재 블록을 `JSON.stringify`로 비교하여 **내용이 동일하면 새 버전을 생성하지 않습니다.** 이를 통해:
- 변경 없이 저장 반복 시 동일한 버전이 쌓이지 않음
- 버전 복원 후 재저장 시 중복 스냅샷 방지

### 14.4 자동 저장 (saveCurrent) 규칙

| 규칙 | 설명 |
|------|------|
| **editMode 가드** | `state.editMode === false`이면 즉시 return |
| **디바운스** | 1.5초 (`triggerAutoSave` 에서 타이머 설정) |
| **페이지 전환 시 타이머 정리** | `loadPage()` / `loadPageWithoutPush()`에서 `clearTimeout(state.autoSaveTimer)` |
| **수동 저장 시 타이머 정리** | `saveDoc()`에서 `clearTimeout(state.autoSaveTimer)` |
| **DB만 저장** | 버전 생성 없이 `collectBlocks()` → `saveDB()` |

### 14.5 버전 복원

1. `confirm('이 버전으로 복원?')` 확인
2. 선택된 버전의 `blocks`를 deep copy → `state.page.blocks`에 적용
3. `renderBlocks()` → `saveDoc()` 호출 (새 버전 생성 — 단, 중복 방지 적용)
4. 버전 패널 닫기

### 14.6 버전 삭제

- 개별 버전 삭제: `confirm()` 후 `versions` 배열에서 제거
- 최신 버전(현재)은 삭제/복원 불가 (UI에서 비활성화)

### 14.7 페이지 전환 시 저장 흐름

```
loadPage(newId) →
  1. editMode && hasChanges()? → confirm('저장?')
     - Yes → saveDoc() (버전 생성 + DB 저장)
     - No  → 미저장 변경사항 폐기 (마지막 autoSave 시점의 데이터 유지)
  2. clearTimeout(autoSaveTimer) → 이전 페이지 타이머 정리
  3. editMode = false, page = newPage
  4. renderBlocks(), saveDB()
```

### 14.8 데이터 보존 계층

```
편집 중 타이핑
  ↓ (500ms)
pushUndo() → undoStack에 스냅샷 (메모리, 최대 50개)
  ↓ (1500ms)
saveCurrent() → DB에 저장 (버전 없음, editMode 가드)
  ↓ (수동 저장)
saveDoc() → DB에 저장 + 버전 생성 (중복 방지)
```

---

## 15. 번호 매기기 규칙


`updateNums()` 함수가 에디터의 모든 자식을 순회:
- `.block-number` → `data-num` 속성 증가
- `.block-number`가 아닌 블록 만나면 카운터 리셋 (`.block-bullet` 제외)

연속된 `number` 블록은 자동으로 1, 2, 3... 번호가 매겨집니다.

---

## 16. 파일 참조

| 파일 | 책임 |
|------|------|
| `src/editor/listeners.js` | 키보드, 클립보드, 드래그, 이벤트 바인딩 |
| `src/editor/blocks.js` | 블록 CRUD, 포커스, 저장, TOC |
| `src/editor/renderer.js` | 블록 → DOM 렌더링 |
| `src/editor/history.js` | Undo/Redo 스택 관리 |
| `src/editor/table.js` | 테이블 행/열/정렬/필터 |
| `src/editor/media.js` | 이미지/슬라이드/비디오/PDF/파일 삽입 |
| `src/editor/calendar.js` | 달력 블록 렌더링 |
| `src/editor/chart.js` | 차트 블록 렌더링 |
| `src/ui/toolbar.js` | 서식바, 슬래시 메뉴, 이모지/멘션/태그 |
| `src/ui/sidebar.js` | 사이드바, 편집 모드 전환, 저장 |
| `src/ui/modals.js` | 모달 열기/닫기 |
| `src/data/store.js` | 전역 상태 |
| `src/config/firebase.js` | 상수 (블록 타입, 색상, 슬래시 메뉴 항목) |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-02-14 | 초판 작성 (20개 결함 수정 + 48글자 자동분할 제거 반영) |
| 2026-02-14 | 버전 관리 섹션 추가 + saveCurrent editMode 가드, 페이지 전환 타이머 정리, 중복 버전 방지 |
