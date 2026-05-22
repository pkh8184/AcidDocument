// src/ui/modals.js — 모달, 설정

import state from '../data/store.js';
import {ICONS,auth} from '../config/firebase.js';
import {$,$$,esc,toast,formatDate} from '../utils/helpers.js';
import {saveDB,savePage,batchUpdateUserIdInPages,updateUserIdInLogs,getErrorLogs,clearErrorLogs} from '../data/firestore.js';
import {isSuper,updateUidMapping} from '../auth/auth.js';
import {generateSalt,hashPassword,verifyPassword,validatePassword} from '../auth/crypto.js';
import {renderTree} from './sidebar.js';
import {getPage} from '../editor/blocks.js';
import {renderBlocks} from '../editor/renderer.js';

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
export function showSettingsTab(tab,btn){$$('.tab-btn').forEach(function(b){b.classList.remove('on')});$$('.tab-panel').forEach(function(p){p.classList.remove('on')});btn.classList.add('on');$('tab'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('on');if(tab==='iplog')renderIpLog();if(tab==='storage')renderStorageSettings();if(tab==='deletelog')renderDeleteLog();if(tab==='errorlog')loadErrorLogs()}

export function renderStorageSettings(){
  var mode=state.db.settings.imageStorage||'storage';
  $('imgStorageOn').checked=(mode==='storage');
  $('imgStorageOff').checked=(mode==='base64');
}
export function setImageStorageMode(mode){
  state.db.settings.imageStorage=mode;
  saveDB();
  toast(mode==='storage'?'외부 호스팅 사용 (Cloudinary)':'문서 내 저장 (Base64) 사용');
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
    saveDB();savePage(p);
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
export function loadErrorLogs(){
  var list=$('errorLogList');
  if(!isSuper()){list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">최고관리자만 볼 수 있습니다.</p>';return}
  list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">로딩 중...</p>';
  getErrorLogs(100).then(function(logs){
    if(!logs||logs.length===0){list.innerHTML='<p style="color:var(--t4);text-align:center;padding:20px">오류 기록이 없습니다.</p>';return}
    var html='<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:var(--bg3)"><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">시간</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">유형</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">메시지</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">사용자</th><th style="padding:8px;text-align:left;border-bottom:1px solid var(--bdr)">UA</th></tr></thead><tbody>';
    for(var i=0;i<logs.length;i++){
      var log=logs[i];
      var d=new Date(log.timestamp);
      var time=d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0')+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
      var ua=log.userAgent||'';
      var shortUa=ua.length>40?ua.substring(0,40)+'...':ua;
      html+='<tr style="border-bottom:1px solid var(--bdr)">';
      html+='<td style="padding:8px;white-space:nowrap">'+esc(time)+'</td>';
      html+='<td style="padding:8px"><span style="background:var(--err);color:#fff;padding:2px 6px;border-radius:4px;font-size:11px">'+esc(log.type||'')+'</span></td>';
      html+='<td style="padding:8px;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="'+esc(log.message||'')+'">'+esc(log.message||'')+(log.code?'<br><span style="color:var(--t4);font-size:11px">'+esc(log.code)+'</span>':'')+'</td>';
      html+='<td style="padding:8px">'+esc(log.userId||'-')+'</td>';
      html+='<td style="padding:8px;font-size:11px;color:var(--t4)" title="'+esc(ua)+'">'+esc(shortUa)+'</td>';
      html+='</tr>';
    }
    html+='</tbody></table>';
    list.innerHTML=html;
  }).catch(function(err){
    list.innerHTML='<p style="color:var(--err);text-align:center;padding:20px">로그 로드 실패: '+esc(err.message)+'</p>';
  });
}
export function clearErrorLogsUI(){
  if(!isSuper()){toast('권한이 없습니다','err');return}
  if(!confirm('모든 오류 로그를 삭제하시겠습니까?'))return;
  clearErrorLogs().then(function(){
    loadErrorLogs();
    toast('오류 로그 삭제됨');
  }).catch(function(err){
    toast('삭제 실패: '+err.message,'err');
  });
}
export function saveNickname(){var nick=$('setNickname').value.trim();for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===state.user.id){state.db.users[i].nickname=nick;break}}state.user.nickname=nick;saveDB();$('userName').textContent=nick||state.user.id;import('./sidebar.js').then(function(m){m.renderMeta()});toast('닉네임 저장')}
export function renderUsers(){
  if(!isSuper()){$('usersTable').innerHTML='<tr><td style="text-align:center;padding:20px;color:var(--t4)">권한 없음</td></tr>';return}
  var html='<tr><th>아이디</th><th>닉네임</th><th>비밀번호</th><th>상태</th><th></th></tr>';
  for(var i=0;i<state.db.users.length;i++){
    var u=state.db.users[i];
    // 아이디 칸: 변경 버튼 + 인라인 입력 (super 제외)
    html+='<tr><td>'+esc(u.id);
    if(u.role!=='super'){
      html+=' <button class="btn btn-sm btn-s" onclick="showChangeIdInput(\''+u.id+'\')" title="아이디 변경">✏️</button>';
      html+='<div id="changeId_'+u.id+'" style="display:none;margin-top:6px">';
      html+='<input id="adminNewId_'+u.id+'" style="width:120px;font-size:12px" placeholder="새 아이디">';
      html+=' <button class="btn btn-sm btn-p" onclick="adminChangeUserId(\''+u.id+'\')">변경</button></div>';
    }
    html+='</td>';
    html+='<td>'+esc(u.nickname||'-')+'</td>';
    html+='<td><code id="pw_'+u.id+'" style="background:var(--bg3);padding:2px 6px;border-radius:4px;font-size:12px">••••••</code> <button class="btn btn-sm btn-s" onclick="togglePwView(\''+u.id+'\')">👁</button></td>';
    html+='<td><span class="badge '+(u.active?'badge-p':'badge-w')+'">'+(u.active?'활성':'비활성')+'</span></td>';
    html+='<td>';
    if(u.role!=='super'){
      html+='<button class="btn btn-sm btn-s" onclick="resetPw(\''+u.id+'\')">초기화</button> ';
      html+='<button class="btn btn-sm btn-s" onclick="toggleActive(\''+u.id+'\')">'+(u.active?'비활성':'활성')+'</button> ';
      html+='<button class="btn btn-sm btn-d" onclick="delUser(\''+u.id+'\')">삭제</button>';
    }else{
      html+='<span class="badge badge-w">최고관리자</span>';
    }
    html+='</td></tr>';
  }
  $('usersTable').innerHTML=html;
}
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
// ── 아이디 변경 ──────────────────────────────────────
function validateUserId(newId,currentId){
  if(!newId||!newId.trim())return '아이디를 입력하세요';
  newId=newId.trim();
  if(newId===currentId)return '현재 아이디와 동일합니다';
  if(newId.length<3)return '아이디는 3자 이상이어야 합니다';
  if(newId.length>30)return '아이디는 30자 이하여야 합니다';
  if(!/^[a-zA-Z0-9_]+$/.test(newId))return '아이디는 영문, 숫자, 밑줄(_)만 사용 가능합니다';
  for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===newId)return '이미 사용 중인 아이디입니다'}
  return null;
}
function changeUserId(oldId,newId,isSelf){
  var err=validateUserId(newId,oldId);
  if(err){toast(err,'err');return}
  var msg='아이디를 "'+oldId+'" → "'+newId+'"(으)로 변경하시겠습니까?\n\n모든 기록(작성자, 버전, 댓글, 로그)이 업데이트됩니다.';
  if(isSelf)msg+='\n\n변경 후 다시 로그인해야 합니다.';
  if(!confirm(msg))return;
  toast('아이디 변경 중...','warn');
  // 1. state.db.users[].id 변경
  var userEntry=null;
  for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===oldId){userEntry=state.db.users[i];state.db.users[i].id=newId;break}}
  if(!userEntry){toast('사용자를 찾을 수 없습니다','err');return}
  // 2. state.user 업데이트
  if(isSelf)state.user.id=newId;
  // 3. 로그 업데이트 (메모리)
  updateUserIdInLogs(oldId,newId);
  // 4. 페이지 참조 일괄 업데이트 + Firestore 저장
  batchUpdateUserIdInPages(oldId,newId).then(function(){
    return saveDB();
  }).then(function(){
    return updateUidMapping(oldId,newId);
  }).then(function(){
    // Firebase Auth 이메일 업데이트 (본인만)
    if(isSelf&&auth.currentUser){
      var newEmail=newId+'@aciddocument.local';
      return auth.currentUser.updateEmail(newEmail).then(function(){
        console.log('Firebase Auth 이메일 업데이트 완료');
      }).catch(function(e){
        console.warn('Firebase Auth 이메일 업데이트 실패 (다음 로그인 시 자동 처리):',e);
      });
    }
  }).then(function(){
    // UI 갱신
    if(isSelf){
      $('setUserId').value=newId;
      $('userName').textContent=userEntry.nickname||newId;
      $('userAvatar').textContent=(userEntry.nickname||newId).slice(-2).toUpperCase();
      if(state.page)import('./sidebar.js').then(function(m){m.renderMeta()});
    }
    renderUsers();
    toast('아이디 변경 완료');
    if(isSelf){
      setTimeout(function(){
        alert('아이디가 변경되었습니다. 새 아이디로 다시 로그인하세요.');
        import('../auth/auth.js').then(function(m){m.logout()});
      },1000);
    }
  }).catch(function(e){
    console.error('아이디 변경 실패:',e);
    userEntry.id=oldId;
    if(isSelf)state.user.id=oldId;
    updateUserIdInLogs(newId,oldId);
    toast('아이디 변경 실패. 새로고침하세요.','err');
  });
}
export function changeUserIdSelf(){
  var newId=$('setNewUserId').value.trim();
  changeUserId(state.user.id,newId,true);
}
export function adminChangeUserId(oldId){
  var input=$('adminNewId_'+oldId);
  if(!input)return;
  changeUserId(oldId,input.value.trim(),false);
}
export function showChangeIdInput(userId){
  var el=$('changeId_'+userId);
  if(!el)return;
  el.style.display=el.style.display==='none'?'block':'none';
  if(el.style.display==='block'){var inp=$('adminNewId_'+userId);if(inp){inp.value='';inp.focus()}}
}
export function toggleChangeIdSelf(){
  var wrap=$('changeIdSelfWrap');
  if(!wrap)return;
  wrap.style.display=wrap.style.display==='none'?'block':'none';
  if(wrap.style.display==='block'){$('setNewUserId').value='';$('setNewUserId').focus()}
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
export function selectIcon(ic){state.page.icon=ic;$('pageIcon').textContent=ic;saveDB();savePage(state.page);renderTree();closeModal('iconModal')}
