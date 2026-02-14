// src/editor/calendar.js — 캘린더 블록

import state from '../data/store.js';
import {$,esc,toast} from '../utils/helpers.js';
import {CAL_COLORS} from '../config/firebase.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave} from './blocks.js';
import {pushUndoImmediate} from './history.js';
import {openModal,closeModal} from '../ui/modals.js';

export function renderCalendar(b,idx){
  var year=b.year||2026,month=b.month||1;
  var rangeEvents=b.rangeEvents||[]; // 기간 일정 배열
  var months=['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  var html='<div class="cal-month-title">'+year+'년 '+months[month-1]+'</div>';
  if(state.editMode){
    html+='<div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px">';
    html+='<button class="btn btn-sm btn-s" onclick="changeCalMonth('+idx+',-1)">◀ 이전</button>';
    html+='<button class="btn btn-sm btn-s" onclick="openCalEventAdd('+idx+')">+ 일정</button>';
    html+='<button class="btn btn-sm btn-s" onclick="changeCalMonth('+idx+',1)">다음 ▶</button>';
    html+='</div>';
  }
  html+='<div class="block-calendar-wrap"><table class="block-calendar"><thead><tr><th class="cal-sun">일</th><th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th class="cal-sat">토</th></tr></thead><tbody>';
  var firstDay=new Date(year,month-1,1).getDay();
  var lastDate=new Date(year,month,0).getDate();
  var prevLastDate=new Date(year,month-1,0).getDate();
  var today=new Date();
  var isThisMonth=(today.getFullYear()===year&&today.getMonth()===month-1);

  // 각 날짜별 이벤트 바 위치 계산
  var eventRows={}; // dateKey -> [{event, row, type}]
  for(var ei=0;ei<rangeEvents.length;ei++){
    var ev=rangeEvents[ei];
    var start=new Date(ev.startDate);
    var end=new Date(ev.endDate);
    var curr=new Date(start);
    var safety=0;while(curr<=end&&safety<366){safety++;
      var dk=curr.getFullYear()+'-'+String(curr.getMonth()+1).padStart(2,'0')+'-'+String(curr.getDate()).padStart(2,'0');
      if(!eventRows[dk])eventRows[dk]=[];
      var type='middle';
      if(curr.getTime()===start.getTime()&&curr.getTime()===end.getTime())type='single';
      else if(curr.getTime()===start.getTime())type='start';
      else if(curr.getTime()===end.getTime())type='end';
      eventRows[dk].push({event:ev,idx:ei,type:type,row:eventRows[dk].length});
      curr.setDate(curr.getDate()+1);
    }
  }

  var day=1,nextDay=1;
  for(var w=0;w<6;w++){
    if(day>lastDate)break;
    html+='<tr>';
    for(var d=0;d<7;d++){
      var cellClass='';
      var cellDay='';
      var dateKey='';
      var isCurrentMonth=false;
      if(w===0&&d<firstDay){
        cellDay=prevLastDate-firstDay+d+1;
        cellClass='cal-other';
      }else if(day>lastDate){
        cellDay=nextDay++;
        cellClass='cal-other';
      }else{
        cellDay=day;
        dateKey=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
        isCurrentMonth=true;
        if(d===0)cellClass='cal-sun';
        if(d===6)cellClass='cal-sat';
        if(isThisMonth&&day===today.getDate())cellClass+=' cal-today';
        day++;
      }
      html+='<td class="'+cellClass+'"'+(isCurrentMonth&&state.editMode?' onclick="openCalEventAdd('+idx+',\''+dateKey+'\')"':'')+'>';
      html+='<div class="cal-day">'+cellDay+'</div>';
      // 기간 일정 바 표시
      if(dateKey&&eventRows[dateKey]){
        for(var ri=0;ri<Math.min(eventRows[dateKey].length,3);ri++){
          var item=eventRows[dateKey][ri];
          var barClass='cal-event-bar '+item.type;
          var showTitle=(item.type==='start'||item.type==='single');
          html+='<div class="'+barClass+'" style="background:'+esc(item.event.color||'#3b82f6')+';top:'+(26+ri*20)+'px" title="'+esc(item.event.title)+'">';
          if(showTitle)html+=esc(item.event.title);
          html+='</div>';
        }
        if(eventRows[dateKey].length>3){
          html+='<div style="position:absolute;bottom:2px;right:4px;font-size:9px;color:var(--t4)">+'+(eventRows[dateKey].length-3)+'</div>';
        }
      }
      html+='</td>';
    }
    html+='</tr>';
  }
  html+='</tbody></table></div>';
  // 일정 목록 (편집 모드)
  if(state.editMode&&rangeEvents.length>0){
    html+='<div style="margin-top:12px;padding:12px;background:var(--bg3);border-radius:8px">';
    html+='<div style="font-weight:600;margin-bottom:8px">📋 일정 목록</div>';
    for(var i=0;i<rangeEvents.length;i++){
      var ev=rangeEvents[i];
      html+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bdr)">';
      html+='<div style="width:12px;height:12px;border-radius:3px;background:'+esc(ev.color||'#3b82f6')+'"></div>';
      html+='<div style="flex:1;font-size:13px">'+esc(ev.title)+'</div>';
      html+='<div style="font-size:11px;color:var(--t4)">'+ev.startDate+' ~ '+ev.endDate+'</div>';
      html+='<button class="btn btn-sm" style="color:var(--err);padding:2px 6px" onclick="deleteCalRangeEvent('+idx+','+i+')">✕</button>';
      html+='</div>';
    }
    html+='</div>';
  }
  return html;
}
export function changeCalMonth(idx,dir){
  if(!state.page||!state.page.blocks[idx])return;
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  b.month=(b.month||1)+dir;
  if(b.month<1){b.month=12;b.year--;}
  if(b.month>12){b.month=1;b.year++;}
  renderBlocks();triggerAutoSave();
}
export function openCalEventAdd(idx,dateKey){
  if(!state.page||!state.page.blocks[idx])return;
  state.currentCalIdx=idx;
  var b=state.page.blocks[idx];
  var rangeEvents=b.rangeEvents||[];

  $('calEventModalTitle').textContent='📅 일정 추가';

  // 기존 일정 목록 표시
  var listHtml='';
  if(rangeEvents.length===0){
    listHtml='<p style="color:var(--t4);text-align:center;padding:20px">등록된 일정이 없습니다</p>';
  }else{
    for(var i=0;i<rangeEvents.length;i++){
      var ev=rangeEvents[i];
      listHtml+='<div class="event-item">';
      listHtml+='<div class="event-color" style="background:'+esc(ev.color||'#3b82f6')+'"></div>';
      listHtml+='<div class="event-info"><div class="event-title">'+esc(ev.title)+'</div>';
      listHtml+='<div class="event-time">'+ev.startDate+' ~ '+ev.endDate+'</div>';
      listHtml+='</div>';
      listHtml+='<button class="event-del" onclick="deleteCalRangeEvent('+idx+','+i+');openCalEventAdd('+idx+')">✕</button>';
      listHtml+='</div>';
    }
  }
  $('calEventList').innerHTML=listHtml;

  // 색상 선택
  var colorHtml='';
  for(var c=0;c<CAL_COLORS.length;c++){
    colorHtml+='<div style="width:28px;height:28px;border-radius:6px;background:'+CAL_COLORS[c]+';cursor:pointer;border:3px solid '+(state.selectedEventColor===CAL_COLORS[c]?'var(--t1)':'transparent')+'" onclick="selectEventColor(\''+CAL_COLORS[c]+'\')"></div>';
  }
  $('calEventColors').innerHTML=colorHtml;

  // 입력 초기화
  $('calEventTitle').value='';
  $('calEventStartDate').value=dateKey||'';
  $('calEventEndDate').value=dateKey||'';

  openModal('calEventModal');
}
export function selectEventColor(color){
  state.selectedEventColor=color;
  var colorDivs=$('calEventColors').children;
  for(var i=0;i<colorDivs.length;i++){
    colorDivs[i].style.borderColor=CAL_COLORS[i]===color?'var(--t1)':'transparent';
  }
}
export function addCalEvent(){
  if(state.currentCalIdx===null)return;
  var title=$('calEventTitle').value.trim();
  var startDate=$('calEventStartDate').value;
  var endDate=$('calEventEndDate').value;
  if(!title){toast('제목을 입력하세요','err');return}
  if(!startDate||!endDate){toast('시작일과 종료일을 선택하세요','err');return}
  if(startDate>endDate){toast('종료일은 시작일 이후여야 합니다','err');return}
  var ev={
    title:title,
    startDate:startDate,
    endDate:endDate,
    color:state.selectedEventColor
  };
  pushUndoImmediate();
  var b=state.page.blocks[state.currentCalIdx];
  if(!b.rangeEvents)b.rangeEvents=[];
  b.rangeEvents.push(ev);
  renderBlocks();triggerAutoSave();
  closeModal('calEventModal');
  toast('일정 추가됨');
}
export function deleteCalRangeEvent(idx,eventIdx){
  pushUndoImmediate();
  var b=state.page.blocks[idx];
  if(b.rangeEvents){
    b.rangeEvents.splice(eventIdx,1);
    renderBlocks();triggerAutoSave();
    toast('일정 삭제됨');
  }
}
