// src/editor/listeners.js — 키보드, 클립보드, 드래그&드롭 이벤트

import state from '../data/store.js';
import {ALLOWED_IMAGE_TYPES} from '../config/firebase.js';
import {$,$$,genId,toast,esc} from '../utils/helpers.js';
import {uploadToStorage} from '../data/firestore.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave,focusBlock,insertBlock,deleteBlock,addBlockBelow,updateNums,setupBlockTracking,copyCode,downloadCode,findBlock,findBlockIndex,getCurrentIdx,moveBlockUp,moveBlockDown} from './blocks.js';
import {addImageBlock,addPdfBlock,closeImageViewer,viewerNav,openImageViewer} from './media.js';
import {showSlash,hideSlash,filterSlash,moveSlashSel,execSlash,showFmtBar,hideFmtBar} from '../ui/toolbar.js';
import {openSearch,closeModal,closeAllModals,closeAllPanels,openShortcutHelp} from '../ui/modals.js';
import {hideCtx} from '../ui/sidebar.js';
import {showTagPicker,hideTagPicker} from '../ui/toolbar.js';
import {undo,redo,pushUndoImmediate} from './history.js';
import {sanitizeHTML} from '../utils/sanitize.js';

var TEXT_TYPES=['text','h1','h2','h3','bullet','number','quote','todo'];
var CONTENT_TYPES=['table','image','video','pdf','file','slide','calendar','columns','toc','divider'];

// Range 기반 커서 위치 판별 (리치 텍스트에서도 정확)
function isAtStart(el){
  var sel=window.getSelection();
  if(!sel.isCollapsed||!sel.rangeCount)return false;
  var range=sel.getRangeAt(0);
  var testRange=document.createRange();
  testRange.setStart(el,0);
  testRange.setEnd(range.startContainer,range.startOffset);
  return testRange.toString().length===0;
}
function isAtEnd(el){
  var sel=window.getSelection();
  if(!sel.isCollapsed||!sel.rangeCount)return false;
  var range=sel.getRangeAt(0);
  var testRange=document.createRange();
  testRange.setStart(range.endContainer,range.endOffset);
  testRange.setEnd(el,el.childNodes.length);
  return testRange.toString().length===0;
}

export function reorderBlock(fromIdx,toIdx){
  if(!state.page||!state.page.blocks)return;
  if(fromIdx===toIdx)return;
  if(fromIdx<0||fromIdx>=state.page.blocks.length)return;
  if(toIdx<0||toIdx>=state.page.blocks.length)return;
  pushUndoImmediate();
  var block=state.page.blocks.splice(fromIdx,1)[0];
  state.page.blocks.splice(toIdx,0,block);
  renderBlocks();
  triggerAutoSave();
}

export function handleKey(e,b,idx,el){
  if(state.isComposing)return;
  // CLOSURE-01 fix: 클로저의 stale idx 대신 DOM에서 현재 idx 조회
  var blockEl=el.closest('.block');
  if(blockEl){
    var freshIdx=parseInt(blockEl.getAttribute('data-idx'));
    if(!isNaN(freshIdx)&&state.page&&state.page.blocks[freshIdx]){
      idx=freshIdx;
      b=state.page.blocks[idx];
    }
  }
  var menu=$('slashMenu'),menuOpen=menu.classList.contains('open');
  if(menuOpen){
    if(e.key==='ArrowDown'){e.preventDefault();moveSlashSel(1);return}
    if(e.key==='ArrowUp'){e.preventDefault();moveSlashSel(-1);return}
    if(e.key==='Enter'){e.preventDefault();var sel=menu.querySelector('.slash-item.sel');if(sel)execSlash(sel.getAttribute('data-type'));return}
    if(e.key==='Escape'){e.preventDefault();hideSlash();return}
    if(e.key==='Backspace'){setTimeout(function(){var txt=el.innerText||el.textContent;txt=txt.replace(/\n/g,'').trim();if(!txt.startsWith('/'))hideSlash();else filterSlash(txt.slice(1))},10);return}
    // 한글 등 일반 문자 입력 시
    if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){setTimeout(function(){var txt=el.innerText||el.textContent;txt=txt.replace(/\n/g,'').trim();if(txt.startsWith('/'))filterSlash(txt.slice(1))},10);return}
  }

  /* ========== 텍스트 입력 규칙 ========== */

  // 규칙 1: Enter - 새 블록 생성
  if(e.key==='Enter'&&!e.shiftKey){
    // @태그 처리
    var txt=el.innerHTML;
    var tagMatch=txt.match(/@([^@<>\s]+)$/);
    if(tagMatch){
      e.preventDefault();
      var tagText=tagMatch[1];
      var newHtml=txt.replace(/@([^@<>\s]+)$/,'<span class="inline-tag tag-blue" contenteditable="false">@'+sanitizeHTML(tagText)+'</span>&nbsp;');
      el.innerHTML=newHtml;
      // 커서를 끝으로 이동
      var range=document.createRange();
      var sel=window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      triggerAutoSave();
      return;
    }

    e.preventDefault();
    // ENT-04: 빈 리스트 아이템에서 Enter → text로 변환 (리스트 탈출)
    if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&(el.textContent===''||el.innerHTML==='<br>')){
      pushUndoImmediate();
      state.page.blocks[idx].type='text';
      state.page.blocks[idx].content='';
      if(b.type==='todo')delete state.page.blocks[idx].checked;
      renderBlocks();
      updateNums();
      focusBlock(idx,0);
      return;
    }
    var sel=window.getSelection();
    var range=sel.getRangeAt(0);
    // 텍스트 선택 상태면 선택 영역 삭제
    if(!sel.isCollapsed){
      range.deleteContents();
      sel=window.getSelection();
      range=sel.getRangeAt(0);
    }
    // 커서 뒤의 콘텐츠를 추출
    var afterRange=document.createRange();
    afterRange.setStart(range.endContainer,range.endOffset);
    afterRange.setEnd(el,el.childNodes.length);
    var afterFrag=afterRange.extractContents();
    var tempDiv=document.createElement('div');
    tempDiv.appendChild(afterFrag);
    var afterHTML=sanitizeHTML(tempDiv.innerHTML);
    // 현재 블록은 커서 앞 텍스트만 남음
    state.page.blocks[idx].content=sanitizeHTML(el.innerHTML);
    var newType='text';
    if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&el.textContent.trim()!==''){
      newType=b.type;
    }
    var newB={id:genId(),type:newType,content:afterHTML};
    if(newType==='todo')newB.checked=false;
    if(newType==='number')newB.num=(b.num||1)+1;
    insertBlock(idx+1,newB);
    updateNums();
    return;
  }

  // 규칙 2: Shift+Enter - 명시적 줄바꿈 (<br> 삽입)
  if(e.key==='Enter'&&e.shiftKey){
    e.preventDefault();
    document.execCommand('insertLineBreak');
    triggerAutoSave();
    return;
  }

  // 규칙 3: Backspace - 빈 블록 처리
  if(e.key==='Backspace'){
    if(el.textContent===''||el.innerHTML==='<br>'){
      e.preventDefault();
      // 서식 블록(리스트/헤딩/인용)이면 text로 변환
      if(b.type==='bullet'||b.type==='number'||b.type==='todo'||b.type==='h1'||b.type==='h2'||b.type==='h3'||b.type==='quote'){
        pushUndoImmediate();
        state.page.blocks[idx].type='text';
        renderBlocks();
        focusBlock(idx);
      }
      // text이고 첫 블록이 아니면 삭제 후 이전 블록으로 포커스 (콘텐츠 블록 스킵)
      else if(state.page.blocks.length>1){
        deleteBlock(idx);
        // deleteBlock의 기본 포커스를 오버라이드 — 콘텐츠 블록 스킵
        var prevIdx=idx-1;
        while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
          prevIdx--;
        }
        if(prevIdx<0)prevIdx=Math.max(0,idx-1);
        setTimeout(function(){focusBlock(prevIdx,'end')},50)
      }
      return;
    }
    // 커서가 맨 앞일 때 (BS-01, BS-04, BS-05 수정)
    if(isAtStart(el)){
      e.preventDefault();
      // BS-01/BS-05: 서식 블록이면 text로 타입 변환 (내용 유지, idx 무관)
      if(b.type==='h1'||b.type==='h2'||b.type==='h3'||b.type==='quote'||b.type==='bullet'||b.type==='number'||b.type==='todo'){
        pushUndoImmediate();
        state.page.blocks[idx].type='text';
        if(b.type==='todo')delete state.page.blocks[idx].checked;
        renderBlocks();
        focusBlock(idx,0);
        return;
      }
      // BS-04: text 블록이고 이전 블록이 있으면 → 이전 텍스트 블록과 병합
      if(idx>0){
        var prevIdx=idx-1;
        while(prevIdx>=0&&CONTENT_TYPES.indexOf(state.page.blocks[prevIdx].type)!==-1){
          prevIdx--;
        }
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
          // 이전 블록이 콘텐츠 블록뿐이면 포커스만 이동
          if(prevIdx<0)prevIdx=Math.max(0,idx-1);
          focusBlock(prevIdx,'end');
        }
        return;
      }
      // idx===0이고 text 블록이면 아무것도 안 함 (정상)
      return;
    }
  }

  // 규칙 4: Delete - 다음 블록과 병합
  if(e.key==='Delete'){
    if(isAtEnd(el)&&idx<state.page.blocks.length-1){
      e.preventDefault();
      var nextB=state.page.blocks[idx+1];
      if(['text','h1','h2','h3','bullet','number','quote','todo'].includes(nextB.type)){
        pushUndoImmediate();
        // sync 후 state에서 다시 읽기 (syncBlocksFromDOM이 배열을 교체하므로)
        var curBlock=state.page.blocks[idx];
        var nextBlock=state.page.blocks[idx+1];
        var curContent=(curBlock.content||'').replace(/<br\s*\/?>$/i,'');
        var curTextLen=curContent.replace(/<[^>]*>/g,'').length;
        curBlock.content=curContent+(nextBlock.content||'');
        state.page.blocks.splice(idx+1,1);
        renderBlocks();
        focusBlock(idx,curTextLen);
      }
      return;
    }
  }

  // 규칙 7-8: 방향키로 블록 이동 (콘텐츠 블록 스킵)
  if(e.key==='ArrowUp'&&!e.shiftKey){
    if(isAtStart(el)&&idx>0){
      e.preventDefault();
      var upIdx=idx-1;
      while(upIdx>0&&CONTENT_TYPES.indexOf(state.page.blocks[upIdx].type)!==-1){upIdx--}
      if(CONTENT_TYPES.indexOf(state.page.blocks[upIdx].type)!==-1)upIdx=idx-1;
      focusBlock(upIdx,-1);
      return;
    }
  }
  if(e.key==='ArrowDown'&&!e.shiftKey){
    if(isAtEnd(el)&&idx<state.page.blocks.length-1){
      e.preventDefault();
      var downIdx=idx+1;
      while(downIdx<state.page.blocks.length-1&&CONTENT_TYPES.indexOf(state.page.blocks[downIdx].type)!==-1){downIdx++}
      if(CONTENT_TYPES.indexOf(state.page.blocks[downIdx].type)!==-1)downIdx=idx+1;
      focusBlock(downIdx,0);
      return;
    }
  }

  // 규칙 10: 슬래시 메뉴
  if(e.key==='/'){
    if(el.textContent===''){
      // 빈 블록: 기존 동작 (현재 블록 교체)
      state.slashMenuState={open:true,idx:idx};
      showSlash(el);
      return;
    }else{
      // 내용 있는 블록: 다음 블록 생성 후 슬래시 메뉴
      e.preventDefault();
      var newB={id:genId(),type:'text',content:''};
      pushUndoImmediate();
      state.page.blocks.splice(idx+1,0,newB);
      renderBlocks();
      setTimeout(function(){
        state.slashMenuState={open:true,idx:idx+1};
        var newEl=$('editor').children[idx+1];
        if(newEl){
          var c=newEl.querySelector('.block-content');
          if(c){c.focus();showSlash(c)}
        }
      },50);
      return;
    }
  }

  // Tab 들여쓰기 / Shift+Tab 내어쓰기
  if(e.key==='Tab'){
    e.preventDefault();
    if(e.shiftKey){
      // TAB-02: Shift+Tab — 커서 앞 또는 줄 시작의 4칸 스페이스 제거
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
    triggerAutoSave();
    return;
  }

  // 규칙 9: 서식 단축키
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey){
    if(e.key==='b'){e.preventDefault();document.execCommand('bold');return}
    if(e.key==='i'){e.preventDefault();document.execCommand('italic');return}
    if(e.key==='u'){e.preventDefault();document.execCommand('underline');return}
  }
}
export function handlePaste(e){
  e.preventDefault();
  var html=e.clipboardData.getData('text/html');
  var txt=e.clipboardData.getData('text/plain');
  var files=e.clipboardData.files;

  // 이미지 파일 붙여넣기 - Storage에 업로드
  if(files&&files.length>0){
    for(var i=0;i<files.length;i++){
      var file=files[i];
      if(file.type.startsWith('image/')){
        var mode=state.db.settings.imageStorage||'storage';
        if(mode==='storage'){
          uploadToStorage(file,'images',ALLOWED_IMAGE_TYPES).then(function(result){
            pushUndoImmediate();
            var b={id:genId(),type:'image',src:result.url,caption:''};
            var idx=state.currentInsertIdx!==null?state.currentInsertIdx+1:state.page.blocks.length;
            state.page.blocks.splice(idx,0,b);
            renderBlocks();triggerAutoSave();
            toast('이미지 삽입');
          }).catch(function(err){
            console.error('이미지 업로드 실패:',err);
            toast(err.message||'이미지 업로드 실패','err');
          });
        }else{
          var reader=new FileReader();
          reader.onload=function(ev){
            pushUndoImmediate();
            var b={id:genId(),type:'image',src:ev.target.result,caption:''};
            var idx=state.currentInsertIdx!==null?state.currentInsertIdx+1:state.page.blocks.length;
            state.page.blocks.splice(idx,0,b);
            renderBlocks();triggerAutoSave();
            toast('이미지 삽입');
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  }

  // 여러 줄 텍스트 붙여넣기 - 문단별 블록화 (PASTE-01: 커서 위치 반영)
  if(txt&&txt.indexOf('\n')!==-1){
    var lines=txt.split(/\n+/).filter(function(l){return l.trim()!==''});
    if(lines.length>1){
      // 테이블/컬럼/캡션 안에서는 블록 분할 안 함
      if(e.target.closest('.block-col-content')||e.target.closest('th')||e.target.closest('td')||e.target.closest('.block-image-caption')){
        document.execCommand('insertText',false,txt.replace(/\n/g,' '));
        triggerAutoSave();
        return;
      }
      var pasteEl=e.target.closest('.block');
      if(!pasteEl){document.execCommand('insertText',false,txt);triggerAutoSave();return}
      var pasteIdx=parseInt(pasteEl.getAttribute('data-idx'));
      if(isNaN(pasteIdx)){document.execCommand('insertText',false,txt);triggerAutoSave();return}
      var contentEl=pasteEl.querySelector('.block-content');
      if(!contentEl){document.execCommand('insertText',false,txt);triggerAutoSave();return}

      pushUndoImmediate();
      // 커서 위치에서 분할
      var pSel=window.getSelection();
      var afterHTML='';
      if(pSel&&pSel.rangeCount>0){
        var pRange=pSel.getRangeAt(0);
        if(!pSel.isCollapsed)pRange.deleteContents();
        var afterRange=document.createRange();
        afterRange.setStart(pRange.endContainer,pRange.endOffset);
        afterRange.setEnd(contentEl,contentEl.childNodes.length);
        var afterFrag=afterRange.extractContents();
        var tempDiv=document.createElement('div');
        tempDiv.appendChild(afterFrag);
        afterHTML=tempDiv.innerHTML;
      }
      var beforeHTML=sanitizeHTML(contentEl.innerHTML);
      // 현재 블록 = 커서 앞 + 첫 줄 (text/plain → HTML escape)
      state.page.blocks[pasteIdx].content=beforeHTML+esc(lines[0]);
      // 중간 줄: 새 블록
      var insertIdx=pasteIdx;
      for(var j=1;j<lines.length-1;j++){
        insertIdx++;
        state.page.blocks.splice(insertIdx,0,{id:genId(),type:'text',content:esc(lines[j])});
      }
      // 마지막 줄 + 커서 뒤 콘텐츠
      insertIdx++;
      state.page.blocks.splice(insertIdx,0,{id:genId(),type:'text',content:esc(lines[lines.length-1])+sanitizeHTML(afterHTML)});
      renderBlocks();triggerAutoSave();
      focusBlock(insertIdx,-1);
      return;
    }
  }

  // 단일 줄 텍스트
  document.execCommand('insertText',false,txt);
  triggerAutoSave();
}

export function setupBlockEvents(div,b,idx){
  var cons=div.querySelectorAll('.block-content');
  for(var i=0;i<cons.length;i++){(function(el){
    // 보기 모드에서 더블클릭하면 편집 모드로
    el.addEventListener('dblclick',function(){
      if(!state.editMode){import('../ui/sidebar.js').then(function(m){m.toggleEdit();setTimeout(function(){focusBlock(idx)},50)})}
    });
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
      }
    });
    el.addEventListener('keydown',function(e){handleKey(e,b,idx,el)});
    el.addEventListener('paste',handlePaste);
    el.addEventListener('compositionstart',function(){state.isComposing=true});
    el.addEventListener('compositionend',function(){
      state.isComposing=false;
    });
    el.addEventListener('mouseup',showFmtBar);
    // 클릭 시 포커스
    el.addEventListener('click',function(e){
      if(state.editMode&&el.getAttribute('contenteditable')==='true'){
        el.focus();
      }
    });
  })(cons[i])}

  // 블록 전체 클릭 시
  div.addEventListener('click',function(e){
    if(e.target.closest('.block-handle')||e.target.closest('.block-add-below')||e.target.closest('button')||e.target.closest('select')||e.target.closest('input')||e.target.closest('a'))return;
    var con=div.querySelector('.block-content')||div.querySelector('.block-col-content');
    if(con&&state.editMode){con.focus()}
  });

  // 테이블 셀
  var cells=div.querySelectorAll('th,td');
  for(var j=0;j<cells.length;j++){(function(cell){
    cell.addEventListener('input',triggerAutoSave);
    cell.addEventListener('paste',handlePaste);
    cell.addEventListener('click',function(){if(state.editMode)cell.focus()});
    cell.addEventListener('dblclick',function(){if(!state.editMode){import('../ui/sidebar.js').then(function(m){m.toggleEdit();setTimeout(function(){cell.focus()},50)})}});
  })(cells[j])}

  // 테이블 필터
  var filterInput=div.querySelector('.table-filter-input');
  if(filterInput){(function(fInput){
    var colSelect=div.querySelector('.table-filter-col');
    fInput.addEventListener('input',function(){
      var col=colSelect?parseInt(colSelect.value):0;
      var query=fInput.value;
      import('../editor/table.js').then(function(m){
        var visible=m.filterTableRows(b.id,col,query);
        var trs=div.querySelectorAll('tr');
        for(var ti=1;ti<trs.length;ti++){trs[ti].style.display=visible.indexOf(ti)===-1?'none':''}
      });
    });
    if(colSelect){colSelect.addEventListener('change',function(){fInput.dispatchEvent(new Event('input'))})}
  })(filterInput)}

  // 컬럼 콘텐츠
  var colCons=div.querySelectorAll('.block-col-content');
  for(var k=0;k<colCons.length;k++){(function(el,colIdx){
    el.setAttribute('data-col-content','true');
    el.addEventListener('dblclick',function(e){e.stopPropagation();if(!state.editMode){import('../ui/sidebar.js').then(function(m){m.toggleEdit();setTimeout(function(){el.focus()},50)})}});
    el.addEventListener('input',function(e){
      e.stopPropagation();
      // 해당 컬럼 데이터 직접 업데이트
      var blockEl=el.closest('.block');
      if(blockEl){
        var blockId=blockEl.getAttribute('data-id');
        var blk=findBlock(blockId);
        if(blk&&blk.columns)blk.columns[colIdx]=sanitizeHTML(el.innerHTML);
      }
      triggerAutoSave();
    });
    el.addEventListener('paste',handlePaste);
    el.addEventListener('mouseup',showFmtBar);
    el.addEventListener('keydown',function(e){
      e.stopPropagation();
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    el.addEventListener('focus',function(e){e.stopPropagation()});
    el.addEventListener('click',function(e){e.stopPropagation()});
  })(colCons[k],k)}

  // 이미지 캡션
  var caption=div.querySelector('.block-image-caption');
  if(caption){
    caption.addEventListener('input',triggerAutoSave);
    caption.addEventListener('paste',handlePaste);
    caption.addEventListener('dblclick',function(){if(!state.editMode){import('../ui/sidebar.js').then(function(m){m.toggleEdit();setTimeout(function(){caption.focus()},50)})}});
  }

  // 이미지/파일 블록 백스페이스 삭제
  var mediaWrap=div.querySelector('.block-image-wrap,.block-file-wrap');
  if(mediaWrap){
    mediaWrap.addEventListener('keydown',function(e){
      if(!state.editMode)return;
      if(e.key==='Backspace'||e.key==='Delete'){
        e.preventDefault();
        deleteBlock(idx);
      }
    });
    mediaWrap.addEventListener('click',function(){if(state.editMode)mediaWrap.focus()});
  }

  // 할일 체크박스
  if(b.type==='todo'){
    var cb=div.querySelector('input[type="checkbox"]');
    if(cb){(function(blockId){
      cb.addEventListener('change',function(){
        if(!state.editMode)return;
        var blk=findBlock(blockId);
        if(blk)blk.checked=cb.checked;
        div.classList.toggle('done',cb.checked);
        triggerAutoSave();
      });
      cb.addEventListener('click',function(e){
        if(!state.editMode){e.preventDefault();import('../ui/sidebar.js').then(function(m){m.toggleEdit()})}
      });
    })(b.id)}
  }

  // 토글
  if(b.type==='toggle'){
    var arrow=div.querySelector('.block-toggle-arrow');
    var head=div.querySelector('.block-toggle-head');
    var body=div.querySelector('.block-toggle-body');
    if(arrow){(function(blockId){
      arrow.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        var blk=findBlock(blockId);
        var isOpen=blk?!blk.open:!head.classList.contains('open');
        if(blk)blk.open=isOpen;
        head.classList.toggle('open',isOpen);
        body.classList.toggle('open',isOpen);
      });
    })(b.id)}
    // 토글 바디의 block-content에 별도 이벤트
    var bodyContent=body?body.querySelector('.block-content'):null;
    if(bodyContent){
      // 바디에 고유 식별자 추가
      bodyContent.setAttribute('data-toggle-body','true');
      bodyContent.addEventListener('input',function(e){
        e.stopPropagation();
        // 직접 innerContent 업데이트
        var blk=findBlock(b.id);
        if(blk)blk.innerContent=sanitizeHTML(bodyContent.innerHTML);
        triggerAutoSave();
      });
      bodyContent.addEventListener('keydown',function(e){
        e.stopPropagation();
        // Enter 시 줄바꿈만 (새 블록 생성 안함)
        if(e.key==='Enter'&&!e.shiftKey){
          e.preventDefault();
          document.execCommand('insertLineBreak');
        }
      });
      bodyContent.addEventListener('focus',function(e){
        e.stopPropagation();
      });
      bodyContent.addEventListener('click',function(e){
        e.stopPropagation();
      });
    }
  }
}

export function setupListeners(){
  setupBlockTracking();

  // 제목 IME composition 추적
  var titleEl=$('pageTitle');
  var titleComposing=false;
  titleEl.addEventListener('compositionstart',function(){titleComposing=true});
  titleEl.addEventListener('compositionend',function(){titleComposing=false});
  // 제목에서 Enter → 첫 블록 포커스 (없으면 생성)
  titleEl.addEventListener('keydown',function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      if(!state.page||!state.page.blocks||state.page.blocks.length===0){
        if(state.page){
          state.page.blocks=[{id:genId(),type:'text',content:''}];
          renderBlocks();
        }
      }
      focusBlock(0,0);
    }
  });
  // 제목 input에서 composition 중 autoSave 방지
  titleEl.addEventListener('input',function(){
    if(titleComposing)return;
    triggerAutoSave();
  });

  // Editor event delegation (click)
  $('editor').addEventListener('click',function(e){
    var target=e.target.closest('[data-action]');
    if(!target)return;
    var action=target.dataset.action;
    var idx=target.dataset.idx!==undefined?parseInt(target.dataset.idx):null;
    var blockId=target.dataset.blockId||null;

    switch(action){
      case'addBlockBelow':addBlockBelow(idx);break;
      case'showBlockCtx':import('../ui/sidebar.js').then(function(m){m.showBlockCtx(e,idx)});break;
      case'deleteBlock':deleteBlock(idx);break;
      case'addTblRow':import('../editor/table.js').then(function(m){m.addTblRow(blockId)});break;
      case'addTblCol':import('../editor/table.js').then(function(m){m.addTblCol(blockId)});break;
      case'delTblRow':import('../editor/table.js').then(function(m){m.delTblRow(blockId)});break;
      case'delTblCol':import('../editor/table.js').then(function(m){m.delTblCol(blockId)});break;
      case'openColWidthModal':import('../editor/table.js').then(function(m){m.openColWidthModal(blockId)});break;
      case'deleteTable':import('../editor/table.js').then(function(m){m.deleteTable(blockId)});break;
      case'sortTable':import('../editor/table.js').then(function(m){var col=parseInt(target.dataset.col);var blk=null;if(state.page&&state.page.blocks){for(var si=0;si<state.page.blocks.length;si++){if(state.page.blocks[si].id===blockId){blk=state.page.blocks[si];break}}}if(!blk)return;var curDir=(blk.sortCol===col)?blk.sortDir:'desc';var newDir=curDir==='asc'?'desc':'asc';m.sortTable(blockId,col,newDir)});break;
      case'copyCode':copyCode(target);break;
      case'downloadCode':downloadCode(target);break;
      case'openCalloutIconPicker':import('./media.js').then(function(m){m.openCalloutIconPicker(blockId)});break;
      case'openCodeSetting':import('./media.js').then(function(m){m.openCodeSetting(blockId)});break;
      case'setImageScale':import('./media.js').then(function(m){m.setImageScale(idx,parseInt(target.dataset.scale))});break;
      case'copyImageUrl':import('./media.js').then(function(m){m.copyImageUrl(idx)});break;
      case'downloadImage':import('./media.js').then(function(m){m.downloadImage(idx)});break;
      case'downloadFile':import('./media.js').then(function(m){m.downloadFile(idx)});break;
    }
  });

  // Editor event delegation (change for select elements)
  $('editor').addEventListener('change',function(e){
    var target=e.target.closest('[data-action]');
    if(!target)return;
    if(target.dataset.action==='setTblAlign'){
      import('../editor/table.js').then(function(m){m.setTblAlign(target.dataset.blockId,target.value)});
    }
  });

  document.addEventListener('click',function(e){
    if(!$('ctxMenu').contains(e.target))hideCtx();
    if(!$('slashMenu').contains(e.target)&&!e.target.classList.contains('block-content'))hideSlash();
    if(!$('fmtBar').contains(e.target)&&!e.target.closest('.block-content')&&!e.target.closest('.block-col-content'))hideFmtBar();
    // 페이지 링크 클릭
    if(e.target.classList.contains('page-link')){
      e.preventDefault();
      var pid=e.target.getAttribute('data-page-id');
      if(pid){import('../ui/sidebar.js').then(function(m){m.loadPage(pid)})}
      return;
    }
    // 인라인 태그 클릭
    if(e.target.classList.contains('inline-tag')&&state.editMode){
      e.preventDefault();
      e.stopPropagation();
      showTagPicker(e.target);
    }else if(!$('tagPicker').contains(e.target)){
      hideTagPicker();
    }
  });
  document.addEventListener('keydown',function(e){
    if((e.metaKey||e.ctrlKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();return}
    if((e.metaKey||e.ctrlKey)&&e.key==='y'){e.preventDefault();redo();return}
    if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='Z'){e.preventDefault();redo();return}
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch()}
    if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();if(state.editMode){import('../ui/sidebar.js').then(function(m){m.saveAndExit()})}}
    if((e.metaKey||e.ctrlKey)&&e.key==='/'){e.preventDefault();openShortcutHelp()}
    if((e.metaKey||e.ctrlKey)&&e.key===']'){
      e.preventDefault();
      var ci=getCurrentIdx();
      if(ci>0){moveBlockUp(ci);focusBlock(ci-1)}
      return;
    }
    if((e.metaKey||e.ctrlKey)&&e.key==='['){
      e.preventDefault();
      var ci=getCurrentIdx();
      if(ci<state.page.blocks.length-1){moveBlockDown(ci);focusBlock(ci+1)}
      return;
    }
    var COLOR_MAP={'1':'#FF0000','2':'#FF8C00','3':'#FFD700','4':'#00C853','5':'#2196F3','6':'#1A237E','7':'#9C27B0','8':'#E91E63','9':'#9E9E9E','0':null};
    if((e.metaKey||e.ctrlKey)&&COLOR_MAP.hasOwnProperty(e.key)){
      var sel=window.getSelection();
      if(sel&&!sel.isCollapsed&&state.editMode){
        e.preventDefault();
        if(e.key==='0'){
          document.execCommand('removeFormat',false,null);
        }else{
          document.execCommand('foreColor',false,COLOR_MAP[e.key]);
        }
        triggerAutoSave();
      }
      return;
    }
    if(e.key==='Escape'){closeImageViewer();closeAllModals();closeAllPanels();hideCtx();hideSlash();hideFmtBar()}
    // 이미지 뷰어에서 좌우 화살표
    if($('imageViewer').classList.contains('open')){
      if(e.key==='ArrowLeft')viewerNav(-1);
      if(e.key==='ArrowRight')viewerNav(1);
    }
  });
  window.addEventListener('resize',function(){if(window.innerWidth>768){import('../ui/sidebar.js').then(function(m){m.closeMobile()})}});
  window.addEventListener('beforeunload',function(e){
    if(state.editMode){
      // hasChanges check inlined to avoid circular deps
      if(state.editBackup){
        if($('pageTitle').value!==state.editBackup.title||$('pageIcon').textContent!==state.editBackup.icon){
          e.preventDefault();e.returnValue='작성 중인 내용이 저장되지 않았습니다.';return e.returnValue
        }
      }
    }
  });

  // 에디터 영역 클릭 - 빈 공간 클릭 시 마지막 블록 포커스 또는 새 블록 생성
  var editorWrap=$('editorWrap');
  editorWrap.addEventListener('click',function(e){
    if(!state.editMode)return;
    // 텍스트 드래그 선택 중이면 무시 (최하단 이동 방지)
    var sel=window.getSelection();
    if(sel&&!sel.isCollapsed)return;
    // 클릭이 editor 내부 블록이 아닌 빈 공간일 때
    var editor=$('editor');
    if(e.target===editor||e.target.classList.contains('editor-inner')){
      e.preventDefault();
      if(state.page.blocks.length===0){
        // 블록이 없으면 새로 생성
        state.page.blocks.push({id:genId(),type:'text',content:''});
        renderBlocks();
      }
      // 마지막 블록의 마지막에 포커스
      focusBlock(state.page.blocks.length-1,-1);
    }
  });

  // 블록 드래그앤드롭 재정렬 + 이미지/파일 드롭
  var editor=$('editor');
  editor.addEventListener('dragstart',function(e){
    if(!state.editMode)return;
    var handle=e.target.closest('.block-handle[draggable]');
    if(!handle)return;
    state.dragBlockIdx=parseInt(handle.getAttribute('data-drag-idx'));
    var block=handle.closest('.block');
    if(block)block.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain','block');
  });
  editor.addEventListener('dragend',function(){
    state.dragBlockIdx=null;
    var dragging=editor.querySelectorAll('.block.dragging');
    for(var i=0;i<dragging.length;i++)dragging[i].classList.remove('dragging');
    var ind=editor.querySelector('.drag-indicator');
    if(ind)ind.remove();
  });
  editor.addEventListener('dragover',function(e){
    e.preventDefault();
    if(state.dragBlockIdx!==null){
      e.dataTransfer.dropEffect='move';
      var ind=editor.querySelector('.drag-indicator');
      if(!ind){ind=document.createElement('div');ind.className='drag-indicator';editor.appendChild(ind)}
      var blocks=editor.querySelectorAll('.block');
      var targetIdx=-1;
      for(var i=0;i<blocks.length;i++){
        var rect=blocks[i].getBoundingClientRect();
        if(e.clientY<rect.top+rect.height/2){targetIdx=i;break}
      }
      if(targetIdx===-1)targetIdx=blocks.length;
      ind.setAttribute('data-drop-idx',targetIdx);
      if(targetIdx<blocks.length){
        editor.insertBefore(ind,blocks[targetIdx]);
      }else{
        editor.appendChild(ind);
      }
    }else{
      if(state.editMode)editor.classList.add('drag-over');
    }
  });
  editor.addEventListener('dragleave',function(){
    editor.classList.remove('drag-over');
  });
  editor.addEventListener('drop',function(e){
    e.preventDefault();editor.classList.remove('drag-over');
    if(!state.editMode)return;
    if(state.dragBlockIdx!==null){
      var ind=editor.querySelector('.drag-indicator');
      var toIdx=ind?parseInt(ind.getAttribute('data-drop-idx')):state.dragBlockIdx;
      if(ind)ind.remove();
      if(toIdx>state.dragBlockIdx)toIdx--;
      // 드래그 전 현재 편집 중인 DOM 내용을 state에 동기화
      var edChs=editor.children;
      for(var si=0;si<edChs.length;si++){
        var sEl=edChs[si],sId=sEl.getAttribute('data-id');
        if(!sId)continue;
        for(var sj=0;sj<state.page.blocks.length;sj++){
          if(state.page.blocks[sj].id===sId){
            var sCon=sEl.querySelector('.block-content');
            if(sCon)state.page.blocks[sj].content=sanitizeHTML(sCon.innerHTML);
            break;
          }
        }
      }
      reorderBlock(state.dragBlockIdx,toIdx);
      state.dragBlockIdx=null;
      return;
    }
    // 파일 드롭 시에도 drag indicator 제거
    var fileInd=editor.querySelector('.drag-indicator');
    if(fileInd)fileInd.remove();
    var files=e.dataTransfer.files;
    for(var i=0;i<files.length;i++){
      var file=files[i];
      if(file.type.startsWith('image/')){
        var mode=state.db.settings.imageStorage||'storage';
        if(mode==='storage'){
          uploadToStorage(file,'images',ALLOWED_IMAGE_TYPES).then(function(result){
            addImageBlock(result.url);
          }).catch(function(err){
            console.error('이미지 업로드 실패:',err);
            toast(err.message||'이미지 업로드 실패','err');
          });
        }else{
          var reader=new FileReader();
          reader.onload=function(ev){addImageBlock(ev.target.result)};
          reader.readAsDataURL(file);
        }
      }else if(file.type==='application/pdf'){
        var reader=new FileReader();
        reader.onload=function(ev){addPdfBlock(ev.target.result)};
        reader.readAsDataURL(file)
      }else{
        var reader=new FileReader();
        (function(f){
          reader.onload=function(ev){
            pushUndoImmediate();
            var b={id:genId(),type:'file',url:ev.target.result,name:f.name};
            state.page.blocks.push(b);renderBlocks();triggerAutoSave()
          }
        })(file);
        reader.readAsDataURL(file)
      }
    }
  });
  import('../ui/sidebar.js').then(function(m){m.setupTrashDrop()});
}
