// src/ui/toolbar.js — 서식바, 슬래시 메뉴, 인라인 태그

import state from '../data/store.js';
import {$,$$,genId,esc,toast} from '../utils/helpers.js';
import {COLORS,SLASH,EMOJIS} from '../config/firebase.js';
import {renderBlocks} from '../editor/renderer.js';
import {triggerAutoSave,focusBlock,insertBlock} from '../editor/blocks.js';
import {pushUndoImmediate} from '../editor/history.js';
import {openModal,closeModal} from './modals.js';
import {insertImage,insertSlide,insertVideo,insertPdf,insertFile,insertBookmark} from '../editor/media.js';

// 서식바
export function showFmtBar(){var sel=window.getSelection();if(!sel.rangeCount||sel.isCollapsed){hideFmtBar();return}var rng=sel.getRangeAt(0),rect=rng.getBoundingClientRect();if(rect.width<5){hideFmtBar();return}var bar=$('fmtBar');bar.style.left=Math.max(10,rect.left+rect.width/2-110)+'px';bar.style.top=Math.max(10,rect.top-50)+'px';bar.classList.add('open')}
export function hideFmtBar(){$('fmtBar').classList.remove('open')}
export function fmtCmd(cmd){var sel=window.getSelection();if(!sel||sel.isCollapsed){toast('텍스트를 선택해주세요','warn');return}document.execCommand(cmd,false,null);triggerAutoSave()}
export function saveSelection(){
  var sel=window.getSelection();
  if(sel.rangeCount>0)state.savedSelection=sel.getRangeAt(0).cloneRange();
}
export function restoreSelection(){
  if(state.savedSelection){
    var sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(state.savedSelection);
  }
}
export function openColorPicker(){saveSelection();var html='';for(var i=0;i<COLORS.length;i++)html+='<div class="color-item" style="background:'+COLORS[i]+'" onclick="applyColor(\''+COLORS[i]+'\')"></div>';$('colorGrid').innerHTML=html;openModal('colorModal')}
export function applyColor(c){
  closeModal('colorModal');
  restoreSelection();
  var sel=window.getSelection();
  if((!sel||sel.isCollapsed)&&state.savedSelection){
    try{sel.removeAllRanges();sel.addRange(state.savedSelection)}catch(ex){}
  }
  document.execCommand('foreColor',false,c);
  state.savedSelection=null;
  triggerAutoSave();
}

// 슬래시 메뉴
export function showSlash(el){var menu=$('slashMenu');menu.style.left='320px';menu.style.top='auto';menu.style.bottom='200px';renderSlashMenu('');menu.classList.add('open')}
export function hideSlash(){$('slashMenu').classList.remove('open');state.slashMenuState={open:false,idx:null}}
export function renderSlashMenu(filter){
  var menu=$('slashMenu'),q=filter.toLowerCase().trim(),html='',hasItems=false,first=true;
  for(var s=0;s<SLASH.length;s++){
    var sec=SLASH[s],filtered=[];
    for(var i=0;i<sec.i.length;i++){var it=sec.i[i];if(!q||it.n.toLowerCase().indexOf(q)!==-1||it.t.toLowerCase().indexOf(q)!==-1)filtered.push(it)}
    if(filtered.length===0)continue;
    hasItems=true;html+='<div class="slash-section">'+sec.s+'</div>';
    for(var j=0;j<filtered.length;j++){var f=filtered[j];html+='<div class="slash-item'+(first?' sel':'')+'" role="option" aria-selected="'+(first?'true':'false')+'" data-type="'+f.t+'"><div class="slash-icon">'+f.c+'</div><div><div style="font-weight:500">'+f.n+'</div><div style="font-size:12px;color:var(--t4)">'+f.d+'</div></div></div>';first=false}
  }
  if(!hasItems)html='<div style="padding:20px;text-align:center;color:var(--t4)">결과 없음</div>';
  menu.innerHTML=html;
  var items=menu.querySelectorAll('.slash-item');
  for(var k=0;k<items.length;k++){(function(it){it.addEventListener('click',function(){execSlash(it.getAttribute('data-type'))});it.addEventListener('mouseenter',function(){var all=menu.querySelectorAll('.slash-item');for(var m=0;m<all.length;m++)all[m].classList.remove('sel');it.classList.add('sel')})})(items[k])}
}
export function filterSlash(q){renderSlashMenu(q)}
export function moveSlashSel(dir){var menu=$('slashMenu'),items=menu.querySelectorAll('.slash-item');if(!items.length)return;var cur=-1;for(var i=0;i<items.length;i++){if(items[i].classList.contains('sel')){cur=i;break}}var n=cur+dir;if(n<0)n=items.length-1;if(n>=items.length)n=0;for(var j=0;j<items.length;j++){items[j].classList.remove('sel');items[j].setAttribute('aria-selected','false')}items[n].classList.add('sel');items[n].setAttribute('aria-selected','true');items[n].scrollIntoView({block:'nearest'})}
export function execSlash(type){
  var idx=state.slashMenuState.idx;hideSlash();if(idx===null)return;
  if(type==='image'){state.slashMenuState.idx=idx;insertImage();return}
  if(type==='slide'){state.slashMenuState.idx=idx;insertSlide();return}
  if(type==='video'){state.slashMenuState.idx=idx;insertVideo();return}
  if(type==='pdf'){state.slashMenuState.idx=idx;insertPdf();return}
  if(type==='file'){state.slashMenuState.idx=idx;insertFile();return}
  if(type==='bookmark'){state.slashMenuState.idx=idx;insertBookmark();return}
  if(type==='emoji'){state.slashMenuState.idx=idx;openEmojiPicker();return}
  if(type==='mention'){state.slashMenuState.idx=idx;openMentionPicker();return}
  if(type==='pagelink'){state.slashMenuState.idx=idx;import('../features/pagelink.js').then(function(m){m.openPageLinkPicker()});return}
  pushUndoImmediate();
  var b=state.page.blocks[idx];b.type=type;b.content='';
  switch(type){
    case'table':b.rows=[['','',''],['','','']];break;
    case'callout':b.calloutType='info';break;
    case'number':b.num=1;break;
    case'toggle':b.open=false;b.innerContent='';break;
    case'todo':b.checked=false;break;
    case'col2':b.type='columns';b.colType='col2';b.columns=['',''];break;
    case'col3':b.type='columns';b.colType='col3';b.columns=['','',''];break;
    case'calendar':b.year=2026;b.month=new Date().getMonth()+1;b.rangeEvents=[];break;
    case'chart-bar':
    case'chart-pie':
    case'chart-line':
      b.chartData=[{label:'항목1',value:30},{label:'항목2',value:50},{label:'항목3',value:20}];
      b.chartTitle='차트 제목';
      break;
  }
  // toc, divider, calendar, chart 등 편집 불가 블록은 아래에 빈 블록 추가
  if(type==='toc'||type==='divider'||type==='calendar'||type.startsWith('chart-')){
    state.page.blocks.splice(idx+1,0,{id:genId(),type:'text',content:''});
  }
  renderBlocks();
  setTimeout(function(){
    var focusIdx=(type==='toc'||type==='divider'||type==='calendar'||type.startsWith('chart-'))?idx+1:idx;
    var el=$('editor').children[focusIdx];
    if(el){var c=el.querySelector('.block-content')||el.querySelector('.block-col-content');if(c)c.focus({preventScroll:true})}
  },30)
}

// 이모지 피커
export function openEmojiPicker(){
  var html='';
  for(var i=0;i<EMOJIS.length;i++){
    html+='<div class="emoji-item" onclick="insertEmoji(\''+EMOJIS[i]+'\')">'+EMOJIS[i]+'</div>';
  }
  $('emojiGrid').innerHTML=html;
  $('emojiSearch').value='';
  openModal('emojiModal');
}
export function filterEmoji(q){
  var items=$$('#emojiGrid .emoji-item');
  // 간단한 검색 - 전체 표시 (이모지는 텍스트 검색이 어려움)
  for(var i=0;i<items.length;i++)items[i].style.display='';
}
export function insertEmoji(emoji){
  closeModal('emojiModal');
  var idx=state.slashMenuState.idx;
  if(idx!==null&&state.page.blocks[idx]){
    pushUndoImmediate();
    state.page.blocks[idx].content=(state.page.blocks[idx].content||'')+emoji;
    state.page.blocks[idx].type=state.page.blocks[idx].type||'text';
    renderBlocks();focusBlock(idx,'end');triggerAutoSave();
  }
  state.slashMenuState.idx=null;
}

// 멘션 (사용자 태그)
export function openMentionPicker(){
  var html='';
  for(var i=0;i<state.db.users.length;i++){
    var u=state.db.users[i];
    if(!u.active)continue;
    var name=u.nickname||u.id;
    var initials=name.slice(-2).toUpperCase();
    html+='<div class="mention-item" onclick="insertMention(\''+esc(u.id)+'\',\''+esc(name)+'\')">';
    html+='<div class="mention-avatar">'+initials+'</div>';
    html+='<div><div style="font-weight:600">'+esc(name)+'</div><div style="font-size:11px;color:var(--t4)">@'+esc(u.id)+'</div></div>';
    html+='</div>';
  }
  $('mentionUserList').innerHTML=html||'<p style="color:var(--t4);text-align:center;padding:20px">사용자 없음</p>';
  openModal('mentionModal');
}
export function insertMention(userId,userName){
  closeModal('mentionModal');
  var idx=state.slashMenuState.idx;
  if(idx!==null&&state.page.blocks[idx]){
    pushUndoImmediate();
    var tag='<span class="mention-tag" contenteditable="false" data-user="'+esc(userId)+'">@'+esc(userName)+'</span>&nbsp;';
    state.page.blocks[idx].content=(state.page.blocks[idx].content||'')+tag;
    state.page.blocks[idx].type=state.page.blocks[idx].type||'text';
    renderBlocks();focusBlock(idx,'end');triggerAutoSave();
  }
  state.slashMenuState.idx=null;
}

// 인라인 태그
export function showTagPicker(el){
  state.currentTagElement=el;
  var picker=$('tagPicker');
  var rect=el.getBoundingClientRect();
  picker.style.left=(rect.left)+'px';
  picker.style.top=(rect.bottom+5)+'px';
  picker.classList.add('open');
  // 현재 색상 표시
  var colors=picker.querySelectorAll('.tag-picker-color');
  for(var i=0;i<colors.length;i++){
    colors[i].classList.remove('selected');
    if(el.classList.contains('tag-'+colors[i].getAttribute('data-color'))){
      colors[i].classList.add('selected');
    }
  }
}
export function hideTagPicker(){$('tagPicker').classList.remove('open');state.currentTagElement=null}
export function changeTagColor(color){
  if(!state.currentTagElement)return;
  // 기존 색상 클래스 제거
  var classes=state.currentTagElement.className.split(' ').filter(function(c){return!c.startsWith('tag-')});
  classes.push('tag-'+color);
  state.currentTagElement.className=classes.join(' ');
  triggerAutoSave();
  hideTagPicker();
}
export function removeInlineTag(){
  if(!state.currentTagElement)return;
  var text=state.currentTagElement.textContent.replace('@','');
  var textNode=document.createTextNode(text+' ');
  state.currentTagElement.parentNode.replaceChild(textNode,state.currentTagElement);
  triggerAutoSave();
  hideTagPicker();
}
