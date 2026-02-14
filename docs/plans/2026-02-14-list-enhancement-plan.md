# 글머리 기호/번호 목록 전체 개선 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 글머리 기호/번호 목록에 5단계 중첩, 자동 변환, 접기/펼치기 기능 추가

**Architecture:** 기존 플랫 블록 배열 유지. 각 블록에 `indent`(0~4)와 `collapsed`(boolean) 속성 추가. CSS에서 indent별 들여쓰기/마커 변화. 번호 매기기를 indent-aware로 수정. 접기/펼치기는 렌더링 시 하위 항목 display:none.

**Tech Stack:** Vanilla JS (ES6 modules), CSS3, contenteditable

---

## 컨텍스트

### 현재 파일 구조
- `src/editor/renderer.js` — createBlockEl에서 블록 HTML 생성
- `src/editor/blocks.js` — insertBlock, deleteBlock, updateNums, focusBlock, collectBlocks
- `src/editor/listeners.js` — handleKey (Enter/Backspace/Tab/Arrow), setupBlockEvents
- `src/ui/toolbar.js` — execSlash (슬래시 메뉴 실행)
- `src/styles/main.css` — 블록 스타일
- `src/data/store.js` — 전역 state

### 현재 데이터 모델
```javascript
{id:'abc', type:'bullet', content:'항목 내용'}          // bullet
{id:'def', type:'number', content:'항목 내용', num:1}    // number
{id:'ghi', type:'todo', content:'할일', checked:false}   // todo
```

### 목표 데이터 모델
```javascript
{id:'abc', type:'bullet', content:'상위', indent:0, collapsed:false}
{id:'def', type:'bullet', content:'하위', indent:1}
{id:'ghi', type:'number', content:'깊은', indent:2}
```

---

## Task 1: CSS indent 스타일 추가

**Files:**
- Modify: `src/styles/main.css:81-89`

**Context:** 현재 `.block-bullet`과 `.block-number`는 고정 padding-left(58px). indent 레벨별 추가 패딩과 마커 변화 필요.

**Step 1: indent 레벨별 들여쓰기 CSS 추가**

`main.css` 81번줄 `.block-bullet{...}` 뒤에 다음 추가:

```css
/* 리스트 indent 레벨 (edit mode) */
.block-bullet[data-indent="1"],.block-number[data-indent="1"],.block-todo[data-indent="1"]{padding-left:82px}
.block-bullet[data-indent="2"],.block-number[data-indent="2"],.block-todo[data-indent="2"]{padding-left:106px}
.block-bullet[data-indent="3"],.block-number[data-indent="3"],.block-todo[data-indent="3"]{padding-left:130px}
.block-bullet[data-indent="4"],.block-number[data-indent="4"],.block-todo[data-indent="4"]{padding-left:154px}
/* indent별 불릿 마커 변화 */
.block-bullet[data-indent="1"]::before{content:'◦';left:66px}
.block-bullet[data-indent="2"]::before{content:'▪';left:90px;font-size:14px}
.block-bullet[data-indent="3"]::before{content:'◦';left:114px}
.block-bullet[data-indent="4"]::before{content:'•';left:138px}
/* indent별 번호 마커 위치 */
.block-number[data-indent="1"]::before{left:64px}
.block-number[data-indent="2"]::before{left:88px}
.block-number[data-indent="3"]::before{left:112px}
.block-number[data-indent="4"]::before{left:136px}
/* indent별 todo 위치 */
.block-todo[data-indent="1"]{padding-left:64px}
.block-todo[data-indent="2"]{padding-left:88px}
.block-todo[data-indent="3"]{padding-left:112px}
.block-todo[data-indent="4"]{padding-left:136px}
/* view mode indent */
.view-mode .block-bullet[data-indent="1"],.view-mode .block-number[data-indent="1"],.view-mode .block-todo[data-indent="1"]{padding-left:48px}
.view-mode .block-bullet[data-indent="2"],.view-mode .block-number[data-indent="2"],.view-mode .block-todo[data-indent="2"]{padding-left:72px}
.view-mode .block-bullet[data-indent="3"],.view-mode .block-number[data-indent="3"],.view-mode .block-todo[data-indent="3"]{padding-left:96px}
.view-mode .block-bullet[data-indent="4"],.view-mode .block-number[data-indent="4"],.view-mode .block-todo[data-indent="4"]{padding-left:120px}
.view-mode .block-bullet[data-indent="1"]::before{left:30px}
.view-mode .block-bullet[data-indent="2"]::before{left:54px}
.view-mode .block-bullet[data-indent="3"]::before{left:78px}
.view-mode .block-bullet[data-indent="4"]::before{left:102px}
.view-mode .block-number[data-indent="1"]::before{left:28px}
.view-mode .block-number[data-indent="2"]::before{left:52px}
.view-mode .block-number[data-indent="3"]::before{left:76px}
.view-mode .block-number[data-indent="4"]::before{left:100px}
```

**Step 2: 접기/펼치기 화살표 + 접힌 표시 CSS 추가**

```css
/* 리스트 접기/펼치기 화살표 */
.list-collapse-arrow{position:absolute;left:28px;top:6px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--t4);cursor:pointer;border-radius:3px;transition:transform .15s;z-index:1}
.list-collapse-arrow:hover{background:var(--bg3);color:var(--t1)}
.list-collapse-arrow.open{transform:rotate(90deg)}
/* indent별 화살표 위치 */
.block[data-indent="1"] .list-collapse-arrow{left:52px}
.block[data-indent="2"] .list-collapse-arrow{left:76px}
.block[data-indent="3"] .list-collapse-arrow{left:100px}
.block[data-indent="4"] .list-collapse-arrow{left:124px}
/* 접힌 블록 하단 표시 */
.block.collapsed-parent::after{content:'';display:block;border-bottom:2px dashed var(--bdr);margin-top:2px;opacity:0.5}
/* 접힌 하위 항목 숨김 */
.block.collapsed-child{display:none}
/* view mode 화살표 위치 조정 */
.view-mode .list-collapse-arrow{left:-4px}
.view-mode .block[data-indent="1"] .list-collapse-arrow{left:20px}
.view-mode .block[data-indent="2"] .list-collapse-arrow{left:44px}
.view-mode .block[data-indent="3"] .list-collapse-arrow{left:68px}
.view-mode .block[data-indent="4"] .list-collapse-arrow{left:92px}
```

**Step 3: 빌드 & 확인**

Run: `npm run build`

**Step 4: 커밋**

```
feat: 리스트 indent 0~4 CSS 스타일 추가
```

---

## Task 2: Renderer indent/collapsed 지원

**Files:**
- Modify: `src/editor/renderer.js:62-234` (createBlockEl 함수)

**Context:** createBlockEl에서 블록의 indent 속성을 data-indent로 반영하고, collapsed 상태에서 하위 블록 숨김 처리. 하위 항목이 있는 블록에 접기 화살표 추가.

**Step 1: createBlockEl에 data-indent 속성 추가**

`renderer.js:66` 뒤에 indent 설정 추가:

```javascript
// renderer.js createBlockEl 시작부 (line 66 뒤)
var indent=b.indent||0;
if(indent>0)div.setAttribute('data-indent',indent);
```

**Step 2: bullet/number 케이스에 번호 형식 변화 적용**

`renderer.js` number 케이스 (line 213-215) 수정:

```javascript
case'number':
  // indent별 번호 형식 (1. / a. / i. / A. / I.)
  div.setAttribute('data-num',b.num||1);
  div.setAttribute('data-num-style',indent%5);
  inner='<div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div>';
  break;
```

**Step 3: renderBlocks에서 collapsed 처리 + 접기 화살표 추가**

`renderer.js:14` renderBlocks 함수 수정:

```javascript
export function renderBlocks(){
  var ed=$('editor');
  ed.innerHTML='';
  blockElements.clear();
  ed.className='editor '+(state.editMode?'edit-mode':'view-mode');
  // 하위 항목이 있는 블록 인덱스 미리 계산
  var hasChildren=getListParents(state.page.blocks);
  // collapsed 부모의 하위 항목 인덱스 계산
  var hiddenSet=getCollapsedChildren(state.page.blocks);
  for(var i=0;i<state.page.blocks.length;i++){
    var el=createBlockEl(state.page.blocks[i],i);
    // 하위 항목이 있으면 접기 화살표 추가
    if(hasChildren[i]){
      var isCollapsed=state.page.blocks[i].collapsed;
      addCollapseArrow(el,state.page.blocks[i],isCollapsed);
      if(isCollapsed)el.classList.add('collapsed-parent');
    }
    // collapsed 하위 항목 숨김
    if(hiddenSet.has(i))el.classList.add('collapsed-child');
    ed.appendChild(el);
    blockElements.set(state.page.blocks[i].id,el);
  }
  updateNums();setupSlideAutoPlay()
}
```

**Step 4: 헬퍼 함수 추가 (renderBlocks 위)**

```javascript
// 리스트 부모 판별: 하위 항목(indent 더 큰 연속 블록)이 있는 인덱스
function getListParents(blocks){
  var result={};
  var LIST_TYPES=['bullet','number','todo'];
  for(var i=0;i<blocks.length;i++){
    if(LIST_TYPES.indexOf(blocks[i].type)===-1)continue;
    var myIndent=blocks[i].indent||0;
    if(i+1<blocks.length&&(blocks[i+1].indent||0)>myIndent){
      result[i]=true;
    }
  }
  return result;
}

// collapsed 부모의 하위 항목 인덱스 Set
function getCollapsedChildren(blocks){
  var hidden=new Set();
  for(var i=0;i<blocks.length;i++){
    if(!blocks[i].collapsed)continue;
    var myIndent=blocks[i].indent||0;
    for(var j=i+1;j<blocks.length;j++){
      if((blocks[j].indent||0)>myIndent)hidden.add(j);
      else break;
    }
  }
  return hidden;
}

// 접기 화살표 DOM 추가
function addCollapseArrow(div,block,isCollapsed){
  var arrow=document.createElement('span');
  arrow.className='list-collapse-arrow'+(isCollapsed?'':' open');
  arrow.textContent='▶';
  arrow.setAttribute('data-collapse-id',block.id);
  // block-content 앞에 삽입
  var content=div.querySelector('.block-content');
  if(content)content.parentNode.insertBefore(arrow,content);
  else div.insertBefore(arrow,div.firstChild);
}
```

**Step 5: number 블록 CSS에서 indent별 번호 형식 표현**

`main.css`에 추가:

```css
/* indent별 번호 형식 */
.block-number[data-num-style="1"]::before{content:attr(data-num-alpha)'.'}
.block-number[data-num-style="2"]::before{content:attr(data-num-roman)'.'}
.block-number[data-num-style="3"]::before{content:attr(data-num-alpha-upper)'.'}
.block-number[data-num-style="4"]::before{content:attr(data-num-roman-upper)'.'}
```

> 주의: CSS attr()으로는 알파벳/로마 숫자 변환이 안 됨. updateNums에서 변환된 문자열을 data-num 속성에 직접 넣는 방식으로 처리.

**Step 6: 빌드 & 확인**

Run: `npm run build`

**Step 7: 커밋**

```
feat: 렌더러에 indent/collapsed 지원 추가
```

---

## Task 3: updateNums를 indent-aware로 수정 + getChildren 헬퍼

**Files:**
- Modify: `src/editor/blocks.js:199` (updateNums)
- Modify: `src/editor/blocks.js` (getChildren 헬퍼 추가)

**Context:** 현재 updateNums는 모든 number 블록을 일렬로 번호 매김. indent별로 별도 그룹 번호 필요.

**Step 1: getChildren 헬퍼 함수 추가**

`blocks.js` export 함수로 추가 (findBlockIndex 뒤):

```javascript
// 블록 idx의 하위 항목 인덱스 배열 반환
export function getChildren(idx){
  if(!state.page||!state.page.blocks)return[];
  var myIndent=state.page.blocks[idx].indent||0;
  var children=[];
  for(var j=idx+1;j<state.page.blocks.length;j++){
    if((state.page.blocks[j].indent||0)>myIndent)children.push(j);
    else break;
  }
  return children;
}

// 숫자 → 알파벳 변환 (1→a, 2→b, ..., 26→z, 27→aa)
function numToAlpha(n,upper){
  var s='';
  while(n>0){n--;s=String.fromCharCode((upper?65:97)+(n%26))+s;n=Math.floor(n/26)}
  return s;
}
// 숫자 → 로마 숫자 변환
function numToRoman(n,upper){
  var vals=[1000,900,500,400,100,90,50,40,10,9,5,4,1];
  var syms=upper?['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I']:['m','cm','d','cd','c','xc','l','xl','x','ix','v','iv','i'];
  var s='';
  for(var i=0;i<vals.length;i++){while(n>=vals[i]){s+=syms[i];n-=vals[i]}}
  return s;
}
```

**Step 2: updateNums를 indent-aware로 교체**

`blocks.js:199` 전체 교체:

```javascript
export function updateNums(){
  var chs=$('editor').children;
  // indent 레벨별 카운터 스택
  var counters=[0,0,0,0,0];
  var prevIndent=-1;
  var prevType='';
  for(var i=0;i<chs.length;i++){
    var el=chs[i];
    var indent=parseInt(el.getAttribute('data-indent'))||0;
    if(el.classList.contains('block-number')){
      // 이전과 indent가 다르거나 이전이 number가 아니면 리셋
      if(indent!==prevIndent||prevType!=='number'){
        counters[indent]=0;
        // 더 깊은 레벨도 리셋
        for(var r=indent+1;r<5;r++)counters[r]=0;
      }
      counters[indent]++;
      var n=counters[indent];
      var numStr;
      switch(indent%5){
        case 0:numStr=String(n);break;
        case 1:numStr=numToAlpha(n,false);break;
        case 2:numStr=numToRoman(n,false);break;
        case 3:numStr=numToAlpha(n,true);break;
        case 4:numStr=numToRoman(n,true);break;
      }
      el.setAttribute('data-num',numStr);
      prevType='number';
      prevIndent=indent;
    }else if(el.classList.contains('block-bullet')||el.classList.contains('block-todo')){
      prevType=el.classList.contains('block-bullet')?'bullet':'todo';
      prevIndent=indent;
      // bullet/todo에서는 더 깊은 number 카운터만 리셋
      for(var r=indent+1;r<5;r++)counters[r]=0;
    }else{
      // 비리스트 블록: 모든 카운터 리셋
      for(var r=0;r<5;r++)counters[r]=0;
      prevType='';
      prevIndent=-1;
    }
  }
}
```

**Step 3: numToAlpha, numToRoman을 blocks.js 상단에 배치**

`blocks.js` import 구문 아래, export 함수들 위에 배치.

**Step 4: collectBlocks에서 indent/collapsed 보존 확인**

`blocks.js:152-197` collectBlocks 확인 — 이미 `JSON.parse(JSON.stringify(orig))`로 전체 복사하므로 indent/collapsed는 자동 보존됨. 변경 불필요.

**Step 5: getChildren을 export하고 renderer.js에서 import**

`renderer.js` import에 `getChildren` 추가.

**Step 6: 빌드 & 확인**

Run: `npm run build`

**Step 7: 커밋**

```
feat: indent-aware 번호 매기기 + getChildren 헬퍼
```

---

## Task 4: Tab/Shift+Tab 리스트 인덴트

**Files:**
- Modify: `src/editor/listeners.js:285-319` (Tab 핸들러)

**Context:** 현재 Tab은 무조건 스페이스 4칸 삽입. 리스트 블록(bullet/number/todo)에서는 indent 증감으로 변경.

**Step 1: Tab 핸들러를 리스트 인덴트로 수정**

`listeners.js:285-319` 전체 교체:

```javascript
  // Tab 들여쓰기 / Shift+Tab 내어쓰기
  if(e.key==='Tab'){
    e.preventDefault();
    var LIST_TYPES=['bullet','number','todo'];
    if(LIST_TYPES.indexOf(b.type)!==-1){
      // 리스트 블록: indent 변경
      var curIndent=b.indent||0;
      if(e.shiftKey){
        // 아웃덴트
        if(curIndent>0){
          pushUndoImmediate();
          state.page.blocks[idx].indent=curIndent-1;
          renderBlocks();
          updateNums();
          focusBlock(idx,-1);
        }
      }else{
        // 인덴트 (최대 4, 그리고 이전 블록보다 1 이상 깊어질 수 없음)
        var maxIndent=4;
        if(idx>0){
          var prevIndent=state.page.blocks[idx-1].indent||0;
          maxIndent=Math.min(4,prevIndent+1);
        }
        if(curIndent<maxIndent){
          pushUndoImmediate();
          state.page.blocks[idx].indent=curIndent+1;
          renderBlocks();
          updateNums();
          focusBlock(idx,-1);
        }
      }
    }else{
      // 비리스트 블록: 기존 스페이스 삽입/제거
      if(e.shiftKey){
        var tSel=window.getSelection();
        if(tSel.rangeCount>0){
          var tRange=tSel.getRangeAt(0);
          var tNode=tRange.startContainer;
          if(tNode.nodeType===3){
            var tText=tNode.textContent;
            var tOff=tRange.startOffset;
            if(tOff>=4&&tText.substring(tOff-4,tOff)==='    '){
              tNode.textContent=tText.substring(0,tOff-4)+tText.substring(tOff);
              var nRange=document.createRange();
              nRange.setStart(tNode,tOff-4);
              nRange.collapse(true);
              tSel.removeAllRanges();
              tSel.addRange(nRange);
            }else if(tText.substring(0,4)==='    '){
              tNode.textContent=tText.substring(4);
              var nRange=document.createRange();
              nRange.setStart(tNode,Math.max(0,tOff-4));
              nRange.collapse(true);
              tSel.removeAllRanges();
              tSel.addRange(nRange);
            }
          }
        }
      }else{
        document.execCommand('insertText',false,'    ');
      }
    }
    triggerAutoSave();
    return;
  }
```

**Step 2: 빌드 & 수동 테스트**

- bullet 블록에서 Tab → indent 증가 확인
- Shift+Tab → indent 감소 확인
- indent 0에서 Shift+Tab → 무반응 확인
- indent 4에서 Tab → 무반응 확인
- 비리스트 블록에서 Tab → 스페이스 4칸 확인

Run: `npm run build`

**Step 3: 커밋**

```
feat: Tab/Shift+Tab 리스트 인덴트/아웃덴트
```

---

## Task 5: Enter 키 빈 리스트 아웃덴트

**Files:**
- Modify: `src/editor/listeners.js:100-111` (Enter 핸들러의 빈 리스트 탈출 로직)

**Context:** 현재 빈 리스트 항목에서 Enter → 무조건 text로 변환. indent > 0이면 먼저 아웃덴트해야 함.

**Step 1: ENT-04 로직 수정**

`listeners.js` 기존 ENT-04 (lines 101-111) 교체:

```javascript
    // ENT-04: 빈 리스트 아이템에서 Enter
    if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&(el.textContent===''||el.innerHTML==='<br>')){
      e.preventDefault();
      var curIndent=b.indent||0;
      if(curIndent>0){
        // indent > 0: 아웃덴트 (indent 감소)
        pushUndoImmediate();
        state.page.blocks[idx].indent=curIndent-1;
        renderBlocks();
        updateNums();
        focusBlock(idx,0);
      }else{
        // indent 0: text로 변환 (기존 동작)
        pushUndoImmediate();
        state.page.blocks[idx].type='text';
        state.page.blocks[idx].content='';
        delete state.page.blocks[idx].indent;
        delete state.page.blocks[idx].collapsed;
        if(b.type==='todo')delete state.page.blocks[idx].checked;
        renderBlocks();
        updateNums();
        focusBlock(idx,0);
      }
      return;
    }
```

**Step 2: Enter로 새 리스트 항목 생성 시 indent 유지**

`listeners.js` 새 블록 생성부 (lines 136-141 근처) 수정 — newB에 indent 복사:

```javascript
    var newB={id:genId(),type:newType,content:afterHTML};
    if(newType==='todo')newB.checked=false;
    if(newType==='number')newB.num=(b.num||1)+1;
    // 리스트 타입이면 indent 유지
    if(['bullet','number','todo'].indexOf(newType)!==-1){
      newB.indent=b.indent||0;
    }
    insertBlock(idx+1,newB);
    updateNums();
```

**Step 3: 빌드 & 확인**

Run: `npm run build`

**Step 4: 커밋**

```
feat: Enter 빈 리스트 아웃덴트 + 새 항목 indent 유지
```

---

## Task 6: Backspace 리스트 아웃덴트

**Files:**
- Modify: `src/editor/listeners.js:152-213` (Backspace 핸들러)

**Context:** 빈 리스트 + indent > 0 → 아웃덴트. 커서 맨 앞 + indent > 0 → 아웃덴트.

**Step 1: 빈 블록 Backspace (lines 153-175) 수정**

```javascript
  if(e.key==='Backspace'){
    if(el.textContent===''||el.innerHTML==='<br>'){
      e.preventDefault();
      var curIndent=b.indent||0;
      // 리스트 블록: indent > 0이면 아웃덴트
      if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&curIndent>0){
        pushUndoImmediate();
        state.page.blocks[idx].indent=curIndent-1;
        renderBlocks();
        updateNums();
        focusBlock(idx,0);
        return;
      }
      // 서식 블록(리스트 indent 0 포함)이면 text로 변환
      if(b.type==='bullet'||b.type==='number'||b.type==='todo'||b.type==='h1'||b.type==='h2'||b.type==='h3'||b.type==='quote'){
        pushUndoImmediate();
        state.page.blocks[idx].type='text';
        delete state.page.blocks[idx].indent;
        delete state.page.blocks[idx].collapsed;
        if(b.type==='todo')delete state.page.blocks[idx].checked;
        renderBlocks();
        focusBlock(idx);
      }
      // text이고 첫 블록이 아니면 삭제
      else if(state.page.blocks.length>1){
        deleteBlock(idx);
        var prevIdx=idx-1;
        while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){prevIdx--}
        if(prevIdx<0)prevIdx=Math.max(0,idx-1);
        setTimeout(function(){focusBlock(prevIdx,'end')},50)
      }
      return;
    }
    // 커서가 맨 앞일 때
    if(isAtStart(el)){
      e.preventDefault();
      var curIndent=b.indent||0;
      // 리스트 블록 + indent > 0: 아웃덴트
      if(['bullet','number','todo'].indexOf(b.type)!==-1&&curIndent>0){
        pushUndoImmediate();
        state.page.blocks[idx].indent=curIndent-1;
        renderBlocks();
        updateNums();
        focusBlock(idx,0);
        return;
      }
      // BS-01/BS-05: 서식 블록(indent 0)이면 text로 변환
      if(b.type==='h1'||b.type==='h2'||b.type==='h3'||b.type==='quote'||b.type==='bullet'||b.type==='number'||b.type==='todo'){
        pushUndoImmediate();
        state.page.blocks[idx].type='text';
        delete state.page.blocks[idx].indent;
        delete state.page.blocks[idx].collapsed;
        if(b.type==='todo')delete state.page.blocks[idx].checked;
        renderBlocks();
        focusBlock(idx,0);
        return;
      }
      // BS-04: text 블록 병합 (기존 로직 유지)
      if(idx>0){
        var prevIdx=idx-1;
        while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){prevIdx--}
        if(prevIdx>=0&&TEXT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
          pushUndoImmediate();
          var prevBlock=state.page.blocks[prevIdx];
          var curBlock=state.page.blocks[idx];
          var prevContent=(prevBlock.content||'').replace(/<br\s*\/?>$/i,'');
          var prevTextLen=prevContent.replace(/<[^>]*>/g,'').length;
          prevBlock.content=prevContent+(curBlock.content||'');
          state.page.blocks.splice(idx,1);
          renderBlocks();
          focusBlock(prevIdx,prevTextLen);
        }else{
          if(prevIdx<0)prevIdx=Math.max(0,idx-1);
          focusBlock(prevIdx,'end');
        }
        return;
      }
      return;
    }
  }
```

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
feat: Backspace 리스트 아웃덴트 지원
```

---

## Task 7: 자동 변환 (마크다운 패턴)

**Files:**
- Modify: `src/editor/listeners.js:431-441` (input 이벤트 핸들러)

**Context:** text 블록에서 `- `, `* `, `1. `, `[] `, `[x] `, `> ` 입력 시 자동 변환.

**Step 1: input 핸들러에 자동 변환 로직 추가**

`listeners.js` setupBlockEvents의 input 핸들러 (현재 line 431) 수정:

```javascript
    el.addEventListener('input',function(){
      triggerAutoSave();
      if(state.isComposing)return;
      // 슬래시 메뉴 필터링
      var menu=$('slashMenu');
      if(menu.classList.contains('open')){
        var txt=el.innerText||el.textContent;
        txt=txt.replace(/\n/g,'').trim();
        if(txt.startsWith('/'))filterSlash(txt.slice(1));
        else hideSlash();
        return;
      }
      // 마크다운 자동 변환 (text 블록에서만)
      if(b.type==='text'&&state.editMode){
        var raw=el.textContent||'';
        // CLOSURE-01 fix: 최신 블록 데이터 참조
        var blockEl=el.closest('.block');
        var curIdx=idx,curB=b;
        if(blockEl&&state.page&&state.page.blocks){
          var bid=blockEl.getAttribute('data-id');
          for(var ai=0;ai<state.page.blocks.length;ai++){
            if(state.page.blocks[ai].id===bid){curIdx=ai;curB=state.page.blocks[ai];break}
          }
        }
        if(curB.type!=='text')return;
        var converted=null;
        if(raw==='- '||raw==='* '){converted={type:'bullet'}}
        else if(/^1[\.\)] $/.test(raw)){converted={type:'number',num:1}}
        else if(raw==='[] '||raw==='[ ] '){converted={type:'todo',checked:false}}
        else if(raw==='[x] '||raw==='[X] '){converted={type:'todo',checked:true}}
        else if(raw==='> '){converted={type:'quote'}}
        if(converted){
          pushUndoImmediate();
          state.page.blocks[curIdx].type=converted.type;
          state.page.blocks[curIdx].content='';
          if(converted.num!==undefined)state.page.blocks[curIdx].num=converted.num;
          if(converted.checked!==undefined)state.page.blocks[curIdx].checked=converted.checked;
          renderBlocks();
          updateNums();
          focusBlock(curIdx,0);
        }
      }
    });
```

**Step 2: 빌드 & 수동 테스트**

- 빈 text 블록에서 `- ` 입력 → bullet 변환
- `1. ` 입력 → number 변환
- `[] ` 입력 → todo 변환
- `> ` 입력 → quote 변환
- 내용 있는 text 블록 → 변환 안 됨 확인
- 한글 입력 중 → 변환 안 됨 확인

Run: `npm run build`

**Step 3: 커밋**

```
feat: 마크다운 패턴 자동 변환 (- * 1. [] [x] >)
```

---

## Task 8: ArrowUp/Down collapsed 블록 건너뛰기

**Files:**
- Modify: `src/editor/listeners.js:237-257` (ArrowUp/Down 핸들러)

**Context:** collapsed 블록의 하위 항목은 화살표 키로 건너뛰어야 함.

**Step 1: ArrowDown에서 collapsed 하위 건너뛰기**

`listeners.js` ArrowDown 핸들러 수정:

```javascript
  if(e.key==='ArrowDown'&&!e.shiftKey){
    if(isAtEnd(el)&&idx<state.page.blocks.length-1){
      e.preventDefault();
      var downIdx=idx+1;
      // collapsed 블록이면 하위 항목 건너뛰기
      if(state.page.blocks[idx].collapsed){
        var myIndent=state.page.blocks[idx].indent||0;
        while(downIdx<state.page.blocks.length&&(state.page.blocks[downIdx].indent||0)>myIndent){downIdx++}
      }
      // 콘텐츠 블록 스킵
      while(downIdx<state.page.blocks.length-1&&CONTENT_TYPES.indexOf(state.page.blocks[downIdx].type)!==-1){downIdx++}
      if(downIdx>=state.page.blocks.length)downIdx=state.page.blocks.length-1;
      if(CONTENT_TYPES.indexOf(state.page.blocks[downIdx].type)!==-1)downIdx=idx+1;
      focusBlock(downIdx,0);
      return;
    }
  }
```

**Step 2: ArrowUp에서도 collapsed 고려**

ArrowUp에서는 이전 블록이 collapsed parent의 하위 항목이면 부모로 이동:

```javascript
  if(e.key==='ArrowUp'&&!e.shiftKey){
    if(isAtStart(el)&&idx>0){
      e.preventDefault();
      var upIdx=idx-1;
      // 이전 블록이 collapsed-child이면 부모 찾기
      while(upIdx>0){
        var parentFound=false;
        for(var pi=upIdx-1;pi>=0;pi--){
          if(state.page.blocks[pi].collapsed){
            var piIndent=state.page.blocks[pi].indent||0;
            if((state.page.blocks[upIdx].indent||0)>piIndent){
              upIdx=pi;parentFound=true;break;
            }
          }
        }
        if(!parentFound)break;
      }
      // 콘텐츠 블록 스킵
      while(upIdx>0&&CONTENT_TYPES.indexOf(state.page.blocks[upIdx].type)!==-1){upIdx--}
      if(CONTENT_TYPES.indexOf(state.page.blocks[upIdx].type)!==-1)upIdx=idx-1;
      focusBlock(upIdx,-1);
      return;
    }
  }
```

**Step 3: 빌드 & 확인**

Run: `npm run build`

**Step 4: 커밋**

```
feat: ArrowUp/Down collapsed 하위 항목 건너뛰기
```

---

## Task 9: 접기/펼치기 클릭 핸들러

**Files:**
- Modify: `src/editor/listeners.js:424-601` (setupBlockEvents)

**Context:** 접기 화살표 클릭 시 collapsed 토글 + 리렌더.

**Step 1: setupBlockEvents에 접기 화살표 클릭 이벤트 추가**

`listeners.js` setupBlockEvents 함수 끝부분 (기존 todo/toggle 이벤트들 뒤) 에 추가:

```javascript
  // 리스트 접기/펼치기 화살표
  var collapseArrow=div.querySelector('.list-collapse-arrow');
  if(collapseArrow){(function(blockId){
    collapseArrow.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      var blk=findBlock(blockId);
      if(blk){
        pushUndoImmediate();
        blk.collapsed=!blk.collapsed;
        renderBlocks();
        // 포커스 유지
        var newIdx=findBlockIndex(blockId);
        if(newIdx>=0)focusBlock(newIdx,-1);
      }
    });
  })(b.id)}
```

**Step 2: 빌드 & 수동 테스트**

- bullet indent 0 + 하위 indent 1 블록 생성
- 접기 화살표 클릭 → 하위 숨김
- 다시 클릭 → 하위 표시
- 접힌 상태에서 Enter → 올바른 위치에 새 블록

Run: `npm run build`

**Step 3: 커밋**

```
feat: 리스트 접기/펼치기 기능
```

---

## Task 10: Collapsed 블록 삭제/드래그 시 하위 항목 함께 처리

**Files:**
- Modify: `src/editor/blocks.js:95-111` (deleteBlock)
- Modify: `src/editor/listeners.js:810-836` (드래그 핸들러)

**Context:** collapsed 블록 삭제 시 하위 항목도 삭제. 드래그 시 하위 항목도 함께 이동.

**Step 1: deleteBlock에 하위 항목 연쇄 삭제 추가**

`blocks.js` deleteBlock 수정:

```javascript
export function deleteBlock(idx){
  pushUndoImmediate();
  if(state.page.blocks.length<=1){
    state.page.blocks[0]={id:genId(),type:'text',content:''};
    renderBlocks();focusBlock(0,0);return;
  }
  // collapsed 블록이면 하위 항목도 함께 삭제
  var deleteCount=1;
  if(state.page.blocks[idx].collapsed){
    var children=getChildren(idx);
    deleteCount=1+children.length;
  }
  var blockId=state.page.blocks[idx].id;
  state.page.blocks.splice(idx,deleteCount);
  // 삭제된 블록이 여러 개일 수 있으므로 전체 리렌더
  renderBlocks();
  updateNums();
  var newIdx=Math.min(idx,state.page.blocks.length-1);
  focusBlock(newIdx,-1);
}
```

**Step 2: 드래그 핸들러에서 collapsed 블록 그룹 이동**

`listeners.js` drop 핸들러 (reorderBlock 호출부) 수정 — collapsed 블록 드래그 시 하위도 함께:

```javascript
    // drop 핸들러 내부 (reorderBlock 호출 전)
    if(state.dragBlockIdx!==null){
      var ind=editor.querySelector('.drag-indicator');
      var toIdx=ind?parseInt(ind.getAttribute('data-drop-idx')):state.dragBlockIdx;
      if(ind)ind.remove();
      // collapsed 블록이면 하위 항목도 함께 이동
      var fromIdx=state.dragBlockIdx;
      var dragBlock=state.page.blocks[fromIdx];
      if(dragBlock&&dragBlock.collapsed){
        var children=getChildren(fromIdx);
        var groupCount=1+children.length;
        // 그룹 추출
        pushUndoImmediate();
        var group=state.page.blocks.splice(fromIdx,groupCount);
        // toIdx 보정
        if(toIdx>fromIdx)toIdx-=groupCount;
        if(toIdx<0)toIdx=0;
        if(toIdx>state.page.blocks.length)toIdx=state.page.blocks.length;
        // 삽입
        for(var gi=0;gi<group.length;gi++){
          state.page.blocks.splice(toIdx+gi,0,group[gi]);
        }
        renderBlocks();
        triggerAutoSave();
      }else{
        if(toIdx>fromIdx)toIdx--;
        reorderBlock(fromIdx,toIdx);
      }
      state.dragBlockIdx=null;
      return;
    }
```

**Step 3: getChildren import 추가**

`listeners.js` import에 `getChildren` 추가.

**Step 4: 빌드 & 확인**

Run: `npm run build`

**Step 5: 커밋**

```
feat: collapsed 블록 삭제/드래그 시 하위 항목 그룹 처리
```

---

## Task 11: toolbar.js execSlash indent 초기화

**Files:**
- Modify: `src/ui/toolbar.js:59-98` (execSlash)

**Context:** 슬래시 메뉴로 리스트 블록 생성 시 indent 초기화 필요.

**Step 1: execSlash에서 리스트 타입 생성 시 indent 설정**

`toolbar.js` execSlash의 switch 문에 추가:

```javascript
    case'bullet':b.indent=0;break;
    case'todo':b.checked=false;b.indent=0;break;
    case'number':b.num=1;b.indent=0;break;
```

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
feat: 슬래시 메뉴 리스트 생성 시 indent 초기화
```

---

## Task 12: Enter에서 collapsed 블록 뒤 삽입 위치 보정

**Files:**
- Modify: `src/editor/listeners.js:80-142` (Enter 핸들러)

**Context:** collapsed 블록에서 Enter 시 새 블록은 숨겨진 하위 항목들 뒤에 삽입되어야 함.

**Step 1: Enter 핸들러에서 insertBlock 위치 보정**

Enter로 새 블록 삽입하는 부분 (현재 `insertBlock(idx+1,newB)`) 수정:

```javascript
    // collapsed 블록이면 하위 항목 뒤에 삽입
    var insertIdx=idx+1;
    if(b.collapsed){
      var children=getChildren(idx);
      insertIdx=idx+1+children.length;
    }
    insertBlock(insertIdx,newB);
    updateNums();
```

**Step 2: 빌드 & 확인**

Run: `npm run build`

**Step 3: 커밋**

```
fix: collapsed 블록 Enter 시 올바른 삽입 위치
```

---

## Task 13: 최종 통합 테스트 & 엣지 케이스

**Files:** 전체

**수동 테스트 체크리스트:**

### 기본 동작
- [ ] 슬래시 메뉴로 bullet/number/todo 생성
- [ ] `- ` 입력 → bullet 자동 변환
- [ ] `1. ` 입력 → number 자동 변환
- [ ] `[] ` 입력 → todo 자동 변환
- [ ] `> ` 입력 → quote 자동 변환
- [ ] 한글 입력 중 자동 변환 안 됨

### Enter
- [ ] 내용 있는 bullet에서 Enter → 같은 indent 새 bullet
- [ ] 내용 있는 number에서 Enter → 같은 indent 새 number
- [ ] 빈 리스트 indent 2에서 Enter → indent 1로 아웃덴트
- [ ] 빈 리스트 indent 0에서 Enter → text 변환

### Tab/Shift+Tab
- [ ] bullet에서 Tab → indent +1
- [ ] indent 4에서 Tab → 무반응
- [ ] Shift+Tab → indent -1
- [ ] indent 0에서 Shift+Tab → 무반응
- [ ] 비리스트에서 Tab → 스페이스 4칸

### Backspace
- [ ] 빈 리스트 indent 2 → 아웃덴트
- [ ] 빈 리스트 indent 0 → text 변환
- [ ] 커서 맨 앞 indent 1 → 아웃덴트
- [ ] 커서 맨 앞 indent 0 → text 변환

### 번호 매기기
- [ ] indent 0 → 1. 2. 3.
- [ ] indent 1 → a. b. c.
- [ ] indent 2 → i. ii. iii.
- [ ] 중간에 다른 블록 → 번호 리셋
- [ ] indent 달라지면 별도 그룹

### 접기/펼치기
- [ ] 하위 항목 있는 블록 → 화살표 표시
- [ ] 화살표 클릭 → 하위 숨김
- [ ] 다시 클릭 → 하위 표시
- [ ] 접힌 상태에서 Enter → 하위 뒤에 삽입
- [ ] 접힌 상태에서 Delete → 하위도 삭제
- [ ] 접힌 상태에서 ArrowDown → 하위 건너뛰기

### 드래그
- [ ] 리스트 항목 드래그 → indent 유지
- [ ] collapsed 블록 드래그 → 하위도 함께 이동
- [ ] 텍스트 드래그 선택 → 최하단 이동 없음

### Undo/Redo
- [ ] indent 변경 후 Ctrl+Z → 복원
- [ ] collapsed 변경 후 Ctrl+Z → 복원
- [ ] 자동 변환 후 Ctrl+Z → text 복원

**커밋:**

```
test: 리스트 기능 전체 통합 테스트 완료
```
