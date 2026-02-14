// src/editor/renderer.js — renderBlocks, createBlockEl

import state from '../data/store.js';
import {$,esc} from '../utils/helpers.js';
import {sanitizeHTML} from '../utils/sanitize.js';
import {updateNums,genTOC,triggerAutoSave,focusBlock,deleteBlock,addBlockBelow,scrollToBlk,findBlock,findBlockIndex,getChildren} from './blocks.js';
import {renderCalendar} from './calendar.js';
import {renderChart} from './chart.js';
import {renderSlideBlock,getYTId,openImageViewer,setupSlideAutoPlay} from './media.js';
import {setupBlockEvents} from './listeners.js';

var blockElements=new Map();

var LIST_TYPES_SET=['bullet','number','todo'];

// 리스트 부모 판별: 하위 항목(indent 더 큰 연속 블록)이 있는 인덱스
function getListParents(blocks){
  var result={};
  for(var i=0;i<blocks.length;i++){
    if(LIST_TYPES_SET.indexOf(blocks[i].type)===-1)continue;
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
  arrow.textContent='\u25B6';
  arrow.setAttribute('data-collapse-id',block.id);
  var content=div.querySelector('.block-content');
  if(content)content.parentNode.insertBefore(arrow,content);
  else div.insertBefore(arrow,div.firstChild);
}

export function renderBlocks(){
  var ed=$('editor');
  ed.innerHTML='';
  blockElements.clear();
  ed.className='editor '+(state.editMode?'edit-mode':'view-mode');
  var hasChildren=getListParents(state.page.blocks);
  var hiddenSet=getCollapsedChildren(state.page.blocks);
  for(var i=0;i<state.page.blocks.length;i++){
    var el=createBlockEl(state.page.blocks[i],i);
    if(hasChildren[i]){
      var isCollapsed=state.page.blocks[i].collapsed;
      addCollapseArrow(el,state.page.blocks[i],isCollapsed);
      if(isCollapsed)el.classList.add('collapsed-parent');
    }
    if(hiddenSet.has(i))el.classList.add('collapsed-child');
    ed.appendChild(el);
    blockElements.set(state.page.blocks[i].id,el);
  }
  updateNums();setupSlideAutoPlay()
}

export function updateBlock(blockId){
  var b=findBlock(blockId);
  if(!b)return;
  var idx=findBlockIndex(blockId);
  var oldEl=blockElements.get(blockId);
  if(!oldEl)return;
  var newEl=createBlockEl(b,idx);
  oldEl.replaceWith(newEl);
  blockElements.set(blockId,newEl);
}

export function insertBlockEl(block,index){
  var el=createBlockEl(block,index);
  var editor=$('editor');
  var ref=editor.children[index];
  if(ref)editor.insertBefore(el,ref);
  else editor.appendChild(el);
  blockElements.set(block.id,el);
  for(var i=index+1;i<editor.children.length;i++){
    editor.children[i].setAttribute('data-idx',i);
  }
}

export function removeBlockEl(blockId){
  var el=blockElements.get(blockId);
  if(el){
    var idx=parseInt(el.getAttribute('data-idx'));
    el.remove();
    blockElements.delete(blockId);
    var editor=$('editor');
    for(var i=idx;i<editor.children.length;i++){
      editor.children[i].setAttribute('data-idx',i);
    }
  }
}
export function createBlockEl(b,idx){
  var div=document.createElement('div');
  div.className='block block-'+b.type;
  div.setAttribute('data-id',b.id);
  div.setAttribute('data-idx',idx);
  var indent=b.indent||0;
  if(indent>0)div.setAttribute('data-indent',indent);
  var ce=state.editMode?' contenteditable="true"':'';
  var inner='';

  switch(b.type){
    case'divider':
      inner='<hr>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'todo':
      if(b.checked)div.classList.add('done');
      inner='<label class="todo-wrap"><input type="checkbox"'+(b.checked?' checked':'')+(state.editMode?'':' onclick="return false"')+'><div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div></label>';
      break;
    case'toggle':
      inner='<div class="block-toggle-wrap">';
      inner+='<div class="block-toggle-head'+(b.open?' open':'')+'">';
      inner+='<span class="block-toggle-arrow" data-id="'+b.id+'">▶</span>';
      inner+='<div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div>';
      inner+='</div>';
      inner+='<div class="block-toggle-body'+(b.open?' open':'')+'">';
      inner+='<div class="block-content"'+ce+' data-placeholder="토글 내용을 입력하세요">'+sanitizeHTML(b.innerContent||'')+'</div>';
      inner+='</div>';
      inner+='</div>';
      break;
    case'callout':
      var ct=b.calloutType||'info',cIcon=b.icon||{info:'💡',success:'✅',warning:'⚠️',danger:'❌'}[ct];
      inner='<div class="block-callout-wrap '+ct+'">';
      inner+='<div class="block-callout-icon"'+(state.editMode?' data-action="openCalloutIconPicker" data-block-id="'+b.id+'" style="cursor:pointer"':'')+'>'+cIcon+'</div>';
      inner+='<div style="flex:1"><div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div></div></div>';
      break;
    case'code':
      inner='<div class="block-code-wrap"><div class="block-code-head">';
      inner+='<span class="block-code-lang"'+(state.editMode?' data-action="openCodeSetting" data-block-id="'+b.id+'" style="cursor:pointer"':'')+'>'+esc(b.lang||'code')+'</span>';
      inner+='<div style="display:flex;gap:4px"><button class="btn btn-sm btn-s" data-action="copyCode">복사</button><button class="btn btn-sm btn-s" data-action="downloadCode">다운로드</button></div></div>';
      inner+='<div class="block-content"'+ce+' style="font-family:monospace;white-space:pre-wrap">'+sanitizeHTML(b.content||'')+'</div></div>';
      break;
    case'image':
      var imgWidth=b.width;
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
    case'slide':
      inner=renderSlideBlock(b,idx);
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'video':
      if(b.isFile){inner='<video controls style="width:100%;max-height:500px;border-radius:var(--rad)"><source src="'+esc(b.url)+'"></video>';}
      else{var vid=getYTId(b.url);inner=vid?'<iframe src="https://www.youtube.com/embed/'+vid+'" style="width:100%;height:400px;border:none;border-radius:var(--rad)" allowfullscreen></iframe>':'<div style="color:var(--err);padding:16px">유효하지 않은 URL</div>';}
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'pdf':
      inner='<iframe src="'+esc(b.src||'')+'#toolbar=1" style="width:100%;height:500px;border:1px solid var(--bdr);border-radius:var(--rad)"></iframe>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'file':
      var fileExt=(b.name||'').split('.').pop().toLowerCase();
      var fileIcon={pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📽️',pptx:'📽️',zip:'📦',rar:'📦',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',mp3:'🎵',mp4:'🎬',txt:'📃'}[fileExt]||'📎';
      inner='<div class="block-file-wrap" tabindex="0" data-block-idx="'+idx+'">';
      inner+='<div class="block-file-card">';
      inner+='<div class="file-icon">'+fileIcon+'</div>';
      inner+='<div class="file-info"><div class="file-name">'+esc(b.name||'파일')+'</div><div class="file-ext">.'+fileExt.toUpperCase()+'</div></div>';
      if(state.editMode)inner+='<div class="file-actions"><button class="media-btn" data-action="downloadFile" data-idx="'+idx+'" title="다운로드">💾</button><button class="media-btn danger" data-action="deleteBlock" data-idx="'+idx+'" title="삭제">🗑️</button></div>';
      else inner+='<a href="'+esc(b.url||'')+'" download="'+esc(b.name||'file')+'" class="file-download-btn">다운로드</a>';
      inner+='</div></div>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'bookmark':
      var domain='';
      try{domain=new URL(b.url||'').hostname}catch(e){}
      inner='<a href="'+esc(b.url||'')+'" target="_blank" class="url-preview">';
      if(b.image)inner+='<img class="url-preview-img" src="'+esc(b.image)+'" onerror="this.style.display=\'none\'">';
      else inner+='<div class="url-preview-img" style="display:flex;align-items:center;justify-content:center;font-size:32px">🔗</div>';
      inner+='<div class="url-preview-info">';
      inner+='<div class="url-preview-title">'+esc(b.title||b.url||'링크')+'</div>';
      if(b.description)inner+='<div class="url-preview-desc">'+esc(b.description)+'</div>';
      inner+='<div class="url-preview-domain">'+esc(domain)+'</div>';
      inner+='</div></a>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'table':
      var rows=b.rows||[['','',''],['','','']],thc=b.headerColor||'',tdc=b.cellColor||'',tAlign=b.align||'left';
      var colWidths=b.colWidths||[];
      var numCols=rows[0]?rows[0].length:3;
      inner='<div class="block-table-wrap"><table style="width:100%;border-collapse:collapse;table-layout:fixed">';
      // colgroup으로 열 너비 설정
      inner+='<colgroup>';
      for(var cw=0;cw<numCols;cw++){
        var w=colWidths[cw]||Math.floor(100/numCols);
        inner+='<col style="width:'+w+'%">';
      }
      inner+='</colgroup>';
      for(var r=0;r<rows.length;r++){
        inner+='<tr>';
        for(var c=0;c<rows[r].length;c++){
          var cs=(r===0&&thc?'background:'+thc+';':'')+(r>0&&tdc?'background:'+tdc+';':'')+'padding:10px;border:1px solid var(--bdr);text-align:'+tAlign+';';
          if(r===0){
            inner+='<th'+ce+' style="'+cs+'">'+sanitizeHTML(rows[r][c]||'');
            if(state.editMode){var sortIcon=(b.sortCol===c)?(b.sortDir==='asc'?'\u2191':'\u2193'):'\u21C5';inner+='<span class="sort-btn" contenteditable="false" data-action="sortTable" data-block-id="'+b.id+'" data-col="'+c+'">'+sortIcon+'</span>'}
            inner+='</th>';
          }else{
            inner+='<td'+ce+' style="'+cs+'">'+sanitizeHTML(rows[r][c]||'')+'</td>';
          }
        }
        inner+='</tr>';
      }
      inner+='</table></div>';
      if(state.editMode){
        inner+='<div class="block-table-tools" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">';
        inner+='<button class="btn btn-sm btn-s" data-action="addTblRow" data-block-id="'+b.id+'">+행</button>';
        inner+='<button class="btn btn-sm btn-s" data-action="addTblCol" data-block-id="'+b.id+'">+열</button>';
        inner+='<button class="btn btn-sm btn-s" data-action="delTblRow" data-block-id="'+b.id+'">-행</button>';
        inner+='<button class="btn btn-sm btn-s" data-action="delTblCol" data-block-id="'+b.id+'">-열</button>';
        inner+='<select class="btn btn-sm btn-s" data-action="setTblAlign" data-block-id="'+b.id+'"><option value="">정렬</option><option value="left"'+(tAlign==='left'?' selected':'')+'>왼쪽</option><option value="center"'+(tAlign==='center'?' selected':'')+'>가운데</option><option value="right"'+(tAlign==='right'?' selected':'')+'>오른쪽</option></select>';
        inner+='<button class="btn btn-sm btn-s" data-action="openColWidthModal" data-block-id="'+b.id+'">열 너비</button>';
        inner+='<button class="btn btn-sm" style="color:var(--err)" data-action="deleteTable" data-block-id="'+b.id+'">삭제</button>';
        inner+='<span style="margin-left:4px;color:var(--bdr)">|</span>';
        inner+='<select class="btn btn-sm btn-s table-filter-col" style="min-width:60px">';
        for(var fc=0;fc<numCols;fc++){inner+='<option value="'+fc+'">열 '+(fc+1)+'</option>';}
        inner+='</select>';
        inner+='<input type="text" class="table-filter-input" placeholder="필터..." style="padding:4px 8px;font-size:13px;width:120px;border-radius:var(--rad);border:1px solid var(--bdr);background:var(--bg3);color:var(--t1)">';
        inner+='</div>';
        inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      }
      break;
    case'toc':
      inner='<div class="block-toc-wrap">'+genTOC()+'</div>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'columns':
      var cols=b.columns||['',''];
      inner='<div class="block-columns-wrap" style="display:flex;gap:16px">';
      for(var ci=0;ci<cols.length;ci++){
        inner+='<div class="block-col" data-col-idx="'+ci+'" style="flex:1;min-width:0"><div class="block-col-content" data-col-idx="'+ci+'"'+ce+' style="min-height:60px;padding:12px;border:1px dashed var(--bdr);border-radius:var(--rad)">'+sanitizeHTML(cols[ci]||'')+'</div></div>';
      }
      inner+='</div>';
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'quote':
      inner='<div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div>';
      break;
    case'bullet':
      inner='<div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div>';
      break;
    case'number':
      div.setAttribute('data-num',b.num||1);
      div.setAttribute('data-num-style',indent%5);
      inner='<div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div>';
      break;
    case'calendar':
      inner=renderCalendar(b,idx);
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    case'chart-bar':
    case'chart-pie':
    case'chart-line':
      inner=renderChart(b,idx);
      if(state.editMode)inner+='<button class="block-add-below" data-action="addBlockBelow" data-idx="'+idx+'">+ 블록 추가</button>';
      break;
    default:
      inner='<div class="block-content"'+ce+'>'+sanitizeHTML(b.content||'')+'</div>';
  }
  var handleHtml=state.editMode?'<div class="block-handle" draggable="true" data-drag-idx="'+idx+'"><button class="btn btn-i" tabindex="0" data-action="showBlockCtx" data-idx="'+idx+'">⋮</button></div>':'';
  div.innerHTML=handleHtml+inner;
  setupBlockEvents(div,b,idx);
  return div;
}
