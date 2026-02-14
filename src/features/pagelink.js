// src/features/pagelink.js — 페이지 링크 + 백링크

import state from '../data/store.js';
import {$,esc} from '../utils/helpers.js';
import {renderBlocks} from '../editor/renderer.js';
import {focusBlock,triggerAutoSave} from '../editor/blocks.js';
import {pushUndoImmediate} from '../editor/history.js';
import {openModal,closeModal} from '../ui/modals.js';

export function searchPages(query){
  var q=(query||'').toLowerCase().trim();
  var results=[];
  for(var i=0;i<state.db.pages.length;i++){
    var p=state.db.pages[i];
    if(p.deleted)continue;
    if(!q||p.title.toLowerCase().indexOf(q)!==-1){
      results.push(p);
    }
  }
  return results;
}

export function getBacklinks(pageId){
  var links=[];
  for(var i=0;i<state.db.pages.length;i++){
    var p=state.db.pages[i];
    if(p.deleted||p.id===pageId)continue;
    var found=false;
    for(var j=0;j<(p.blocks||[]).length;j++){
      if((p.blocks[j].content||'').indexOf('data-page-id="'+pageId+'"')!==-1){found=true;break}
    }
    if(found)links.push(p);
  }
  return links;
}

export function insertPageLink(pageId,pageTitle){
  var idx=state.slashMenuState.idx;
  if(idx===null||idx===undefined||!state.page||!state.page.blocks[idx])return;
  pushUndoImmediate();
  var tag='<a class="page-link" contenteditable="false" data-page-id="'+esc(pageId)+'">📄 '+esc(pageTitle)+'</a>&nbsp;';
  state.page.blocks[idx].content=(state.page.blocks[idx].content||'')+tag;
  state.page.blocks[idx].type=state.page.blocks[idx].type||'text';
  renderBlocks();focusBlock(idx,'end');triggerAutoSave();
  state.slashMenuState.idx=null;
}

export function openPageLinkPicker(){
  renderPageLinkList('');
  var searchEl=$('pageLinkSearch');
  if(searchEl)searchEl.value='';
  openModal('pageLinkModal');
}

export function renderPageLinkList(query){
  var pages=searchPages(query);
  var html='';
  if(pages.length===0){
    html='<div style="text-align:center;color:var(--t4);padding:20px">페이지 없음</div>';
  }else{
    for(var i=0;i<pages.length;i++){
      var p=pages[i];
      html+='<div class="nav-item" onclick="selectPageLink(\''+esc(p.id)+'\',\''+esc(p.title.replace(/'/g,"\\'"))+'\')">';
      html+='<span class="nav-icon">'+(p.icon||'📄')+'</span>';
      html+='<span class="nav-text">'+esc(p.title)+'</span>';
      html+='</div>';
    }
  }
  var listEl=$('pageLinkList');
  if(listEl)listEl.innerHTML=html;
}

export function renderBacklinks(){
  if(!state.page)return;
  var links=getBacklinks(state.page.id);
  var el=$('backlinks');
  if(!el)return;
  if(links.length===0){el.style.display='none';return}
  el.style.display='block';
  var html='<div class="backlinks-title">🔗 백링크 ('+links.length+')</div>';
  for(var i=0;i<links.length;i++){
    var p=links[i];
    html+='<div class="backlink-item" onclick="loadPage(\''+p.id+'\')">'+(p.icon||'📄')+' '+esc(p.title)+'</div>';
  }
  el.innerHTML=html;
}
