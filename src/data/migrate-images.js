// src/data/migrate-images.js — Firebase Storage → Cloudinary 일회성 마이그레이션
// 콘솔에서 migrateImagesDryRun() 로 먼저 스캔, migrateImages() 로 실제 이전.

import state from './store.js';
import {uploadToStorage,savePage} from './firestore.js';

// Firebase Storage URL 판별
function isFirebaseStorageUrl(url){
  if(typeof url!=='string')return false;
  return url.indexOf('firebasestorage.googleapis.com')!==-1
      || url.indexOf('firebasestorage.app')!==-1
      || url.indexOf('storage.googleapis.com')!==-1;
}

// 블록에서 마이그레이션 대상 필드 수집
function collectTargets(block){
  var targets=[];
  if(block.src&&isFirebaseStorageUrl(block.src))targets.push({field:'src'});
  if(block.url&&isFirebaseStorageUrl(block.url))targets.push({field:'url'});
  if(Array.isArray(block.images)){
    for(var i=0;i<block.images.length;i++){
      if(isFirebaseStorageUrl(block.images[i]))targets.push({field:'images',imgIdx:i});
    }
  }
  return targets;
}

// 단일 URL: 다운로드 → Cloudinary 업로드 → 새 URL 반환
function migrateOneUrl(url){
  return fetch(url).then(function(res){
    if(!res.ok)throw new Error('다운로드 실패 HTTP '+res.status);
    return res.blob();
  }).then(function(blob){
    var rawName=(url.split('/').pop()||'image').split('?')[0];
    try{rawName=decodeURIComponent(rawName);}catch(e){}
    var name=rawName.replace(/[^a-zA-Z0-9._-]/g,'_')||'image';
    var file=new File([blob],name,{type:blob.type||'application/octet-stream'});
    return uploadToStorage(file,'migrated',null);
  }).then(function(result){
    return result.url;
  });
}

// 메인: dryRun=true면 스캔/로그만, false면 실제 이전 + 저장
export function migrateImagesToCloudinary(dryRun){
  var pages=(state.db&&state.db.pages)||[];
  var jobs=[];
  for(var p=0;p<pages.length;p++){
    var blocks=pages[p].blocks;
    if(!Array.isArray(blocks))continue;
    for(var b=0;b<blocks.length;b++){
      var tg=collectTargets(blocks[b]);
      for(var t=0;t<tg.length;t++){
        jobs.push({pageIdx:p,blockIdx:b,field:tg[t].field,imgIdx:tg[t].imgIdx});
      }
    }
  }
  console.log('[migrate] 페이지 '+pages.length+'개 스캔 → Firebase Storage 자산 '+jobs.length+'개 발견');
  if(dryRun){
    jobs.forEach(function(j,i){
      var blk=pages[j.pageIdx].blocks[j.blockIdx];
      var url=j.field==='images'?blk.images[j.imgIdx]:blk[j.field];
      console.log('  ['+(i+1)+'] "'+(pages[j.pageIdx].title||'(제목없음)')+'" / '+blk.type+' → '+url);
    });
    console.log('[migrate] DRY RUN 종료. 실제 실행하려면 콘솔에 migrateImages() 입력.');
    return Promise.resolve({found:jobs.length,migrated:0,failed:0});
  }
  if(jobs.length===0){
    console.log('[migrate] 이전할 자산이 없습니다.');
    return Promise.resolve({found:0,migrated:0,failed:0});
  }
  // 실제 실행 — 순차 처리 (서버 부하/순서 보장)
  var migrated=0,failed=0,failures=[],modifiedPages={};
  var chain=Promise.resolve();
  jobs.forEach(function(j,i){
    chain=chain.then(function(){
      var blk=pages[j.pageIdx].blocks[j.blockIdx];
      var oldUrl=j.field==='images'?blk.images[j.imgIdx]:blk[j.field];
      console.log('[migrate] ('+(i+1)+'/'+jobs.length+') '+oldUrl);
      return migrateOneUrl(oldUrl).then(function(newUrl){
        if(j.field==='images')blk.images[j.imgIdx]=newUrl;
        else blk[j.field]=newUrl;
        modifiedPages[j.pageIdx]=true;
        migrated++;
        console.log('  ✓ → '+newUrl);
      }).catch(function(err){
        failed++;
        failures.push(oldUrl+' — '+err.message);
        console.warn('  ✗ 실패: '+err.message);
      });
    });
  });
  return chain.then(function(){
    // 변경된 페이지만 Firestore에 저장
    var savePromises=[];
    for(var idx in modifiedPages){
      if(modifiedPages.hasOwnProperty(idx))savePromises.push(savePage(pages[idx]));
    }
    return Promise.all(savePromises);
  }).then(function(){
    console.log('[migrate] 완료 — 성공 '+migrated+'개 / 실패 '+failed+'개');
    if(failures.length){
      console.warn('[migrate] 실패 목록:');
      failures.forEach(function(f){console.warn('  - '+f)});
    }
    console.log('[migrate] 페이지를 새로고침하면 변경된 이미지가 반영됩니다.');
    return {found:jobs.length,migrated:migrated,failed:failed,failures:failures};
  });
}

// 깨진 Firebase Storage 자산을 데이터에서 완전히 제거 (복구 포기 시)
// dryRun=true면 무엇이 지워질지 스캔만, false면 실제 삭제 + 저장
export function cleanupFirebaseAssets(dryRun){
  var pages=(state.db&&state.db.pages)||[];
  var removedBlocks=0,cleanedSlideImgs=0,report=[],modifiedPages={};
  for(var p=0;p<pages.length;p++){
    var blocks=pages[p].blocks;
    if(!Array.isArray(blocks))continue;
    var keep=[];
    for(var b=0;b<blocks.length;b++){
      var blk=blocks[b];
      if(collectTargets(blk).length===0){keep.push(blk);continue;}
      if(Array.isArray(blk.images)){
        // 슬라이드: Firebase URL만 골라 제거, 남는 게 있으면 블록 유지
        var clean=[];
        for(var i=0;i<blk.images.length;i++){
          if(isFirebaseStorageUrl(blk.images[i]))cleanedSlideImgs++;
          else clean.push(blk.images[i]);
        }
        if(clean.length>0){
          if(!dryRun)blk.images=clean;
          keep.push(blk);
          report.push('"'+(pages[p].title||'(제목없음)')+'" / '+blk.type+' → 슬라이드 깨진 이미지 제거');
        }else{
          removedBlocks++;
          report.push('"'+(pages[p].title||'(제목없음)')+'" / '+blk.type+' → 블록 삭제(전부 깨짐)');
        }
        modifiedPages[p]=true;
      }else{
        // image/pdf/video/file: 블록 통째 삭제
        removedBlocks++;
        report.push('"'+(pages[p].title||'(제목없음)')+'" / '+blk.type+' → 블록 삭제');
        modifiedPages[p]=true;
      }
    }
    if(!dryRun)pages[p].blocks=keep;
  }
  console.log('[cleanup] 페이지 '+pages.length+'개 스캔');
  console.log('[cleanup] 삭제 대상 블록 '+removedBlocks+'개, 슬라이드 내 제거 이미지 '+cleanedSlideImgs+'개');
  report.forEach(function(r,i){console.log('  ['+(i+1)+'] '+r)});
  if(dryRun){
    console.log('[cleanup] DRY RUN 종료. 실제 삭제하려면 콘솔에 cleanupBrokenImages() 입력.');
    return Promise.resolve({removedBlocks:removedBlocks,cleanedSlideImgs:cleanedSlideImgs});
  }
  if(removedBlocks===0&&cleanedSlideImgs===0){
    console.log('[cleanup] 정리할 자산이 없습니다.');
    return Promise.resolve({removedBlocks:0,cleanedSlideImgs:0});
  }
  var savePromises=[];
  for(var idx in modifiedPages){
    if(modifiedPages.hasOwnProperty(idx))savePromises.push(savePage(pages[idx]));
  }
  return Promise.all(savePromises).then(function(){
    console.log('[cleanup] 완료 — 페이지를 새로고침하면 반영됩니다.');
    return {removedBlocks:removedBlocks,cleanedSlideImgs:cleanedSlideImgs};
  });
}
