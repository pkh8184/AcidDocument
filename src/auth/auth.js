// src/auth/auth.js — 로그인, 세션 관리 (Firebase Auth 호환 레이어)

import state from '../data/store.js';
import {SUPER,auth,firestore} from '../config/firebase.js';
import {$,toast,getLoginState,saveLoginState} from '../utils/helpers.js';
import {saveDB,logLoginAttempt} from '../data/firestore.js';
import {initApp} from '../main.js';
import {openModal,closeModal,closeAllModals,closeAllPanels} from '../ui/modals.js';

// AUTH_DOMAIN: Firebase Auth용 이메일 도메인
var AUTH_DOMAIN='@aciddocument.local';

// --- 유틸: 레거시 users 배열에서 사용자 찾기 ---
function findLegacyUser(id,pw){
  if(!state.db||!state.db.users)return null;
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===id&&state.db.users[i].pw===pw&&state.db.users[i].active)return state.db.users[i];
  }
  return null;
}
function findLegacyUserById(id){
  if(!state.db||!state.db.users)return null;
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===id)return state.db.users[i];
  }
  return null;
}

// --- 유틸: Firebase Auth에서 사용자 프로필 복사 (users/{uid} 컬렉션) ---
function copyUserProfile(uid,legacyUser){
  return firestore.collection('users').doc(uid).set({
    legacyId:legacyUser.id,
    nickname:legacyUser.nickname||'',
    role:legacyUser.role||'admin',
    active:legacyUser.active!==false,
    migratedAt:new Date().toISOString()
  },{merge:true}).catch(function(e){
    console.warn('사용자 프로필 복사 실패:',e);
  });
}

// --- 유틸: UID 매핑 저장 ---
function saveUidMapping(legacyId,uid){
  return firestore.collection('app').doc('userMapping').set(
    (function(){var obj={};obj[legacyId]=uid;return obj})(),
    {merge:true}
  ).catch(function(e){
    console.warn('UID 매핑 저장 실패:',e);
  });
}

// --- 유틸: state.user 설정 (레거시 유저 기반) ---
function setStateUser(legacyUser){
  state.user=legacyUser;
}

// --- Progressive Migration: 레거시 로그인 성공 시 Firebase Auth에 자동 등록 ---
function progressiveMigrate(id,pw,legacyUser){
  var email=id+AUTH_DOMAIN;
  return auth.createUserWithEmailAndPassword(email,pw).then(function(cred){
    var uid=cred.user.uid;
    console.log('Progressive migration 성공:',id,'-> UID:',uid);
    // 프로필 복사 + 매핑 저장
    return Promise.all([
      copyUserProfile(uid,legacyUser),
      saveUidMapping(id,uid)
    ]);
  }).catch(function(e){
    // 이미 존재하면 무시 (이전에 등록된 경우)
    if(e.code==='auth/email-already-in-use'){
      console.log('이미 Firebase Auth에 등록됨:',id);
      // 로그인해서 UID 가져오기
      return auth.signInWithEmailAndPassword(email,pw).then(function(cred){
        return saveUidMapping(id,cred.user.uid);
      }).catch(function(){});
    }
    console.warn('Progressive migration 실패:',e);
  });
}

// === handleLogin: Firebase Auth 우선, 레거시 폴백 ===
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

  var id=$('loginId').value.trim(),pw=$('loginPw').value;
  var email=id+AUTH_DOMAIN;

  // 1. Firebase Auth 시도
  auth.signInWithEmailAndPassword(email,pw).then(function(cred){
    // Firebase Auth 로그인 성공
    console.log('Firebase Auth 로그인 성공:',id);
    logLoginAttempt(id,true);
    st.attempts=0;st.lockUntil=0;st.blocked=false;
    saveLoginState(st);

    // 레거시 users 배열에서 사용자 정보 가져오기
    var legacyUser=findLegacyUserById(id);
    if(legacyUser){
      setStateUser(legacyUser);
    }else{
      // 레거시 배열에 없으면 Firebase Auth 정보로 임시 state.user 생성
      state.user={
        id:id,
        pw:pw,
        role:'admin',
        active:true,
        nickname:cred.user.displayName||id
      };
    }

    localStorage.setItem('ad_session',id);
    $('loginError').style.display='none';

    if(state.user.needPw){
      $('loginScreen').classList.add('hidden');
      openModal('pwChangeModal');
    }else{
      initApp();
    }
  }).catch(function(authErr){
    console.log('Firebase Auth 실패:',authErr.code,'- 레거시 폴백 시도');

    // 2. Firebase Auth 실패 -> 레거시 폴백
    var u=findLegacyUser(id,pw);

    if(!u){
      // 둘 다 실패
      logLoginAttempt(id,false);
      st.attempts=(st.attempts||0)+1;
      console.log('로그인 실패 - 시도 횟수:', st.attempts);

      var idExists=false;
      for(var j=0;j<state.db.users.length;j++){if(state.db.users[j].id===id){idExists=true;break}}
      var errMsg=idExists?'비밀번호가 일치하지 않습니다.':'존재하지 않는 아이디입니다.';

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

    // 레거시 로그인 성공
    console.log('레거시 로그인 성공:',id);
    logLoginAttempt(id,true);
    st.attempts=0;st.lockUntil=0;st.blocked=false;
    saveLoginState(st);
    localStorage.setItem('ad_session',u.id);
    setStateUser(u);
    $('loginError').style.display='none';

    // 3. Progressive migration: Firebase Auth에 자동 등록
    progressiveMigrate(id,pw,u);

    if(u.needPw){
      $('loginScreen').classList.add('hidden');
      openModal('pwChangeModal');
    }else{
      initApp();
    }
  });
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

  // 레거시 users 배열 업데이트 (항상)
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===state.user.id){
      state.db.users[i].pw=n;
      state.db.users[i].needPw=false;
      if(nick)state.db.users[i].nickname=nick;
      break;
    }
  }

  // Firebase Auth 비밀번호도 업데이트 (로그인된 경우)
  var currentUser=auth.currentUser;
  if(currentUser){
    currentUser.updatePassword(n).then(function(){
      console.log('Firebase Auth 비밀번호 업데이트 완료');
    }).catch(function(e){
      console.warn('Firebase Auth 비밀번호 업데이트 실패:',e);
      // 레거시는 이미 업데이트됨, Firebase Auth 실패는 경고만
    });
  }

  saveDB();closeModal('pwChangeModal');toast('설정 완료');initApp()
}

// === logout: Firebase Auth + localStorage 모두 정리 ===
export function logout(){
  // Firebase Auth 로그아웃
  auth.signOut().catch(function(e){
    console.warn('Firebase Auth 로그아웃 실패:',e);
  });
  // 레거시 세션 정리
  localStorage.removeItem('ad_session');
  state.user=null;
  state.page=null;
  $('appWrap').style.display='none';
  $('loginScreen').classList.remove('hidden');
  $('loginId').value='';
  $('loginPw').value='';
  $('loginForm').style.display='block';
  $('loginLocked').style.display='none';
  closeAllModals();
  closeAllPanels();
  location.hash='';
}

// === isSuper: 레거시 + Firestore 역할 확인 ===
export function isSuper(){
  if(!state.user)return false;
  // 레거시 체크 (기존과 동일)
  if(state.user.id===SUPER)return true;
  // Firestore users/{uid}.role 체크 (마이그레이션된 사용자)
  if(state.user.firestoreRole==='super')return true;
  return false;
}

// === checkFirestoreRole: 마이그레이션된 사용자의 역할 비동기 확인 ===
export function checkFirestoreRole(uid){
  return firestore.collection('users').doc(uid).get().then(function(doc){
    if(doc.exists){
      var data=doc.data();
      if(data.role==='super'){
        state.user.firestoreRole='super';
      }
      return data.role||'admin';
    }
    return 'admin';
  }).catch(function(){
    return 'admin';
  });
}
