# 글머리 기호/번호 목록 전체 개선 설계

> 작성일: 2026-02-14
> 방식: 방식 A — indent 속성 추가 (플랫 블록 구조 유지)

---

## 1. 데이터 모델

기존 블록에 `indent`(0~4)와 `collapsed`(boolean) 속성 추가:

```javascript
{id:'a', type:'bullet', content:'상위 항목', indent:0, collapsed:false}
{id:'b', type:'bullet', content:'하위 항목 1', indent:1}
{id:'c', type:'number', content:'더 깊은 항목', indent:2}
{id:'d', type:'bullet', content:'하위 항목 2', indent:1}
{id:'e', type:'text', content:'일반 텍스트'}  // indent 없음 = 0
```

- `indent`: 0~4 (5단계), 미설정 시 0 취급
- `collapsed`: true일 때 하위 항목 숨김
- 기존 데이터 마이그레이션 불필요

---

## 2. 렌더링

### 들여쓰기 (indent별 padding-left)

| indent | edit mode | view mode |
|--------|-----------|-----------|
| 0 | 58px (현재) | 24px (현재) |
| 1 | 82px (+24) | 48px (+24) |
| 2 | 106px (+24) | 72px (+24) |
| 3 | 130px (+24) | 96px (+24) |
| 4 | 154px (+24) | 120px (+24) |

### 불릿 마커 변화

| indent | 마커 |
|--------|------|
| 0 | • (채워진 원) |
| 1 | ◦ (빈 원) |
| 2 | ▪ (채워진 사각) |
| 3 | ◦ (빈 원) |
| 4 | • (채워진 원, 순환) |

### 번호 마커 변화

| indent | 형식 |
|--------|------|
| 0 | 1. 2. 3. |
| 1 | a. b. c. |
| 2 | i. ii. iii. |
| 3 | A. B. C. |
| 4 | I. II. III. |

### 접기/펼치기

- 하위 항목이 있는 블록: 마커 왼쪽에 ▶/▼ 토글 화살표
- collapsed 시 하위 블록에 `display:none`
- 접힌 상태: 블록 하단에 점선 표시

### 번호 매기기 규칙

- 같은 indent + 같은 type(number)인 연속 블록끼리 번호 부여
- 중간에 다른 타입 블록 → 번호 리셋
- indent가 다르면 별도 그룹

---

## 3. 키보드 인터랙션

### Enter

| 조건 | 결과 |
|------|------|
| 내용 있는 리스트 항목 | 같은 type + 같은 indent로 새 항목, 커서 뒤 내용 이동 |
| 빈 리스트 (indent > 0) | indent 1단계 감소 (아웃덴트) |
| 빈 리스트 (indent === 0) | text 블록으로 변환 |

### Tab / Shift+Tab

| 조건 | 결과 |
|------|------|
| Tab + 리스트 (indent < 4) | indent +1 |
| Tab + 리스트 (indent === 4) | 무시 |
| Tab + 비리스트 | 스페이스 4칸 (현재 동작) |
| Shift+Tab + 리스트 (indent > 0) | indent -1 |
| Shift+Tab + 리스트 (indent === 0) | 무시 |
| Shift+Tab + 비리스트 | 스페이스 제거 (현재 동작) |

### Backspace

| 조건 | 결과 |
|------|------|
| 빈 리스트 (indent > 0) | indent -1 |
| 빈 리스트 (indent === 0) | text로 변환 |
| 커서 맨 앞 (indent > 0) | indent -1 |
| 커서 맨 앞 (indent === 0) | text로 변환 |

### Delete

| 조건 | 결과 |
|------|------|
| 커서 맨 끝 | 다음 블록과 병합 (현재 블록 indent 유지) |

### ArrowUp/Down

| 조건 | 결과 |
|------|------|
| collapsed 블록 아래 이동 | 숨겨진 하위 항목 건너뛰기 |

### Shift+Enter

변경 없음 — `<br>` 줄바꿈

---

## 4. 자동 변환

`input` 이벤트에서 블록 시작 패턴 감지 (IME 조합 중 제외):

| 패턴 | 변환 |
|------|------|
| `- ` 또는 `* ` | bullet |
| `1. ` 또는 `1) ` | number (num=1) |
| `[] ` 또는 `[ ] ` | todo (unchecked) |
| `[x] ` | todo (checked) |
| `> ` | quote |

- 패턴 텍스트 제거 후 변환
- pushUndoImmediate 호출
- 리스트 블록이 아닌 text 블록에서만 동작

---

## 5. 접기/펼치기

### 하위 항목 판별

```
getChildren(idx):
  myIndent = blocks[idx].indent || 0
  children = []
  for j = idx+1 to blocks.length-1:
    if blocks[j].indent > myIndent: children.push(j)
    else: break
  return children
```

### 토글 동작

- 화살표 클릭 → collapsed 토글 → renderBlocks
- 접힌 상태에서 Enter → 새 항목은 하위 항목들 뒤에 삽입
- 접힌 블록 삭제 시 하위 항목도 함께 삭제

---

## 6. 드래그/선택 대응

| 상황 | 처리 |
|------|------|
| 리스트 항목 드래그 이동 | indent 값 유지 |
| collapsed 블록 드래그 | 하위 항목도 함께 이동 |
| 텍스트 드래그 선택 | 현재와 동일 (preventScroll 적용) |
| 멀티라인 붙여넣기 | 현재 블록 indent 유지 |

---

## 7. 수정 파일

| 파일 | 변경 |
|------|------|
| renderer.js | indent CSS, 마커 변화, collapsed 렌더링, 접기 화살표 |
| listeners.js | Tab/Shift+Tab 인덴트, Enter 아웃덴트, Backspace 아웃덴트, 자동 변환, ArrowUp/Down 스킵, 접기 토글 |
| blocks.js | updateNums indent-aware, getChildren 헬퍼, focusBlock 스킵 |
| main.css | indent 0~4 스타일, 마커 변형, 접기 화살표, 접힌 표시 |
| toolbar.js | execSlash에서 indent 초기화 |
