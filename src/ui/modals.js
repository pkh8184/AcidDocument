// src/ui/modals.js — 모달, 설정

import state from '../data/store.js';
import {ICONS,STORAGE_LIMIT,auth} from '../config/firebase.js';
import {$,$$,esc,toast,formatDate,formatBytes} from '../utils/helpers.js';
import {saveDB,uploadToStorage,updateStorageUsage} from '../data/firestore.js';
import {isSuper} from '../auth/auth.js';
import {generateSalt,hashPassword,verifyPassword,validatePassword} from '../auth/crypto.js';
import {renderTree} from './sidebar.js';
import {getPage} from '../editor/blocks.js';
import {renderBlocks} from '../editor/renderer.js';
import {storage} from '../config/firebase.js';

var _previousFocus=null;

export function trapFocus(modalId){
  var modal=$(modalId);
  if(!modal)return;
  var focusable=modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if(focusable.length===0)return;
  var first=focusable[0];
  var last=focusable[focusable.length-1];
  modal.addEventListener('keydown',function(e){
    if(e.key==='Tab'){
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
    if(e.key==='Escape')closeModal(modalId);
  });
  first.focus();
}

export function openModal(id){
  _previousFocus=document.activeElement;
  $(id).classList.add('open');
  trapFocus(id);
}
export function closeModal(id){
  $(id).classList.remove('open');
  if(_previousFocus&&typeof _previousFocus.focus==='function'){
    _previousFocus.focus();
    _previousFocus=null;
  }
}
export function closeAllModals(){$$('.modal-bg').forEach(function(m){m.classList.remove('open')});if(_previousFocus&&typeof _previousFocus.focus==='function'){_previousFocus.focus();_previousFocus=null}}
export function closePanel(id){$(id).classList.remove('open')}
export function closeAllPanels(){$$('.panel').forEach(function(p){p.classList.remove('open')});state.panelType=null}

export function openSettings(){
  openModal('settingsModal');
  $('setUserId').value=state.user.id;
  $('setNickname').value=state.user.nickname||'';
  $('setUserRole').value=isSuper()?'최고관리자':'관리자';
  $('setWsName').value=state.db.settings.wsName;
  $('noticeContent').value=state.db.settings.notice||'';
  renderUsers();genNewUser();
  showSettingsTab('profile',document.querySelector('.tab-btn.on'))
}
export function showSettingsTab(tab,btn){$$('.tab-btn').forEach(function(b){b.classList.remove('on')});$$('.tab-panel').forEach(function(p){p.classList.remove('on')});btn.classList.add('on');$('tab'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('on');if(tab==='iplog')renderIpLog();if(tab==='storage')renderStorageUsage();if(tab==='deletelog')renderDeleteLog()}

export function renderStorageUsage(){
  var used=state.db.storageUsage||0;
  var pct=Math.min((used/STORAGE_LIMIT)*100,100);
  $('storageUsageFill').style.width=pct+'%';
  $('storageUsageFill').style.background=pct>90?'var(--err)':pct>70?'var(--warn)':'var(--acc)';
  $('storageUsageText').innerHTML='<strong>'+formatBytes(used)+'</strong> / '+formatBytes(STORAGE_LIMIT)+' 사용 ('+pct.toFixed(1)+'%)';
  // 이미지 저장 방식 라디오버튼 설정
  var mode=state.db.settings.imageStorage||'storage';
  $('imgStorageOn').checked=(mode==='storage');
  $('imgStorageOff').checked=(mode==='base64');
}
export function migrateImages(){
  if(!isSuper()){toast('최고관리자만 가능합니다','err');return}
  if(!confirm('기존 base64 이미지를 Storage로 이전합니다.\n시간이 걸릴 수 있습니다. 진행하시겠습니까?'))return;

  var status=$('migrationStatus');
  status.style.display='block';
  status.innerHTML='🔍 base64 이미지 검색 중...';

  // base64 이미지 찾기
  var targets=[];
  for(var i=0;i<state.db.pages.length;i++){
    var pg=state.db.pages[i];
    if(!pg.blocks)continue;
    for(var j=0;j<pg.blocks.length;j++){
      var blk=pg.blocks[j];
      if(blk.type==='image'&&blk.src&&blk.src.startsWith('data:image/')){
        targets.push({pageIdx:i,blockIdx:j,src:blk.src});
      }
    }
  }

  if(targets.length===0){
    status.innerHTML='✅ 마이그레이션할 이미지가 없습니다.';
    toast('이미 완료됨');
    return;
  }

  status.innerHTML='📤 '+targets.length+'개 이미지 발견. 업로드 중... (0/'+targets.length+')';

  var completed=0;
  var failed=0;

  function uploadNext(idx){
    if(idx>=targets.length){
      status.innerHTML='✅ 완료! 성공: '+completed+', 실패: '+failed;
      if(completed>0){
        saveDB().then(function(){
          toast('마이그레이션 완료');
          renderStorageUsage();
        });
      }
      return;
    }

    var t=targets[idx];
    status.innerHTML='📤 업로드 중... ('+(idx+1)+'/'+targets.length+')';

    // base64 → Blob 변환
    try{
      var parts=t.src.split(',');
      var mime=parts[0].match(/:(.*?);/)[1];
      var bstr=atob(parts[1]);
      var n=bstr.length;
      var u8arr=new Uint8Array(n);
      for(var k=0;k<n;k++)u8arr[k]=bstr.charCodeAt(k);
      var blob=new Blob([u8arr],{type:mime});

      // Storage에 업로드
      var ext=mime.split('/')[1]||'png';
      var fileName='images/migrate_'+Date.now()+'_'+idx+'.'+ext;
      var ref=storage.ref().child(fileName);

      ref.put(blob).then(function(snapshot){
        return snapshot.ref.getDownloadURL();
      }).then(function(url){
        // 원본 교체
        state.db.pages[t.pageIdx].blocks[t.blockIdx].src=url;
        updateStorageUsage(blob.size);
        completed++;
        uploadNext(idx+1);
      }).catch(function(err){
        console.error('업로드 실패:',err);
        failed++;
        uploadNext(idx+1);
      });
    }catch(err){
      console.error('변환 실패:',err);
      failed++;
      uploadNext(idx+1);
    }
  }

  uploadNext(0);
}
export function setImageStorageMode(mode){
  state.db.settings.imageStorage=mode;
  saveDB();
  toast(mode==='storage'?'Storage 사용':'Base64 사용');
}
export function renderIpLog(){
  var list=$('ipLogList');
  if(!isSuper()){list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">최고관리자만 볼 수 있습니다.</p>';return}
  if(!state.db.ipLogs||state.db.ipLogs.length===0){list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">접속 기록이 없습니다.</p>';return}
  var html='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--bg3)"><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">시간</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">IP</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">아이디</th><th style="padding:8px;text-align:center;border-bottom:1px solid var(--bdr)">결과</th></tr></thead><tbody>';
  for(var i=0;i<state.db.ipLogs.length;i++){
    var log=state.db.ipLogs[i];
    var d=new Date(log.time);
    var time=d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0')+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    html+='<tr style="border-bottom:1px solid var(--bdr)">';
    html+='<td style="padding:8px">'+time+'</td>';
    html+='<td style="padding:8px;font-family:monospace">'+esc(log.ip)+'</td>';
    html+='<td style="padding:8px">'+esc(log.userId)+'</td>';
    html+='<td style="padding:8px;text-align:center">'+(log.success?'<span style="color:var(--ok)">✓ 성공</span>':'<span style="color:var(--err)">✗ 실패</span>')+'</td>';
    html+='</tr>';
  }
  html+='</tbody></table>';
  list.innerHTML=html;
}
export function clearIpLog(){
  if(!isSuper()){toast('권한이 없습니다','err');return}
  if(!confirm('모든 접속 로그를 삭제하시겠습니까?'))return;
  state.db.ipLogs=[];
  saveDB();
  renderIpLog();
  toast('로그 삭제됨');
}
export function renderDeleteLog(){
  var list=$('deleteLogList');
  if(!isSuper()){list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">최고관리자만 볼 수 있습니다.</p>';return}
  if(!state.db.deleteLogs||state.db.deleteLogs.length===0){list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">삭제 기록이 없습니다.</p>';return}
  var html='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--bg3)"><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">시간</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">문서</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">삭제자</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">IP</th><th style="padding:8px;text-align:center;border-bottom:1px solid var(--bdr)">유형</th><th style="padding:8px;text-align:center;border-bottom:1px solid var(--bdr)">복원</th></tr></thead><tbody>';
  for(var i=0;i<state.db.deleteLogs.length;i++){
    var log=state.db.deleteLogs[i];
    var d=new Date(log.time);
    var time=d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0')+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    var actionLabel=log.action==='trash'?'<span style="color:var(--warn)">🗑️ 휴지통</span>':'<span style="color:var(--err)">❌ 영구삭제</span>';
    var canRestore=log.action==='trash'&&getPage(log.pageId);
    html+='<tr style="border-bottom:1px solid var(--bdr)">';
    html+='<td style="padding:8px">'+time+'</td>';
    html+='<td style="padding:8px">'+esc(log.pageTitle)+'</td>';
    html+='<td style="padding:8px">'+esc(log.userNickname||log.userId)+'</td>';
    html+='<td style="padding:8px;font-family:monospace;font-size:12px">'+esc(log.ip)+'</td>';
    html+='<td style="padding:8px;text-align:center">'+actionLabel+'</td>';
    html+='<td style="padding:8px;text-align:center">'+(canRestore?'<button class="btn btn-sm btn-p" onclick="restoreFromLog(\''+log.pageId+'\')">복원</button>':'<span style="color:var(--t4)">-</span>')+'</td>';
    html+='</tr>';
  }
  html+='</tbody></table>';
  list.innerHTML=html;
}
export function restoreFromLog(pageId){
  var p=getPage(pageId);
  if(p&&p.deleted){
    p.deleted=false;
    delete p.deletedAt;
    delete p.deletedBy;
    saveDB();
    renderDeleteLog();
    renderTree();
    toast('복원됨');
  }else{
    toast('복원할 수 없습니다','err');
  }
}
export function clearDeleteLog(){
  if(!isSuper()){toast('권한이 없습니다','err');return}
  if(!confirm('모든 삭제 로그를 삭제하시겠습니까?'))return;
  state.db.deleteLogs=[];
  saveDB();
  renderDeleteLog();
  toast('로그 삭제됨');
}
export function saveNickname(){var nick=$('setNickname').value.trim();for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===state.user.id){state.db.users[i].nickname=nick;break}}state.user.nickname=nick;saveDB();$('userName').textContent=nick||state.user.id;import('./sidebar.js').then(function(m){m.renderMeta()});toast('닉네임 저장')}
export function renderUsers(){if(!isSuper()){$('usersTable').innerHTML='<tr><td style="text-align:center;padding:20px;color:var(--t4)">권한 없음</td></tr>';return}var html='<tr><th>아이디</th><th>닉네임</th><th>비밀번호</th><th>상태</th><th></th></tr>';for(var i=0;i<state.db.users.length;i++){var u=state.db.users[i];html+='<tr><td>'+esc(u.id)+'</td><td>'+esc(u.nickname||'-')+'</td><td><code id="pw_'+u.id+'" style="background:var(--bg3);padding:2px 6px;border-radius:4px;font-size:12px">••••••</code> <button class="btn btn-sm btn-s" onclick="togglePwView(\''+u.id+'\')">👁</button></td><td><span class="badge '+(u.active?'badge-p':'badge-w')+'">'+(u.active?'활성':'비활성')+'</span></td><td>'+(u.role!=='super'?'<button class="btn btn-sm btn-s" onclick="resetPw(\''+u.id+'\')">초기화</button> <button class="btn btn-sm btn-s" onclick="toggleActive(\''+u.id+'\')">'+(u.active?'비활성':'활성')+'</button> <button class="btn btn-sm btn-d" onclick="delUser(\''+u.id+'\')">삭제</button>':'<span class="badge badge-w">최고관리자</span>')+'</td></tr>'}$('usersTable').innerHTML=html}
export function togglePwView(userId){
  var el=$('pw_'+userId);
  if(!el)return;
  var u=null;
  for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===userId){u=state.db.users[i];break}}
  if(!u)return;
  if(el.textContent==='••••••'){
    if(u.pwHash){el.textContent='[SHA-256 해시됨]'}
    else if(u.pw){el.textContent=u.pw+' [마이그레이션 필요]'}
  }else{el.textContent='••••••'}
}
export function exportUsers(){
  if(!isSuper()){toast('권한 없음','err');return}
  var data=[];
  for(var i=0;i<state.db.users.length;i++){
    var u=state.db.users[i];
    var entry={id:u.id,nickname:u.nickname||'',active:u.active,role:u.role||'admin'};
    if(u.pwHash){entry.migrated=true}else{entry.migrated=false}
    data.push(entry);
  }
  var json=JSON.stringify(data,null,2);
  var blob=new Blob([json],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download='acid_users_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('계정 목록 다운로드됨');
}
export function genNewUser(){var id='admin'+Math.floor(1000+Math.random()*9000),chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789',pw='';for(var i=0;i<12;i++)pw+=chars[Math.floor(Math.random()*chars.length)];$('newUserId').value=id;$('newUserPw').value=pw}
export function createUser(){if(!isSuper()){toast('권한 없음','err');return}var id=$('newUserId').value,pw=$('newUserPw').value;for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===id){toast('중복 아이디','err');return}}var salt=generateSalt();hashPassword(pw,salt).then(function(hash){state.db.users.push({id:id,pwHash:hash,pwSalt:salt,role:'admin',needPw:true,active:true,nickname:''});saveDB();renderUsers();genNewUser();toast('사용자 생성');alert('생성된 비밀번호: '+pw+'\n(이 비밀번호는 다시 볼 수 없습니다)')})}
export function resetPw(id){if(!isSuper())return;var chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789',pw='';for(var i=0;i<12;i++)pw+=chars[Math.floor(Math.random()*chars.length)];var salt=generateSalt();hashPassword(pw,salt).then(function(hash){for(var j=0;j<state.db.users.length;j++){if(state.db.users[j].id===id){state.db.users[j].pwHash=hash;state.db.users[j].pwSalt=salt;delete state.db.users[j].pw;state.db.users[j].needPw=true;break}}saveDB();alert('새 비밀번호: '+pw+'\n(이 비밀번호는 다시 볼 수 없습니다)');renderUsers()})}
export function toggleActive(id){if(!isSuper())return;for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===id){state.db.users[i].active=!state.db.users[i].active;break}}saveDB();renderUsers();toast('상태 변경')}
export function delUser(id){if(!isSuper()||!confirm('삭제?'))return;state.db.users=state.db.users.filter(function(u){return u.id!==id});saveDB();renderUsers();toast('삭제됨')}
export function changePassword(){
  var c=$('setPwCur').value,n=$('setPwNew').value;
  if(!c||!n){toast('비밀번호 입력','err');return}
  var pwErr=validatePassword(n);
  if(pwErr){toast(pwErr,'err');return}
  var userEntry=null;
  for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===state.user.id){userEntry=state.db.users[i];break}}
  if(!userEntry){toast('사용자를 찾을 수 없습니다','err');return}
  // 비밀번호 검증 (해시/평문 모두 지원)
  var verifyPromise;
  if(userEntry.pwHash&&userEntry.pwSalt){
    verifyPromise=verifyPassword(c,userEntry.pwSalt,userEntry.pwHash);
  }else{
    verifyPromise=Promise.resolve(userEntry.pw===c);
  }
  verifyPromise.then(function(valid){
    if(!valid){toast('현재 비밀번호 틀림','err');return}
    var salt=generateSalt();
    hashPassword(n,salt).then(function(hash){
      for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===state.user.id){state.db.users[i].pwHash=hash;state.db.users[i].pwSalt=salt;delete state.db.users[i].pw;break}}
      saveDB();
      var currentUser=auth.currentUser;
      if(currentUser){
        currentUser.updatePassword(n).then(function(){
          console.log('Firebase Auth 비밀번호 업데이트 완료');
        }).catch(function(e){
          console.error('Firebase Auth 비밀번호 업데이트 실패:',e);
          toast('비밀번호 변경됨 (Firebase 동기화 실패, 레거시 인증으로 로그인 가능)','warn');
        });
      }
      $('setPwCur').value=$('setPwNew').value='';toast('변경됨');
    });
  });
}
export function saveWorkspace(){state.db.settings.wsName=$('setWsName').value||'DocSpace';saveDB();$('wsName').textContent=state.db.settings.wsName;import('./sidebar.js').then(function(m){m.renderBreadcrumb()});toast('저장됨')}
// 공지사항
export function saveNotice(){if(!isSuper()){toast('권한 없음','err');return}state.db.settings.notice=$('noticeContent').value;saveDB();updateNoticeBar();toast('공지 저장')}
export function clearNotice(){if(!isSuper()){toast('권한 없음','err');return}state.db.settings.notice='';$('noticeContent').value='';saveDB();updateNoticeBar();toast('공지 삭제')}
export function updateNoticeBar(){if(state.db.settings.notice){$('noticeText').textContent=state.db.settings.notice;$('noticeBar').classList.add('show')}else{$('noticeBar').classList.remove('show')}}
export function closeNoticeBar(){$('noticeBar').classList.remove('show')}
export function showNotice(){if(state.db.settings.notice){$('noticeBody').textContent=state.db.settings.notice;openModal('noticeModal')}else{toast('공지사항 없음','warn')}}

// 단축키 안내
export function openShortcutHelp(){openModal('shortcutModal')}

// 검색 (openSearch/doSearch는 search.js에서 import)
export function openSearch(){openModal('searchModal');$('searchInput').value='';$('searchInput').focus();import('../features/search.js').then(function(m){m.doSearch('')})}

// 아이콘 피커
export function openIconPicker(){var html='';for(var i=0;i<ICONS.length;i++)html+='<div class="icon-item" onclick="selectIcon(\''+ICONS[i]+'\')">'+ICONS[i]+'</div>';$('iconGrid').innerHTML=html;openModal('iconModal')}
export function selectIcon(ic){state.page.icon=ic;$('pageIcon').textContent=ic;saveDB();renderTree();closeModal('iconModal')}
