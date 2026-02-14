# 글자 입력 강경책(Hardening) 계획서

> 작성일: 2026-02-14
> 목적: contenteditable 기반 에디터의 모든 텍스트 입력 결함을 체계적으로 제거

---

## 1. 완료된 수정 (이번 세션)

| ID | 수정 내용 | 파일 |
|---|---|---|
| CLOSURE-01 | handleKey에서 DOM data-idx로 stale closure 해결 | listeners.js |
| BS-01 | 내용 있는 서식 블록 맨 앞 BS → text 변환 | listeners.js |
| BS-04 | text 맨 앞 BS + 이전 text → 블록 병합 | listeners.js |
| BS-05 | idx=0 서식 블록 맨 앞 BS → text 변환 | listeners.js |
| ENT-04 | 빈 리스트 Enter → text 변환 (리스트 탈출) | listeners.js |
| DEL-04 | Delete 병합 대상에 todo 추가 | listeners.js |
| CTX-01 | 블록 컨텍스트 메뉴 H3 추가 | sidebar.js |
| TAB-02 | Shift+Tab 내어쓰기 | listeners.js |
| PASTE-01 | 멀티라인 붙여넣기 커서 위치 반영 | listeners.js |
| SEC-01 | collectBlocks 저장 시 sanitizeHTML 적용 | blocks.js |
| SEC-02 | Enter 분할 시 content sanitize | listeners.js |
| SEC-03 | 멀티라인 paste에 esc() HTML escape | listeners.js |
| SEC-04 | @태그 텍스트 sanitize | listeners.js |
| ARW-01 | ArrowUp/Down 콘텐츠 블록 스킵 | listeners.js |
| SHIFT-ENT | Shift+Enter → insertLineBreak 명시적 사용 | listeners.js |

---

## 2. 커서 상태별 동작 매트릭스

### 표기법
- `|` = 커서 위치
- `[text]` = 선택된 텍스트
- `→` = 결과

### 2.1 Enter

| 블록 타입 | 커서 상태 | 동작 | 상태 |
|---|---|---|---|
| text `|` (빈) | 커서만 | 아래에 빈 text 생성 | ✅ |
| text `내용|` | 끝 | 아래에 빈 text 생성 | ✅ |
| text `내|용` | 중간 | text="내", new text="용" | ✅ |
| text `|내용` | 앞 | text="", new text="내용" | ✅ |
| text `[내용]` | 전체 선택 | 선택 삭제 → text="", new text="" | ✅ |
| h1 `제목|` | 끝 | h1="제목", new text="" | ✅ |
| h1 `제|목` | 중간 | h1="제", new text="목" | ✅ |
| h1 `|` (빈) | 빈 | h1="", new text="" | ✅ |
| bullet `|` (빈) | 빈 | **bullet → text 변환** (리스트 탈출) | ✅ 수정 |
| number `|` (빈) | 빈 | **number → text 변환** | ✅ 수정 |
| todo `|` (빈) | 빈 | **todo → text 변환** | ✅ 수정 |
| bullet `내용|` | 끝 | bullet="내용", new bullet="" | ✅ |
| Shift+Enter | 어디서든 | `<br>` 삽입 (insertLineBreak) | ✅ 수정 |

### 2.2 Backspace

| 블록 타입 | 커서 상태 | 동작 | 상태 |
|---|---|---|---|
| text `|` (빈) idx>0 | 빈 | 블록 삭제, 이전 블록 포커스 | ✅ |
| text `|` (빈) idx=0 유일 | 빈 | 아무것도 안 함 (마지막 블록) | ✅ |
| h1 `|` (빈) | 빈 | h1 → text 변환 | ✅ |
| bullet `|` (빈) | 빈 | bullet → text 변환 | ✅ |
| h1 `|내용` | 맨 앞 | **h1 → text 변환 (내용 유지)** | ✅ 수정 |
| h1 `|내용` idx=0 | 맨 앞 | **h1 → text 변환** | ✅ 수정 |
| text `|내용` idx>0 | 맨 앞, 이전=text | **이전 블록에 병합** | ✅ 수정 |
| text `|내용` 이전=image | 맨 앞, 이전=콘텐츠 | 포커스 이동 | ✅ |
| text `내|용` | 중간 | 브라우저 기본 (문자 삭제) | ✅ |

### 2.3 Delete

| 블록 타입 | 커서 상태 | 동작 | 상태 |
|---|---|---|---|
| text `내용|` + 다음=text | 끝 | 다음 블록 내용 병합 | ✅ |
| text `내용|` + 다음=todo | 끝 | **다음 블록 내용 병합** | ✅ 수정 |
| text `내용|` + 다음=image | 끝 | 아무것도 안 함 | ✅ |
| text `내|용` | 중간 | 브라우저 기본 (문자 삭제) | ✅ |

### 2.4 방향키

| 키 | 커서 상태 | 동작 | 상태 |
|---|---|---|---|
| ArrowUp | 맨 앞 | 이전 텍스트 블록 끝으로 (콘텐츠 스킵) | ✅ 수정 |
| ArrowDown | 맨 끝 | 다음 텍스트 블록 앞으로 (콘텐츠 스킵) | ✅ 수정 |
| ArrowUp | 중간 | 브라우저 기본 (줄 이동) | ✅ |
| ArrowDown | 중간 | 브라우저 기본 (줄 이동) | ✅ |

### 2.5 Tab

| 키 | 동작 | 상태 |
|---|---|---|
| Tab | 4칸 스페이스 삽입 | ✅ |
| Shift+Tab | 커서 앞/줄 시작 4칸 스페이스 제거 | ✅ 수정 |

### 2.6 Paste

| 타입 | 동작 | 상태 |
|---|---|---|
| 단일 줄 텍스트 | insertText (커서 위치) | ✅ |
| 멀티라인 텍스트 | 커서에서 분할, 줄마다 블록 생성 | ✅ 수정 |
| 이미지 파일 | image 블록 생성 | ✅ |
| 테이블/컬럼 내 멀티라인 | 공백으로 치환 (블록 분할 안 함) | ✅ 수정 |

---

## 3. 보안 레이어

```
[사용자 입력] → contenteditable (브라우저 HTML 생성)
     ↓
[collectBlocks] → sanitizeHTML(innerHTML) → state.page.blocks ← 수정
     ↓
[saveCurrent] → Firestore 저장 (sanitized HTML)
     ↓
[renderBlocks] → sanitizeHTML(b.content) → DOM (이중 방어)
```

**보안 원칙**: 입력 시점(collectBlocks)과 출력 시점(renderBlocks) 양쪽에서 sanitize.
- 허용 태그: `b, i, u, s, a, br, span, code, mark, sub, sup`
- 허용 속성: `href, target, rel, class, style, data-tag-color`
- 차단: script, img, iframe, event handler, javascript: URL

---

## 4. 남은 잠재 결함 및 강경 조치

### 4.1 구조적 취약점

| ID | 문제 | 위험도 | 강경 조치 |
|---|---|---|---|
| STRUCT-01 | `setupBlockEvents` 내 다른 클로저(todo checkbox `b.checked`, toggle `b.open`)도 stale 가능 | 낮음 | 이벤트 핸들러에서 `findBlock(blockId)` 사용으로 항상 최신 참조 |
| STRUCT-02 | `contenteditable`에서 브라우저가 임의 HTML 생성 (font, div, p 태그) | 중간 | `collectBlocks`의 `sanitizeHTML`이 제거 (완료) |
| STRUCT-03 | `renderBlocks()` 호출 시 전체 DOM 재생성 → 포커스/스크롤 위치 손실 | 낮음 | `focusBlock` 후 `scrollIntoView` 필요 시 추가 |
| STRUCT-04 | 빠른 연속 키 입력 시 `pushUndoImmediate` 반복 호출 → 성능 | 낮음 | debounce 고려 (현재 triggerAutoSave가 500ms 타이머 사용) |

### 4.2 엣지 케이스

| ID | 시나리오 | 위험도 | 조치 |
|---|---|---|---|
| EDGE-01 | 매우 긴 단일 블록 (10000자+) → DOM 조작 느림 | 낮음 | 현재 제한 없음, 필요 시 경고 추가 |
| EDGE-02 | 한글 IME 중 Enter → `isComposing` 체크로 방지됨 | 정상 | ✅ |
| EDGE-03 | contenteditable에 `<div>` 삽입 (Chrome 기본 Enter) → sanitize가 제거 | 정상 | ✅ 수정 |
| EDGE-04 | 블록 수 1000+ → renderBlocks 느림 | 낮음 | 가상 스크롤 미구현 (향후) |
| EDGE-05 | Ctrl+A (전체 선택) 후 Enter/Delete/Backspace → 브라우저 기본 동작 | 중간 | 블록 단위가 아닌 전체 에디터 선택 시 처리 필요 |

### 4.3 향후 강화 계획 (우선순위순)

1. **STRUCT-01 해결**: `setupBlockEvents` 내 모든 `b` 참조를 `findBlock(blockId)`로 교체
   - 영향: todo checkbox, toggle arrow, column input, 이미지 caption
   - 위험: 낮음 (현재 이벤트들은 직접 DOM 수정 후 triggerAutoSave)

2. **EDGE-05 해결**: Ctrl+A 후 키 입력 처리
   - 전체 선택 감지 → 단일 빈 블록으로 교체

3. **블록 간 선택(multi-block selection)**: 현재 미구현
   - Shift+Click으로 블록 범위 선택
   - 선택된 블록 일괄 삭제/복사

4. **Undo 성능 최적화**: diff 기반 undo (현재는 전체 스냅샷)

---

## 5. 테스트 체크리스트

### 기본 입력
- [ ] 한글 입력 (초성/중성/종성 조합)
- [ ] 영문/숫자/특수문자 입력
- [ ] Ctrl+B/I/U 서식
- [ ] Ctrl+1~9 색상

### Enter/Shift+Enter
- [ ] 빈 text → 새 text
- [ ] 내용 있는 text 끝 → 새 text
- [ ] 내용 있는 text 중간 → 분할
- [ ] 빈 bullet → text 변환
- [ ] 빈 number → text 변환
- [ ] 빈 todo → text 변환
- [ ] h1 끝 → 새 text
- [ ] Shift+Enter → `<br>` 삽입 (새 블록 아님)

### Backspace
- [ ] 빈 text idx>0 → 삭제
- [ ] 빈 h1 → text 변환
- [ ] 빈 bullet → text 변환
- [ ] 내용 있는 h1 맨 앞 → text 변환
- [ ] 내용 있는 text 맨 앞 + 이전 text → 병합
- [ ] idx=0 h1 맨 앞 → text 변환

### Delete
- [ ] text 끝 + 다음 text → 병합
- [ ] text 끝 + 다음 todo → 병합
- [ ] text 끝 + 다음 image → 무동작

### 방향키
- [ ] ArrowUp 맨 앞 → 이전 텍스트 블록 (이미지 스킵)
- [ ] ArrowDown 맨 끝 → 다음 텍스트 블록 (이미지 스킵)

### Tab
- [ ] Tab → 4칸 삽입
- [ ] Shift+Tab → 4칸 제거

### Paste
- [ ] 단일 줄 → insertText
- [ ] 멀티라인 → 블록 분할 (커서 위치 반영)
- [ ] 이미지 파일 → image 블록
- [ ] 테이블 안 멀티라인 → 공백 치환

### 보안
- [ ] `<script>` 태그 입력 → sanitize 제거
- [ ] `<img onerror>` → sanitize 제거
- [ ] JavaScript: URL → sanitizeURL 차단
