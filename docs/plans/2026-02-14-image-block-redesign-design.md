# 이미지 블록 리디자인 설계

## 목표
이미지 블록의 디자인과 인터랙션을 전면 개선. 호버 기반 오버레이 UI, 드래그 리사이즈, 좌/중/우 정렬, 키보드 탐색 개선.

## 데이터 모델 변경

```javascript
// 기존
{id, type:'image', src, caption, scale}  // scale: 25|50|75|100

// 변경
{id, type:'image', src, caption, width, align}
// width: px 단위 (null이면 100%), align: 'left'|'center'|'right' (기본 'center')
```

- `scale` → `width`(px) 마이그레이션: 기존 scale 값이 있으면 렌더링 시 자동 변환
- `align` 속성 추가

## 디자인

### 호버 오버레이 UI
- 기본 상태: 이미지 + 캡션만 표시, 툴바 숨김
- 편집 모드 호버 시: 이미지 위 상단에 반투명 툴바 fade-in
  - 좌측 그룹: 정렬 버튼 [◀ 좌] [■ 중] [▶ 우]
  - 우측 그룹: [📋 복사] [⬇ 다운로드] [🗑 삭제]
- 툴바 배경: rgba(0,0,0,0.6), border-radius: 8px
- transition: opacity 0.15s

### 리사이즈 핸들
- 이미지 우측 중앙에 세로 바 핸들 (6px x 40px, 반투명)
- 호버/포커스 시에만 표시
- 마우스 드래그로 좌우 이동 → width px 변경
- 최소 100px, 최대 컨테이너 너비
- 드래그 중 너비 수치 tooltip 표시
- 드래그 완료 시 pushUndoImmediate + triggerAutoSave

### 정렬
- CSS: align=left → margin-right:auto, center → margin:0 auto, right → margin-left:auto
- 이미지 컨테이너(img 래핑 div)에 적용

### 선택/포커스 UI
- 이미지 wrap 포커스 시: 파란 테두리 2px solid var(--acc)
- 이미지 wrap 호버 시: 연한 배경 하이라이트

### 캡션 개선
- 편집 모드: `:empty::before` placeholder "이미지 캡션을 입력하세요"
- 보기 모드: 빈 캡션이면 `display:none`

## 키보드 인터랙션

| 키 | 이미지 wrap 포커스 시 | 캡션 포커스 시 |
|---|---|---|
| Enter | 캡션으로 포커스 이동 | 다음 text 블록 생성 |
| Backspace/Delete | 블록 삭제 | 빈 캡션이면 wrap으로 포커스 |
| ArrowUp | 이전 블록 포커스 | wrap으로 포커스 |
| ArrowDown | 캡션으로 포커스 | 다음 블록 포커스 |
| Escape | 선택 해제 | wrap으로 포커스 |
| Tab | 다음 블록 | 다음 블록 |

## 뷰 모드
- 호버: cursor: zoom-in
- 클릭: 이미지 뷰어 (기존 동일)
- 정렬/크기 저장값 반영
- 빈 캡션 숨김

## 하위 호환
- 기존 `scale` 속성은 렌더링 시 width로 자동 변환 (scale% × 컨테이너 너비)
- `align` 없으면 기본 'center'
