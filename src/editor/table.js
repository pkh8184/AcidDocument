// src/editor/table.js — 표 관련 기능 (리디자인)

import state from '../data/store.js';
import {$,toast} from '../utils/helpers.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave} from './blocks.js';
import {pushUndoImmediate} from './history.js';
import {openModal} from '../ui/modals.js';
import {COLORS} from '../config/firebase.js';

// 블록 찾기 헬퍼
function findBlock(id){
  if(!state.page||!state.page.blocks)return null;
  for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===id)return state.page.blocks[i]}
  return null;
}
// DOM에서 현재 테이블 데이터 수집
export function collectTableData(id){
  var el=document.querySelector('[data-id="'+id+'"]');
  if(!el)return null;
  var rows=[],trs=el.querySelectorAll('tr');
  for(var ri=0;ri<trs.length;ri++){
    var cls=[],tds=trs[ri].querySelectorAll('th,td');
    for(var ci=0;ci<tds.length;ci++){
      cls.push(tds[ci].innerHTML.replace(/<div class="col-resizer"[^>]*><\/div>/g,''));
    }
    rows.push(cls);
  }
  return rows;
}

// 테이블 생성 (그리드 셀렉터에서 호출)
export function createTable(idx,numRows,numCols){
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  b.type='table';b.content='';
  b.rows=[];
  for(var r=0;r<numRows;r++){
    var row=[];for(var c=0;c<numCols;c++)row.push('');
    b.rows.push(row);
  }
  renderBlocks();triggerAutoSave();
  // 첫 번째 셀에 포커스
  setTimeout(function(){focusCell(b.id,0,0)},50);
}

// 셀 포커스 이동
export function focusCell(blockId,row,col){
  var el=document.querySelector('[data-id="'+blockId+'"]');
  if(!el)return;
  var cell=el.querySelector('[data-row="'+row+'"][data-col="'+col+'"]');
  if(cell){
    cell.focus({preventScroll:true});
    var rng=document.createRange();var sel=window.getSelection();
    rng.selectNodeContents(cell);rng.collapse(false);
    sel.removeAllRanges();sel.addRange(rng);
  }
}

// 테이블 크기 조회
export function getTableSize(blockId){
  var b=findBlock(blockId);
  if(!b||!b.rows)return{rows:0,cols:0};
  return{rows:b.rows.length,cols:b.rows[0]?b.rows[0].length:0};
}

// 행 추가 (마지막)
export function addTblRow(id){
  console.log('[TABLE] addTblRow called:',id);
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var cols=b.rows[0]?b.rows[0].length:3;
  var nr=[];for(var j=0;j<cols;j++)nr.push('');
  b.rows.push(nr);
  renderBlocks();triggerAutoSave();
}

// 열 추가 (마지막)
export function addTblCol(id){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  for(var j=0;j<b.rows.length;j++)b.rows[j].push('');
  renderBlocks();triggerAutoSave();
}

// 위치 지정 행 삽입 (afterRow 뒤에)
export function insertRowAt(id,afterRow){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var cols=b.rows[0]?b.rows[0].length:3;
  var nr=[];for(var j=0;j<cols;j++)nr.push('');
  b.rows.splice(afterRow+1,0,nr);
  renderBlocks();triggerAutoSave();
  setTimeout(function(){focusCell(id,afterRow+1,0)},50);
}

// 위치 지정 열 삽입 (afterCol 뒤에)
export function insertColAt(id,afterCol){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  for(var j=0;j<b.rows.length;j++)b.rows[j].splice(afterCol+1,0,'');
  // colWidths 조정
  if(b.colWidths&&b.colWidths.length){
    var avg=Math.floor(100/(b.rows[0].length));
    b.colWidths.splice(afterCol+1,0,avg);
    // 재정규화
    var total=0;for(var k=0;k<b.colWidths.length;k++)total+=b.colWidths[k];
    if(total!==100)for(var k=0;k<b.colWidths.length;k++)b.colWidths[k]=Math.round(b.colWidths[k]/total*100);
  }
  renderBlocks();triggerAutoSave();
}

// 특정 행 삭제
export function deleteRow(id,row){
  var b=findBlock(id);if(!b||!b.rows)return;
  if(b.rows.length<=1){toast('최소 1개 행이 필요합니다','warn');return}
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  b.rows.splice(row,1);
  // rowColors/cellStyles 키 재조정
  if(b.rowColors){var nr={};for(var k in b.rowColors){var ri=parseInt(k);if(ri<row)nr[ri]=b.rowColors[k];else if(ri>row)nr[ri-1]=b.rowColors[k]}b.rowColors=nr}
  if(b.cellStyles){var ns={};for(var k in b.cellStyles){var p=k.split('-');var ri=parseInt(p[0]),ci=parseInt(p[1]);if(ri<row)ns[k]=b.cellStyles[k];else if(ri>row)ns[(ri-1)+'-'+ci]=b.cellStyles[k]}b.cellStyles=ns}
  renderBlocks();triggerAutoSave();toast('행 삭제');
}

// 특정 열 삭제
export function deleteCol(id,col){
  var b=findBlock(id);if(!b||!b.rows)return;
  if(b.rows[0].length<=1){toast('최소 1개 열이 필요합니다','warn');return}
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  for(var j=0;j<b.rows.length;j++)b.rows[j].splice(col,1);
  // colWidths 조정
  if(b.colWidths&&b.colWidths.length>col){b.colWidths.splice(col,1)}
  // colColors/cellStyles 키 재조정
  if(b.colColors){var nc={};for(var k in b.colColors){var ci=parseInt(k);if(ci<col)nc[ci]=b.colColors[k];else if(ci>col)nc[ci-1]=b.colColors[k]}b.colColors=nc}
  if(b.cellStyles){var ns={};for(var k in b.cellStyles){var p=k.split('-');var ri=parseInt(p[0]),ci=parseInt(p[1]);if(ci<col)ns[k]=b.cellStyles[k];else if(ci>col)ns[ri+'-'+(ci-1)]=b.cellStyles[k]}b.cellStyles=ns}
  renderBlocks();triggerAutoSave();toast('열 삭제');
}

// 셀 배경색 설정
export function setCellColor(id,row,col,color){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(!b.cellStyles)b.cellStyles={};
  if(color)b.cellStyles[row+'-'+col]={bg:color};
  else delete b.cellStyles[row+'-'+col];
  renderBlocks();triggerAutoSave();
}

// 행 배경색 설정
export function setRowColor(id,row,color){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(!b.rowColors)b.rowColors={};
  if(color)b.rowColors[row]=color;
  else delete b.rowColors[row];
  renderBlocks();triggerAutoSave();
}

// 열 배경색 설정
export function setColColor(id,col,color){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(!b.colColors)b.colColors={};
  if(color)b.colColors[col]=color;
  else delete b.colColors[col];
  renderBlocks();triggerAutoSave();
}

// 색상 초기화
export function clearCellColors(id,row,col){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(b.cellStyles)delete b.cellStyles[row+'-'+col];
  if(b.rowColors)delete b.rowColors[row];
  if(b.colColors)delete b.colColors[col];
  renderBlocks();triggerAutoSave();toast('색상 초기화');
}

// 정렬
export function sortTable(id,colIdx,dir){
  var b=findBlock(id);
  if(!b||!b.rows||b.rows.length<2)return;
  pushUndoImmediate();
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var header=b.rows[0];
  var data=b.rows.slice(1);
  data.sort(function(a,c){
    var va=(a[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var vc=(c[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var na=parseFloat(va),nc=parseFloat(vc);
    if(!isNaN(na)&&!isNaN(nc))return dir==='asc'?na-nc:nc-na;
    return dir==='asc'?va.localeCompare(vc,'ko'):vc.localeCompare(va,'ko');
  });
  b.rows=[header].concat(data);
  b.sortCol=colIdx;b.sortDir=dir;
  renderBlocks();triggerAutoSave();
  toast(dir==='asc'?'오름차순 정렬':'내림차순 정렬');
}

// 표 삭제
export function deleteTable(id){
  state.deleteTableId=id;
  $('deleteConfirmText').textContent='이 표를 삭제하시겠습니까?';
  state._deleteTableConfirm=function(){
    pushUndoImmediate();
    for(var i=0;i<state.page.blocks.length;i++){if(state.page.blocks[i].id===state.deleteTableId){state.page.blocks.splice(i,1);break}}
    renderBlocks();triggerAutoSave();toast('표 삭제됨');
    state.deleteTableId=null;state._deleteTableConfirm=null;
  };
  openModal('deleteConfirmModal');
}

// 테이블 패널 상태
var panelState={blockId:null,row:0,col:0};

// 패널 열기
export function showTablePanel(blockId,row,col){
  console.log('[TABLE] showTablePanel called:',blockId,row,col);
  panelState.blockId=blockId;panelState.row=row;panelState.col=col;
  var panel=$('tablePanel');
  var body=$('tablePanelBody');
  console.log('[TABLE] panel:',panel,'body:',body);
  var b=findBlock(blockId);
  console.log('[TABLE] block found:',!!b);
  if(!b)return;
  var size=b.rows?{rows:b.rows.length,cols:b.rows[0].length}:{rows:0,cols:0};
  var html='';
  html+='<div class="tbl-panel-info">셀 ('+(row+1)+', '+(col+1)+') · '+size.rows+'×'+size.cols+'</div>';
  // 행/열 추가
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">행/열 추가</div>';
  html+='<div class="tbl-panel-grid">';
  html+='<button class="tbl-panel-btn" data-tbl-action="insertRowBefore">⬆ 위에 행</button>';
  html+='<button class="tbl-panel-btn" data-tbl-action="insertRowAfter">⬇ 아래에 행</button>';
  html+='<button class="tbl-panel-btn" data-tbl-action="insertColBefore">⬅ 왼쪽에 열</button>';
  html+='<button class="tbl-panel-btn" data-tbl-action="insertColAfter">➡ 오른쪽에 열</button>';
  html+='</div></div>';
  // 행/열 삭제
  if(size.rows>1||size.cols>1){
    html+='<div class="tbl-panel-section"><div class="tbl-panel-title">삭제</div>';
    if(size.rows>1)html+='<button class="tbl-panel-btn" data-tbl-action="deleteRow">행 삭제 (행 '+(row+1)+')</button>';
    if(size.cols>1)html+='<button class="tbl-panel-btn" data-tbl-action="deleteCol">열 삭제 (열 '+(col+1)+')</button>';
    html+='</div>';
  }
  // 셀 배경색
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">셀 배경색</div><div class="tbl-panel-colors">';
  html+='<div class="ctx-color-swatch ctx-color-none" data-tbl-action="setCellColor" data-color=""></div>';
  for(var i=0;i<COLORS.length;i++)html+='<div class="ctx-color-swatch" style="background:'+COLORS[i]+'" data-tbl-action="setCellColor" data-color="'+COLORS[i]+'"></div>';
  html+='</div></div>';
  // 행 배경색
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">행 배경색</div><div class="tbl-panel-colors">';
  html+='<div class="ctx-color-swatch ctx-color-none" data-tbl-action="setRowColor" data-color=""></div>';
  for(var i=0;i<COLORS.length;i++)html+='<div class="ctx-color-swatch" style="background:'+COLORS[i]+'" data-tbl-action="setRowColor" data-color="'+COLORS[i]+'"></div>';
  html+='</div></div>';
  // 열 배경색
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">열 배경색</div><div class="tbl-panel-colors">';
  html+='<div class="ctx-color-swatch ctx-color-none" data-tbl-action="setColColor" data-color=""></div>';
  for(var i=0;i<COLORS.length;i++)html+='<div class="ctx-color-swatch" style="background:'+COLORS[i]+'" data-tbl-action="setColColor" data-color="'+COLORS[i]+'"></div>';
  html+='</div></div>';
  html+='<div class="tbl-panel-section"><button class="tbl-panel-btn" data-tbl-action="clearColors">색상 초기화</button></div>';
  // 정렬
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">정렬 (열 '+(col+1)+')</div>';
  html+='<button class="tbl-panel-btn" data-tbl-action="sortAsc">↑ 오름차순</button>';
  html+='<button class="tbl-panel-btn" data-tbl-action="sortDesc">↓ 내림차순</button>';
  html+='</div>';
  // 표 삭제
  html+='<div class="tbl-panel-section"><button class="tbl-panel-btn danger" data-tbl-action="deleteTable">표 삭제</button></div>';
  body.innerHTML=html;
  panel.classList.add('open');
}

// 패널 닫기
export function closeTablePanel(){
  $('tablePanel').classList.remove('open');
  panelState.blockId=null;
}

// 패널 이벤트 위임 초기화 (한 번만 호출)
export function initTablePanel(){
  var panel=$('tablePanel');
  console.log('[TABLE] initTablePanel called, panel:',panel);
  if(!panel)return;
  panel.addEventListener('click',function(e){
    var btn=e.target.closest('[data-tbl-action]');
    if(!btn)return;
    var action=btn.getAttribute('data-tbl-action');
    var color=btn.hasAttribute('data-color')?btn.getAttribute('data-color'):null;
    var bid=panelState.blockId,row=panelState.row,col=panelState.col;
    if(!bid)return;
    switch(action){
      case'insertRowBefore':insertRowAt(bid,row-1);break;
      case'insertRowAfter':insertRowAt(bid,row);break;
      case'insertColBefore':insertColAt(bid,col-1);break;
      case'insertColAfter':insertColAt(bid,col);break;
      case'deleteRow':deleteRow(bid,row);break;
      case'deleteCol':deleteCol(bid,col);break;
      case'setCellColor':setCellColor(bid,row,col,color||null);break;
      case'setRowColor':setRowColor(bid,row,color||null);break;
      case'setColColor':setColColor(bid,col,color||null);break;
      case'clearColors':clearCellColors(bid,row,col);break;
      case'sortAsc':sortTable(bid,col,'asc');break;
      case'sortDesc':sortTable(bid,col,'desc');break;
      case'deleteTable':deleteTable(bid);closeTablePanel();return;
    }
    // 패널 갱신 (크기 변경 반영)
    var b=findBlock(bid);
    if(b&&b.rows){
      if(action==='deleteRow'&&row>=b.rows.length)panelState.row=b.rows.length-1;
      if(action==='deleteCol'&&col>=b.rows[0].length)panelState.col=b.rows[0].length-1;
      showTablePanel(panelState.blockId,panelState.row,panelState.col);
    }
  });
}

// 열 리사이즈 (기존 유지 + 개선)
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
      var w=Math.max(50,startW+(e.pageX-startX));
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
        pushUndoImmediate();triggerAutoSave();
      }
    }
  });
}

// 컬럼 블록 리사이즈 (기존 유지)
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
