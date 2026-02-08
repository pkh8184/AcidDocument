// src/features/search.js — 검색

import state from '../data/store.js';
import {$,esc,fmtD,highlightText} from '../utils/helpers.js';
import {closeModal} from '../ui/modals.js';
import {loadPage} from '../ui/sidebar.js';

export function doSearch(q){
  q=q.toLowerCase().trim();
  state.lastSearchQuery=q;
  var res=$('searchResults');
  if(!q){res.innerHTML='<div style="padding:40px;text-align:center;color:var(--t4)"><div style="font-size:40px;margin-bottom:12px">🔍</div>검색어를 입력하세요</div>';return}
  var found=[];
  for(var i=0;i<state.db.pages.length;i++){
    var p=state.db.pages[i];
    if(p.deleted)continue;
    var titleMatch=p.title.toLowerCase().indexOf(q)!==-1;
    var contentMatch=false;
    var preview='';
    for(var j=0;j<p.blocks.length;j++){
      var txt=(p.blocks[j].content||'').replace(/<[^>]*>/g,'');
      var idx=txt.toLowerCase().indexOf(q);
      if(idx!==-1){
        contentMatch=true;
        var start=Math.max(0,idx-20);
        var end=Math.min(txt.length,idx+q.length+40);
        preview=(start>0?'...':'')+txt.slice(start,end)+(end<txt.length?'...':'');
        break;
      }
    }
    if(titleMatch||contentMatch)found.push({page:p,preview:preview,titleMatch:titleMatch});
  }
  if(found.length===0){res.innerHTML='<div style="padding:40px;text-align:center;color:var(--t4)"><div style="font-size:40px;margin-bottom:12px">📭</div>결과 없음</div>';return}
  var html='';
  for(var k=0;k<found.length;k++){
    var f=found[k];
    var title=f.page.title;
    if(f.titleMatch)title=highlightText(title,q);
    var prevHtml=f.preview?highlightText(f.preview,q):'';
    html+='<div class="search-item" onclick="loadPage(\''+f.page.id+'\',\''+esc(q)+'\');closeModal(\'searchModal\')">';
    html+='<span style="font-size:22px">'+f.page.icon+'</span>';
    html+='<div><div style="font-weight:500">'+title+'</div>';
    if(prevHtml)html+='<div style="font-size:12px;color:var(--t3);margin-top:2px">'+prevHtml+'</div>';
    html+='<div style="font-size:11px;color:var(--t4)">'+fmtD(f.page.updated)+'</div></div></div>';
  }
  res.innerHTML=html;
}
