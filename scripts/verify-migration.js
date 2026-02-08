// scripts/verify-migration.js
// 마이그레이션 검증 스크립트
// app/data 원본과 pages 컬렉션을 비교하여 데이터 무결성 확인
//
// 사용법:
//   1. Firebase Admin SDK 설치: npm install firebase-admin
//   2. 서비스 계정 키 파일(serviceAccountKey.json)을 이 디렉토리에 배치
//   3. 실행: node scripts/verify-migration.js

var admin = require('firebase-admin');
var serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://aciddocument.firebaseio.com'
});

var db = admin.firestore();

async function verify() {
  console.log('=== 마이그레이션 검증 시작 ===');
  console.log('시각:', new Date().toISOString());

  // 1. 원본 데이터 로드
  var dataDoc = await db.collection('app').doc('data').get();
  if (!dataDoc.exists) {
    console.error('app/data 문서가 존재하지 않습니다.');
    process.exit(1);
  }

  var data = dataDoc.data();

  // pages 파싱
  var originalPages = data.pages;
  if (typeof originalPages === 'string') {
    try { originalPages = JSON.parse(originalPages); } catch (e) { originalPages = []; }
  }
  if (!Array.isArray(originalPages)) originalPages = [];

  // templates 파싱
  var originalTemplates = data.templates;
  if (typeof originalTemplates === 'string') {
    try { originalTemplates = JSON.parse(originalTemplates); } catch (e) { originalTemplates = []; }
  }

  // settings 파싱
  var originalSettings = data.settings;
  if (typeof originalSettings === 'string') {
    try { originalSettings = JSON.parse(originalSettings); } catch (e) { originalSettings = {}; }
  }

  var passCount = 0;
  var failCount = 0;
  var failDetails = [];

  // 2. 페이지 수 비교
  console.log('\n--- 페이지 검증 ---');
  console.log('원본 페이지 수: ' + originalPages.length);

  var pagesSnapshot = await db.collection('pages').get();
  var newPageCount = pagesSnapshot.size;
  console.log('신규 컬렉션 페이지 수: ' + newPageCount);

  if (newPageCount !== originalPages.length) {
    console.error('[FAIL] 페이지 수 불일치: 원본 ' + originalPages.length + ' vs 신규 ' + newPageCount);
    failCount++;
    failDetails.push('페이지 총 수 불일치');
  } else {
    console.log('[PASS] 페이지 총 수 일치');
    passCount++;
  }

  // 3. 각 페이지별 상세 검증
  for (var i = 0; i < originalPages.length; i++) {
    var origPage = originalPages[i];
    var pageId = origPage.id;

    var newDoc = await db.collection('pages').doc(pageId).get();

    if (!newDoc.exists) {
      console.error('[FAIL] 페이지 누락: ' + pageId + ' (' + (origPage.title || '제목 없음') + ')');
      failCount++;
      failDetails.push('페이지 누락: ' + pageId);
      continue;
    }

    var newPage = newDoc.data();
    var pagePass = true;

    // 블록 수 비교
    var origBlockCount = Array.isArray(origPage.blocks) ? origPage.blocks.length : 0;
    var newBlockCount = Array.isArray(newPage.blocks) ? newPage.blocks.length : 0;
    if (origBlockCount !== newBlockCount) {
      console.error('[FAIL] 블록 수 불일치: ' + pageId + ' (원본 ' + origBlockCount + ' vs 신규 ' + newBlockCount + ')');
      failCount++;
      failDetails.push('블록 수 불일치: ' + pageId);
      pagePass = false;
    }

    // 메타데이터 비교
    if (origPage.title !== newPage.title) {
      console.error('[FAIL] 제목 불일치: ' + pageId);
      failCount++;
      failDetails.push('제목 불일치: ' + pageId);
      pagePass = false;
    }

    if (origPage.icon !== newPage.icon) {
      console.error('[FAIL] 아이콘 불일치: ' + pageId);
      failCount++;
      failDetails.push('아이콘 불일치: ' + pageId);
      pagePass = false;
    }

    if (origPage.deleted !== newPage.deleted) {
      console.error('[FAIL] 삭제 상태 불일치: ' + pageId);
      failCount++;
      failDetails.push('삭제 상태 불일치: ' + pageId);
      pagePass = false;
    }

    // authorLegacyId 확인
    if (newPage.authorLegacyId !== (origPage.author || '')) {
      console.error('[FAIL] authorLegacyId 불일치: ' + pageId);
      failCount++;
      failDetails.push('authorLegacyId 불일치: ' + pageId);
      pagePass = false;
    }

    // 버전 수 비교
    var origVersionCount = Array.isArray(origPage.versions) ? origPage.versions.length : 0;
    var versionsSnap = await db.collection('pages').doc(pageId).collection('versions').get();
    if (versionsSnap.size !== origVersionCount) {
      console.error('[FAIL] 버전 수 불일치: ' + pageId + ' (원본 ' + origVersionCount + ' vs 신규 ' + versionsSnap.size + ')');
      failCount++;
      failDetails.push('버전 수 불일치: ' + pageId);
      pagePass = false;
    }

    // 댓글 수 비교
    var origCommentCount = Array.isArray(origPage.comments) ? origPage.comments.length : 0;
    var commentsSnap = await db.collection('pages').doc(pageId).collection('comments').get();
    if (commentsSnap.size !== origCommentCount) {
      console.error('[FAIL] 댓글 수 불일치: ' + pageId + ' (원본 ' + origCommentCount + ' vs 신규 ' + commentsSnap.size + ')');
      failCount++;
      failDetails.push('댓글 수 불일치: ' + pageId);
      pagePass = false;
    }

    if (pagePass) {
      passCount++;
      console.log('[PASS] ' + pageId + ' (' + (origPage.title || '제목 없음') + ')');
    }
  }

  // 4. 설정 검증
  console.log('\n--- 설정 검증 ---');
  var settingsDoc = await db.collection('app').doc('settings').get();
  if (!settingsDoc.exists) {
    console.error('[FAIL] app/settings 문서가 없습니다.');
    failCount++;
    failDetails.push('app/settings 누락');
  } else {
    var newSettings = settingsDoc.data();

    // wsName 비교
    if (originalSettings && originalSettings.wsName !== newSettings.wsName) {
      console.error('[FAIL] settings.wsName 불일치');
      failCount++;
      failDetails.push('settings.wsName 불일치');
    } else {
      console.log('[PASS] settings.wsName 일치');
      passCount++;
    }

    // theme 비교
    if (originalSettings && originalSettings.theme !== newSettings.theme) {
      console.error('[FAIL] settings.theme 불일치');
      failCount++;
      failDetails.push('settings.theme 불일치');
    } else {
      console.log('[PASS] settings.theme 일치');
      passCount++;
    }

    // storageUsage 확인 (중요!)
    var origStorageUsage = data.storageUsage || 0;
    if (newSettings.storageUsage === undefined || newSettings.storageUsage === null) {
      console.error('[FAIL] storageUsage 누락! (용량 표시 0으로 초기화됨)');
      failCount++;
      failDetails.push('storageUsage 누락');
    } else if (newSettings.storageUsage !== origStorageUsage) {
      console.error('[FAIL] storageUsage 불일치: 원본 ' + origStorageUsage + ' vs 신규 ' + newSettings.storageUsage);
      failCount++;
      failDetails.push('storageUsage 불일치');
    } else {
      console.log('[PASS] storageUsage 일치: ' + newSettings.storageUsage);
      passCount++;
    }
  }

  // 5. 템플릿 검증
  console.log('\n--- 템플릿 검증 ---');
  var templatesDoc = await db.collection('app').doc('templates').get();
  if (!templatesDoc.exists) {
    if (Array.isArray(originalTemplates) && originalTemplates.length > 0) {
      console.error('[FAIL] app/templates 문서가 없습니다.');
      failCount++;
      failDetails.push('app/templates 누락');
    } else {
      console.log('[PASS] 템플릿 없음 (원본도 없음)');
      passCount++;
    }
  } else {
    var newTemplates = templatesDoc.data();
    var newTemplateItems = newTemplates.items || [];
    var origTemplateCount = Array.isArray(originalTemplates) ? originalTemplates.length : 0;

    if (newTemplateItems.length !== origTemplateCount) {
      console.error('[FAIL] 템플릿 수 불일치: 원본 ' + origTemplateCount + ' vs 신규 ' + newTemplateItems.length);
      failCount++;
      failDetails.push('템플릿 수 불일치');
    } else {
      console.log('[PASS] 템플릿 수 일치: ' + newTemplateItems.length + '개');
      passCount++;
    }
  }

  // 6. app/data 원본 보존 확인
  console.log('\n--- 원본 보존 검증 ---');
  var dataDocRecheck = await db.collection('app').doc('data').get();
  if (dataDocRecheck.exists) {
    console.log('[PASS] app/data 원본 문서 보존됨');
    passCount++;
  } else {
    console.error('[FAIL] app/data 원본 문서가 삭제되었습니다!');
    failCount++;
    failDetails.push('app/data 원본 삭제됨');
  }

  // 7. 결과 요약
  console.log('\n=== 검증 결과 ===');
  console.log('통과: ' + passCount);
  console.log('실패: ' + failCount);

  if (failDetails.length > 0) {
    console.log('\n실패 상세:');
    for (var f = 0; f < failDetails.length; f++) {
      console.log('  - ' + failDetails[f]);
    }
  }

  if (failCount === 0) {
    console.log('\n[결과] 모든 검증 통과. USE_NEW_STRUCTURE를 true로 전환해도 안전합니다.');
  } else {
    console.log('\n[결과] 검증 실패. USE_NEW_STRUCTURE를 전환하지 마세요.');
    console.log('실패 원인을 확인하고 마이그레이션을 재실행하세요.');
  }

  process.exit(failCount === 0 ? 0 : 1);
}

verify().catch(function(err) {
  console.error('검증 오류:', err);
  process.exit(1);
});
