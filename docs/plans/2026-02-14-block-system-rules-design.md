# AcidDocument 블록 시스템 규칙 개선 설계

**날짜**: 2026-02-14
**브랜치**: feat/table-sort-filter (현재) → 새 브랜치 생성 예정

---

## 1. 목표

블록 에디터의 시스템 규칙을 개선하여 일관된 편집 경험 제공:
- 블록 생성/삭제/이동 규칙 정비
- 48글자 자동 분할
- 토글 클릭 범위 제한
- Ctrl+1~0 텍스트 컬러 단축키

## 2. 변경 사항

### 2.1 블록 기본 — 새 페이지 생성 시 포커스

- `createPage()`에서 새 페이지 생성 후 `focusBlock(0, 0)` 호출
- 기존 데이터 유지 (마이그레이션 없음)

### 2.2 48글자 자동 분할

- **적용 대상**: text, h1, h2, h3, bullet, number, quote, todo
- **미적용**: table, image, code, slide, video, pdf, file, calendar, chart, columns, toc, divider, toggle(body), callout
- **동작**:
  1. `input` 이벤트에서 `.textContent.length > 48` 체크
  2. 48번째 글자까지 현재 블록에 유지
  3. 초과분으로 새 블록 생성 (같은 타입) + 포커스
- **붙여넣기**: `handlePaste`에서 48글자 단위로 분할하여 여러 블록 생성
- **기존 데이터**: 수정 시에만 분할 (로드 시 강제 분할 안 함)

### 2.3 내용 있는 블록에서 슬래시 명령어

- **현재**: 빈 블록에서만 `/` → 슬래시 메뉴
- **변경**: 내용이 있는 블록에서 `/` 입력 시:
  1. 다음 위치에 새 빈 블록 생성
  2. 새 블록에서 슬래시 메뉴 오픈
- 빈 블록에서는 기존과 동일 (현재 블록 교체)

### 2.4 텍스트 선택 후 Enter

- `getSelection()`으로 선택 범위 확인
- 선택된 텍스트 삭제
- 선택 끝 위치 이후의 텍스트를 새 블록으로 이동

### 2.5 Ctrl+[/] 블록 이동 단축키

- `Ctrl+]` → `moveBlockUp(currentIdx)` (위로)
- `Ctrl+[` → `moveBlockDown(currentIdx)` (아래로)
- `listeners.js` global keydown 핸들러에 추가

### 2.6 Backspace 삭제 규칙 세분화

- **빈 블록에서 Backspace**:
  - 이전 블록이 텍스트 계열 → 이전 블록 끝으로 포커스
  - 이전 블록이 콘텐츠 계열 → 그 위의 텍스트 블록으로 포커스
- **콘텐츠 블록(표/파일/영상) 삭제 시**:
  - `deleteConfirmModal` 사용 (브라우저 confirm 대신)
  - 삭제 후 새 빈 블록 생성 + 포커스
- **서식(H1, H2 등) 블록 삭제 시**:
  - 서식 제거되고 일반 text 블록으로 전환

### 2.7 토글 기능

- 현재 이미 arrow 클릭에서만 토글 발생 (요구사항 충족)
- 별도 수정 불필요

### 2.8 Ctrl+1~0 텍스트 컬러 단축키

| 키 | 색상 | HEX |
|----|------|-----|
| Ctrl+1 | 빨강 | #FF0000 |
| Ctrl+2 | 주황 | #FF8C00 |
| Ctrl+3 | 노랑 | #FFD700 |
| Ctrl+4 | 초록 | #00C853 |
| Ctrl+5 | 파랑 | #2196F3 |
| Ctrl+6 | 남색 | #1A237E |
| Ctrl+7 | 보라 | #9C27B0 |
| Ctrl+8 | 분홍 | #E91E63 |
| Ctrl+9 | 회색 | #9E9E9E |
| Ctrl+0 | 검정 | 색상 제거 (removeFormat) |

- 조건: 텍스트 선택 상태에서만 동작
- `document.execCommand('foreColor', false, hex)` 사용

## 3. 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| src/editor/listeners.js | 48글자 분할, Ctrl+[/], Ctrl+1~0, Enter+선택, Backspace 규칙 |
| src/editor/blocks.js | 삭제 시 서식 초기화, 콘텐츠 삭제 모달 |
| src/ui/sidebar.js | createPage 블록 포커스 |
| src/ui/toolbar.js | 슬래시 메뉴 비어있지 않은 블록 동작 |

## 4. 구현 방식

일괄 구현 (사용자 선택). 단일 브랜치에서 모든 변경 적용.

## 5. 리스크

- **48글자 제한**: 기존 48글자 초과 블록이 있을 수 있음. 로드 시 분할하지 않고 수정 시에만 적용.
- **Backspace 로직 복잡도**: 블록 타입별 분기가 늘어남. 테스트 필수.
- **Ctrl+숫자**: 브라우저 기본 탭 전환 단축키(Ctrl+1~9)와 충돌 → `e.preventDefault()` 필수.
