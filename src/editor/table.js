// src/editor/table.js — 표 관련 기능

import state from '../data/store.js';
import {$,toast} from '../utils/helpers.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave} from './blocks.js';
import {openModal,closeModal} from '../ui/modals.js';

export function collectTableData(id){
  var el=document.querySelector('[data-id="'+id+'"]');
  if(!el)return null;
  var rows=[],trs=el.querySelectorAll('tr');
  for(var ri=0;ri<trs.length;ri++){
    var cls=[],tds=trs[ri].querySelectorAll('th,td');
    for(var ci=0;ci<tds.length;ci++){
      cls.push(tds[ci].innerHTML.replace(/<div class="col-resizer"[^>]*><\/div>/g,'').replace(/<span class="sort-btn"[^>]*>[^<]*<\/span>/g,''));
    }
    rows.push(cls);
  }
  return rows;
}
export function addTblRow(id){var rows=collectTableData(id);for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){var b=state.page.blocks[i];b.rows=rows||b.rows;if(!b.rows)return;var cols=b.rows[0]?b.rows[0].length:3,nr=[];for(var j=0;j<cols;j++)nr.push('');b.rows.push(nr);renderBlocks();triggerAutoSave();toast('행 추가');return}}}
export function addTblCol(id){var rows=collectTableData(id);for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){var b=state.page.blocks[i];b.rows=rows||b.rows;if(!b.rows)return;for(var j=0;j<b.rows.length;j++)b.rows[j].push('');renderBlocks();triggerAutoSave();toast('열 추가');return}}}
export function delTblRow(id){var rows=collectTableData(id);for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){var b=state.page.blocks[i];b.rows=rows||b.rows;if(!b.rows||b.rows.length<=1)return;b.rows.pop();renderBlocks();triggerAutoSave();toast('행 삭제');return}}}
export function delTblCol(id){var rows=collectTableData(id);for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){var b=state.page.blocks[i];b.rows=rows||b.rows;if(!b.rows||b.rows[0].length<=1)return;for(var j=0;j<b.rows.length;j++)b.rows[j].pop();renderBlocks();triggerAutoSave();toast('열 삭제');return}}}
export function setTblColor(id,type,color){if(!color)return;var rows=collectTableData(id);for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){var b=state.page.blocks[i];b.rows=rows||b.rows;if(type==='header')b.headerColor=color;else b.cellColor=color;renderBlocks();triggerAutoSave();return}}}
export function setTblAlign(id,align){
  if(!align)return;
  // 먼저 현재 테이블 데이터 수집
  var el=document.querySelector('[data-id="'+id+'"]');
  if(el){
    var rows=[],trs=el.querySelectorAll('tr');
    for(var ri=0;ri<trs.length;ri++){
      var cls=[],tds=trs[ri].querySelectorAll('th,td');
      for(var ci=0;ci<tds.length;ci++){
        cls.push(tds[ci].innerHTML.replace(/<div class="col-resizer"[^>]*><\/div>/g,'').replace(/<span class="sort-btn"[^>]*>[^<]*<\/span>/g,''));
      }
      rows.push(cls);
    }
    for(var i=0;i<state.page.blocks.length;i++){
      if(state.page.blocks[i].id===id){
        state.page.blocks[i].rows=rows;
        state.page.blocks[i].align=align;
        break;
      }
    }
  }
  renderBlocks();triggerAutoSave();toast(align==='left'?'왼쪽 정렬':align==='center'?'가운데 정렬':'오른쪽 정렬')
}
export function deleteTable(id){if(!confirm('표를 삭제하시겠습니까?'))return;for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){state.page.blocks.splice(i,1);break}}renderBlocks();triggerAutoSave();toast('표 삭제됨')}
export function openTableSetting(id){state.currentEditBlockId=id;openModal('tableAlignModal')}
export function openColWidthModal(id){
  state.colWidthTableId=id;
  var b=null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){b=state.page.blocks[i];break}}
  if(!b||!b.rows||!b.rows[0])return;
  var numCols=b.rows[0].length;
  var widths=b.colWidths||[];
  var html='';
  for(var c=0;c<numCols;c++){
    var w=widths[c]||Math.floor(100/numCols);
    html+='<div class="fg" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html+='<span style="width:60px">열 '+(c+1)+'</span>';
    html+='<input type="range" min="10" max="80" value="'+w+'" id="colW'+c+'" oninput="$(\'colWVal'+c+'\').textContent=this.value+\'%\'" style="flex:1">';
    html+='<span id="colWVal'+c+'" style="width:40px;text-align:right">'+w+'%</span>';
    html+='</div>';
  }
  $('colWidthInputs').innerHTML=html;
  openModal('colWidthModal');
}
export function applyColWidths(){
  if(!state.colWidthTableId)return;
  var b=null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===state.colWidthTableId){b=state.page.blocks[i];break}}
  if(!b||!b.rows||!b.rows[0])return;
  var numCols=b.rows[0].length;
  var widths=[];
  for(var c=0;c<numCols;c++){
    widths.push(parseInt($('colW'+c).value)||Math.floor(100/numCols));
  }
  b.colWidths=widths;
  renderBlocks();triggerAutoSave();
  closeModal('colWidthModal');
  toast('열 너비 적용');
  state.colWidthTableId=null;
}
export function setupTableResize(div,b){
  var resizers=div.querySelectorAll('.col-resizer');
  resizers.forEach(function(resizer){
    var colIdx=parseInt(resizer.getAttribute('data-col'));
    var startX,startW,th;
    resizer.addEventListener('mousedown',function(e){
      e.preventDefault();e.stopPropagation();
      th=div.querySelector('th[data-col="'+colIdx+'"]');
      if(!th)return;
      startX=e.pageX;startW=th.offsetWidth;
      resizer.classList.add('active');
      document.addEventListener('mousemove',onMouseMove);
      document.addEventListener('mouseup',onMouseUp);
    });
    function onMouseMove(e){
      if(!th)return;
      var w=Math.max(60,startW+(e.pageX-startX));
      th.style.width=w+'px';
      var tds=div.querySelectorAll('td[data-col="'+colIdx+'"]');
      tds.forEach(function(td){td.style.width=w+'px'});
    }
    function onMouseUp(){
      resizer.classList.remove('active');
      document.removeEventListener('mousemove',onMouseMove);
      document.removeEventListener('mouseup',onMouseUp);
      if(th){
        if(!b.colWidths)b.colWidths=[];
        var tbl=div.querySelector('table');
        b.colWidths[colIdx]=tbl?Math.round(th.offsetWidth/tbl.offsetWidth*100):Math.floor(100/(b.rows&&b.rows[0]?b.rows[0].length:3));
        triggerAutoSave();
      }
    }
  });
}
export function setupColResize(div,b){
  var dividers=div.querySelectorAll('.col-divider');
  dividers.forEach(function(divider){
    var colIdx=parseInt(divider.getAttribute('data-col'));
    var startX,col,startW,wrap;
    divider.addEventListener('mousedown',function(e){
      e.preventDefault();e.stopPropagation();
      wrap=div.querySelector('.block-columns-wrap');
      col=wrap.children[colIdx*2];
      if(!col)return;
      startX=e.pageX;startW=col.offsetWidth;
      divider.classList.add('active');
      document.addEventListener('mousemove',onMouseMove);
      document.addEventListener('mouseup',onMouseUp);
    });
    function onMouseMove(e){
      if(!col)return;
      var w=Math.max(80,startW+(e.pageX-startX));
      col.style.flex='0 0 '+w+'px';
    }
    function onMouseUp(){
      divider.classList.remove('active');
      document.removeEventListener('mousemove',onMouseMove);
      document.removeEventListener('mouseup',onMouseUp);
      if(col){
        if(!b.colWidths)b.colWidths=[];
        b.colWidths[colIdx]=col.offsetWidth;
        triggerAutoSave();
      }
    }
  });
}
export function sortTable(id,colIdx,dir){
  var b=null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){b=state.page.blocks[i];break}}
  if(!b||!b.rows||b.rows.length<2)return;
  var rows=collectTableData(id);
  if(rows)b.rows=rows;
  var header=b.rows[0];
  var data=b.rows.slice(1);
  data.sort(function(a,c){
    var va=(a[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var vc=(c[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var na=parseFloat(va),nc=parseFloat(vc);
    if(!isNaN(na)&&!isNaN(nc)){
      return dir==='asc'?na-nc:nc-na;
    }
    if(dir==='asc')return va.localeCompare(vc,'ko');
    return vc.localeCompare(va,'ko');
  });
  b.rows=[header].concat(data);
  b.sortCol=colIdx;
  b.sortDir=dir;
  renderBlocks();triggerAutoSave();
}
export function filterTableRows(id,colIdx,query){
  var b=null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id){b=state.page.blocks[i];break}}
  if(!b||!b.rows)return[];
  var q=(query||'').toLowerCase().trim();
  var visible=[0];
  if(!q){
    for(var i=1;i<b.rows.length;i++)visible.push(i);
    return visible;
  }
  for(var i=1;i<b.rows.length;i++){
    var val=(b.rows[i][colIdx]||'').replace(/<[^>]*>/g,'').toLowerCase();
    if(val.indexOf(q)!==-1)visible.push(i);
  }
  return visible;
}
