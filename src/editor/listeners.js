// src/editor/listeners.js — 키보드, 클립보드, 드래그&드롭 이벤트

import state from '../data/store.js';
import {ALLOWED_IMAGE_TYPES} from '../config/firebase.js';
import {$,$$,genId,toast} from '../utils/helpers.js';
import {uploadToStorage} from '../data/firestore.js';
import {renderBlocks} from './renderer.js';
import {triggerAS,focusBlock,insertBlock,deleteBlock,addBlockBelow,updateNums,setupBlockTracking,copyCode,downloadCode} from './blocks.js';
import {addImageBlock,addPdfBlock,closeImageViewer,viewerNav,openImageViewer} from './media.js';
import {showSlash,hideSlash,filterSlash,moveSlashSel,execSlash,showFmtBar,hideFmtBar} from '../ui/toolbar.js';
import {openSearch,closeModal,closeAllModals,closeAllPanels,openShortcutHelp} from '../ui/modals.js';
import {hideCtx} from '../ui/sidebar.js';
import {showTagPicker,hideTagPicker} from '../ui/toolbar.js';

export function handleKey(e,b,idx,el){
  if(state.isComp)return;
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
      var newHtml=txt.replace(/@([^@<>\s]+)$/,'<span class="inline-tag tag-blue" contenteditable="false">@'+tagText+'</span>&nbsp;');
      el.innerHTML=newHtml;
      // 커서를 끝으로 이동
      var range=document.createRange();
      var sel=window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      triggerAS();
      return;
    }

    e.preventDefault();
    state.page.blocks[idx].content=el.innerHTML;
    var newType='text';
    // bullet/number/todo는 같은 타입 유지, 단 빈 내용이면 text로
    if((b.type==='bullet'||b.type==='number'||b.type==='todo')&&el.textContent.trim()!==''){
      newType=b.type;
    }
    var newB={id:genId(),type:newType,content:''};
    if(newType==='todo')newB.checked=false;
    if(newType==='number')newB.num=(b.num||1)+1;
    insertBlock(idx+1,newB);
    updateNums();
    return;
  }

  // 규칙 2: Shift+Enter - 줄바꿈 (기본 동작 허용)
  if(e.key==='Enter'&&e.shiftKey){
    return; // 기본 동작
  }

  // 규칙 3: Backspace - 빈 블록 처리
  if(e.key==='Backspace'){
    var sel=window.getSelection();
    var atStart=sel.anchorOffset===0&&sel.isCollapsed;

    if(el.textContent===''||el.innerHTML==='<br>'){
      e.preventDefault();
      // 리스트 타입이면 text로 변환
      if(b.type==='bullet'||b.type==='number'||b.type==='todo'){
        state.page.blocks[idx].type='text';
        renderBlocks();
        focusBlock(idx);
      }
      // text이고 첫 블록이 아니면 삭제 후 이전 블록으로 포커스
      else if(state.page.blocks.length>1){
        deleteBlock(idx);
        if(idx>0)focusBlock(idx-1);
      }
      return;
    }
    // 커서가 맨 앞이고 이전 블록이 있으면 → 이전 블록 끝으로 포커스 (병합 안함)
    if(atStart&&idx>0){
      e.preventDefault();
      focusBlock(idx-1,'end');
      return;
    }
  }

  // 규칙 4: Delete - 다음 블록과 병합
  if(e.key==='Delete'){
    var sel=window.getSelection();
    var atEnd=sel.anchorOffset===el.textContent.length&&sel.isCollapsed;
    if(atEnd&&idx<state.page.blocks.length-1){
      e.preventDefault();
      var nextB=state.page.blocks[idx+1];
      if(['text','h1','h2','h3','bullet','number','quote'].includes(nextB.type)){
        b.content=el.innerHTML+(nextB.content||'');
        state.page.blocks.splice(idx+1,1);
        renderBlocks();
        focusBlock(idx,el.textContent.length);
      }
      return;
    }
  }

  // 규칙 7-8: 방향키로 블록 이동
  if(e.key==='ArrowUp'&&!e.shiftKey){
    var sel=window.getSelection();
    if(sel.anchorOffset===0&&idx>0){
      e.preventDefault();
      focusBlock(idx-1,-1); // -1은 끝으로
      return;
    }
  }
  if(e.key==='ArrowDown'&&!e.shiftKey){
    var sel=window.getSelection();
    if(sel.anchorOffset===el.textContent.length&&idx<state.page.blocks.length-1){
      e.preventDefault();
      focusBlock(idx+1,0);
      return;
    }
  }

  // 규칙 10: 슬래시 메뉴
  if(e.key==='/'&&el.textContent===''){
    state.slashSt={open:true,idx:idx};
    showSlash(el);
    return;
  }

  // Tab 들여쓰기
  if(e.key==='Tab'){
    e.preventDefault();
    document.execCommand('insertText',false,'    '); // 4칸 스페이스
    triggerAS();
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
            var b={id:genId(),type:'image',src:result.url,caption:''};
            var idx=state.currentInsertIdx!==null?state.currentInsertIdx+1:state.page.blocks.length;
            state.page.blocks.splice(idx,0,b);
            renderBlocks();triggerAS();
            toast('이미지 삽입');
          }).catch(function(err){
            console.error('이미지 업로드 실패:',err);
            toast(err.message||'이미지 업로드 실패','err');
          });
        }else{
          var reader=new FileReader();
          reader.onload=function(ev){
            var b={id:genId(),type:'image',src:ev.target.result,caption:''};
            var idx=state.currentInsertIdx!==null?state.currentInsertIdx+1:state.page.blocks.length;
            state.page.blocks.splice(idx,0,b);
            renderBlocks();triggerAS();
            toast('이미지 삽입');
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  }

  // 여러 줄 텍스트 붙여넣기 - 문단별 블록화
  if(txt&&txt.indexOf('\n')!==-1){
    var lines=txt.split(/\n+/).filter(function(l){return l.trim()!==''});
    if(lines.length>1){
      var idx=state.currentInsertIdx!==null?state.currentInsertIdx:state.page.blocks.length-1;
      // 현재 블록에 첫 줄 삽입
      document.execCommand('insertText',false,lines[0]);
      // 나머지 줄은 새 블록으로
      for(var j=1;j<lines.length;j++){
        idx++;
        state.page.blocks.splice(idx,0,{id:genId(),type:'text',content:lines[j]});
      }
      renderBlocks();triggerAS();
      return;
    }
  }

  // 단일 줄 텍스트
  document.execCommand('insertText',false,txt);
  triggerAS();
}

export function setupBlockEvents(div,b,idx){
  var cons=div.querySelectorAll('.block-content');
  for(var i=0;i<cons.length;i++){(function(el){
    // 보기 모드에서 더블클릭하면 편집 모드로
    el.addEventListener('dblclick',function(){
      if(!state.editMode){import('../ui/sidebar.js').then(function(m){m.toggleEdit();setTimeout(function(){focusBlock(idx)},50)})}
    });
    el.addEventListener('input',function(){
      triggerAS();
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
    el.addEventListener('compositionstart',function(){state.isComp=true});
    el.addEventListener('compositionend',function(){
      state.isComp=false;
      // 한글 조합 완료 후 슬래시 메뉴 필터링
      var menu=$('slashMenu');
      if(menu.classList.contains('open')){
        var txt=el.innerText||el.textContent;
        txt=txt.replace(/\n/g,'').trim();
        if(txt.startsWith('/'))filterSlash(txt.slice(1));
        else hideSlash();
      }
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
    if(e.target.closest('.block-handle')||e.target.closest('.block-add-below')||e.target.closest('button')||e.target.closest('select')||e.target.closest('a'))return;
    var con=div.querySelector('.block-content')||div.querySelector('.block-col-content');
    if(con&&state.editMode){con.focus()}
  });

  // 테이블 셀
  var cells=div.querySelectorAll('th,td');
  for(var j=0;j<cells.length;j++){(function(cell){
    cell.addEventListener('input',triggerAS);
    cell.addEventListener('paste',handlePaste);
    cell.addEventListener('click',function(){if(state.editMode)cell.focus()});
    cell.addEventListener('dblclick',function(){if(!state.editMode){import('../ui/sidebar.js').then(function(m){m.toggleEdit();setTimeout(function(){cell.focus()},50)})}});
  })(cells[j])}

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
        for(var i=0;i<state.page.blocks.length;i++){
          if(state.page.blocks[i].id===blockId&&state.page.blocks[i].columns){
            state.page.blocks[i].columns[colIdx]=el.innerHTML;
            break;
          }
        }
      }
      triggerAS();
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
    caption.addEventListener('input',triggerAS);
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
    if(cb){
      cb.addEventListener('change',function(){
        if(!state.editMode)return;
        b.checked=cb.checked;
        div.classList.toggle('done',b.checked);
        triggerAS();
      });
      cb.addEventListener('click',function(e){
        if(!state.editMode){e.preventDefault();import('../ui/sidebar.js').then(function(m){m.toggleEdit()})}
      });
    }
  }

  // 토글
  if(b.type==='toggle'){
    var arrow=div.querySelector('.block-toggle-arrow');
    var head=div.querySelector('.block-toggle-head');
    var body=div.querySelector('.block-toggle-body');
    if(arrow){
      arrow.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        b.open=!b.open;
        head.classList.toggle('open',b.open);
        body.classList.toggle('open',b.open);
        // 상태 저장
        for(var i=0;i<state.page.blocks.length;i++){
          if(state.page.blocks[i].id===b.id){state.page.blocks[i].open=b.open;break}
        }
      });
    }
    // 토글 바디의 block-content에 별도 이벤트
    var bodyContent=body?body.querySelector('.block-content'):null;
    if(bodyContent){
      // 바디에 고유 식별자 추가
      bodyContent.setAttribute('data-toggle-body','true');
      bodyContent.addEventListener('input',function(e){
        e.stopPropagation();
        // 직접 innerContent 업데이트
        for(var i=0;i<state.page.blocks.length;i++){
          if(state.page.blocks[i].id===b.id){state.page.blocks[i].innerContent=bodyContent.innerHTML;break}
        }
        triggerAS();
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
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch()}
    if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();if(state.editMode){import('../ui/sidebar.js').then(function(m){m.saveAndExit()})}}
    if((e.metaKey||e.ctrlKey)&&e.key==='/'){e.preventDefault();openShortcutHelp()}
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

  // 에디터 드래그앤드롭 이미지 업로드
  var editor=$('editor');
  editor.addEventListener('dragover',function(e){e.preventDefault();if(state.editMode)editor.classList.add('drag-over')});
  editor.addEventListener('dragleave',function(e){editor.classList.remove('drag-over')});
  editor.addEventListener('drop',function(e){
    e.preventDefault();editor.classList.remove('drag-over');
    if(!state.editMode)return;
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
            var b={id:genId(),type:'file',url:ev.target.result,name:f.name};
            state.page.blocks.push(b);renderBlocks();triggerAS()
          }
        })(file);
        reader.readAsDataURL(file)
      }
    }
  });
  import('../ui/sidebar.js').then(function(m){m.setupTrashDrop()});
}
