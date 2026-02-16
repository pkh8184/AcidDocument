// src/auth/loginDebug.js — 로그인 디버그 로깅 시스템
//
// 사용법:
//   1) URL에 ?debug=login 추가  (예: https://example.com/?debug=login)
//   2) 브라우저 콘솔에서 loginDebug.enable()
//   3) localStorage에 ad_debug_login=true 직접 설정
//
// 로그 레벨:
//   [AUTH:FLOW]   — 로그인 흐름 단계 추적
//   [AUTH:HASH]   — 비밀번호 해싱/검증 상태
//   [AUTH:LOCK]   — 잠금 상태 변화
//   [AUTH:FB]     — Firebase Auth 연동
//   [AUTH:SESSION] — 세션 복원/관리
//   [AUTH:ERROR]  — 오류 상세

var DEBUG_KEY='ad_debug_login';

function isEnabled(){
  try{
    if(localStorage.getItem(DEBUG_KEY)==='true')return true;
    var params=new URLSearchParams(location.search);
    if(params.get('debug')==='login'||params.get('debug')==='all')return true;
    return false;
  }catch(e){return false}
}

function log(tag,msg,data){
  if(!isEnabled())return;
  var timestamp=new Date().toISOString().slice(11,23);
  var prefix='%c['+timestamp+'] '+tag;
  var colors={
    'AUTH:FLOW':'color:#58a6ff;font-weight:bold',
    'AUTH:HASH':'color:#a371f7;font-weight:bold',
    'AUTH:LOCK':'color:#d29922;font-weight:bold',
    'AUTH:FB':'color:#3fb950;font-weight:bold',
    'AUTH:SESSION':'color:#79b8ff;font-weight:bold',
    'AUTH:ERROR':'color:#f85149;font-weight:bold'
  };
  if(data!==undefined){
    console.log(prefix,colors[tag]||'color:gray',msg,data);
  }else{
    console.log(prefix,colors[tag]||'color:gray',msg);
  }
}

// 로그인 흐름 추적
export function logFlow(msg,data){log('AUTH:FLOW',msg,data)}

// 해시 관련 (해시값 자체는 출력하지 않고 상태만)
export function logHash(msg,data){log('AUTH:HASH',msg,data)}

// 잠금 상태
export function logLock(msg,data){log('AUTH:LOCK',msg,data)}

// Firebase Auth
export function logFB(msg,data){log('AUTH:FB',msg,data)}

// 세션
export function logSession(msg,data){log('AUTH:SESSION',msg,data)}

// 오류
export function logError(msg,data){log('AUTH:ERROR',msg,data)}

// 전역 디버그 컨트롤 (콘솔에서 loginDebug.enable() 호출 가능)
var loginDebug={
  enable:function(){localStorage.setItem(DEBUG_KEY,'true');console.log('%c[LOGIN DEBUG] 활성화됨 — 즉시 적용','color:#3fb950;font-weight:bold')},
  disable:function(){localStorage.removeItem(DEBUG_KEY);console.log('%c[LOGIN DEBUG] 비활성화됨.','color:#f85149;font-weight:bold')},
  status:function(){console.log('%c[LOGIN DEBUG] '+(isEnabled()?'활성':'비활성'),'color:#58a6ff;font-weight:bold')},
  // 현재 세션 상태 덤프
  dump:function(){
    try{
      var loginState=JSON.parse(localStorage.getItem('ad_login_state')||'{}');
      var lastId=localStorage.getItem('ad_last_login_id');
      var appState=window.__debugState?window.__debugState():{};
      console.group('%c[LOGIN DEBUG] 상태 덤프','color:#58a6ff;font-weight:bold');
      console.log('디버그 활성:',isEnabled());
      console.log('localStorage 잠금:',loginState);
      console.log('마지막 로그인 ID:',lastId);
      console.log('앱 상태:',appState);
      console.groupEnd();
    }catch(e){console.error('덤프 실패:',e)}
  }
};

// window에 등록 (콘솔에서 접근 가능)
if(typeof window!=='undefined'){
  window.loginDebug=loginDebug;
}
