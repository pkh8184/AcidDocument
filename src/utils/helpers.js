// src/utils/helpers.js — 유틸리티 함수

import state from '../data/store.js';
import {saveDB} from '../data/firestore.js';

export function $(id){return document.getElementById(id)}
export function $$(s){return document.querySelectorAll(s)}
export function genId(){return Date.now().toString(36)+Math.random().toString(36).substr(2,8)}
export function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
export function formatDate(t){return new Date(t).toLocaleDateString('ko-KR',{year:'numeric',month:'short',day:'numeric'})}
export function formatDateTime(t){return new Date(t).toLocaleString('ko-KR')}
export function toast(m,t){t=t||'ok';var w=$('toastWrap'),e=document.createElement('div');e.className='toast '+t;var ic={ok:'✅',err:'❌',warn:'⚠️'};e.innerHTML='<span style="font-size:18px">'+(ic[t]||'💬')+'</span><span style="font-size:14px">'+esc(m)+'</span>';w.appendChild(e);setTimeout(function(){e.style.opacity='0';setTimeout(function(){e.remove()},200)},3000)}
export function setTheme(t){document.documentElement.setAttribute('data-theme',t);state.db.settings.theme=t;saveDB()}
export function toggleTheme(){setTheme(state.db.settings.theme==='dark'?'light':'dark')}
export function formatBytes(bytes){
  if(bytes===0)return '0 Bytes';
  var k=1024,sizes=['Bytes','KB','MB','GB'];
  var i=Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(2))+' '+sizes[i];
}
export function getLoginState(){var s=localStorage.getItem('ad_login_state');if(s){try{return JSON.parse(s)}catch(e){}}return{attempts:0,lockUntil:0,blocked:false}}
export function saveLoginState(st){localStorage.setItem('ad_login_state',JSON.stringify(st))}
export function highlightText(text,query){
  if(!query)return esc(text);
  var regex=new RegExp('('+query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return esc(text).replace(regex,'<span class="search-hl">$1</span>');
}
export function fetchIP(){
  return fetch('https://api.ipify.org?format=json')
    .then(function(r){return r.json()})
    .then(function(d){return d.ip})
    .catch(function(){return '(알 수 없음)'});
}
// 파일을 data URL(base64)로 읽음 — maxSize(bytes) 초과 시 거부, 읽기 실패 시 reject
export function readFileAsDataURL(file,maxSize){
  return new Promise(function(resolve,reject){
    if(!file){reject(new Error('파일이 없습니다'));return}
    if(maxSize&&file.size>maxSize){
      reject(new Error('파일이 너무 큽니다 (최대 '+Math.round(maxSize/1024)+'KB). Storage 저장 방식을 사용하세요.'));
      return;
    }
    var reader=new FileReader();
    reader.onload=function(e){resolve(e.target.result)};
    reader.onerror=function(){reject(new Error('파일을 읽지 못했습니다'))};
    reader.readAsDataURL(file);
  });
}
