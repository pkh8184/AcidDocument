// src/auth/auth.js — 로그인, 세션 관리 (Firebase Auth 호환 레이어)

import state from '../data/store.js';
import {auth,firestore} from '../config/firebase.js';
import {$,toast,getLoginState,saveLoginState} from '../utils/helpers.js';
import {saveDB,logLoginAttempt,getLoginLockState,updateLoginLockState,clearLoginLockState} from '../data/firestore.js';
import {initApp} from '../main.js';
import {openModal,closeModal,closeAllModals,closeAllPanels} from '../ui/modals.js';
import {generateSalt,hashPassword,verifyPassword} from './crypto.js';

// AUTH_DOMAIN: Firebase Auth용 이메일 도메인
var AUTH_DOMAIN='@aciddocument.local';

// --- 유틸: Firebase Auth 에러 코드 → 한국어 메시지 ---
export function getAuthErrorMessage(code){
  var messages={
    'auth/network-request-failed':'네트워크 연결을 확인하세요',
    'auth/too-many-requests':'잠시 후 다시 시도하세요',
    'auth/user-disabled':'비활성화된 계정입니다',
    'auth/invalid-credential':'아이디 또는 비밀번호가 올바르지 않습니다',
    'auth/user-not-found':'존재하지 않는 계정입니다',
    'auth/wrong-password':'비밀번호가 올바르지 않습니다'
  };
  return messages[code]||'로그인 처리 중 오류가 발생했습니다';
}

// --- 유틸: 레거시 users 배열에서 사용자 찾기 (async — 해시/평문 모두 지원) ---
function findLegacyUser(id,pw){
  if(!state.db||!state.db.users)return Promise.resolve(null);
  for(var i=0;i<state.db.users.length;i++){
    var u=state.db.users[i];
    if(u.id===id&&u.active){
      // 해시된 비밀번호 우선 체크
      if(u.pwHash&&u.pwSalt){
        return verifyPassword(pw,u.pwSalt,u.pwHash).then(function(match){return match?u:null});
      }
      // 레거시 평문 폴백
      if(u.pw===pw)return Promise.resolve(u);
    }
  }
  return Promise.resolve(null);
}
function findLegacyUserById(id){
  if(!state.db||!state.db.users)return null;
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===id)return state.db.users[i];
  }
  return null;
}

// --- 유틸: 평문 비밀번호 → 해시 자동 마이그레이션 ---
function migrateUserPassword(user,plaintextPw){
  if(user.pwHash)return; // 이미 마이그레이션됨
  var salt=generateSalt();
  hashPassword(plaintextPw,salt).then(function(hash){
    for(var i=0;i<state.db.users.length;i++){
      if(state.db.users[i].id===user.id){
        state.db.users[i].pwHash=hash;
        state.db.users[i].pwSalt=salt;
        delete state.db.users[i].pw;
        break;
      }
    }
    saveDB();
    console.log('비밀번호 해시 마이그레이션 완료:',user.id);
  });
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
      }).catch(function(e2){
        console.warn('Progressive migration 재로그인 실패:',e2);
      });
    }
    console.warn('Progressive migration 실패:',e);
  });
}

// === handleLogin: Firebase Auth 우선, 레거시 폴백 + Firestore 잠금 ===
export function handleLogin(e){
  e.preventDefault();
  // db 로드 전이면 대기
  if(!state.db||!state.db.users){
    toast('데이터 로딩 중...','warn');
    return;
  }

  var id=$('loginId').value.trim(),pw=$('loginPw').value;
  if(!id){toast('아이디를 입력하세요','warn');return}

  // 로그인 진행 중 표시 (onAuthStateChanged 충돌 방지 + 사용자 피드백)
  state.loginInProgress=true;
  var loginBtn=$('loginForm').querySelector('button[type="submit"]');
  if(loginBtn){loginBtn.disabled=true;loginBtn.textContent='로그인 중...';}

  function resetLoginBtn(){
    state.loginInProgress=false;
    if(loginBtn){loginBtn.disabled=false;loginBtn.textContent='로그인';}
  }

  // localStorage 빠른 체크 (캐시)
  var localSt=getLoginState();
  if(localSt.blocked||localSt.lockUntil>Date.now()){
    // localStorage에 잠금 있으면 Firestore도 확인
  }

  // Firestore 잠금 상태 확인 후 로그인 진행
  getLoginLockState(id).then(function(serverSt){
    console.log('로그인 시도 - 서버 잠금 상태:', serverSt);

    // 서버 잠금 상태가 권위 (Firestore가 source of truth)
    if(serverSt.blocked){
      $('loginBlocked').style.display='block';
      $('loginForm').style.display='none';
      $('loginError').style.display='none';
      saveLoginState({attempts:serverSt.attempts,lockUntil:0,blocked:true});
      resetLoginBtn();
      return;
    }
    if(serverSt.lockUntil>Date.now()){
      showLockTimer(serverSt.lockUntil);
      saveLoginState({attempts:serverSt.attempts,lockUntil:serverSt.lockUntil,blocked:false});
      resetLoginBtn();
      return;
    }

    var email=id+AUTH_DOMAIN;

    // .then(onSuccess, onFailure) 패턴 사용:
    // onSuccess 내부 에러가 onFailure(레거시 폴백)로 빠지는 것을 방지
    auth.signInWithEmailAndPassword(email,pw).then(function(cred){
      // Firebase Auth 로그인 성공
      console.log('Firebase Auth 로그인 성공:',id);
      logLoginAttempt(id,true);
      clearLoginLockState(id);
      saveLoginState({attempts:0,lockUntil:0,blocked:false});

      // 레거시 users 배열에서 사용자 정보 가져오기
      var legacyUser=findLegacyUserById(id);
      if(legacyUser){
        setStateUser(legacyUser);
      }else{
        state.user={
          id:id,
          role:'viewer',
          active:true,
          nickname:cred.user.displayName||id
        };
      }

      $('loginError').style.display='none';

      if(state.user.needPw){
        $('loginScreen').classList.add('hidden');
        openModal('pwChangeModal');
      }else{
        initApp();
      }
      resetLoginBtn();
    }, function(authErr){
      // 2. Firebase Auth 실패 -> 레거시 폴백
      console.log('Firebase Auth 실패:',authErr.code,'- 레거시 폴백 시도');

      // findLegacyUser는 이제 Promise 반환 (해시/평문 모두 지원)
      findLegacyUser(id,pw).then(function(u){
        if(!u){
          // 둘 다 실패 — 잠금 카운터 증가
          logLoginAttempt(id,false);
          serverSt.attempts=(serverSt.attempts||0)+1;
          console.log('로그인 실패 - 시도 횟수:', serverSt.attempts);

          var idExists=false;
          for(var j=0;j<state.db.users.length;j++){if(state.db.users[j].id===id){idExists=true;break}}
          var errMsg=idExists?'비밀번호가 일치하지 않습니다.':'존재하지 않는 아이디입니다.';

          if(serverSt.attempts>=15){
            serverSt.blocked=true;
            serverSt.blockedAt=Date.now();
            updateLoginLockState(id,serverSt);
            saveLoginState({attempts:serverSt.attempts,lockUntil:0,blocked:true});
            $('loginBlocked').style.display='block';
            $('loginForm').style.display='none';
            $('loginError').style.display='none';
            resetLoginBtn();
            return;
          }
          if(serverSt.attempts>=5){
            serverSt.lockUntil=Date.now()+5*60*1000;
            updateLoginLockState(id,serverSt);
            saveLoginState({attempts:serverSt.attempts,lockUntil:serverSt.lockUntil,blocked:false});
            showLockTimer(serverSt.lockUntil);
            resetLoginBtn();
            return;
          }
          errMsg+=' ('+serverSt.attempts+'/5)';
          $('loginError').textContent=errMsg;
          $('loginError').style.display='block';
          $('loginPw').value='';
          updateLoginLockState(id,serverSt);
          saveLoginState({attempts:serverSt.attempts,lockUntil:0,blocked:false});
          resetLoginBtn();
          return;
        }

        // 레거시 로그인 성공
        console.log('레거시 로그인 성공:',id);
        logLoginAttempt(id,true);
        clearLoginLockState(id);
        saveLoginState({attempts:0,lockUntil:0,blocked:false});
        setStateUser(u);
        $('loginError').style.display='none';

        // 평문 비밀번호 → 해시 자동 마이그레이션
        migrateUserPassword(u,pw);

        // Progressive migration: Firebase Auth에 자동 등록
        progressiveMigrate(id,pw,u);

        if(u.needPw){
          $('loginScreen').classList.add('hidden');
          openModal('pwChangeModal');
        }else{
          initApp();
        }
        resetLoginBtn();
      });
    }).catch(function(err){
      console.error('로그인 후 앱 초기화 실패:', err);
      toast(getAuthErrorMessage(err&&err.code),'err');
      $('loginPw').value='';
      resetLoginBtn();
    });
  }).catch(function(err){
    console.error('로그인 처리 중 오류:', err);
    toast(getAuthErrorMessage(err&&err.code),'err');
    $('loginPw').value='';
    resetLoginBtn();
  });
}

export function showLockTimer(until){
  $('loginLocked').style.display='block';$('loginForm').style.display='none';$('loginError').style.display='none';
  if(state.lockTimerInterval){clearInterval(state.lockTimerInterval);state.lockTimerInterval=null}
  state.lockTimerInterval=setInterval(function(){
    var remaining=until-Date.now();
    if(remaining<=0){clearInterval(state.lockTimerInterval);state.lockTimerInterval=null;$('loginLocked').style.display='none';$('loginForm').style.display='block';return}
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
}

// 서버 잠금 상태 확인 (init에서 사용 — localStorage 캐시 기반 빠른 체크)
export function checkServerLockOnInit(){
  var localSt=getLoginState();
  if(localSt.blocked){
    $('loginBlocked').style.display='block';
    $('loginForm').style.display='none';
    return true;
  }
  if(localSt.lockUntil>Date.now()){
    showLockTimer(localSt.lockUntil);
    return true;
  }
  return false;
}

export function skipPwChange(){closeModal('pwChangeModal');initApp()}

export function submitPwChange(){
  var nick=$('pwNickname').value.trim(),c=$('pwCur').value,n=$('pwNew').value,cf=$('pwConfirm').value;
  if(!c||!n||!cf){toast('비밀번호를 입력하세요','err');return}
  if(n!==cf){toast('비밀번호가 일치하지 않습니다','err');return}

  var userEntry=null;
  for(var i=0;i<state.db.users.length;i++){
    if(state.db.users[i].id===state.user.id){userEntry=state.db.users[i];break}
  }
  if(!userEntry){toast('사용자를 찾을 수 없습니다','err');return}

  // 비밀번호 검증 (해시/평문 모두 지원)
  var verifyPromise;
  if(userEntry.pwHash&&userEntry.pwSalt){
    verifyPromise=verifyPassword(c,userEntry.pwSalt,userEntry.pwHash);
  }else{
    verifyPromise=Promise.resolve(userEntry.pw===c);
  }

  verifyPromise.then(function(valid){
    if(!valid){toast('현재 비밀번호가 틀립니다','err');return}

    // 새 비밀번호 해싱
    var salt=generateSalt();
    hashPassword(n,salt).then(function(hash){
      for(var i=0;i<state.db.users.length;i++){
        if(state.db.users[i].id===state.user.id){
          state.db.users[i].pwHash=hash;
          state.db.users[i].pwSalt=salt;
          delete state.db.users[i].pw;
          state.db.users[i].needPw=false;
          if(nick)state.db.users[i].nickname=nick;
          break;
        }
      }

      // Firebase Auth 비밀번호도 업데이트
      var currentUser=auth.currentUser;
      if(currentUser){
        currentUser.updatePassword(n).then(function(){
          console.log('Firebase Auth 비밀번호 업데이트 완료');
        }).catch(function(e){
          console.warn('Firebase Auth 비밀번호 업데이트 실패:',e);
          toast('비밀번호 변경됨 (일부 동기화 실패, 다음 로그인에 영향 없음)','warn');
        });
      }

      saveDB();closeModal('pwChangeModal');toast('설정 완료');initApp();
    });
  });
}

// --- 유틸: 앱 상태 전체 초기화 (로그아웃 시 사용) ---
export function resetAppState(){
  clearTimeout(state.autoSaveTimer);
  clearTimeout(state.undoTimer);
  if(state.lockTimerInterval){clearInterval(state.lockTimerInterval);state.lockTimerInterval=null}
  for(var k in state.slideIntervals){
    if(state.slideIntervals.hasOwnProperty(k))clearInterval(state.slideIntervals[k]);
  }
  state.editMode=false;
  state.editBackup=null;
  state.undoStack=[];
  state.redoStack=[];
  state.isComposing=false;
  state.autoSaveTimer=null;
  state.undoTimer=null;
  state.viewerImages=[];
  state.viewerIndex=0;
  state.slideIntervals={};
  state.currentSlideIdx=null;
  state.slashMenuState={open:false,idx:null};
  state.editingCommentId=null;
  state.panelType=null;
  state.currentEditBlockId=null;
  state.renamePageId=null;
  state.currentCalIdx=null;
  state.colWidthTableId=null;
  state.deleteTargetId=null;
  state.currentInsertIdx=null;
  state.dragBlockIdx=null;
  state.dragPageId=null;
  state.savedSelection=null;
  state.currentTagElement=null;
  state.lastSearchQuery='';
  state.selectedEventColor='#3b82f6';
  state.loginInProgress=false;
  state.appInitialized=false;
}

// === logout: Firebase Auth + localStorage 모두 정리 ===
export function logout(){
  resetAppState();
  state.loggingOut=true;
  auth.signOut().catch(function(e){
    console.warn('Firebase Auth 로그아웃 실패:',e);
  }).then(function(){
    state.loggingOut=false;
  });
  // 기존 localStorage 정리 (하위 호환)
  localStorage.removeItem('ad_session');
  state.user=null;
  state.page=null;
  $('appWrap').style.display='none';
  $('loginScreen').classList.remove('hidden');
  $('loginId').value='';
  $('loginPw').value='';
  $('loginForm').style.display='block';
  $('loginLocked').style.display='none';
  $('loginBlocked').style.display='none';
  closeAllModals();
  closeAllPanels();
  location.hash='';
}

// === isSuper: Firestore 역할 + 레거시 users 배열 role 확인 ===
export function isSuper(){
  if(!state.user)return false;
  // Firestore users/{uid}.role 체크 (마이그레이션된 사용자)
  if(state.user.firestoreRole==='super')return true;
  // 레거시: users 배열의 role 체크
  if(state.db&&state.db.users){
    for(var i=0;i<state.db.users.length;i++){
      if(state.db.users[i].id===state.user.id&&state.db.users[i].role==='super')return true;
    }
  }
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
