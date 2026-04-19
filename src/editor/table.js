// src/editor/table.js — 표 관련 기능 (리디자인)

import state from '../data/store.js';
import {$,toast} from '../utils/helpers.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave,findBlock} from './blocks.js';
import {pushUndoImmediate} from './history.js';
import {openModal} from '../ui/modals.js';
import {COLORS} from '../config/firebase.js';

// 열 너비 상수
var MIN_COL_PCT = 5;
var MAX_COL_PCT = 80;

// colWidths 합계 100% 정규화 (허용 오차 0.5 이내면 건드리지 않음, 레거시 보정용)
function normalizeColWidths(b){
  if(!b.colWidths||!b.colWidths.length)return;
  var total=0;for(var k=0;k<b.colWidths.length;k++)total+=b.colWidths[k];
  if(total>0&&Math.abs(total-100)>0.5){
    for(var k=0;k<b.colWidths.length;k++)b.colWidths[k]=b.colWidths[k]/total*100;
  }
}

// colWidths가 없거나 길이가 안 맞으면 균등값으로 초기화 (모듈 내부 헬퍼 — Task 5 setupTableResize 내부에서도 직접 호출)
function ensureColWidths(b){
  if(!b.rows||!b.rows[0])return;
  var n=b.rows[0].length;
  if(!b.colWidths||b.colWidths.length!==n){
    b.colWidths=[];
    var even=100/n;
    for(var i=0;i<n;i++)b.colWidths.push(even);
  }
}

// 한 열을 목표값으로 설정하고 이웃에서 차감/보충 (합계 100 유지)
export function resizeColWithNeighborCompensation(blockId,colIdx,targetPct){
  var b=findBlock(blockId);if(!b||!b.rows)return;
  ensureColWidths(b);
  var n=b.colWidths.length;
  var target=Math.max(MIN_COL_PCT,Math.min(MAX_COL_PCT,targetPct));
  var delta=target-b.colWidths[colIdx];
  if(Math.abs(delta)<0.01)return;
  // 보상 방향: 마지막 열이면 왼쪽으로, 아니면 오른쪽으로
  var dir=colIdx<n-1?1:-1;
  b.colWidths[colIdx]=target;
  var remaining=delta;
  var i=colIdx+dir;
  while(Math.abs(remaining)>0.01&&i>=0&&i<n){
    var cur=b.colWidths[i];
    var canTake=delta>0?(cur-MIN_COL_PCT):(MAX_COL_PCT-cur);
    var take=Math.min(Math.abs(remaining),Math.max(0,canTake));
    b.colWidths[i]=delta>0?cur-take:cur+take;
    remaining=delta>0?remaining-take:remaining+take;
    i+=dir;
  }
  // 여전히 remaining이 있으면 목표 조정 (이웃 한계 초과 시 target 자체 제한)
  if(Math.abs(remaining)>0.01){
    b.colWidths[colIdx]=target-remaining;
  }
}

// 패널에서 특정 열 너비 직접 지정 (undo + autosave 포함)
export function setColWidth(blockId,colIdx,targetPct){
  var b=findBlock(blockId);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(blockId);
  resizeColWithNeighborCompensation(blockId,colIdx,targetPct);
  renderBlocks();triggerAutoSave();
}

// 균등 분배 (모든 열 100/N)
export function distributeColsEvenly(blockId){
  var b=findBlock(blockId);if(!b||!b.rows||!b.rows[0])return;
  pushUndoImmediate();b=findBlock(blockId);
  var n=b.rows[0].length;
  var even=100/n;
  b.colWidths=[];
  for(var i=0;i<n;i++)b.colWidths.push(even);
  renderBlocks();triggerAutoSave();toast('너비 균등 분배');
}

// colWidths 제거 (자동 맞춤 상태로 복귀)
export function clearColWidths(blockId){
  var b=findBlock(blockId);if(!b)return;
  pushUndoImmediate();b=findBlock(blockId);
  delete b.colWidths;
  renderBlocks();triggerAutoSave();toast('너비 자동 맞춤');
}

// col-resizer 제거 후 셀 HTML 반환
function cleanCellHtml(td){
  var clone=td.cloneNode(true);
  var rs=clone.querySelectorAll('.col-resizer');
  for(var i=0;i<rs.length;i++)rs[i].parentNode.removeChild(rs[i]);
  return clone.innerHTML;
}

// DOM에서 현재 테이블 데이터 수집
export function collectTableData(id){
  var el=document.querySelector('[data-id="'+id+'"]');
  if(!el)return null;
  var rows=[],trs=el.querySelectorAll('tr');
  for(var ri=0;ri<trs.length;ri++){
    var cls=[],tds=trs[ri].querySelectorAll('th,td');
    for(var ci=0;ci<tds.length;ci++){
      cls.push(cleanCellHtml(tds[ci]));
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
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var cols=b.rows[0]?b.rows[0].length:3;
  var nr=[];for(var j=0;j<cols;j++)nr.push('');
  b.rows.push(nr);
  renderBlocks();triggerAutoSave();
}

// 열 추가 (마지막)
export function addTblCol(id){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  for(var j=0;j<b.rows.length;j++)b.rows[j].push('');
  renderBlocks();triggerAutoSave();
}

// 위치 지정 행 삽입 (afterRow 뒤에, -1이면 맨 앞)
export function insertRowAt(id,afterRow){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var insertIdx=Math.max(afterRow+1,0);
  var cols=b.rows[0]?b.rows[0].length:3;
  var nr=[];for(var j=0;j<cols;j++)nr.push('');
  b.rows.splice(insertIdx,0,nr);
  renderBlocks();triggerAutoSave();
  setTimeout(function(){focusCell(id,insertIdx,0)},50);
}

// 위치 지정 열 삽입 (afterCol 뒤에, -1이면 맨 앞)
export function insertColAt(id,afterCol){
  var b=findBlock(id);if(!b||!b.rows)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var insertIdx=Math.max(afterCol+1,0);
  for(var j=0;j<b.rows.length;j++)b.rows[j].splice(insertIdx,0,'');
  // colWidths 조정
  if(b.colWidths&&b.colWidths.length){
    var avg=Math.floor(100/(b.rows[0].length));
    b.colWidths.splice(insertIdx,0,avg);
    normalizeColWidths(b);
  }
  renderBlocks();triggerAutoSave();
}

// 특정 행 삭제
export function deleteRow(id,row){
  var b=findBlock(id);if(!b||!b.rows)return;
  if(b.rows.length<=1){toast('최소 1개 행이 필요합니다','warn');return}
  pushUndoImmediate();b=findBlock(id);
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
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  for(var j=0;j<b.rows.length;j++)b.rows[j].splice(col,1);
  // colWidths 조정
  if(b.colWidths&&b.colWidths.length>col){b.colWidths.splice(col,1);normalizeColWidths(b)}
  // colColors/cellStyles 키 재조정
  if(b.colColors){var nc={};for(var k in b.colColors){var ci=parseInt(k);if(ci<col)nc[ci]=b.colColors[k];else if(ci>col)nc[ci-1]=b.colColors[k]}b.colColors=nc}
  if(b.cellStyles){var ns={};for(var k in b.cellStyles){var p=k.split('-');var ri=parseInt(p[0]),ci=parseInt(p[1]);if(ci<col)ns[k]=b.cellStyles[k];else if(ci>col)ns[ri+'-'+(ci-1)]=b.cellStyles[k]}b.cellStyles=ns}
  renderBlocks();triggerAutoSave();toast('열 삭제');
}

// 셀 배경색 설정
export function setCellColor(id,row,col,color){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(!b.cellStyles)b.cellStyles={};
  if(color)b.cellStyles[row+'-'+col]={bg:color};
  else delete b.cellStyles[row+'-'+col];
  renderBlocks();triggerAutoSave();
}

// 행 배경색 설정
export function setRowColor(id,row,color){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(!b.rowColors)b.rowColors={};
  if(color)b.rowColors[row]=color;
  else delete b.rowColors[row];
  renderBlocks();triggerAutoSave();
}

// 열 배경색 설정
export function setColColor(id,col,color){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(!b.colColors)b.colColors={};
  if(color)b.colColors[col]=color;
  else delete b.colColors[col];
  renderBlocks();triggerAutoSave();
}

// 색상 초기화
export function clearCellColors(id,row,col){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();b=findBlock(id);
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
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  var header=b.rows[0];
  var data=b.rows.slice(1);
  // 정렬 전 원본 인덱스 기록 (1-based, 헤더=0은 고정)
  for(var di=0;di<data.length;di++)data[di]._origIdx=di+1;
  data.sort(function(a,c){
    var va=(a[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var vc=(c[colIdx]||'').replace(/<[^>]*>/g,'').trim();
    var na=parseFloat(va),nc=parseFloat(vc);
    if(!isNaN(na)&&!isNaN(nc))return dir==='asc'?na-nc:nc-na;
    return dir==='asc'?va.localeCompare(vc,'ko'):vc.localeCompare(va,'ko');
  });
  // oldRow → newRow 매핑 (헤더 0은 불변)
  var map={};map[0]=0;
  for(var mi=0;mi<data.length;mi++){map[data[mi]._origIdx]=mi+1;delete data[mi]._origIdx}
  // rowColors 재매핑
  if(b.rowColors){var nr={};for(var k in b.rowColors){var oi=parseInt(k);if(map.hasOwnProperty(oi))nr[map[oi]]=b.rowColors[k]}b.rowColors=nr}
  // cellStyles 재매핑 (key: "row-col")
  if(b.cellStyles){var ns={};for(var k in b.cellStyles){var p=k.split('-');var ri=parseInt(p[0]),ci=parseInt(p[1]);if(map.hasOwnProperty(ri))ns[map[ri]+'-'+ci]=b.cellStyles[k]}b.cellStyles=ns}
  b.rows=[header].concat(data);
  b.sortCol=colIdx;b.sortDir=dir;
  renderBlocks();triggerAutoSave();
  toast(dir==='asc'?'오름차순 정렬':'내림차순 정렬');
}

// 수평 정렬 설정
export function setTableAlign(id,align){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(align&&align!=='left')b.tableAlign=align;
  else delete b.tableAlign;
  renderBlocks();triggerAutoSave();
}

// 수직 정렬 설정
export function setTableVAlign(id,valign){
  var b=findBlock(id);if(!b)return;
  pushUndoImmediate();b=findBlock(id);
  var rows=collectTableData(id);if(rows)b.rows=rows;
  if(valign&&valign!=='top')b.tableVAlign=valign;
  else delete b.tableVAlign;
  renderBlocks();triggerAutoSave();
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
  panelState.blockId=blockId;panelState.row=row;panelState.col=col;
  var panel=$('tablePanel');
  var body=$('tablePanelBody');
  var b=findBlock(blockId);
  if(!b)return;
  var size=b.rows?{rows:b.rows.length,cols:b.rows[0].length}:{rows:0,cols:0};
  var html='';
  html+='<div class="tbl-panel-info">셀 ('+(row+1)+', '+(col+1)+') · '+size.rows+'×'+size.cols+'</div>';
  // 텍스트 맞춤
  var curAlign=b.tableAlign||'left';
  var curVAlign=b.tableVAlign||'top';
  html+='<div class="tbl-panel-section"><div class="tbl-panel-title">텍스트 맞춤</div>';
  html+='<div class="tbl-panel-align">';
  html+='<button class="tbl-align-btn'+(curAlign==='left'?' active':'')+'" data-tbl-action="alignLeft" title="왼쪽">⫷</button>';
  html+='<button class="tbl-align-btn'+(curAlign==='center'?' active':'')+'" data-tbl-action="alignCenter" title="가운데">☰</button>';
  html+='<button class="tbl-align-btn'+(curAlign==='right'?' active':'')+'" data-tbl-action="alignRight" title="오른쪽">⫸</button>';
  html+='<span class="tbl-align-sep"></span>';
  html+='<button class="tbl-align-btn'+(curVAlign==='top'?' active':'')+'" data-tbl-action="valignTop" title="상단">⬆</button>';
  html+='<button class="tbl-align-btn'+(curVAlign==='middle'?' active':'')+'" data-tbl-action="valignMiddle" title="중앙">⬌</button>';
  html+='<button class="tbl-align-btn'+(curVAlign==='bottom'?' active':'')+'" data-tbl-action="valignBottom" title="하단">⬇</button>';
  html+='</div></div>';
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

// 패널 상태 초기화 (로그아웃 시 호출)
export function resetTablePanel(){
  panelState.blockId=null;panelState.row=0;panelState.col=0;
  var panel=$('tablePanel');
  if(panel)panel.classList.remove('open');
}

// 패널 이벤트 위임 초기화 (한 번만 호출)
export function initTablePanel(){
  var panel=$('tablePanel');
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
      case'alignLeft':setTableAlign(bid,'left');break;
      case'alignCenter':setTableAlign(bid,'center');break;
      case'alignRight':setTableAlign(bid,'right');break;
      case'valignTop':setTableVAlign(bid,'top');break;
      case'valignMiddle':setTableVAlign(bid,'middle');break;
      case'valignBottom':setTableVAlign(bid,'bottom');break;
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
export function setupTableResize(div){
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
      pushUndoImmediate();
      document.addEventListener('mousemove',onMouseMove);
      document.addEventListener('mouseup',onMouseUp);
    });
    function onMouseMove(e){
      if(!th)return;
      var w=Math.max(50,startW+(e.pageX-startX));
      th.style.width=w+'px';
      // table-layout:fixed에서 <col> 요소도 업데이트해야 반영됨
      var tbl=div.querySelector('table');
      if(tbl){var cols=tbl.querySelectorAll('col');if(cols[colIdx])cols[colIdx].style.width=w+'px'}
      var tds=div.querySelectorAll('td[data-col="'+colIdx+'"]');
      tds.forEach(function(td){td.style.width=w+'px'});
    }
    function onMouseUp(){
      resizer.classList.remove('active');
      document.removeEventListener('mousemove',onMouseMove);
      document.removeEventListener('mouseup',onMouseUp);
      if(th){
        var bid=div.getAttribute('data-id');
        var cur=findBlock(bid);if(!cur)return;
        if(!cur.colWidths)cur.colWidths=[];
        var tbl=div.querySelector('table');
        cur.colWidths[colIdx]=tbl?Math.round(th.offsetWidth/tbl.offsetWidth*100):Math.floor(100/(cur.rows&&cur.rows[0]?cur.rows[0].length:3));
        normalizeColWidths(cur);
        triggerAutoSave();
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
