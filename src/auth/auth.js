// src/auth/auth.js — 로그인, 세션 관리

import state from '../data/store.js';
import {SUPER} from '../config/firebase.js';
import {$,toast,getLoginState,saveLoginState} from '../utils/helpers.js';
import {saveDB,logLoginAttempt} from '../data/firestore.js';
import {initApp} from '../main.js';
import {openModal,closeModal,closeAllModals,closeAllPanels} from '../ui/modals.js';

export function handleLogin(e){
  e.preventDefault();
  // db 로드 전이면 대기
  if(!state.db||!state.db.users){
    toast('데이터 로딩 중...','warn');
    return;
  }
  var st=getLoginState();
  console.log('로그인 시도 - 현재 상태:', st);

  if(st.blocked){$('loginBlocked').style.display='block';$('loginForm').style.display='none';return}
  if(st.lockUntil>Date.now()){showLockTimer(st.lockUntil);return}

  var id=$('loginId').value.trim(),pw=$('loginPw').value,u=null;
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===id&&state.db.users[i].pw===pw&&state.db.users[i].active){u=state.db.users[i];break}
  }

  if(!u){
    logLoginAttempt(id,false);
    st.attempts=(st.attempts||0)+1;
    console.log('로그인 실패 - 시도 횟수:', st.attempts);

    var idExists=false;
    for(var j=0;j<state.db.users.length;j++){if(state.db.users[j].id===id){idExists=true;break}}
    var errMsg=idExists?'❌ 비밀번호가 일치하지 않습니다.':'❌ 존재하지 않는 아이디입니다.';

    if(st.attempts>=15){
      st.blocked=true;
      saveLoginState(st);
      $('loginBlocked').style.display='block';
      $('loginForm').style.display='none';
      $('loginError').style.display='none';
      return;
    }
    if(st.attempts>=5){
      st.lockUntil=Date.now()+5*60*1000;
      saveLoginState(st);
      showLockTimer(st.lockUntil);
      return;
    }
    errMsg+=' ('+st.attempts+'/5)';
    $('loginError').textContent=errMsg;
    $('loginError').style.display='block';
    $('loginPw').value='';
    saveLoginState(st);
    return;
  }

  // 성공
  logLoginAttempt(id,true);
  st.attempts=0;st.lockUntil=0;st.blocked=false;
  saveLoginState(st);
  localStorage.setItem('ad_session',u.id);
  state.user=u;
  $('loginError').style.display='none';
  if(u.needPw){$('loginScreen').classList.add('hidden');openModal('pwChangeModal')}else initApp()
}
export function showLockTimer(until){
  $('loginLocked').style.display='block';$('loginForm').style.display='none';$('loginError').style.display='none';
  var interval=setInterval(function(){
    var remaining=until-Date.now();
    if(remaining<=0){clearInterval(interval);$('loginLocked').style.display='none';$('loginForm').style.display='block';return}
    var min=Math.floor(remaining/60000),sec=Math.floor((remaining%60000)/1000);
    $('lockTimer').textContent=min+':'+(sec<10?'0':'')+sec
  },1000)
}
export function resetLoginState(){
  localStorage.removeItem('ad_login_state');
  $('loginBlocked').style.display='none';
  $('loginLocked').style.display='none';
  $('loginForm').style.display='block';
  $('loginError').style.display='none';
  toast('잠금 해제됨');
}
export function skipPwChange(){closeModal('pwChangeModal');initApp()}
export function submitPwChange(){
  var nick=$('pwNickname').value.trim(),c=$('pwCur').value,n=$('pwNew').value,cf=$('pwConfirm').value;
  if(!c||!n||!cf){toast('비밀번호를 입력하세요','err');return}
  if(n!==cf){toast('비밀번호가 일치하지 않습니다','err');return}
  if(state.user.pw!==c){toast('현재 비밀번호가 틀립니다','err');return}
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===state.user.id){state.db.users[i].pw=n;state.db.users[i].needPw=false;if(nick)state.db.users[i].nickname=nick;break}
  }
  saveDB();closeModal('pwChangeModal');toast('설정 완료');initApp()
}
export function logout(){localStorage.removeItem('ad_session');state.user=null;state.page=null;$('appWrap').style.display='none';$('loginScreen').classList.remove('hidden');$('loginId').value='';$('loginPw').value='';$('loginForm').style.display='block';$('loginLocked').style.display='none';closeAllModals();closeAllPanels();location.hash=''}
export function isSuper(){return state.user&&state.user.id===SUPER}
