# 텍스트 드래그 선택 시 최하단 이동 버그 수정 계획

> 작성일: 2026-02-14
> 증상: 글자를 드래그해서 선택하면 에디터가 최하단으로 스크롤됨

---

## 1. 근본 원인

에디터 내 `.focus()` 호출 7곳이 `preventScroll` 옵션 없이 실행됨.
브라우저는 `focus()` 호출 시 해당 요소가 뷰포트 밖이면 자동으로 스크롤시킴.

```
사용자 드래그 선택
  ↓
mouseup 발생 (showFmtBar 호출 → 스크롤 없음)
  ↓
click 이벤트 버블링
  ↓
블록 div.click 핸들러: con.focus()  ← preventScroll 없음!
  ↓
브라우저가 focus 대상을 화면에 스크롤
  ↓
→ 최하단 이동!
```

---

## 2. 문제 코드 목록

| # | 파일 | 라인 | 코드 | 위험도 |
|---|---|---|---|---|
| 1 | listeners.js | 278 | `c.focus();showSlash(c)` | 중간 |
| 2 | listeners.js | 453 | `el.focus()` (block-content click) | **높음** |
| 3 | listeners.js | 462 | `con.focus()` (block div click) | **높음** |
| 4 | listeners.js | 470 | `cell.focus()` (table cell click) | 중간 |
| 5 | listeners.js | 494 | `el.focus()` (dblclick) | 낮음 |
| 6 | listeners.js | 537 | `mediaWrap.focus()` | 낮음 |
| 7 | toolbar.js | 96 | `c.focus()` (slash exec) | 낮음 |

**#2, #3이 핵심 원인**: 드래그 선택 후 click 이벤트가 블록에서 발생 → `focus()` → 스크롤.

---

## 3. 수정 계획

### Phase 1: 모든 focus() 호출에 preventScroll 적용

**listeners.js 6곳:**
```javascript
// 변경 전
el.focus();
con.focus();
cell.focus();
mediaWrap.focus();

// 변경 후
el.focus({preventScroll:true});
con.focus({preventScroll:true});
cell.focus({preventScroll:true});
mediaWrap.focus({preventScroll:true});
```

**toolbar.js 1곳:**
```javascript
// 변경 전
c.focus();

// 변경 후
c.focus({preventScroll:true});
```

### Phase 2: 블록 click 핸들러에 드래그 선택 가드 추가

블록 div 클릭 핸들러(라인 459)에서 텍스트 선택 중이면 focus 호출 생략:

```javascript
div.addEventListener('click',function(e){
  if(e.target.closest('.block-handle')||...)return;
  // 드래그 선택 중이면 focus 호출 안 함
  var sel=window.getSelection();
  if(sel&&!sel.isCollapsed)return;
  var con=div.querySelector('.block-content')||div.querySelector('.block-col-content');
  if(con&&state.editMode){con.focus({preventScroll:true})}
});
```

block-content 클릭 핸들러(라인 451)에도 동일 가드:

```javascript
el.addEventListener('click',function(e){
  var sel=window.getSelection();
  if(sel&&!sel.isCollapsed)return;
  if(state.editMode&&el.getAttribute('contenteditable')==='true'){
    el.focus({preventScroll:true});
  }
});
```

---

## 4. 테스트 체크리스트

### 드래그 선택
- [ ] 블록 내 텍스트 드래그 선택 → 스크롤 안 됨
- [ ] 블록 간 텍스트 드래그 선택 → 스크롤 안 됨
- [ ] 빈 영역까지 드래그 → 스크롤 안 됨
- [ ] 드래그 선택 후 서식 바 정상 표시

### 기존 기능 유지
- [ ] 블록 클릭 시 포커스 정상
- [ ] 테이블 셀 클릭 시 포커스 정상
- [ ] 슬래시 메뉴 실행 후 포커스 정상
- [ ] 이미지/파일 블록 클릭 시 포커스 정상
- [ ] 더블클릭 편집 모드 전환 정상
- [ ] 마지막 블록 아래 클릭 → 마지막 블록 포커스 (의도된 스크롤)
