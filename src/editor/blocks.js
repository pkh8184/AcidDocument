// src/editor/blocks.js — 블록 CRUD

import state from '../data/store.js';
import {$,genId,toast,esc} from '../utils/helpers.js';
import {renderBlocks,insertBlockEl,removeBlockEl} from './renderer.js';
import {pushUndo,pushUndoImmediate} from './history.js';
import {sanitizeHTML} from '../utils/sanitize.js';

export function triggerAutoSave(){if(!state.editMode)return;clearTimeout(state.autoSaveTimer);state.autoSaveTimer=setTimeout(saveCurrent,1500);clearTimeout(state.undoTimer);state.undoTimer=setTimeout(function(){pushUndo()},500)}
export function onTitleChange(){triggerAutoSave()}

export function saveCurrent(){if(!state.editMode||!state.page)return;var p=getPage(state.page.id);if(!p)return;p.title=$('pageTitle').value||'제목 없음';p.icon=$('pageIcon').textContent;p.blocks=collectBlocks();p.updated=Date.now();import('../data/firestore.js').then(function(m){m.saveDB()})}

// 페이지 조회 헬퍼
export function getPages(pid){var r=[];for(var i=0;i<state.db.pages.length;i++){if(state.db.pages[i].parentId===pid&&!state.db.pages[i].deleted)r.push(state.db.pages[i])}for(var j=0;j<r.length;j++){if(typeof r[j].order!=='number')r[j].order=j}r.sort(function(a,b){return a.order-b.order});return r}
export function getPage(id){for(var i=0;i<state.db.pages.length;i++){if(state.db.pages[i].id===id)return state.db.pages[i]}return null}
export function getPath(id){var path=[],p=getPage(id);while(p){path.unshift(p);p=p.parentId?getPage(p.parentId):null}return path}

// 블록 ID 검색 헬퍼
export function findBlock(id){if(!state.page||!state.page.blocks)return null;for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id)return state.page.blocks[i]}return null}
export function findBlockIndex(id){if(!state.page)return -1;for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id)return i}return -1}

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

/* ========== 블록 생성/삭제 규칙 ==========
 * 1. insertBlock: 지정 위치에 블록 삽입 후 포커스
 * 2. deleteBlock: 블록 삭제 후 이전/다음 블록 포커스
 * 3. addBlockBelow: 특정 블록 아래에 새 블록 추가
 * 4. dupBlock: 블록 복제
 * 5. moveBlockUp/Down: 블록 위치 이동
 * 6. 빈 블록 자동 정리 안함 (사용자 의도 존중)
 * 7. 마지막 블록 삭제 시 빈 블록 하나 유지
 * 8. 편집 불가 블록(toc,divider,image 등) 생성 시 아래 빈 블록 자동 추가
 * 9. 포커스 이동 시 커서 위치 지정 가능
 * 10. 블록 타입 변환 시 내용 유지
 */
export function focusBlock(idx,cursorPos){
  var doFocus=function(){
    var el=$('editor').children[idx];
    if(!el)return;
    var c=el.querySelector('.block-content');
    if(!c){
      c=el.querySelector('.block-col-content')||el.querySelector('th')||el.querySelector('td');
    }
    if(!c)return;
    c.focus({preventScroll:true});
    if(cursorPos==='end'){cursorPos=-1}
    if(typeof cursorPos==='number'){
      try{
        var rng=document.createRange();
        var sel=window.getSelection();
        if(cursorPos===-1||cursorPos>=c.textContent.length){
          rng.selectNodeContents(c);
          rng.collapse(false);
        }else if(cursorPos===0){
          rng.selectNodeContents(c);
          rng.collapse(true);
        }else{
          var node=c.firstChild||c;
          if(node.nodeType===3){
            rng.setStart(node,Math.min(cursorPos,node.length));
            rng.collapse(true);
          }else{
            rng.selectNodeContents(c);
            rng.collapse(true);
          }
        }
        sel.removeAllRanges();
        sel.addRange(rng);
      }catch(ex){console.warn('focusBlock:',ex)}
    }
    // 뷰포트 밖이면 최소 스크롤
    var rect=c.getBoundingClientRect();
    var wrap=document.getElementById('editorWrap');
    if(wrap){
      var wrapRect=wrap.getBoundingClientRect();
      if(rect.bottom>wrapRect.bottom||rect.top<wrapRect.top){
        c.scrollIntoView({block:'nearest',behavior:'smooth'});
      }
    }
  };
  if(typeof requestAnimationFrame==='function'){
    requestAnimationFrame(function(){setTimeout(doFocus,0)});
  }else{
    setTimeout(doFocus,50);
  }
}
export function insertBlock(idx,b){
  pushUndoImmediate();
  state.page.blocks.splice(idx,0,b);
  insertBlockEl(b,idx);
  focusBlock(idx,0);
}
export function addBlockBelow(idx){
  insertBlock(idx+1,{id:genId(),type:'text',content:''});
}
export function deleteBlock(idx){
  pushUndoImmediate();
  if(state.page.blocks.length<=1){
    // 마지막 블록이면 내용만 비우기
    state.page.blocks[0]={id:genId(),type:'text',content:''};
    renderBlocks();
    focusBlock(0,0);
    return;
  }
  // collapsed 블록이면 하위 항목도 함께 삭제
  if(state.page.blocks[idx].collapsed){
    var children=getChildren(idx);
    var deleteCount=1+children.length;
    state.page.blocks.splice(idx,deleteCount);
    renderBlocks();
  }else{
    var blockId=state.page.blocks[idx].id;
    state.page.blocks.splice(idx,1);
    removeBlockEl(blockId);
  }
  updateNums();
  // 삭제된 위치나 이전 블록으로 포커스
  var newIdx=Math.min(idx,state.page.blocks.length-1);
  focusBlock(newIdx,-1);
}
export function dupBlock(idx){
  pushUndoImmediate();
  var orig=state.page.blocks[idx];
  var copy=JSON.parse(JSON.stringify(orig));
  copy.id=genId();
  state.page.blocks.splice(idx+1,0,copy);
  insertBlockEl(copy,idx+1);
  focusBlock(idx+1,0);
  toast('블록 복제됨');
}
export function moveBlockUp(idx){
  if(idx<=0)return;
  pushUndoImmediate();
  var temp=state.page.blocks[idx];
  state.page.blocks[idx]=state.page.blocks[idx-1];
  state.page.blocks[idx-1]=temp;
  renderBlocks();
  focusBlock(idx-1);
}
export function moveBlockDown(idx){
  if(idx>=state.page.blocks.length-1)return;
  pushUndoImmediate();
  var temp=state.page.blocks[idx];
  state.page.blocks[idx]=state.page.blocks[idx+1];
  state.page.blocks[idx+1]=temp;
  renderBlocks();
  focusBlock(idx+1);
}
export function changeBlockType(idx,newType){
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  var oldContent=b.content||'';
  b.type=newType;
  b.content=oldContent;
  if(newType==='todo')b.checked=false;
  if(newType==='toggle'){b.open=false;if(!b.innerContent)b.innerContent='';}
  renderBlocks();
  updateNums();
  focusBlock(idx,-1);
}
export function collectBlocks(){
  if(!state.editMode){return JSON.parse(JSON.stringify(state.page.blocks))}
  var blks=[],chs=$('editor').children;
  for(var i=0;i<chs.length;i++){
    var el=chs[i],id=el.getAttribute('data-id'),orig=null;
    for(var j=0;j<state.page.blocks.length;j++){if(state.page.blocks[j].id===id){orig=state.page.blocks[j];break}}
    if(!orig)continue;
    var b=JSON.parse(JSON.stringify(orig));
    if(b.type==='toggle'){
      var headCon=el.querySelector('.block-toggle-head .block-content');
      if(headCon)b.content=sanitizeHTML(headCon.innerHTML);
      var bodyCon=el.querySelector('.block-toggle-body .block-content');
      if(bodyCon)b.innerContent=sanitizeHTML(bodyCon.innerHTML);
      var hd=el.querySelector('.block-toggle-head');
      b.open=hd?hd.classList.contains('open'):false
    }else{
      var con=el.querySelector('.block-content');
      if(con)b.content=sanitizeHTML(con.innerHTML)
    }
    if(b.type==='todo'){var cb=el.querySelector('input[type="checkbox"]');b.checked=cb?cb.checked:false}
    if(b.type==='image'){var cap=el.querySelector('.block-image-caption');if(cap)b.caption=sanitizeHTML(cap.innerHTML)}
    if(b.type==='table'){
      var rows=[],trs=el.querySelectorAll('tr'),cws=[],tbl=el.querySelector('table'),tblW=tbl?tbl.offsetWidth:0;
      for(var ri=0;ri<trs.length;ri++){
        var cls=[],tds=trs[ri].querySelectorAll('th,td');
        for(var ci=0;ci<tds.length;ci++){
          var cellClone=tds[ci].cloneNode(true);
          var cellResizers=cellClone.querySelectorAll('.col-resizer');
          for(var cr=0;cr<cellResizers.length;cr++)cellResizers[cr].parentNode.removeChild(cellResizers[cr]);
          cls.push(sanitizeHTML(cellClone.innerHTML));
          if(ri===0&&tds[ci].offsetWidth&&tblW)cws[ci]=Math.round(tds[ci].offsetWidth/tblW*100)
        }
        rows.push(cls)
      }
      b.rows=rows;if(cws.length)b.colWidths=cws
    }
    if(b.type==='columns'){
      var cols=[],ces=el.querySelectorAll('.block-col-content'),cwc=[];
      for(var coi=0;coi<ces.length;coi++){
        cols.push(sanitizeHTML(ces[coi].innerHTML));
        var colEl=ces[coi].closest('.block-col');
        if(colEl&&colEl.offsetWidth)cwc[coi]=colEl.offsetWidth
      }
      b.columns=cols;if(cwc.length)b.colWidths=cwc
    }
    blks.push(b)
  }
  return blks
}
export function updateNums(){
  var chs=$('editor').children;
  var counters=[0,0,0,0,0];
  var prevIndent=-1;
  var prevType='';
  for(var i=0;i<chs.length;i++){
    var el=chs[i];
    var indent=parseInt(el.getAttribute('data-indent'))||0;
    if(el.classList.contains('block-number')){
      if(indent!==prevIndent||prevType!=='number'){
        counters[indent]=0;
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
      for(var r=indent+1;r<5;r++)counters[r]=0;
    }else{
      for(var r=0;r<5;r++)counters[r]=0;
      prevType='';
      prevIndent=-1;
    }
  }
}
export function genTOC(){var hs=[];for(var i=0;i<state.page.blocks.length;i++){var b=state.page.blocks[i];if(b.type==='h1'||b.type==='h2'||b.type==='h3')hs.push(b)}if(hs.length===0)return'<div class="block-toc-title">📑 목차</div><p style="color:var(--t4)">제목이 없습니다</p>';var html='<div class="block-toc-title">📑 목차</div><ul class="block-toc-list">',tmp=document.createElement('div');for(var j=0;j<hs.length;j++){var h=hs[j];tmp.innerHTML=h.content||'';var txt=tmp.textContent||'';var lv=h.type==='h1'?1:h.type==='h2'?2:3;html+='<li class="block-toc-item l'+lv+'"><a href="#" onclick="scrollToBlk(\''+h.id+'\');return false">'+esc(txt)+'</a></li>'}html+='</ul>';return html}
export function scrollToBlk(id){var el=document.querySelector('[data-id="'+id+'"]');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.background='var(--accM)';setTimeout(function(){el.style.background=''},2000)}}

// 플로팅 목차 네비게이션
export function initTocNav(){
  var btn=$('tocNavBtn');var closeBtn=$('tocNavClose');
  if(!btn)return;
  btn.addEventListener('click',function(){
    var list=$('tocNavList');
    if(list.classList.contains('open')){list.classList.remove('open')}
    else{updateTocNav();list.classList.add('open')}
  });
  if(closeBtn)closeBtn.addEventListener('click',function(){$('tocNavList').classList.remove('open')});
  document.addEventListener('click',function(e){var nav=$('tocNav');if(nav&&!nav.contains(e.target))$('tocNavList').classList.remove('open')});
}
export function updateTocNav(){
  var ul=$('tocNavItems');if(!ul)return;
  if(!state.page||!state.page.blocks){ul.innerHTML='<li class="toc-nav-item" style="color:var(--t4)">페이지를 선택해주세요</li>';return}
  var html='',tmp=document.createElement('div');
  for(var i=0;i<state.page.blocks.length;i++){
    var b=state.page.blocks[i];
    if(b.type==='h1'||b.type==='h2'||b.type==='h3'){
      tmp.innerHTML=b.content||'';var txt=tmp.textContent||'';if(!txt)txt='(빈 제목)';
      var lv=b.type==='h1'?'l1':b.type==='h2'?'l2':'l3';
      html+='<li class="toc-nav-item '+lv+'" data-block-id="'+b.id+'">'+esc(txt)+'</li>';
    }
  }
  if(!html)html='<li class="toc-nav-item" style="color:var(--t4)">제목이 없습니다</li>';
  ul.innerHTML=html;
  ul.onclick=function(e){var li=e.target.closest('.toc-nav-item');if(!li||!li.getAttribute('data-block-id'))return;scrollToBlk(li.getAttribute('data-block-id'));$('tocNavList').classList.remove('open')};
}
export function updateTocNavVisibility(){
  var nav=$('tocNav');if(!nav)return;
  if(!state.page||!state.page.blocks){nav.classList.remove('visible');return}
  var has=false;for(var i=0;i<state.page.blocks.length;i++){var t=state.page.blocks[i].type;if(t==='h1'||t==='h2'||t==='h3'){has=true;break}}
  if(has)nav.classList.add('visible');else nav.classList.remove('visible');
}

// 좌측 메뉴바용 함수
export function getCurrentIdx(){return state.currentInsertIdx!==null?state.currentInsertIdx:(state.page&&state.page.blocks?state.page.blocks.length-1:0)}
export function dupBlockCurrent(){var idx=state.currentInsertIdx;if(idx!==null&&idx>=0)dupBlock(idx);else toast('블록을 선택하세요','warn')}
export function deleteBlockCurrent(){var idx=state.currentInsertIdx;if(idx!==null&&idx>=0)deleteBlock(idx);else toast('블록을 선택하세요','warn')}
export function addBlockBelowCurrent(){var idx=state.currentInsertIdx!==null?state.currentInsertIdx:state.page.blocks.length-1;addBlockBelow(idx)}
export function moveBlockUpCurrent(){var idx=state.currentInsertIdx;if(idx!==null&&idx>0)moveBlockUp(idx);else toast('이동할 수 없습니다','warn')}
export function moveBlockDownCurrent(){var idx=state.currentInsertIdx;if(idx!==null&&idx<state.page.blocks.length-1)moveBlockDown(idx);else toast('이동할 수 없습니다','warn')}
export function trackCurrentBlock(){
  var focused=document.activeElement;
  if(focused){
    var block=focused.closest('.block');
    if(block){
      state.currentInsertIdx=parseInt(block.getAttribute('data-idx'));
      return;
    }
  }
  // 선택된 블록이 없으면 마지막 블록
  state.currentInsertIdx=state.page.blocks.length-1;
}
// 에디터에서 포커스 변경 시 현재 블록 추적
export function setupBlockTracking(){
  var ed=$('editor');
  ed.addEventListener('focusin',function(e){
    var block=e.target.closest('.block');
    if(block)state.currentInsertIdx=parseInt(block.getAttribute('data-idx'));
  });
}

export function copyCode(btn){var wrap=btn.closest('.block-code-wrap'),code=wrap.querySelector('.block-content').textContent;navigator.clipboard.writeText(code).then(function(){toast('복사됨')})}
export function downloadCode(btn){var wrap=btn.closest('.block-code-wrap'),code=wrap.querySelector('.block-content').textContent,lang=wrap.querySelector('.block-code-lang');var ext=lang?lang.textContent.toLowerCase():'txt';var exts={javascript:'js',python:'py',java:'java',html:'html',css:'css',json:'json',typescript:'ts',ruby:'rb',php:'php',go:'go',rust:'rs',cpp:'cpp',c:'c'};ext=exts[ext]||ext||'txt';var blob=new Blob([code],{type:'text/plain'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='code.'+ext;a.click();URL.revokeObjectURL(url);toast('다운로드됨')}
