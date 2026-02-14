# 이미지 블록 리디자인 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 이미지 블록의 UI/UX를 전면 개선 — 호버 오버레이 툴바, 드래그 리사이즈, 좌/중/우 정렬, 키보드 탐색

**Architecture:** 기존 이미지 블록의 `scale` 프리셋을 `width`(px) + `align`(left/center/right)으로 교체. 렌더러에서 새 HTML 구조 생성, CSS로 호버 오버레이/리사이즈 핸들 스타일링, listeners.js에서 드래그 리사이즈 + 키보드 이벤트 처리.

**Tech Stack:** Vanilla JS (ES6 modules), CSS3, contenteditable

---

## 컨텍스트

### 현재 파일 구조
- `src/editor/renderer.js:152-160` — createBlockEl image case
- `src/editor/media.js:42-46` — addImageBlock, `104` — setImageScale
- `src/editor/listeners.js:640-659` — 이미지 이벤트 (caption, mediaWrap)
- `src/styles/main.css:161-162, 265-271` — 이미지 CSS
- `src/editor/blocks.js:199` — collectBlocks image caption sync

### 현재 데이터 모델
```javascript
{id, type:'image', src:'...', caption:'', scale:100}
```

### 목표 데이터 모델
```javascript
{id, type:'image', src:'...', caption:'', width:null, align:'center'}
// width: null=100%, 숫자=px값. align: 'left'|'center'|'right'
```

---

## Task 1: CSS — 호버 오버레이 + 리사이즈 핸들 + 정렬 스타일

**Files:**
- Modify: `src/styles/main.css:161-162, 265-271`

**Context:** 기존 `.block-media-toolbar`(항상 표시)을 호버 시만 표시되는 오버레이로 변경. 리사이즈 핸들, 정렬, 캡션 placeholder 추가.

**Step 1: 기존 이미지 CSS 교체 및 새 스타일 추가**

`main.css:161-162` 기존:
```css
.block-image{margin:20px 0}.block-image img{max-width:100%;border-radius:var(--rad);display:block}
.block-image-caption{margin-top:8px;font-size:14px;color:var(--t4);text-align:center;outline:none}
```

교체:
```css
.block-image{margin:20px 0}.block-image img{max-width:100%;border-radius:var(--rad);display:block}
.block-image-caption{margin-top:8px;font-size:14px;color:var(--t4);text-align:center;outline:none;min-height:1em}
.edit-mode .block-image-caption:empty::before{content:'이미지 캡션을 입력하세요';color:var(--t5);pointer-events:none}
.view-mode .block-image-caption:empty{display:none}
```

`main.css:265-271` 기존 `.block-media-toolbar` ~ `.block-image-wrap` 교체:
```css
.block-media-toolbar{display:flex;gap:8px;justify-content:center;margin-bottom:12px;flex-wrap:wrap}
.media-toolbar-group{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:8px}
.media-btn{background:transparent;border:none;padding:6px 10px;cursor:pointer;font-size:13px;color:var(--t2);border-radius:6px;transition:all .15s}
.media-btn:hover{background:var(--bg4);color:var(--t1)}
.media-btn.active{background:var(--acc);color:#fff}
.media-btn.danger:hover{background:var(--err);color:#fff}
.block-image-wrap{position:relative;outline:none}.block-image-wrap:focus{outline:2px solid var(--acc);border-radius:var(--rad)}
```

→

```css
.block-image-wrap{position:relative;outline:none;display:inline-block}
.block-image-wrap:focus{outline:2px solid var(--acc);border-radius:var(--rad)}
.block-image-wrap:hover .img-overlay-toolbar{opacity:1}
.block-image-wrap:focus .img-overlay-toolbar{opacity:1}
.block-image-inner{position:relative;display:inline-block}
.img-overlay-toolbar{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:rgba(0,0,0,0.65);padding:4px 8px;border-radius:8px;opacity:0;transition:opacity 0.15s;z-index:10;white-space:nowrap}
.img-overlay-toolbar .media-btn{background:transparent;border:none;padding:5px 8px;cursor:pointer;font-size:13px;color:#fff;border-radius:5px;transition:all .15s}
.img-overlay-toolbar .media-btn:hover{background:rgba(255,255,255,0.2)}
.img-overlay-toolbar .media-btn.active{background:var(--acc)}
.img-overlay-toolbar .media-btn.danger:hover{background:var(--err)}
.img-resize-handle{position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:6px;height:40px;background:var(--acc);border-radius:3px;cursor:col-resize;opacity:0;transition:opacity 0.15s;z-index:11}
.block-image-wrap:hover .img-resize-handle{opacity:0.6}
.block-image-wrap:focus .img-resize-handle{opacity:0.8}
.img-resize-handle:hover{opacity:1!important}
.img-resize-tooltip{position:absolute;top:-28px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;white-space:nowrap;pointer-events:none;display:none}
.img-align-left .block-image-inner{margin-right:auto}
.img-align-center .block-image-inner{margin:0 auto}
.img-align-right .block-image-inner{margin-left:auto}
.block-media-toolbar{display:flex;gap:8px;justify-content:center;margin-bottom:12px;flex-wrap:wrap}
.media-toolbar-group{display:flex;gap:4px;background:var(--bg3);padding:4px;border-radius:8px}
.media-btn{background:transparent;border:none;padding:6px 10px;cursor:pointer;font-size:13px;color:var(--t2);border-radius:6px;transition:all .15s}
.media-btn:hover{background:var(--bg4);color:var(--t1)}
.media-btn.active{background:var(--acc);color:#fff}
.media-btn.danger:hover{background:var(--err);color:#fff}
```

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
feat: 이미지 블록 호버 오버레이/리사이즈/정렬 CSS
```

---

## Task 2: Renderer — 새 이미지 블록 HTML 구조

**Files:**
- Modify: `src/editor/renderer.js:152-160` (createBlockEl image case)

**Context:** 기존 항상 보이는 툴바를 호버 오버레이로 교체. `width`/`align` 속성 반영. 리사이즈 핸들 추가. 기존 `scale` 하위 호환.

**Step 1: createBlockEl image case 교체**

`renderer.js:152-160` 기존:
```javascript
    case'image':
      var imgScale=b.scale||100;
      inner='<div class="block-image-wrap" tabindex="0" data-block-idx="'+idx+'">';
      if(state.editMode)inner+='<div class="block-media-toolbar">...';
      inner+='<img src="..." ...>';
      inner+='<div class="block-image-caption"...>...</div>';
      inner+='</div>';
      if(state.editMode)inner+='<button class="block-add-below"...>';
      break;
```

교체:
```javascript
    case'image':
      var imgWidth=b.width;
      // 하위호환: 기존 scale 속성 변환
      if(!imgWidth&&b.scale&&b.scale!==100)imgWidth=null;
      var imgAlign=b.align||'center';
      var alignCls='img-align-'+imgAlign;
      inner='<div class="block-image-wrap '+alignCls+'" tabindex="0" data-block-idx="'+idx+'">';
      inner+='<div class="block-image-inner"'+(imgWidth?' style="width:'+imgWidth+'px"':(b.scale&&b.scale!==100?' style="width:'+b.scale+'%"':''))+'>';
      if(state.editMode){
        inner+='<div class="img-overlay-toolbar">';
        inner+='<button class="media-btn'+(imgAlign==='left'?' active':'')+'" data-action="setImageAlign" data-idx="'+idx+'" data-align="left" title="왼쪽">◀</button>';
        inner+='<button class="media-btn'+(imgAlign==='center'?' active':'')+'" data-action="setImageAlign" data-idx="'+idx+'" data-align="center" title="가운데">■</button>';
        inner+='<button class="media-btn'+(imgAlign==='right'?' active':'')+'" data-action="setImageAlign" data-idx="'+idx+'" data-align="right" title="오른쪽">▶</button>';
        inner+='<span style="width:1px;background:rgba(255,255,255,0.3);margin:0 2px"></span>';
        inner+='<button class="media-btn" data-action="copyImageUrl" data-idx="'+idx+'" title="복사">📋</button>';
        inner+='<button class="media-btn" data-action="downloadImage" data-idx="'+idx+'" title="다운로드">💾</button>';
        inner+='<button class="media-btn danger" data-action="deleteBlock" data-idx="'+idx+'" title="삭제">🗑️</button>';
        inner+='</div>';
        inner+='<div class="img-resize-handle" data-idx="'+idx+'"></div>';
        inner+='<div class="img-resize-tooltip"></div>';
      }
      inner+='<img src="'+esc(b.src||'')+'" style="width:100%;border-radius:var(--rad);display:block;cursor:'+(state.editMode?'default':'zoom-in')+'" onerror="this.style.display=\'none\'"'+(state.editMode?'':' onclick="openImageViewer([\''+esc(b.src||'')+'\'],0)"')+'>';
      inner+='</div>';
      inner+='<div class="block-image-caption"'+ce+'>'+sanitizeHTML(b.caption||'')+'</div>';
      inner+='</div>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
```

핵심 변경:
- `block-image-inner` div가 이미지를 래핑 (width 적용 대상)
- 오버레이 툴바 (`img-overlay-toolbar`)가 `block-image-inner` 안에 position:absolute
- 리사이즈 핸들 (`img-resize-handle`)
- `img` 태그 `style="width:100%"` (inner div의 width를 따름)
- 정렬 클래스 `img-align-{left|center|right}` on wrap

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
feat: 이미지 블록 호버 오버레이 HTML 구조
```

---

## Task 3: Event Delegation — 정렬 액션 핸들러

**Files:**
- Modify: `src/editor/listeners.js:730-758` (Editor event delegation click)
- Modify: `src/editor/media.js:104` (setImageScale → setImageAlign 추가)

**Context:** 기존 `setImageScale` 액션 외에 `setImageAlign` 액션 추가.

**Step 1: listeners.js event delegation에 setImageAlign 추가**

`listeners.js` Editor event delegation (click) switch문 (`case'setImageScale':` 라인 근처)에 추가:
```javascript
      case'setImageAlign':import('../editor/media.js').then(function(m){m.setImageAlign(idx,target.dataset.align)});break;
```

**Step 2: media.js에 setImageAlign 함수 추가**

`media.js:104` (setImageScale 뒤)에 추가:
```javascript
export function setImageAlign(idx,align){pushUndoImmediate();state.page.blocks[idx].align=align;renderBlocks();triggerAutoSave();toast(align==='left'?'왼쪽 정렬':align==='right'?'오른쪽 정렬':'가운데 정렬')}
```

**Step 3: 빌드 & 확인**

Run: `npm run build`

**Step 4: 커밋**

```
feat: 이미지 정렬(좌/중/우) 기능
```

---

## Task 4: 드래그 리사이즈 핸들러

**Files:**
- Modify: `src/editor/listeners.js:640-659` (setupBlockEvents 이미지 영역)

**Context:** `.img-resize-handle`에 mousedown → mousemove → mouseup 드래그 로직. 드래그 중 tooltip에 너비 표시. 완료 시 state에 width 저장.

**Step 1: setupBlockEvents에 리사이즈 핸들러 추가**

`listeners.js` setupBlockEvents 함수에서 기존 mediaWrap 이벤트 섹션 (`var mediaWrap=div.querySelector('.block-image-wrap,.block-file-wrap');` 라인 근처) 앞에 이미지 리사이즈 핸들 이벤트 추가:

```javascript
  // 이미지 리사이즈 핸들
  var resizeHandle=div.querySelector('.img-resize-handle');
  if(resizeHandle){(function(blockIdx){
    resizeHandle.addEventListener('mousedown',function(e){
      e.preventDefault();
      e.stopPropagation();
      var imgInner=div.querySelector('.block-image-inner');
      if(!imgInner)return;
      var startX=e.clientX;
      var startW=imgInner.offsetWidth;
      var tooltip=div.querySelector('.img-resize-tooltip');
      var editorEl=$('editor');
      var maxW=editorEl.offsetWidth-80;
      if(tooltip)tooltip.style.display='block';
      function onMove(ev){
        var diff=ev.clientX-startX;
        var newW=Math.max(100,Math.min(maxW,startW+diff));
        imgInner.style.width=newW+'px';
        if(tooltip)tooltip.textContent=Math.round(newW)+'px';
      }
      function onUp(){
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        if(tooltip)tooltip.style.display='none';
        var finalW=imgInner.offsetWidth;
        pushUndoImmediate();
        state.page.blocks[blockIdx].width=finalW;
        delete state.page.blocks[blockIdx].scale;
        triggerAutoSave();
      }
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  })(idx)}
```

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
feat: 이미지 드래그 리사이즈 기능
```

---

## Task 5: 키보드 인터랙션 개선

**Files:**
- Modify: `src/editor/listeners.js:640-659` (setupBlockEvents 이미지 영역)

**Context:** 이미지 wrap/캡션의 키보드 동작 개선 — Enter, ArrowUp/Down, Escape, Backspace.

**Step 1: mediaWrap keydown 핸들러 확장**

기존 `listeners.js` setupBlockEvents의 mediaWrap keydown:
```javascript
    mediaWrap.addEventListener('keydown',function(e){
      if(!state.editMode)return;
      if(e.key==='Backspace'||e.key==='Delete'){
        e.preventDefault();
        deleteBlock(idx);
      }
    });
```

교체:
```javascript
    mediaWrap.addEventListener('keydown',function(e){
      if(!state.editMode)return;
      if(e.key==='Backspace'||e.key==='Delete'){
        e.preventDefault();
        deleteBlock(idx);
        return;
      }
      if(e.key==='Enter'){
        e.preventDefault();
        // 캡션으로 포커스 이동
        var cap=div.querySelector('.block-image-caption');
        if(cap){cap.focus({preventScroll:true})}
        return;
      }
      if(e.key==='ArrowUp'){
        e.preventDefault();
        if(idx>0)focusBlock(idx-1,-1);
        return;
      }
      if(e.key==='ArrowDown'){
        e.preventDefault();
        var cap=div.querySelector('.block-image-caption');
        if(cap){cap.focus({preventScroll:true})}
        return;
      }
      if(e.key==='Escape'){
        mediaWrap.blur();
        return;
      }
      if(e.key==='Tab'){
        e.preventDefault();
        if(idx<state.page.blocks.length-1)focusBlock(idx+1,0);
        return;
      }
    });
```

**Step 2: 캡션 keydown 핸들러 추가**

기존 caption 이벤트 섹션 (`var caption=div.querySelector('.block-image-caption');` 라인) 뒤에 keydown 추가:

```javascript
    if(caption){
      caption.addEventListener('keydown',function(e){
        if(!state.editMode)return;
        if(e.key==='Enter'&&!e.shiftKey){
          e.preventDefault();
          // 다음 text 블록 생성
          var newB={id:genId(),type:'text',content:''};
          pushUndoImmediate();
          state.page.blocks.splice(idx+1,0,newB);
          renderBlocks();
          focusBlock(idx+1,0);
          return;
        }
        if(e.key==='Backspace'&&(caption.textContent===''||caption.innerHTML==='<br>')){
          e.preventDefault();
          var mw=div.querySelector('.block-image-wrap');
          if(mw)mw.focus({preventScroll:true});
          return;
        }
        if(e.key==='ArrowUp'&&isAtStart(caption)){
          e.preventDefault();
          var mw=div.querySelector('.block-image-wrap');
          if(mw)mw.focus({preventScroll:true});
          return;
        }
        if(e.key==='ArrowDown'&&isAtEnd(caption)){
          e.preventDefault();
          if(idx<state.page.blocks.length-1)focusBlock(idx+1,0);
          return;
        }
        if(e.key==='Escape'){
          e.preventDefault();
          var mw=div.querySelector('.block-image-wrap');
          if(mw)mw.focus({preventScroll:true});
          return;
        }
      });
    }
```

주의: `isAtStart`, `isAtEnd`는 listeners.js 상단에 이미 정의되어 있고 setupBlockEvents에서 접근 가능.

**Step 3: import에 genId 추가 확인**

`listeners.js` import 확인 — `genId`는 이미 `import {$,$$,genId,toast,esc} from '../utils/helpers.js'`에 있음.

**Step 4: 빌드 & 확인**

Run: `npm run build`

**Step 5: 커밋**

```
feat: 이미지 블록 키보드 인터랙션 (Enter/Arrow/Escape/Tab)
```

---

## Task 6: collectBlocks width/align 동기화 + setImageScale 하위호환

**Files:**
- Modify: `src/editor/blocks.js:199` (collectBlocks image 처리)
- Modify: `src/editor/media.js:104` (setImageScale 유지)

**Context:** collectBlocks에서 width/align이 이미 state에 있으므로 추가 DOM 동기화 불필요 (caption만 sync). setImageScale은 하위호환을 위해 유지하되 내부적으로 width로도 변환.

**Step 1: media.js의 setImageScale 수정**

기존:
```javascript
export function setImageScale(idx,scale){pushUndoImmediate();state.page.blocks[idx].scale=scale;renderBlocks();triggerAutoSave();toast(scale+'% 크기')}
```

교체 (이전 데이터와 호환):
```javascript
export function setImageScale(idx,scale){pushUndoImmediate();state.page.blocks[idx].scale=scale;delete state.page.blocks[idx].width;renderBlocks();triggerAutoSave();toast(scale+'% 크기')}
```

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
fix: setImageScale 하위호환 — width 속성 정리
```

---

## Task 7: 최종 통합 테스트

**Files:** 전체

**수동 테스트 체크리스트:**

### 디자인
- [ ] 이미지 블록 기본 상태: 툴바 숨김
- [ ] 호버 시: 오버레이 툴바 fade-in (정렬 3버튼 + 복사/다운로드/삭제)
- [ ] 포커스 시: 파란 테두리 + 오버레이 + 리사이즈 핸들
- [ ] 보기 모드: 빈 캡션 숨김, 호버 cursor:zoom-in
- [ ] 편집 모드: 빈 캡션 placeholder "이미지 캡션을 입력하세요"

### 정렬
- [ ] 왼쪽 정렬 클릭 → 이미지 좌측
- [ ] 가운데 정렬 클릭 → 이미지 중앙
- [ ] 오른쪽 정렬 클릭 → 이미지 우측
- [ ] 활성 정렬 버튼 하이라이트

### 리사이즈
- [ ] 우측 핸들 드래그 → 너비 변경
- [ ] 드래그 중 tooltip에 px 표시
- [ ] 최소 100px 제한
- [ ] 최대 컨테이너 너비 제한
- [ ] 드래그 완료 후 Ctrl+Z → 복원

### 키보드
- [ ] 이미지 wrap에서 Enter → 캡션 포커스
- [ ] 이미지 wrap에서 ArrowDown → 캡션 포커스
- [ ] 이미지 wrap에서 ArrowUp → 이전 블록
- [ ] 이미지 wrap에서 Backspace → 블록 삭제
- [ ] 캡션에서 Enter → 다음 text 블록 생성
- [ ] 빈 캡션에서 Backspace → wrap 포커스
- [ ] 캡션에서 ArrowUp (맨 앞) → wrap 포커스
- [ ] 캡션에서 ArrowDown (맨 끝) → 다음 블록
- [ ] 캡션에서 Escape → wrap 포커스

### 하위 호환
- [ ] 기존 scale:50 이미지 → 올바르게 50% 너비로 표시
- [ ] 기존 scale 없는 이미지 → 100% 표시

**커밋:**

```
test: 이미지 블록 리디자인 통합 테스트 완료
```
