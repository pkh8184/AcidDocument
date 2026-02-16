// src/ui/sidebar.js — 사이드바, 트리, 브레드크럼, 페이지 관리

import state from '../data/store.js';
import {MAX_VER} from '../config/firebase.js';
import {$,$$,genId,esc,formatDate,formatDateTime,toast} from '../utils/helpers.js';
import {saveDB,savePage,savePages,deletePageDoc,logDeleteAction,batchDeletePages} from '../data/firestore.js';
import {isSuper} from '../auth/auth.js';
import {getPages,getPage,getPath,collectBlocks,triggerAutoSave} from '../editor/blocks.js';
import {renderBlocks} from '../editor/renderer.js';
import {clearHistory} from '../editor/history.js';
import {openModal,closeModal,closeAllPanels} from './modals.js';

function saveRecent(){
  try{localStorage.setItem('ad_recent',JSON.stringify(state.db.recent))}catch(e){}
}
export function loadRecent(){
  try{
    var saved=JSON.parse(localStorage.getItem('ad_recent')||'[]');
    if(Array.isArray(saved)&&saved.length>0&&(!state.db.recent||state.db.recent.length===0)){
      state.db.recent=saved;
    }
  }catch(e){state.db.recent=state.db.recent||[]}
}

export function renderBreadcrumb(){var path=getPath(state.page.id),html='<span>'+esc(state.db.settings.wsName)+'</span>';for(var i=0;i<path.length;i++)html+=' / <span>'+path[i].icon+' '+esc(path[i].title)+'</span>';$('breadcrumb').innerHTML=html}
export function renderMeta(){
  var authorId=state.page.author||'';
  var authorName=authorId||'알 수 없음';
  // 작성자 ID로 닉네임 찾기
  if(authorId){
    for(var i=0;i<state.db.users.length;i++){
      if(state.db.users[i].id===authorId){
        authorName=state.db.users[i].nickname||state.db.users[i].id;
        break;
      }
    }
  }
  $('pageMeta').innerHTML='<span>✍️ '+esc(authorName)+'</span><span>📅 '+formatDate(state.page.updated)+'</span><span>v'+(state.page.versions.length+1)+'</span>';
}
export function renderTags(){
  var html='';
  // 일반 태그
  for(var i=0;i<state.page.tags.length;i++){
    html+='<span class="tag" onclick="removeTag(\''+esc(state.page.tags[i])+'\')">'+esc(state.page.tags[i])+' ×</span>';
  }
  // 사용자 태그 (작업자)
  var userTags=state.page.userTags||[];
  for(var j=0;j<userTags.length;j++){
    var ut=userTags[j];
    var userName=ut.name||ut.id;
    html+='<span class="tag user-tag" onclick="removeUserTag(\''+esc(ut.id)+'\')">👤 '+esc(userName)+' ×</span>';
  }
  html+='<span class="tag tag-add" onclick="openTagModal()">+ 태그</span>';
  html+='<span class="tag tag-add" onclick="openUserTagModal()">+ 작업자</span>';
  $('pageTags').innerHTML=html;
}
export function openTagModal(){$('tagInput').value='';openModal('tagModal');setTimeout(function(){$('tagInput').focus()},100)}
function addTag(t){if(state.page.tags.indexOf(t)!==-1){toast('이미 존재하는 태그','err');return false}state.page.tags.push(t);saveDB();savePage(state.page);renderTags();closeModal('tagModal');toast('태그 추가');return true}
export function submitTag(){var t=$('tagInput').value.trim();if(!t){toast('태그를 입력하세요','err');return}addTag(t)}
export function quickTag(t){addTag(t)}
export function removeTag(t){state.page.tags=state.page.tags.filter(function(x){return x!==t});saveDB();savePage(state.page);renderTags()}

// 사용자(작업자) 태그
export function openUserTagModal(){
  var html='';
  var existingIds=(state.page.userTags||[]).map(function(u){return u.id});
  for(var i=0;i<state.db.users.length;i++){
    var u=state.db.users[i];
    if(!u.active)continue;
    var name=u.nickname||u.id;
    var initials=name.slice(-2).toUpperCase();
    var isAdded=existingIds.indexOf(u.id)!==-1;
    html+='<div class="mention-item'+(isAdded?' disabled':'')+'" onclick="'+(isAdded?'':'addUserTag(\''+esc(u.id)+'\',\''+esc(name)+'\')')+'" style="'+(isAdded?'opacity:0.5;cursor:default':'')+';">';
    html+='<div class="mention-avatar">'+initials+'</div>';
    html+='<div><div style="font-weight:600">'+esc(name)+'</div><div style="font-size:11px;color:var(--t4)">@'+esc(u.id)+(isAdded?' (이미 추가됨)':'')+'</div></div>';
    html+='</div>';
  }
  $('userTagList').innerHTML=html||'<p style="color:var(--t4);text-align:center;padding:20px">사용자 없음</p>';
  openModal('userTagModal');
}
export function addUserTag(userId,userName){
  if(!state.page.userTags)state.page.userTags=[];
  // 중복 체크
  for(var i=0;i<state.page.userTags.length;i++){
    if(state.page.userTags[i].id===userId)return;
  }
  state.page.userTags.push({id:userId,name:userName});
  renderTags();
  triggerAutoSave();
  closeModal('userTagModal');
  toast(userName+' 추가됨');
}
export function removeUserTag(userId){
  if(!state.page.userTags)return;
  state.page.userTags=state.page.userTags.filter(function(u){return u.id!==userId});
  renderTags();
  triggerAutoSave();
}

// 페이지 이름 변경
export function openRenamePage(id){
  state.renamePageId=id;
  var p=getPage(id);
  $('renamePageInput').value=p?p.title:'';
  openModal('renamePageModal');
  setTimeout(function(){$('renamePageInput').focus()},100);
}
export function submitRenamePage(){
  if(!state.renamePageId)return;
  var newName=$('renamePageInput').value.trim();
  if(!newName){toast('이름을 입력하세요','err');return}
  for(var i=0;i<state.db.pages.length;i++){
    if(state.db.pages[i].id===state.renamePageId){
      state.db.pages[i].title=newName;
      break;
    }
  }
  if(state.page&&state.page.id===state.renamePageId){
    state.page.title=newName;
    $('pageTitle').value=newName;
  }
  var rp=getPage(state.renamePageId);
  saveDB();if(rp)savePage(rp);renderTree();
  closeModal('renamePageModal');
  toast('이름 변경됨');
  state.renamePageId=null;
}

export function toggleMobile(){$('sidebar').classList.toggle('open');$('mobOverlay').classList.toggle('open')}
export function closeMobile(){$('sidebar').classList.remove('open');$('mobOverlay').classList.remove('open')}

// 페이지 CRUD
export function createPage(pid,tplId){
  var tpl=null;if(tplId){for(var i=0;i<state.db.templates.length;i++){if(state.db.templates[i].id===tplId){tpl=state.db.templates[i];break}}}
  var blks=tpl?JSON.parse(JSON.stringify(tpl.blocks)):[{id:genId(),type:'text',content:''}];
  for(var j=0;j<blks.length;j++)blks[j].id=genId();
  var np={id:genId(),title:tpl?tpl.name:'새 페이지',icon:tpl?tpl.icon:'📄',parentId:pid||null,blocks:blks,tags:[],author:state.user.id,created:Date.now(),updated:Date.now(),versions:[],comments:[],favorite:false,deleted:false,order:getPages(pid||null).length};
  state.db.pages.push(np);saveDB();savePage(np);renderTree();loadPage(np.id);closeModal('templatesModal');toast('페이지 생성됨');
  setTimeout(function(){toggleEdit();$('pageTitle').focus();$('pageTitle').select()},100)
}
export function loadPage(id){
  loadRecent();
  var p=getPage(id);if(!p)return;
  // 편집 중 페이지 이탈 확인
  if(state.editMode&&hasChanges()){
    var doSave=confirm('작성한 내용을 저장하시겠습니까?\n(취소를 누르면 현재 페이지에 머무릅니다)');
    if(doSave){saveDoc()}
    else{return}
  }
  clearTimeout(state.autoSaveTimer);state.autoSaveTimer=null;
  state.editMode=false;state.editBackup=null;
  clearHistory();
  state.page=p;
  // URL 해시 업데이트
  history.pushState(null,null,'#'+id);
  $('pageIcon').textContent=p.icon;$('pageTitle').value=p.title;$('pageTitle').setAttribute('readonly','readonly');
  $('editBtn').style.display='inline-flex';$('deletePageBtn').style.display='inline-flex';
  $('saveBtn').style.display='none';$('cancelBtn').style.display='none';
  renderMeta();renderTags();renderBlocks();renderBreadcrumb();renderTree();
  import('../features/pagelink.js').then(function(m){m.renderBacklinks()});
  if(state.panelType==='versions')renderVersions();
  if(state.panelType==='comments')renderComments();
  state.db.recent=state.db.recent.filter(function(x){return x!==id});state.db.recent.unshift(id);if(state.db.recent.length>30)state.db.recent.pop();
  saveRecent();saveDB();closeMobile();$('editorWrap').scrollTop=0
}
export function loadPageWithoutPush(id){
  var p=getPage(id);if(!p)return;
  if(state.editMode&&hasChanges()){var doSave=confirm('작성한 내용을 저장하시겠습니까?\n(취소를 누르면 현재 페이지에 머무릅니다)');if(doSave){saveDoc()}else{return}}
  clearTimeout(state.autoSaveTimer);state.autoSaveTimer=null;
  state.editMode=false;state.editBackup=null;clearHistory();state.page=p;
  $('pageIcon').textContent=p.icon;$('pageTitle').value=p.title;$('pageTitle').setAttribute('readonly','readonly');
  $('editBtn').style.display='inline-flex';$('deletePageBtn').style.display='inline-flex';
  $('saveBtn').style.display='none';$('cancelBtn').style.display='none';
  renderMeta();renderTags();renderBlocks();renderBreadcrumb();renderTree();
  import('../features/pagelink.js').then(function(m){m.renderBacklinks()});
  if(state.panelType==='versions')renderVersions();
  if(state.panelType==='comments')renderComments();
  state.db.recent=state.db.recent.filter(function(x){return x!==id});state.db.recent.unshift(id);if(state.db.recent.length>30)state.db.recent.pop();
  saveRecent();saveDB();closeMobile();$('editorWrap').scrollTop=0
}
export function saveDoc(){
  if(!state.page)return;clearTimeout(state.autoSaveTimer);state.autoSaveTimer=null;var p=getPage(state.page.id);if(!p)return;
  p.title=$('pageTitle').value||'제목 없음';p.icon=$('pageIcon').textContent;p.blocks=collectBlocks();p.updated=Date.now();
  // 중복 버전 방지: 마지막 버전과 내용이 같으면 스킵
  var newSnap=JSON.stringify(p.blocks);
  var lastVer=p.versions.length>0?p.versions[p.versions.length-1]:null;
  var isDup=lastVer&&JSON.stringify(lastVer.blocks)===newSnap;
  if(!isDup){
    p.versions.push({id:genId(),date:Date.now(),author:state.user.id,blocks:JSON.parse(newSnap)});
    if(p.versions.length>MAX_VER)p.versions.shift();
  }
  saveDB();savePage(p);state.page=p;renderMeta();renderTree();renderVersions();toast('저장됨')
}
export function toggleEdit(){
  if(!state.editMode){
    state.editMode=true;
    state.editBackup={title:$('pageTitle').value,icon:$('pageIcon').textContent,blocks:JSON.parse(JSON.stringify(state.page.blocks))};
    $('editor').classList.remove('view-mode');$('editor').classList.add('edit-mode');
    $('editorWrap').classList.add('edit-mode-active');
    $('pageTitle').removeAttribute('readonly');
    $('editBtn').style.display='none';$('deletePageBtn').style.display='none';
    $('saveBtn').style.display='inline-flex';$('cancelBtn').style.display='inline-flex';
    renderBlocks();toast('편집 모드')
  }
}
export function saveAndExit(){
  saveDoc();exitEditMode();toast('저장 완료 (버전 기록됨)')
}
export function cancelEdit(){
  if(!state.editBackup)return;
  if(hasChanges()){
    if(confirm('작성한 내용을 저장하시겠습니까?')){saveAndExit();return}
  }
  $('pageTitle').value=state.editBackup.title;$('pageIcon').textContent=state.editBackup.icon;
  state.page.blocks=state.editBackup.blocks;
  exitEditMode();renderBlocks();toast('취소됨')
}
export function hasChanges(){
  if(!state.editBackup||!state.editMode)return false;
  if($('pageTitle').value!==state.editBackup.title)return true;
  if($('pageIcon').textContent!==state.editBackup.icon)return true;
  var current=collectBlocks();
  if(current.length!==state.editBackup.blocks.length)return true;
  for(var i=0;i<current.length;i++){
    if(JSON.stringify(current[i])!==JSON.stringify(state.editBackup.blocks[i]))return true;
  }
  return false
}
export function exitEditMode(){
  state.editMode=false;state.editBackup=null;
  $('editor').classList.remove('edit-mode');$('editor').classList.add('view-mode');
  $('editorWrap').classList.remove('edit-mode-active');
  $('pageTitle').setAttribute('readonly','readonly');
  $('editBtn').style.display='inline-flex';$('deletePageBtn').style.display='inline-flex';
  $('saveBtn').style.display='none';$('cancelBtn').style.display='none';
  renderBlocks()
}
export function deleteCurrentPage(){if(state.page)deletePage(state.page.id)}
export function deletePage(id){state.deleteTargetId=id;var p=getPage(id);$('deleteConfirmText').textContent='"'+p.title+'" 페이지를 삭제하시겠습니까?';openModal('deleteConfirmModal')}
export function confirmDelete(){
  closeModal('deleteConfirmModal');
  // 표 삭제 콜백이 있으면 실행
  if(state._deleteTableConfirm){state._deleteTableConfirm();return}
  var id=state.deleteTargetId;
  var p=getPage(id);if(!p)return;
  p.deleted=true;
  p.deletedAt=Date.now();
  p.deletedBy=state.user.id;
  // 삭제 로그 기록
  logDeleteAction(p.id,p.title,'trash');
  saveDB();savePage(p);
  if(state.page&&state.page.id===id){var pgs=getPages(null);pgs.length>0?loadPage(pgs[0].id):createPage()}
  renderTree();toast('휴지통으로 이동')
}
export function restorePage(id){
  var p=getPage(id);
  if(p){
    p.deleted=false;
    delete p.deletedAt;
    delete p.deletedBy;
    saveDB();savePage(p);showTrash();renderTree();toast('복원됨')
  }
}
export function permanentDelete(id){
  if(!confirm('영구 삭제하시겠습니까?'))return;
  var p=getPage(id);
  if(p){
    logDeleteAction(p.id,p.title,'permanent');
  }
  state.db.pages=state.db.pages.filter(function(pg){return pg.id!==id});
  deletePageDoc(id);
  saveDB();showTrash();toast('삭제됨');
}
export function emptyTrash(){
  if(!isSuper()){toast('권한 없음','err');return}
  if(!confirm('휴지통을 비우시겠습니까? 모든 항목이 영구 삭제됩니다.'))return;
  var trashed=state.db.pages.filter(function(p){return p.deleted});
  if(trashed.length===0){showTrash();return}
  // 삭제 로그 기록
  for(var i=0;i<trashed.length;i++){logDeleteAction(trashed[i].id,trashed[i].title,'permanent')}
  // 메모리에서 삭제
  state.db.pages=state.db.pages.filter(function(p){return!p.deleted});
  var ids=trashed.map(function(p){return p.id});
  batchDeletePages(ids);
  saveDB();showTrash();toast('휴지통 비움');
}
export function duplicatePage(id){var o=getPage(id);if(!o)return;var c=JSON.parse(JSON.stringify(o));c.id=genId();c.title+=' (복사)';c.created=c.updated=Date.now();c.author=state.user.id;c.versions=[];c.comments=[];for(var i=0;i<c.blocks.length;i++)c.blocks[i].id=genId();var siblings=getPages(o.parentId);var origIdx=0;for(var s=0;s<siblings.length;s++){if(siblings[s].id===id){origIdx=s;break}}c.order=origIdx+1;var reordered=[];for(var s=0;s<siblings.length;s++){if(siblings[s].order>=c.order&&siblings[s].id!==id){siblings[s].order++;reordered.push(siblings[s])}}state.db.pages.push(c);saveDB();savePage(c);savePages(reordered);renderTree();loadPage(c.id);toast('복제됨')}
export function toggleFavorite(id){var p=getPage(id);if(p){p.favorite=!p.favorite;saveDB();savePage(p);renderTree();toast(p.favorite?'즐겨찾기 추가':'즐겨찾기 해제')}}
export function movePage(id,newParentId){
  if(id===newParentId)return;
  var p=getPage(id);if(!p)return;
  // 순환 참조 방지
  var check=newParentId?getPage(newParentId):null;
  while(check){if(check.id===id)return;check=check.parentId?getPage(check.parentId):null}
  // 이전 부모의 형제 order 재정렬
  var oldSiblings=getPages(p.parentId).filter(function(s){return s.id!==id});
  for(var k=0;k<oldSiblings.length;k++)oldSiblings[k].order=k;
  p.parentId=newParentId;
  // 새 부모의 마지막에 배치
  p.order=getPages(newParentId).filter(function(s){return s.id!==id}).length;
  var affected=oldSiblings.concat([p]);
  saveDB();savePages(affected);renderTree();toast('이동됨')
}
export function reorderPage(id,targetParentId,newIndex){
  var page=getPage(id);if(!page)return;
  if(page.parentId!==targetParentId){
    var check=targetParentId?getPage(targetParentId):null;
    while(check){if(check.id===id)return;check=check.parentId?getPage(check.parentId):null}
    var oldSiblings=getPages(page.parentId).filter(function(p){return p.id!==id});
    for(var k=0;k<oldSiblings.length;k++)oldSiblings[k].order=k;
    page.parentId=targetParentId;
  }
  var siblings=getPages(targetParentId).filter(function(p){return p.id!==id});
  if(newIndex<0)newIndex=0;
  if(newIndex>siblings.length)newIndex=siblings.length;
  siblings.splice(newIndex,0,page);
  for(var i=0;i<siblings.length;i++)siblings[i].order=i;
  saveDB();savePages(siblings);renderTree();toast('이동됨')
}
export function movePageUp(id){
  var page=getPage(id);if(!page)return;
  var siblings=getPages(page.parentId);
  var idx=-1;for(var i=0;i<siblings.length;i++){if(siblings[i].id===id){idx=i;break}}
  if(idx<=0){toast('이미 맨 위입니다');return}
  var prev=siblings[idx-1];var tmp=page.order;page.order=prev.order;prev.order=tmp;
  saveDB();savePages([page,prev]);renderTree();toast('위로 이동됨')
}
export function movePageDown(id){
  var page=getPage(id);if(!page)return;
  var siblings=getPages(page.parentId);
  var idx=-1;for(var i=0;i<siblings.length;i++){if(siblings[i].id===id){idx=i;break}}
  if(idx<0||idx>=siblings.length-1){toast('이미 맨 아래입니다');return}
  var next=siblings[idx+1];var tmp=page.order;page.order=next.order;next.order=tmp;
  saveDB();savePages([page,next]);renderTree();toast('아래로 이동됨')
}

// 트리 렌더링 (드래그앤드롭)
var expandedNodes=new Set();
export function renderTree(){var pt=$('pageTree');pt.innerHTML='';pt.setAttribute('role','tree');pt.setAttribute('aria-label','페이지 목록');renderTreeLevel(null,pt)}
export function renderTreeLevel(pid,con){
  var pgs=getPages(pid);
  for(var i=0;i<pgs.length;i++){
    (function(p){
      var hasCh=getPages(p.id).length>0,isAct=state.page&&state.page.id===p.id;
      var item=document.createElement('div');item.className='tree-item';
      item.innerHTML='<div class="tree-row'+(isAct?' active':'')+'" role="treeitem" data-id="'+p.id+'" draggable="true"><span class="tree-toggle'+(hasCh?'':' hide')+'" role="button" tabindex="0"'+(hasCh?' aria-expanded="false"':'')+'>▶</span><span>'+p.icon+'</span><span class="tree-name">'+esc(p.title)+'</span><span class="tree-fav'+(p.favorite?' on':'')+'">★</span></div><div class="tree-children closed"></div>';
      con.appendChild(item);
      var row=item.querySelector('.tree-row'),tog=item.querySelector('.tree-toggle'),ch=item.querySelector('.tree-children');
      row.addEventListener('click',function(e){if(!e.target.classList.contains('tree-toggle'))loadPage(p.id)});
      row.addEventListener('contextmenu',function(e){e.preventDefault();showPageCtx(e,p.id)});
      // 드래그
      row.addEventListener('dragstart',function(e){state.dragPageId=p.id;row.classList.add('dragging');e.dataTransfer.effectAllowed='move'});
      row.addEventListener('dragend',function(){
        state.dragPageId=null;state.dragDropMode=null;state.dragDropTarget=null;
        row.classList.remove('dragging');
        var inds=document.querySelectorAll('.tree-drop-indicator');for(var k=0;k<inds.length;k++)inds[k].remove();
        var overs=document.querySelectorAll('.tree-row.drag-over');for(var k=0;k<overs.length;k++)overs[k].classList.remove('drag-over');
      });
      row.addEventListener('dragover',function(e){
        e.preventDefault();
        if(!state.dragPageId||state.dragPageId===p.id)return;
        var rect=row.getBoundingClientRect();var y=e.clientY-rect.top;var h=rect.height;
        var old=item.querySelector('.tree-drop-indicator');if(old)old.remove();
        row.classList.remove('drag-over');
        if(y<h*0.25){
          var ind=document.createElement('div');ind.className='tree-drop-indicator';
          item.insertBefore(ind,row);
          state.dragDropMode='before';state.dragDropTarget=p.id;
        }else if(y>h*0.75){
          var ind=document.createElement('div');ind.className='tree-drop-indicator';
          row.parentNode.insertBefore(ind,row.nextSibling);
          state.dragDropMode='after';state.dragDropTarget=p.id;
        }else{
          row.classList.add('drag-over');
          state.dragDropMode='into';state.dragDropTarget=p.id;
        }
      });
      row.addEventListener('dragleave',function(e){
        row.classList.remove('drag-over');
        if(!item.contains(e.relatedTarget)){var ind=item.querySelector('.tree-drop-indicator');if(ind)ind.remove()}
      });
      row.addEventListener('drop',function(e){
        e.preventDefault();e.stopPropagation();
        row.classList.remove('drag-over');
        var inds=document.querySelectorAll('.tree-drop-indicator');for(var k=0;k<inds.length;k++)inds[k].remove();
        if(!state.dragPageId||state.dragPageId===p.id)return;
        if(state.dragDropMode==='into'){
          movePage(state.dragPageId,p.id);
        }else{
          var targetPage=getPage(p.id);
          var siblings=getPages(targetPage.parentId);
          var targetIdx=0;for(var k=0;k<siblings.length;k++){if(siblings[k].id===p.id){targetIdx=k;break}}
          var insertIdx=state.dragDropMode==='after'?targetIdx+1:targetIdx;
          reorderPage(state.dragPageId,targetPage.parentId,insertIdx);
        }
        state.dragPageId=null;state.dragDropMode=null;state.dragDropTarget=null;
      });
      if(hasCh){
        var isOpen=expandedNodes.has(p.id);
        if(isOpen){tog.classList.add('open');tog.setAttribute('aria-expanded','true');ch.classList.remove('closed');renderTreeLevel(p.id,ch)}
        tog.addEventListener('click',function(e){
          e.stopPropagation();
          if(expandedNodes.has(p.id)){expandedNodes.delete(p.id)}else{expandedNodes.add(p.id)}
          tog.classList.toggle('open');ch.classList.toggle('closed');
          tog.setAttribute('aria-expanded',expandedNodes.has(p.id)?'true':'false');
          if(!ch.classList.contains('closed')&&ch.children.length===0)renderTreeLevel(p.id,ch)
        })
      }
    })(pgs[i])
  }
}
// 휴지통 드롭
export function setupTrashDrop(){
  var trash=$('trashDrop');
  trash.addEventListener('dragover',function(e){e.preventDefault();if(state.dragPageId)trash.classList.add('drag-over')});
  trash.addEventListener('dragleave',function(){trash.classList.remove('drag-over')});
  trash.addEventListener('drop',function(e){e.preventDefault();trash.classList.remove('drag-over');if(state.dragPageId){deletePage(state.dragPageId);state.dragPageId=null}})
}

// renderSidebar alias (for submitRenamePage compatibility)
export function renderSidebar(){renderTree()}

// 컨텍스트 메뉴
export function showPageCtx(e,id){var m=$('ctxMenu');m.innerHTML='<div class="ctx-item" onclick="loadPage(\''+id+'\');hideCtx()"><span class="ctx-icon">📄</span>열기</div><div class="ctx-item" onclick="openRenamePage(\''+id+'\');hideCtx()"><span class="ctx-icon">✏️</span>이름 변경</div><div class="ctx-item" onclick="createPage(\''+id+'\');hideCtx()"><span class="ctx-icon">➕</span>하위 페이지</div><div class="ctx-divider"></div><div class="ctx-item" onclick="toggleFavorite(\''+id+'\');hideCtx()"><span class="ctx-icon">⭐</span>즐겨찾기</div><div class="ctx-item" onclick="duplicatePage(\''+id+'\');hideCtx()"><span class="ctx-icon">📋</span>복제</div><div class="ctx-item" onclick="movePageUp(\''+id+'\');hideCtx()"><span class="ctx-icon">⬆️</span>위로 이동</div><div class="ctx-item" onclick="movePageDown(\''+id+'\');hideCtx()"><span class="ctx-icon">⬇️</span>아래로 이동</div><div class="ctx-divider"></div><div class="ctx-item danger" onclick="deletePage(\''+id+'\');hideCtx()"><span class="ctx-icon">🗑️</span>삭제</div>';showCtxAt(e.pageX,e.pageY)}
export function showBlockCtx(e,idx){
  e.stopPropagation();
  var b=state.page.blocks[idx];
  var m=$('ctxMenu');
  var html='';
  html+='<button class="ctx-btn" title="텍스트" onclick="changeBlockType('+idx+',\'text\');hideCtx()">T</button>';
  html+='<button class="ctx-btn" title="제목 1" onclick="changeBlockType('+idx+',\'h1\');hideCtx()">H1</button>';
  html+='<button class="ctx-btn" title="제목 2" onclick="changeBlockType('+idx+',\'h2\');hideCtx()">H2</button>';
  html+='<button class="ctx-btn" title="제목 3" onclick="changeBlockType('+idx+',\'h3\');hideCtx()">H3</button>';
  html+='<button class="ctx-btn" title="글머리" onclick="changeBlockType('+idx+',\'bullet\');hideCtx()">•</button>';
  html+='<button class="ctx-btn" title="번호" onclick="changeBlockType('+idx+',\'number\');hideCtx()">1.</button>';
  html+='<button class="ctx-btn" title="할일" onclick="changeBlockType('+idx+',\'todo\');hideCtx()">☑</button>';
  html+='<button class="ctx-btn" title="인용" onclick="changeBlockType('+idx+',\'quote\');hideCtx()">"</button>';
  html+='<div class="ctx-sep-v"></div>';
  html+='<button class="ctx-btn'+(idx===0?' disabled':'')+'" title="위로 이동" onclick="moveBlockUp('+idx+');hideCtx()">⬆</button>';
  html+='<button class="ctx-btn'+(idx>=state.page.blocks.length-1?' disabled':'')+'" title="아래로 이동" onclick="moveBlockDown('+idx+');hideCtx()">⬇</button>';
  html+='<div class="ctx-sep-v"></div>';
  html+='<button class="ctx-btn" title="복제" onclick="dupBlock('+idx+');hideCtx()">📋</button>';
  html+='<button class="ctx-btn" title="아래에 추가" onclick="addBlockBelow('+idx+');hideCtx()">➕</button>';
  html+='<div class="ctx-sep-v"></div>';
  html+='<button class="ctx-btn ctx-danger" title="삭제" onclick="deleteBlock('+idx+');hideCtx()">🗑️</button>';
  m.innerHTML=html;
  m.classList.add('ctx-horizontal');
  var btn=e.target.closest('.btn-i')||e.target;
  var rect=btn.getBoundingClientRect();
  m.style.right='auto';
  m.style.bottom='auto';
  m.style.left=(rect.right+4)+'px';
  m.style.top=rect.top+'px';
  m.classList.add('open');
}
export function showCtxAt(x,y){var m=$('ctxMenu');m.style.right='auto';m.style.bottom='auto';m.style.left=Math.min(x,window.innerWidth-180)+'px';m.style.top=Math.min(y,window.innerHeight-200)+'px';m.classList.add('open')}
export function hideCtx(){var m=$('ctxMenu');m.classList.remove('open','ctx-horizontal')}

// 버전 렌더링
export function renderVersions(){var list=state.page.versions.slice().reverse(),html='';if(list.length===0){$('versionList').innerHTML='<div style="text-align:center;color:var(--t4);padding:30px">버전 기록 없음</div>';return}for(var i=0;i<list.length;i++){var v=list[i],isCur=i===0;html+='<div class="ver-item'+(isCur?' current':'')+'" onclick="'+(isCur?'':'restoreVer(\''+v.id+'\')')+'"><div><div style="font-weight:500">'+formatDateTime(v.date)+(isCur?' <span class="badge badge-p">현재</span>':'')+'</div><div style="font-size:13px;color:var(--t4)">'+esc(v.author)+'</div></div>'+(isCur?'':'<button class="btn btn-sm btn-s" onclick="event.stopPropagation();deleteVer(\''+v.id+'\')">삭제</button>')+'</div>'}$('versionList').innerHTML=html}
export function renderComments(){var list=state.page.comments,html='';if(list.length===0){$('commentList').innerHTML='<div style="text-align:center;color:var(--t4);padding:30px">댓글 없음</div>';return}for(var i=0;i<list.length;i++){var c=list[i],isOwner=(c.author===(state.user.nickname||state.user.id))||isSuper();html+='<div class="cmt-item"><div class="cmt-head"><div class="cmt-avatar">'+c.author.slice(-2).toUpperCase()+'</div><div style="flex:1"><div style="font-weight:500;font-size:14px">'+esc(c.author)+'</div><div style="font-size:12px;color:var(--t4)">'+formatDateTime(c.date)+'</div></div>'+(isOwner?'<div style="display:flex;gap:4px"><button class="btn btn-sm btn-g" onclick="editComment(\''+c.id+'\')">✏️</button><button class="btn btn-sm btn-g" style="color:var(--err)" onclick="deleteComment(\''+c.id+'\')">🗑️</button></div>':'')+'</div><div style="font-size:14px;color:var(--t2);margin-top:8px">'+esc(c.text)+'</div></div>'}$('commentList').innerHTML=html}

// 기타 모달 — showTrash/showRecent/showFavorites/showTemplates 공통 추상화 검토 후
// 각 함수의 데이터 소스, DOM 대상, 액션이 충분히 달라 추상화 비용 > 이득으로 판단하여 개별 유지
export function showTrash(){
  var del=state.db.pages.filter(function(p){return p.deleted});
  var html='';
  if(del.length===0)html='<div style="text-align:center;color:var(--t4);padding:30px">휴지통이 비어있습니다</div>';
  else for(var i=0;i<del.length;i++){var p=del[i];html+='<div class="nav-item" style="justify-content:space-between"><div style="display:flex;align-items:center;gap:10px"><span>'+p.icon+'</span><span>'+esc(p.title)+'</span></div><div style="display:flex;gap:6px"><button class="btn btn-sm btn-s" onclick="restorePage(\''+p.id+'\')">복원</button>'+(isSuper()?'<button class="btn btn-sm btn-d" onclick="permanentDelete(\''+p.id+'\')">삭제</button>':'')+'</div></div>'}
  $('trashList').innerHTML=html;
  $('trashFoot').style.display=isSuper()&&del.length>0?'flex':'none';
  openModal('trashModal')
}
export function showRecent(){var html='';if(state.db.recent.length===0)html='<div style="text-align:center;color:var(--t4);padding:30px">최근 문서 없음</div>';else for(var i=0;i<Math.min(state.db.recent.length,15);i++){var p=getPage(state.db.recent[i]);if(p&&!p.deleted)html+='<div class="nav-item" onclick="loadPage(\''+p.id+'\');closeModal(\'recentModal\')"><span class="nav-icon">'+p.icon+'</span><span class="nav-text">'+esc(p.title)+'</span></div>'}$('recentList').innerHTML=html;openModal('recentModal')}
export function showFavorites(){var favs=state.db.pages.filter(function(p){return p.favorite&&!p.deleted});var html='';if(favs.length===0)html='<div style="text-align:center;color:var(--t4);padding:30px">즐겨찾기 없음</div>';else for(var i=0;i<favs.length;i++){var p=favs[i];html+='<div class="nav-item" onclick="loadPage(\''+p.id+'\');closeModal(\'favoritesModal\')"><span class="nav-icon">'+p.icon+'</span><span class="nav-text">'+esc(p.title)+'</span></div>'}$('favoritesList').innerHTML=html;openModal('favoritesModal')}
export function showTemplates(){var html='';for(var i=0;i<state.db.templates.length;i++){var t=state.db.templates[i];html+='<div class="nav-item" onclick="createPage(null,\''+t.id+'\')"><span class="nav-icon">'+t.icon+'</span><span class="nav-text">'+esc(t.name)+'</span></div>'}html+='<div class="nav-item" onclick="createPage()"><span class="nav-icon">📄</span><span class="nav-text">빈 페이지</span></div>';$('templatesList').innerHTML=html;openModal('templatesModal')}
