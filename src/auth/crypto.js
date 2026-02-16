// src/auth/crypto.js — Web Crypto API 기반 비밀번호 해싱

var PBKDF2_ITERATIONS=100000;

export function generateSalt(){
  var arr=new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr,function(b){return b.toString(16).padStart(2,'0')}).join('');
}

// PBKDF2-SHA256 해싱 (기존 SHA-256 단일 해싱에서 업그레이드)
export function hashPassword(pw,salt){
  var enc=new TextEncoder();
  return crypto.subtle.importKey(
    'raw',enc.encode(pw),{name:'PBKDF2'},false,['deriveBits']
  ).then(function(key){
    return crypto.subtle.deriveBits(
      {name:'PBKDF2',salt:enc.encode(salt),iterations:PBKDF2_ITERATIONS,hash:'SHA-256'},
      key,256
    );
  }).then(function(buf){
    return 'pbkdf2:'+Array.from(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,'0')}).join('');
  });
}

// 레거시 SHA-256 단일 해싱 (기존 해시 검증용)
function hashPasswordLegacy(pw,salt){
  var data=new TextEncoder().encode(salt+pw);
  return crypto.subtle.digest('SHA-256',data).then(function(buf){
    return Array.from(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,'0')}).join('');
  });
}

export function verifyPassword(pw,salt,storedHash){
  // PBKDF2 해시 (pbkdf2: 접두사)
  if(storedHash&&storedHash.startsWith('pbkdf2:')){
    return hashPassword(pw,salt).then(function(hash){return hash===storedHash});
  }
  // 레거시 SHA-256 해시 (접두사 없음)
  return hashPasswordLegacy(pw,salt).then(function(hash){return hash===storedHash});
}

// 레거시 해시인지 확인 (마이그레이션 필요 여부 판단용)
export function isLegacyHash(storedHash){
  return storedHash&&!storedHash.startsWith('pbkdf2:');
}

// 비밀번호 검증 규칙 (최소 8자, 영문+숫자 혼합)
export function validatePassword(pw){
  if(!pw||pw.length<8)return'비밀번호는 최소 8자 이상이어야 합니다';
  if(!/[a-zA-Z]/.test(pw))return'비밀번호에 영문자가 포함되어야 합니다';
  if(!/[0-9]/.test(pw))return'비밀번호에 숫자가 포함되어야 합니다';
  return null;
}
