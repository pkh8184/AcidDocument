// src/auth/crypto.js — Web Crypto API 기반 비밀번호 해싱

export function generateSalt(){
  var arr=new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr,function(b){return b.toString(16).padStart(2,'0')}).join('');
}

export function hashPassword(pw,salt){
  var data=new TextEncoder().encode(salt+pw);
  return crypto.subtle.digest('SHA-256',data).then(function(buf){
    return Array.from(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,'0')}).join('');
  });
}

export function verifyPassword(pw,salt,storedHash){
  return hashPassword(pw,salt).then(function(hash){return hash===storedHash});
}
