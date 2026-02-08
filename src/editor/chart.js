// src/editor/chart.js — 차트 블록

import state from '../data/store.js';
import {esc} from '../utils/helpers.js';
import {CHART_COLORS} from '../config/firebase.js';
import {renderBlocks} from './renderer.js';
import {triggerAutoSave} from './blocks.js';

export function renderChart(b,idx){
  var data=b.chartData||[{label:'항목1',value:30},{label:'항목2',value:50},{label:'항목3',value:20}];
  var title=b.chartTitle||'차트';
  var type=b.type;
  var html='<div class="block-chart-wrap" data-block-idx="'+idx+'">';
  html+='<div class="chart-title" contenteditable="'+(state.editMode?'true':'false')+'" onblur="updateChartTitle('+idx+',this.textContent)">'+esc(title)+'</div>';

  if(type==='chart-bar'){
    var maxVal=Math.max.apply(null,data.map(function(d){return d.value}))||1;
    html+='<div class="chart-bar-container">';
    for(var i=0;i<data.length;i++){
      var pct=Math.round((data[i].value/maxVal)*100);
      html+='<div class="chart-bar-row">';
      html+='<div class="chart-bar-label">'+esc(data[i].label)+'</div>';
      html+='<div class="chart-bar-track"><div class="chart-bar-fill" style="width:'+pct+'%;background:'+CHART_COLORS[i%CHART_COLORS.length]+'">'+data[i].value+'</div></div>';
      html+='</div>';
    }
    // 축 표시
    html+='<div class="chart-bar-axis"><span>0</span><span>'+Math.round(maxVal/4)+'</span><span>'+Math.round(maxVal/2)+'</span><span>'+Math.round(maxVal*3/4)+'</span><span>'+maxVal+'</span></div>';
    html+='</div>';
  }else if(type==='chart-pie'){
    var total=data.reduce(function(s,d){return s+d.value},0)||1;
    html+='<div class="chart-pie-container">';
    html+='<svg class="chart-pie-svg" viewBox="0 0 100 100">';
    var cumulative=0;
    for(var i=0;i<data.length;i++){
      var pct=data[i].value/total;
      var startAngle=cumulative*360;
      var endAngle=(cumulative+pct)*360;
      cumulative+=pct;
      var x1=50+40*Math.cos((startAngle-90)*Math.PI/180);
      var y1=50+40*Math.sin((startAngle-90)*Math.PI/180);
      var x2=50+40*Math.cos((endAngle-90)*Math.PI/180);
      var y2=50+40*Math.sin((endAngle-90)*Math.PI/180);
      var largeArc=pct>0.5?1:0;
      html+='<path d="M50,50 L'+x1+','+y1+' A40,40 0 '+largeArc+',1 '+x2+','+y2+' Z" fill="'+CHART_COLORS[i%CHART_COLORS.length]+'"/>';
    }
    html+='</svg>';
    html+='<div class="chart-pie-legend">';
    for(var i=0;i<data.length;i++){
      var pct=Math.round((data[i].value/total)*100);
      html+='<div class="chart-pie-legend-item"><div class="chart-pie-legend-color" style="background:'+CHART_COLORS[i%CHART_COLORS.length]+'"></div>'+esc(data[i].label)+' ('+pct+'%)</div>';
    }
    html+='</div></div>';
  }else if(type==='chart-line'){
    var maxVal=Math.max.apply(null,data.map(function(d){return d.value}))||1;
    // Y축 레이블
    html+='<div style="display:flex;gap:8px">';
    html+='<div style="display:flex;flex-direction:column;justify-content:space-between;font-size:11px;color:var(--t4);text-align:right;width:40px;padding:5px 0"><span>'+maxVal+'</span><span>'+Math.round(maxVal*3/4)+'</span><span>'+Math.round(maxVal/2)+'</span><span>'+Math.round(maxVal/4)+'</span><span>0</span></div>';
    html+='<div style="flex:1"><div class="chart-line-container">';
    // SVG with proper aspect ratio
    var svgW=400,svgH=200;
    html+='<svg width="100%" height="100%" viewBox="0 0 '+svgW+' '+svgH+'" preserveAspectRatio="xMidYMid meet">';
    // 그리드 라인
    for(var g=1;g<4;g++){
      var gy=svgH*g/4;
      html+='<line x1="0" y1="'+gy+'" x2="'+svgW+'" y2="'+gy+'" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="4"/>';
    }
    // 데이터 포인트 계산
    var pts=[];
    for(var i=0;i<data.length;i++){
      var px=data.length>1?(i/(data.length-1))*svgW:svgW/2;
      var py=svgH-(data[i].value/maxVal)*svgH;
      pts.push({x:px,y:py});
    }
    // 영역 채우기
    var areaPath='M0,'+svgH+' ';
    for(var i=0;i<pts.length;i++)areaPath+='L'+pts[i].x+','+pts[i].y+' ';
    areaPath+='L'+svgW+','+svgH+' Z';
    html+='<path d="'+areaPath+'" fill="'+CHART_COLORS[0]+'" fill-opacity="0.15"/>';
    // 라인
    var linePath='M'+pts[0].x+','+pts[0].y;
    for(var i=1;i<pts.length;i++)linePath+=' L'+pts[i].x+','+pts[i].y;
    html+='<path d="'+linePath+'" fill="none" stroke="'+CHART_COLORS[0]+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
    // 포인트
    for(var i=0;i<pts.length;i++){
      html+='<circle cx="'+pts[i].x+'" cy="'+pts[i].y+'" r="6" fill="#fff" stroke="'+CHART_COLORS[0]+'" stroke-width="3"/>';
    }
    html+='</svg></div>';
    // X축 레이블
    html+='<div class="chart-line-labels">';
    for(var i=0;i<data.length;i++)html+='<span>'+esc(data[i].label)+'</span>';
    html+='</div></div></div>';
  }

  if(state.editMode){
    html+='<div class="chart-data-input">';
    for(var i=0;i<data.length;i++){
      html+='<div class="chart-data-row" data-row="'+i+'">';
      html+='<input type="text" value="'+esc(data[i].label)+'" placeholder="항목명" onchange="updateChartData('+idx+','+i+',\'label\',this.value)">';
      html+='<input type="number" value="'+data[i].value+'" placeholder="값" style="width:80px" onchange="updateChartData('+idx+','+i+',\'value\',parseFloat(this.value)||0)">';
      html+='<button class="btn btn-sm" style="background:var(--err);color:#fff" onclick="removeChartData('+idx+','+i+')">✕</button>';
      html+='</div>';
    }
    html+='<button class="btn btn-sm btn-s" onclick="addChartData('+idx+')" style="margin-top:8px">+ 항목 추가</button>';
    html+='</div>';
  }
  html+='</div>';
  return html;
}
export function updateChartTitle(idx,title){state.page.blocks[idx].chartTitle=title;triggerAutoSave()}
export function updateChartData(idx,row,field,value){state.page.blocks[idx].chartData[row][field]=value;renderBlocks();triggerAutoSave()}
export function addChartData(idx){state.page.blocks[idx].chartData.push({label:'새 항목',value:10});renderBlocks();triggerAutoSave()}
export function removeChartData(idx,row){if(state.page.blocks[idx].chartData.length>1){state.page.blocks[idx].chartData.splice(row,1);renderBlocks();triggerAutoSave()}}
