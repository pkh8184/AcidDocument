// src/data/firestore.js — Firestore CRUD

import state from './store.js';
import {firestore,storage,STORAGE_LIMIT,MAX_FILE_SIZE} from '../config/firebase.js';
import {$,genId,toast,formatBytes,fetchIP} from '../utils/helpers.js';
import {generateSalt,hashPassword} from '../auth/crypto.js';

// 마이그레이션 전환 플래그
// false: 기존 구조 (app/data 단일 문서)
// true:  새 구조 (pages 컬렉션 + 서브컬렉션)
// 검증 완료 후 true로 변경
export var USE_NEW_STRUCTURE=false;

// ── 에러 처리 래퍼 ──────────────────────────────────
// 모든 Firestore 호출에 일관된 에러 처리를 적용
export async function firestoreCall(operation,errorMessage){
  try{
    return await operation();
  }catch(err){
    console.error(errorMessage,err);
    toast(errorMessage,'err');
    throw err;
  }
}

// ── Batch 삭제 헬퍼 (새 구조 전용) ──────────────────
// Firestore batch는 최대 500개 연산 제한이 있으므로 분할 처리
export async function batchDeletePages(pageIds){
  if(!pageIds||pageIds.length===0)return;
  var BATCH_LIMIT=500;
  for(var i=0;i<pageIds.length;i+=BATCH_LIMIT){
    var chunk=pageIds.slice(i,i+BATCH_LIMIT);
    var batch=firestore.batch();
    for(var j=0;j<chunk.length;j++){
      var ref=firestore.collection('pages').doc(chunk[j]);
      batch.delete(ref);
    }
    await firestoreCall(
      function(){return batch.commit()},
      'batch 삭제 실패'
    );
  }
}

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
      // 개별 페이지 문서에서 로드 시 JSON 문자열→배열 복원
      else if(key==='blocks'&&typeof val==='string'){
        try{newObj.blocks=JSON.parse(val)}catch(e){newObj.blocks=[]}
      }else if(key==='versions'&&typeof val==='string'){
        try{newObj.versions=JSON.parse(val)}catch(e){newObj.versions=[]}
      }else if(key==='comments'&&typeof val==='string'){
        try{newObj.comments=JSON.parse(val)}catch(e){newObj.comments=[]}
      }else if(key==='tags'&&typeof val==='string'){
        try{newObj.tags=JSON.parse(val)}catch(e){newObj.tags=[]}
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
  if(USE_NEW_STRUCTURE){
    return initDBNewStructure();
  }
  return initDBLegacy();
}
// 마이그레이션: app/data.pages → pages 컬렉션으로 복사
function migratePagesTocollection(pages){
  if(!pages||pages.length===0)return Promise.resolve();
  var BATCH_LIMIT=450;
  var promise=Promise.resolve();
  for(var i=0;i<pages.length;i+=BATCH_LIMIT){
    (function(chunk){
      promise=promise.then(function(){
        var batch=firestore.batch();
        for(var j=0;j<chunk.length;j++){
          var ref=firestore.collection('pages').doc(chunk[j].id);
          batch.set(ref,convertRowsForSave(chunk[j]));
        }
        return batch.commit();
      });
    })(pages.slice(i,i+BATCH_LIMIT));
  }
  return promise;
}
// 기존 구조: app/data + pages 컬렉션에서 로드 (자동 마이그레이션 포함)
function initDBLegacy(){
  return firestoreCall(function(){
    return Promise.all([
      firestore.collection('app').doc('data').get(),
      firestore.collection('pages').get()
    ]).then(function(results){
      var doc=results[0];
      var pagesSnap=results[1];
      console.log('[initDB] app/data exists:',doc.exists,'pages컬렉션:',pagesSnap.size,'empty:',pagesSnap.empty);

      if(!doc.exists){
        // 최초 실행: 초기 데이터 생성
        var chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        function randPw(){var p='';for(var k=0;k<12;k++)p+=chars[Math.floor(Math.random()*chars.length)];return p}
        var pw1=randPw(),pw2=randPw();
        var salt1=generateSalt(),salt2=generateSalt();
        return Promise.all([hashPassword(pw1,salt1),hashPassword(pw2,salt2)]).then(function(hashes){
          var welcomePage={
            id:'welcome',title:'시작하기',icon:'👋',parentId:null,
            blocks:[
              {id:genId(),type:'h1',content:'AcidDocument에 오신 것을 환영합니다!'},
              {id:genId(),type:'text',content:'팀을 위한 문서 관리 시스템입니다.'},
              {id:genId(),type:'callout',content:'<b>💡 사용법:</b> 빈 줄에서 <code>/</code>를 입력하여 다양한 블록을 추가하세요.',calloutType:'info'}
            ],
            tags:['가이드'],author:'admin8184',created:Date.now(),updated:Date.now(),versions:[],comments:[],favorite:true,deleted:false
          };
          state.db={
            users:[
              {id:'admin8184',pwHash:hashes[0],pwSalt:salt1,role:'super',needPw:true,active:true,nickname:''},
              {id:'admin3926',pwHash:hashes[1],pwSalt:salt2,role:'admin',needPw:true,active:true,nickname:''}
            ],
            pages:[welcomePage],
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
          // 초기 페이지를 pages 컬렉션에 저장 + 비페이지 데이터를 app/data에 저장
          return Promise.all([
            savePage(welcomePage),
            saveDB()
          ]).then(function(){
            console.warn('=== 초기 계정 생성 완료 ===');
            console.warn('admin8184 비밀번호:',pw1);
            console.warn('admin3926 비밀번호:',pw2);
            console.warn('첫 로그인 후 반드시 비밀번호를 변경하세요.');
            console.warn('============================');
          });
        });
      }

      // 기존 데이터 로드
      state.db=convertRowsForLoad(doc.data());
      if(!state.db.pages)state.db.pages=[];

      if(!pagesSnap.empty){
        // pages 컬렉션에 데이터가 있으면 사용 (마이그레이션 완료된 상태)
        var pages=[];
        pagesSnap.forEach(function(pdoc){
          var p=convertRowsForLoad(pdoc.data());
          if(!p.id)p.id=pdoc.id;
          pages.push(p);
        });
        state.db.pages=pages;
        console.log('[initDB] 페이지 로드 완료:',pages.length,'개');
        if(pages.length>0)console.log('[initDB] 첫페이지:',pages[0].id,pages[0].title,'blocks:',typeof pages[0].blocks,Array.isArray(pages[0].blocks));
      }else if(state.db.pages.length>0){
        // pages 컬렉션이 비어있고 app/data에 pages가 있으면 → 자동 마이그레이션
        console.log('페이지 마이그레이션 시작:',state.db.pages.length,'개');
        return migratePagesTocollection(state.db.pages).then(function(){
          console.log('페이지 마이그레이션 완료');
          // app/data에서 pages 필드 제거 (1MB 초과 방지)
          var nonPageData={};
          for(var k in state.db){
            if(!state.db.hasOwnProperty(k))continue;
            if(k==='pages')continue;
            nonPageData[k]=state.db[k];
          }
          return firestore.collection('app').doc('data').set(convertRowsForSave(nonPageData));
        }).catch(function(err){
          console.error('마이그레이션 오류 (기존 메모리 데이터 사용):',err);
        });
      }
    });
  },'DB 로드 실패');
}
// 새 구조: pages 컬렉션 + app/settings + app/templates에서 로드
function initDBNewStructure(){
  return firestoreCall(function(){
    return Promise.all([
      firestore.collection('pages').get(),
      firestore.collection('app').doc('settings').get(),
      firestore.collection('app').doc('templates').get(),
      firestore.collection('app').doc('data').get()
    ]).then(function(results){
      var pagesSnap=results[0];
      var settingsDoc=results[1];
      var templatesDoc=results[2];
      var dataDoc=results[3];

      // pages 컬렉션에서 로드 (versions/comments는 빈 배열로 초기화, 필요 시 loadPageFull로 로드)
      var pages=[];
      pagesSnap.forEach(function(doc){
        var pageData=convertRowsForLoad(doc.data());
        pageData.id=doc.id;
        // 서브컬렉션 데이터는 loadPageFull()에서 로드하므로 빈 배열로 초기화
        if(!pageData.versions)pageData.versions=[];
        if(!pageData.comments)pageData.comments=[];
        pages.push(pageData);
      });

      // settings
      var settings=settingsDoc.exists?settingsDoc.data():{wsName:'AcidDocument',theme:'dark',notice:''};
      var storageUsage=settings.storageUsage||0;
      delete settings.storageUsage; // state.db.storageUsage로 분리 관리

      // templates
      var templates=[];
      if(templatesDoc.exists){
        var tData=templatesDoc.data();
        templates=tData.items||[];
      }

      // users는 여전히 app/data에서 로드 (Firebase Auth 전환 완료 전까지 필요)
      var users=[];
      if(dataDoc.exists){
        var legacyData=convertRowsForLoad(dataDoc.data());
        users=legacyData.users||[];
      }

      state.db={
        users:users,
        pages:pages,
        templates:templates,
        settings:settings,
        storageUsage:storageUsage,
        session:null,
        recent:[]
      };
    });
  },'데이터 로드 실패');
}
export function saveDB(){
  if(USE_NEW_STRUCTURE){
    return saveDBNewStructure();
  }
  return saveDBLegacy();
}
// 개별 페이지를 pages/{pageId} 컬렉션에 저장
export function savePage(page){
  if(!page||!page.id)return Promise.resolve();
  var pageData=convertRowsForSave(page);
  return firestore.collection('pages').doc(page.id).set(pageData).catch(function(err){
    console.error('페이지 저장 실패 ('+page.id+'):',err);
    toast('페이지 저장 실패','err');
  });
}
// 여러 페이지 일괄 저장 (reorder/move 등)
export function savePages(pages){
  if(!pages||pages.length===0)return Promise.resolve();
  var promises=[];
  for(var i=0;i<pages.length;i++){
    if(pages[i]&&pages[i].id)promises.push(savePage(pages[i]));
  }
  return Promise.all(promises);
}
// pages 컬렉션에서 단일 페이지 삭제
export function deletePageDoc(pageId){
  return firestore.collection('pages').doc(pageId).delete().catch(function(err){
    console.error('페이지 문서 삭제 실패 ('+pageId+'):',err);
  });
}
// 기존 구조: app/data에 비페이지 데이터만 저장 (pages는 savePage로 개별 저장)
function saveDBLegacy(){
  var nonPageData={};
  for(var k in state.db){
    if(!state.db.hasOwnProperty(k))continue;
    if(k==='pages')continue;
    nonPageData[k]=state.db[k];
  }
  var dataToSave=convertRowsForSave(nonPageData);
  return firestoreCall(function(){
    return firestore.collection('app').doc('data').set(dataToSave);
  },'저장 실패');
}
// 새 구조: 변경된 부분만 저장
// 주의: 전체 pages를 한번에 저장하는 것은 비효율. 개별 페이지 저장은 savePageToCollection() 사용.
// saveDB()는 settings, ipLogs, deleteLogs 등 전역 데이터 저장에 사용.
function saveDBNewStructure(){
  var settingsData={};
  if(state.db.settings){
    for(var k in state.db.settings){
      if(state.db.settings.hasOwnProperty(k))settingsData[k]=state.db.settings[k];
    }
  }
  settingsData.storageUsage=state.db.storageUsage||0;

  var legacyData={users:state.db.users||[]};
  if(state.db.ipLogs)legacyData.ipLogs=state.db.ipLogs;
  if(state.db.deleteLogs)legacyData.deleteLogs=state.db.deleteLogs;
  var legacyToSave=convertRowsForSave(legacyData);

  return firestoreCall(function(){
    return Promise.all([
      firestore.collection('app').doc('settings').set(settingsData),
      firestore.collection('app').doc('data').set(legacyToSave,{merge:true})
    ]);
  },'저장 실패');
}

// 새 구조 전용: 개별 페이지를 pages/{pageId}에 저장
export function savePageToCollection(page){
  if(!page||!page.id)return Promise.resolve();
  // versions, comments는 서브컬렉션이므로 메인 문서에서 제외
  var pageData={};
  for(var key in page){
    if(!page.hasOwnProperty(key))continue;
    if(key==='versions'||key==='comments')continue;
    pageData[key]=page[key];
  }
  var dataToSave=convertRowsForSave(pageData);
  return firestoreCall(function(){
    return firestore.collection('pages').doc(page.id).set(dataToSave);
  },'페이지 저장 실패 ('+page.id+')');
}

// 새 구조 전용: 페이지 + 버전/댓글 서브컬렉션 로드
export function loadPageFull(pageId){
  return firestoreCall(function(){
    return Promise.all([
      firestore.collection('pages').doc(pageId).get(),
      firestore.collection('pages').doc(pageId).collection('versions').get(),
      firestore.collection('pages').doc(pageId).collection('comments').get()
    ]).then(function(results){
      var pageDoc=results[0];
      var versionsSnap=results[1];
      var commentsSnap=results[2];

      if(!pageDoc.exists)return null;

      var page=convertRowsForLoad(pageDoc.data());
      page.id=pageDoc.id;

      // 버전 로드
      page.versions=[];
      versionsSnap.forEach(function(doc){
        var ver=convertRowsForLoad(doc.data());
        ver.id=doc.id;
        page.versions.push(ver);
      });
      // 버전을 id 기준으로 정렬 (최신순)
      page.versions.sort(function(a,b){
        var aId=Number(a.id)||0;
        var bId=Number(b.id)||0;
        return bId-aId;
      });

      // 댓글 로드
      page.comments=[];
      commentsSnap.forEach(function(doc){
        var cmt=doc.data();
        cmt.id=doc.id;
        page.comments.push(cmt);
      });
      // 댓글을 시간순 정렬
      page.comments.sort(function(a,b){return(a.date||0)-(b.date||0)});

      return page;
    });
  },'페이지 로드 실패').catch(function(){return null});
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
  return saveDB();
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

// IP 로깅 (비핵심 작업: 실패해도 사용자에게 알리지 않음)
export function logLoginAttempt(userId,success){
  try{
    fetchIP().then(function(ip){
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
      return saveDB();
    }).catch(function(e){console.warn('로그인 로그 저장 실패:',e)});
  }catch(e){console.warn('로그인 로그 기록 실패:',e)}
}

// --- 로그인 잠금 상태 (Firestore 서버사이드) ---
// Firestore 경로: app/loginLocks/{loginId}
// 구조: { attempts, lockUntil, blocked, lastAttempt }
export function getLoginLockState(loginId){
  return firestore.collection('app').doc('loginLocks').collection('locks').doc(loginId).get().then(function(doc){
    if(doc.exists){
      var data=doc.data();
      var needsWriteBack=false;
      // 자동 잠금 해제: lockUntil이 지났으면 잠금 해제 처리
      if(data.lockUntil&&data.lockUntil<=Date.now()&&!data.blocked){
        data.lockUntil=0;
        needsWriteBack=true;
      }
      // blocked 상태도 30분 후 자동 해제
      if(data.blocked&&data.blockedAt&&(Date.now()-data.blockedAt>30*60*1000)){
        data.blocked=false;
        data.attempts=0;
        data.lockUntil=0;
        needsWriteBack=true;
      }
      // 해제된 상태를 Firestore에 반영
      if(needsWriteBack){
        firestore.collection('app').doc('loginLocks').collection('locks').doc(loginId)
          .set(data,{merge:true}).catch(function(e){
            console.warn('잠금 해제 write-back 실패:',e);
          });
      }
      return data;
    }
    return{attempts:0,lockUntil:0,blocked:false,lastAttempt:0,blockedAt:0};
  }).catch(function(e){
    console.warn('잠금 상태 조회 실패:',e);
    return{attempts:0,lockUntil:0,blocked:false,lastAttempt:0,blockedAt:0};
  });
}

export function updateLoginLockState(loginId,lockData){
  lockData.lastAttempt=Date.now();
  return firestore.collection('app').doc('loginLocks').collection('locks').doc(loginId).set(lockData,{merge:true}).catch(function(e){
    console.warn('잠금 상태 업데이트 실패:',e);
  });
}

export function clearLoginLockState(loginId){
  var data={attempts:0,lockUntil:0,blocked:false,lastAttempt:Date.now(),blockedAt:0};
  return firestore.collection('app').doc('loginLocks').collection('locks').doc(loginId).set(data).catch(function(e){
    console.warn('잠금 상태 초기화 실패, 1회 재시도:',e);
    return firestore.collection('app').doc('loginLocks').collection('locks').doc(loginId).set(data).catch(function(e2){
      console.error('잠금 상태 초기화 재시도 실패:',e2);
    });
  });
}

// 삭제 로그 (비핵심 작업: 실패해도 사용자에게 알리지 않음)
export function logDeleteAction(pageId,pageTitle,action){
  try{
    fetchIP().then(function(ip){
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
      return saveDB();
    }).catch(function(e){console.warn('삭제 로그 저장 실패:',e)});
  }catch(e){console.warn('삭제 로그 기록 실패:',e)}
}
