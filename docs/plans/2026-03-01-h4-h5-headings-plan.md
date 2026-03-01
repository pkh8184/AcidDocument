# H4/H5 제목 확장 구현 계획

## Step 1: SLASH 메뉴 데이터 (firebase.js)
- `SLASH[0].i` 배열에 h4, h5 항목 추가

## Step 2: CSS 스타일 (main.css)
- `.block-h4 .block-content` 스타일 추가
- `.block-h5 .block-content` 스타일 추가
- `.block-toc-item.l4`, `.l5` 들여쓰기
- `.toc-nav-item.l4`, `.l5` 들여쓰기

## Step 3: 키보드 동작 (listeners.js)
- `TEXT_TYPES` 배열에 h4/h5 추가
- 빈 블록 Backspace 조건에 h4/h5 추가
- 시작점 Backspace 조건에 h4/h5 추가
- Delete키 병합 조건에 h4/h5 추가

## Step 4: TOC 로직 (blocks.js)
- `genTOC()`에 h4/h5 수집 + l4/l5 레벨 매핑
- `updateTocNav()`에 h4/h5 수집 + l4/l5 레벨 매핑

## Step 5: UI 버튼 (index.html + sidebar.js)
- 에디터 툴바에 H4/H5 버튼 추가
- 블록 컨텍스트 메뉴에 H4/H5 버튼 추가

## Step 6: PDF 내보내기 (export.js)
- PDF 인쇄 CSS에 `.block-h4`, `.block-h5` 추가

## Step 7: 빌드 + 배포 + 커밋
