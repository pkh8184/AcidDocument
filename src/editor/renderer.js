// src/editor/renderer.js — renderBlocks, createBlockEl

import state from '../data/store.js';
import {$,esc} from '../utils/helpers.js';
import {updateNums,genTOC,triggerAS,focusBlock,deleteBlock,addBlockBelow,scrollToBlk} from './blocks.js';
import {renderCalendar} from './calendar.js';
import {renderChart} from './chart.js';
import {renderSlideBlock,getYTId,openImageViewer,setupSlideAutoPlay} from './media.js';
import {setupBlockEvents} from './listeners.js';

export function renderBlocks(){var ed=$('editor');ed.innerHTML='';ed.className='editor '+(state.editMode?'edit-mode':'view-mode');for(var i=0;i<state.page.blocks.length;i++)ed.appendChild(createBlockEl(state.page.blocks[i],i));updateNums();setupSlideAutoPlay()}
export function createBlockEl(b,idx){
  var div=document.createElement('div');
  div.className='block block-'+b.type;
  div.setAttribute('data-id',b.id);
  div.setAttribute('data-idx',idx);
  var ce=state.editMode?' contenteditable="true"':'';
  var inner='';

  switch(b.type){
    case'divider':
      inner='<hr>';
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'todo':
      if(b.checked)div.classList.add('done');
      inner='<label class="todo-wrap"><input type="checkbox"'+(b.checked?' checked':'')+(state.editMode?'':' onclick="return false"')+'><div class="block-content"'+ce+'>'+(b.content||'')+'</div></label>';
      break;
    case'toggle':
      inner='<div class="block-toggle-wrap">';
      inner+='<div class="block-toggle-head'+(b.open?' open':'')+'">';
      inner+='<span class="block-toggle-arrow" data-id="'+b.id+'">▶</span>';
      inner+='<div class="block-content"'+ce+'>'+(b.content||'')+'</div>';
      inner+='</div>';
      inner+='<div class="block-toggle-body'+(b.open?' open':'')+'">';
      inner+='<div class="block-content"'+ce+' data-placeholder="토글 내용을 입력하세요">'+(b.innerContent||'')+'</div>';
      inner+='</div>';
      inner+='</div>';
      break;
    case'callout':
      var ct=b.calloutType||'info',cIcon=b.icon||{info:'💡',success:'✅',warning:'⚠️',danger:'❌'}[ct];
      inner='<div class="block-callout-wrap '+ct+'">';
      inner+='<div class="block-callout-icon"'+(state.editMode?' onclick="openCalloutIconPicker(\''+b.id+'\')" style="cursor:pointer"':'')+'>'+cIcon+'</div>';
      inner+='<div style="flex:1"><div class="block-content"'+ce+'>'+(b.content||'')+'</div></div></div>';
      break;
    case'code':
      inner='<div class="block-code-wrap"><div class="block-code-head">';
      inner+='<span class="block-code-lang"'+(state.editMode?' onclick="openCodeSetting(\''+b.id+'\')" style="cursor:pointer"':'')+'>'+esc(b.lang||'code')+'</span>';
      inner+='<div style="display:flex;gap:4px"><button class="btn btn-sm btn-s" onclick="copyCode(this)">복사</button><button class="btn btn-sm btn-s" onclick="downloadCode(this)">다운로드</button></div></div>';
      inner+='<div class="block-content"'+ce+' style="font-family:monospace;white-space:pre-wrap">'+(b.content||'')+'</div></div>';
      break;
    case'image':
      var imgScale=b.scale||100;
      inner='<div class="block-image-wrap" tabindex="0" data-block-idx="'+idx+'">';
      if(state.editMode)inner+='<div class="block-media-toolbar"><div class="media-toolbar-group"><button class="media-btn" onclick="copyImageUrl('+idx+')" title="복사">📋</button><button class="media-btn" onclick="downloadImage('+idx+')" title="다운로드">💾</button><button class="media-btn danger" onclick="deleteBlock('+idx+')" title="삭제">🗑️</button></div><div class="media-toolbar-group"><button class="media-btn'+(imgScale===25?' active':'')+'" onclick="setImageScale('+idx+',25)">25%</button><button class="media-btn'+(imgScale===50?' active':'')+'" onclick="setImageScale('+idx+',50)">50%</button><button class="media-btn'+(imgScale===75?' active':'')+'" onclick="setImageScale('+idx+',75)">75%</button><button class="media-btn'+(imgScale===100?' active':'')+'" onclick="setImageScale('+idx+',100)">100%</button></div></div>';
      inner+='<img src="'+esc(b.src||'')+'" style="max-width:'+imgScale+'%;border-radius:var(--rad);display:block;margin:0 auto;cursor:'+(state.editMode?'default':'zoom-in')+'" onerror="this.style.display=\'none\'"'+(state.editMode?'':' onclick="openImageViewer([\''+esc(b.src||'')+'\'],0)"')+'>';
      inner+='<div class="block-image-caption"'+ce+' style="text-align:center;color:var(--t4);font-size:13px;margin-top:8px">'+(b.caption||'')+'</div>';
      inner+='</div>';
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'slide':
      inner=renderSlideBlock(b,idx);
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'video':
      if(b.isFile){inner='<video controls style="width:100%;max-height:500px;border-radius:var(--rad)"><source src="'+esc(b.url)+'"></video>';}
      else{var vid=getYTId(b.url);inner=vid?'<iframe src="https://www.youtube.com/embed/'+vid+'" style="width:100%;height:400px;border:none;border-radius:var(--rad)" allowfullscreen></iframe>':'<div style="color:var(--err);padding:16px">유효하지 않은 URL</div>';}
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'pdf':
      inner='<iframe src="'+esc(b.src||'')+'#toolbar=1" style="width:100%;height:500px;border:1px solid var(--bdr);border-radius:var(--rad)"></iframe>';
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'file':
      var fileExt=(b.name||'').split('.').pop().toLowerCase();
      var fileIcon={pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📽️',pptx:'📽️',zip:'📦',rar:'📦',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',mp3:'🎵',mp4:'🎬',txt:'📃'}[fileExt]||'📎';
      inner='<div class="block-file-wrap" tabindex="0" data-block-idx="'+idx+'">';
      inner+='<div class="block-file-card">';
      inner+='<div class="file-icon">'+fileIcon+'</div>';
      inner+='<div class="file-info"><div class="file-name">'+esc(b.name||'파일')+'</div><div class="file-ext">.'+fileExt.toUpperCase()+'</div></div>';
      if(state.editMode)inner+='<div class="file-actions"><button class="media-btn" onclick="downloadFile('+idx+')" title="다운로드">💾</button><button class="media-btn danger" onclick="deleteBlock('+idx+')" title="삭제">🗑️</button></div>';
      else inner+='<a href="'+esc(b.url||'')+'" download="'+esc(b.name||'file')+'" class="file-download-btn">다운로드</a>';
      inner+='</div></div>';
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
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
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
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
          inner+=(r===0?'<th':'<td')+ce+' style="'+cs+'">'+(rows[r][c]||'')+(r===0?'</th>':'</td>');
        }
        inner+='</tr>';
      }
      inner+='</table></div>';
      if(state.editMode){
        inner+='<div class="block-table-tools" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">';
        inner+='<button class="btn btn-sm btn-s" onclick="addTblRow(\''+b.id+'\')">+행</button>';
        inner+='<button class="btn btn-sm btn-s" onclick="addTblCol(\''+b.id+'\')">+열</button>';
        inner+='<button class="btn btn-sm btn-s" onclick="delTblRow(\''+b.id+'\')">-행</button>';
        inner+='<button class="btn btn-sm btn-s" onclick="delTblCol(\''+b.id+'\')">-열</button>';
        inner+='<select class="btn btn-sm btn-s" onchange="setTblAlign(\''+b.id+'\',this.value)"><option value="">정렬</option><option value="left"'+(tAlign==='left'?' selected':'')+'>왼쪽</option><option value="center"'+(tAlign==='center'?' selected':'')+'>가운데</option><option value="right"'+(tAlign==='right'?' selected':'')+'>오른쪽</option></select>';
        inner+='<button class="btn btn-sm btn-s" onclick="openColWidthModal(\''+b.id+'\')">열 너비</button>';
        inner+='<button class="btn btn-sm" style="color:var(--err)" onclick="deleteTable(\''+b.id+'\')">삭제</button>';
        inner+='</div>';
        inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      }
      break;
    case'toc':
      inner='<div class="block-toc-wrap">'+genTOC()+'</div>';
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'columns':
      var cols=b.columns||['',''];
      inner='<div class="block-columns-wrap" style="display:flex;gap:16px">';
      for(var ci=0;ci<cols.length;ci++){
        inner+='<div class="block-col" data-col-idx="'+ci+'" style="flex:1;min-width:0"><div class="block-col-content" data-col-idx="'+ci+'"'+ce+' style="min-height:60px;padding:12px;border:1px dashed var(--bdr);border-radius:var(--rad)">'+(cols[ci]||'')+'</div></div>';
      }
      inner+='</div>';
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'quote':
      inner='<div class="block-content"'+ce+'>'+(b.content||'')+'</div>';
      break;
    case'bullet':
      inner='<div class="block-content"'+ce+'>'+(b.content||'')+'</div>';
      break;
    case'number':
      div.setAttribute('data-num',b.num||1);
      inner='<div class="block-content"'+ce+'>'+(b.content||'')+'</div>';
      break;
    case'calendar':
      inner=renderCalendar(b,idx);
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    case'chart-bar':
    case'chart-pie':
    case'chart-line':
      inner=renderChart(b,idx);
      if(state.editMode)inner+='<div class="block-add-below" onclick="addBlockBelow('+idx+')">+ 블록 추가</div>';
      break;
    default:
      inner='<div class="block-content"'+ce+'>'+(b.content||'')+'</div>';
  }
  div.innerHTML='<div class="block-handle"><button class="btn btn-i" onclick="showBlockCtx(event,'+idx+')">⋮</button></div>'+inner;
  setupBlockEvents(div,b,idx);
  return div;
}
