// src/data/firestore.js — Firestore CRUD

import state from './store.js';
import {firestore,storage,STORAGE_LIMIT,MAX_FILE_SIZE} from '../config/firebase.js';
import {$,genId,toast,formatBytes} from '../utils/helpers.js';

// rows/columns 배열을 JSON 문자열로 변환 (저장용)
// Firebase는 배열 안에 배열(2D 배열)을 지원하지 않음
export function isNestedArray(arr){
  if(!Array.isArray(arr))return false;
  for(var i=0;i<arr.length;i++){
    if(Array.isArray(arr[i]))return true;
  }
  return false;
}
export function convertRowsForSave(obj){
  if(obj===null||obj===undefined)return obj;
  if(Array.isArray(obj)){
    // 배열 내에 객체나 배열이 있으면 JSON으로
    var hasComplex=false;
    for(var i=0;i<obj.length;i++){
      if(typeof obj[i]==='object'&&obj[i]!==null){hasComplex=true;break}
    }
    if(hasComplex)return JSON.stringify(obj);
    return obj.map(function(item){return convertRowsForSave(item)});
  }
  if(typeof obj==='object'){
    var newObj={};
    for(var key in obj){
      if(!obj.hasOwnProperty(key))continue;
      var val=obj[key];
      // 특정 키들은 항상 JSON 문자열로 변환
      if((key==='rows'||key==='columns'||key==='chartData'||key==='colWidths'||key==='images'||key==='ipLogs'||key==='deleteLogs'||key==='rangeEvents'||key==='userTags')&&Array.isArray(val)){
        newObj[key+'Json']=JSON.stringify(val);
      }else if(key==='events'&&typeof val==='object'&&val!==null){
        newObj[key+'Json']=JSON.stringify(val);
      }else{
        newObj[key]=convertRowsForSave(val);
      }
    }
    return newObj;
  }
  return obj;
}
// JSON 문자열을 rows/columns 배열로 변환 (로드용)
export function convertRowsForLoad(obj){
  if(obj===null||obj===undefined)return obj;
  if(Array.isArray(obj)){
    return obj.map(function(item){return convertRowsForLoad(item)});
  }
  if(typeof obj==='object'){
    var newObj={};
    for(var key in obj){
      if(!obj.hasOwnProperty(key))continue;
      var val=obj[key];
      // JSON 문자열로 저장된 필드들 파싱
      if(key==='rowsJson'){
        try{newObj.rows=JSON.parse(val)}catch(e){newObj.rows=[['','',''],['','','']]}
      }else if(key==='columnsJson'){
        try{newObj.columns=JSON.parse(val)}catch(e){newObj.columns=['','']}
      }else if(key==='chartDataJson'){
        try{newObj.chartData=JSON.parse(val)}catch(e){newObj.chartData=[{label:'항목1',value:30}]}
      }else if(key==='colWidthsJson'){
        try{newObj.colWidths=JSON.parse(val)}catch(e){newObj.colWidths=[]}
      }else if(key==='imagesJson'){
        try{newObj.images=JSON.parse(val)}catch(e){newObj.images=[]}
      }else if(key==='eventsJson'){
        try{newObj.events=JSON.parse(val)}catch(e){newObj.events={}}
      }else if(key==='ipLogsJson'){
        try{newObj.ipLogs=JSON.parse(val)}catch(e){newObj.ipLogs=[]}
      }else if(key==='deleteLogsJson'){
        try{newObj.deleteLogs=JSON.parse(val)}catch(e){newObj.deleteLogs=[]}
      }else if(key==='rangeEventsJson'){
        try{newObj.rangeEvents=JSON.parse(val)}catch(e){newObj.rangeEvents=[]}
      }else if(key==='userTagsJson'){
        try{newObj.userTags=JSON.parse(val)}catch(e){newObj.userTags=[]}
      }
      // users, pages가 문자열이면 파싱 (기존 데이터 호환)
      else if(key==='users'&&typeof val==='string'){
        try{newObj.users=JSON.parse(val)}catch(e){newObj.users=[]}
      }else if(key==='pages'&&typeof val==='string'){
        try{newObj.pages=JSON.parse(val)}catch(e){newObj.pages=[]}
      }else if(key==='templates'&&typeof val==='string'){
        try{newObj.templates=JSON.parse(val)}catch(e){newObj.templates=[]}
      }else if(key==='settings'&&typeof val==='string'){
        try{newObj.settings=JSON.parse(val)}catch(e){newObj.settings={}}
      }else if(key==='ipLogs'&&typeof val==='string'){
        try{newObj.ipLogs=JSON.parse(val)}catch(e){newObj.ipLogs=[]}
      }else if(key==='deleteLogs'&&typeof val==='string'){
        try{newObj.deleteLogs=JSON.parse(val)}catch(e){newObj.deleteLogs=[]}
      }else{
        newObj[key]=convertRowsForLoad(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}
export function initDB(){
  return firestore.collection('app').doc('data').get().then(function(doc){
    if(doc.exists){state.db=convertRowsForLoad(doc.data())}
    else{
      state.db={
        users:[
          {id:'admin8184',pw:'Kx7mR2pL9nQw',role:'super',needPw:true,active:true,nickname:''},
          {id:'admin3926',pw:'Ht5vB8cN1jYf',role:'admin',needPw:true,active:true,nickname:''}
        ],
        pages:[{
          id:'welcome',title:'시작하기',icon:'👋',parentId:null,
          blocks:[
            {id:genId(),type:'h1',content:'AcidDocument에 오신 것을 환영합니다!'},
            {id:genId(),type:'text',content:'팀을 위한 문서 관리 시스템입니다.'},
            {id:genId(),type:'callout',content:'<b>💡 사용법:</b> 빈 줄에서 <code>/</code>를 입력하여 다양한 블록을 추가하세요.',calloutType:'info'}
          ],
          tags:['가이드'],author:'admin8184',created:Date.now(),updated:Date.now(),versions:[],comments:[],favorite:true,deleted:false
        }],
        templates:[
          {id:'meeting',name:'회의록',icon:'📋',blocks:[
            {id:genId(),type:'h1',content:'📋 회의록'},
            {id:genId(),type:'table',rowsJson:'[["항목","내용"],["📅 회의 일시",""],["📍 회의 장소",""],["👥 참여 대상",""],["📌 회의 주제",""],["🎤 발언자",""]]'},
            {id:genId(),type:'h2',content:'📝 회의 내용'},{id:genId(),type:'text',content:''},
            {id:genId(),type:'h2',content:'✅ 회의 결론'},{id:genId(),type:'bullet',content:''},
            {id:genId(),type:'h2',content:'📌 Action Items'},{id:genId(),type:'todo',content:'',checked:false},
            {id:genId(),type:'h2',content:'📎 비고'},{id:genId(),type:'text',content:''}
          ]},
          {id:'note',name:'노트',icon:'📝',blocks:[{id:genId(),type:'h1',content:''},{id:genId(),type:'text',content:''}]},
          {id:'project',name:'프로젝트',icon:'🚀',blocks:[
            {id:genId(),type:'h1',content:'프로젝트명'},
            {id:genId(),type:'callout',content:'프로젝트 개요',calloutType:'info'},
            {id:genId(),type:'h2',content:'목표'},{id:genId(),type:'bullet',content:''},
            {id:genId(),type:'h2',content:'일정'},
            {id:genId(),type:'table',rowsJson:'[["단계","시작일","종료일","담당자"],["기획","","",""],["개발","","",""],["테스트","","",""]]'}
          ]}
        ],
        settings:{wsName:'AcidDocument',theme:'dark',notice:''},
        session:null,recent:[]
      };
      return saveDB();
    }
  }).catch(function(e){console.error('DB 로드 실패:',e);toast('데이터 로드 실패','err')});
}
export function saveDB(){
  var dataToSave=convertRowsForSave(state.db);
  return firestore.collection('app').doc('data').set(dataToSave).catch(function(e){
    console.error('저장 실패:',e);
    console.log('저장 시도 데이터:',JSON.stringify(dataToSave).substring(0,500));
    toast('저장 오류: '+e.message,'err');
  });
}

// Storage 용량 체크 및 업로드
export function getStorageUsage(){
  return new Promise(function(resolve){
    if(!state.db.storageUsage)state.db.storageUsage=0;
    resolve(state.db.storageUsage);
  });
}
export function updateStorageUsage(addBytes){
  if(!state.db.storageUsage)state.db.storageUsage=0;
  state.db.storageUsage+=addBytes;
  saveDB();
}
export function uploadToStorage(file,folder,allowedTypes){
  return new Promise(function(resolve,reject){
    // 파일 타입 체크 (더 유연하게)
    var fileType=file.type||'';
    var isAllowed=false;
    if(allowedTypes){
      for(var i=0;i<allowedTypes.length;i++){
        if(fileType===allowedTypes[i]||fileType.indexOf(allowedTypes[i].split('/')[1])!==-1){
          isAllowed=true;break;
        }
      }
      // 확장자로도 체크
      var ext=(file.name||'').split('.').pop().toLowerCase();
      if(['jpg','jpeg','png','gif','webp'].indexOf(ext)!==-1)isAllowed=true;
      if(!isAllowed){
        reject(new Error('허용되지 않는 파일 형식입니다.\n파일 타입: '+fileType+'\n허용: '+allowedTypes.join(', ')));
        return;
      }
    }
    // 파일 크기 체크
    if(file.size>MAX_FILE_SIZE){
      reject(new Error('파일 크기가 너무 큽니다.\n최대: '+formatBytes(MAX_FILE_SIZE)));
      return;
    }
    // 총 용량 체크
    getStorageUsage().then(function(used){
      if(used+file.size>STORAGE_LIMIT){
        reject(new Error('저장 공간이 부족합니다.\n사용: '+formatBytes(used)+' / '+formatBytes(STORAGE_LIMIT)));
        return;
      }
      // 업로드 진행
      var fileName=folder+'/'+Date.now()+'_'+file.name.replace(/[^a-zA-Z0-9._-]/g,'');
      var ref=storage.ref().child(fileName);
      var uploadTask=ref.put(file);

      uploadTask.on('state_changed',
        function(snapshot){
          var progress=Math.round((snapshot.bytesTransferred/snapshot.totalBytes)*100);
          toast('업로드 중... '+progress+'%','warn');
        },
        function(error){
          reject(error);
        },
        function(){
          uploadTask.snapshot.ref.getDownloadURL().then(function(url){
            updateStorageUsage(file.size);
            resolve({url:url,size:file.size,name:file.name});
          });
        }
      );
    });
  });
}

// IP 로깅
export function logLoginAttempt(userId,success){
  fetchIPLocal().then(function(ip){
    if(!state.db.ipLogs)state.db.ipLogs=[];
    state.db.ipLogs.unshift({
      ip:ip,
      userId:userId||'(알 수 없음)',
      success:success,
      time:Date.now(),
      ua:navigator.userAgent.substring(0,100)
    });
    // 최대 100개 유지
    if(state.db.ipLogs.length>100)state.db.ipLogs=state.db.ipLogs.slice(0,100);
    saveDB();
  });
}
function fetchIPLocal(){
  return fetch('https://api.ipify.org?format=json')
    .then(function(r){return r.json()})
    .then(function(d){return d.ip})
    .catch(function(){return '(알 수 없음)'});
}

// 삭제 로그
export function logDeleteAction(pageId,pageTitle,action){
  fetchIPLocal().then(function(ip){
    if(!state.db.deleteLogs)state.db.deleteLogs=[];
    state.db.deleteLogs.unshift({
      pageId:pageId,
      pageTitle:pageTitle,
      action:action, // 'trash' or 'permanent'
      userId:state.user.id,
      userNickname:state.user.nickname||state.user.id,
      ip:ip,
      time:Date.now()
    });
    // 최대 200개 유지
    if(state.db.deleteLogs.length>200)state.db.deleteLogs=state.db.deleteLogs.slice(0,200);
    saveDB();
  });
}
