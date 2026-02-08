// scripts/migrate-pages.js
// Firestore 컬렉션 정규화 마이그레이션 스크립트
// app/data 단일 문서 → pages/{pageId} 컬렉션 + 서브컬렉션으로 복사
//
// 사용법:
//   1. Firebase Admin SDK 설치: npm install firebase-admin
//   2. 서비스 계정 키 파일(serviceAccountKey.json)을 이 디렉토리에 배치
//   3. 실행: node scripts/migrate-pages.js
//
// 주의:
//   - app/data 문서는 절대 삭제하지 않음 (롤백 백업)
//   - storageUsage를 app/settings에 반드시 포함
//   - Firebase Storage 파일은 건드리지 않음
//   - 이미지 URL(Storage URL, base64 모두) 그대로 복사

var admin = require('firebase-admin');
var serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://aciddocument.firebaseio.com'
});

var db = admin.firestore();

async function migrate() {
  console.log('=== Firestore 컬렉션 정규화 마이그레이션 시작 ===');
  console.log('시작 시각:', new Date().toISOString());

  // 1. app/data 원본 읽기
  var dataDoc = await db.collection('app').doc('data').get();
  if (!dataDoc.exists) {
    console.error('app/data 문서가 존재하지 않습니다.');
    process.exit(1);
  }

  var data = dataDoc.data();

  // pages가 JSON 문자열인 경우 파싱
  var pages = data.pages;
  if (typeof pages === 'string') {
    try { pages = JSON.parse(pages); } catch (e) {
      console.error('pages 파싱 실패:', e);
      process.exit(1);
    }
  }
  if (!Array.isArray(pages)) pages = [];

  // templates가 JSON 문자열인 경우 파싱
  var templates = data.templates;
  if (typeof templates === 'string') {
    try { templates = JSON.parse(templates); } catch (e) {
      console.error('templates 파싱 실패:', e);
      templates = [];
    }
  }

  // settings가 JSON 문자열인 경우 파싱
  var settings = data.settings;
  if (typeof settings === 'string') {
    try { settings = JSON.parse(settings); } catch (e) {
      console.error('settings 파싱 실패:', e);
      settings = {};
    }
  }

  // 2. userMapping 로드 (author → authorUid 매핑용)
  var mappingDoc = await db.collection('app').doc('userMapping').get();
  var userMapping = mappingDoc.exists ? mappingDoc.data() : {};
  console.log('userMapping 로드 완료: ' + Object.keys(userMapping).length + '명');

  console.log('\n--- 페이지 마이그레이션 ---');
  console.log('총 페이지 수: ' + pages.length);

  var successCount = 0;
  var failCount = 0;

  // 3. 각 페이지를 pages/{pageId} 컬렉션으로 복사
  for (var i = 0; i < pages.length; i++) {
    var page = pages[i];
    var pageId = page.id;

    try {
      // 버전과 댓글을 분리
      var versions = page.versions || [];
      var comments = page.comments || [];

      // 페이지 메타데이터 (versions, comments 제외)
      var pageMeta = {};
      for (var key in page) {
        if (!page.hasOwnProperty(key)) continue;
        if (key === 'versions' || key === 'comments') continue;
        pageMeta[key] = page[key];
      }

      // author → authorUid 매핑 추가
      pageMeta.authorUid = userMapping[page.author] || null;
      pageMeta.authorLegacyId = page.author || '';

      // 페이지 문서 저장 (blocks 포함)
      await db.collection('pages').doc(pageId).set(pageMeta);

      // 버전을 서브컬렉션에 저장
      for (var v = 0; v < versions.length; v++) {
        var ver = versions[v];
        var verId = String(ver.id || v);
        await db.collection('pages').doc(pageId)
          .collection('versions').doc(verId).set(ver);
      }

      // 댓글을 서브컬렉션에 저장
      for (var c = 0; c < comments.length; c++) {
        var cmt = comments[c];
        var cmtId = cmt.id || String(c);
        await db.collection('pages').doc(pageId)
          .collection('comments').doc(cmtId).set(cmt);
      }

      successCount++;
      console.log('[OK] [' + successCount + '/' + pages.length + '] ' + (page.title || pageId)
        + ' (blocks:' + (pageMeta.blocks ? pageMeta.blocks.length : 0)
        + ', versions:' + versions.length
        + ', comments:' + comments.length + ')');
    } catch (err) {
      failCount++;
      console.error('[FAIL] ' + pageId + ': ' + err.message);
    }
  }

  // 4. 설정을 app/settings로 복사 (storageUsage 포함!)
  console.log('\n--- 설정 마이그레이션 ---');
  try {
    var settingsData = {};
    if (settings && typeof settings === 'object') {
      for (var sk in settings) {
        if (settings.hasOwnProperty(sk)) settingsData[sk] = settings[sk];
      }
    }
    // storageUsage는 app/data 루트에 있으므로 반드시 포함
    settingsData.storageUsage = data.storageUsage || 0;
    await db.collection('app').doc('settings').set(settingsData);
    console.log('[OK] app/settings 저장 완료 (storageUsage: ' + settingsData.storageUsage + ')');
  } catch (err) {
    console.error('[FAIL] app/settings 저장 실패:', err.message);
    failCount++;
  }

  // 5. 템플릿을 app/templates로 복사
  console.log('\n--- 템플릿 마이그레이션 ---');
  try {
    if (Array.isArray(templates) && templates.length > 0) {
      await db.collection('app').doc('templates').set({ items: templates });
      console.log('[OK] app/templates 저장 완료 (' + templates.length + '개)');
    } else {
      console.log('[SKIP] 템플릿 없음');
    }
  } catch (err) {
    console.error('[FAIL] app/templates 저장 실패:', err.message);
    failCount++;
  }

  // 6. 결과 출력
  console.log('\n=== 마이그레이션 완료 ===');
  console.log('완료 시각:', new Date().toISOString());
  console.log('페이지 성공: ' + successCount + '/' + pages.length);
  console.log('실패: ' + failCount);
  console.log('\n[중요] app/data 원본 문서는 그대로 보존됩니다. 절대 삭제하지 마세요.');
  console.log('[중요] 마이그레이션 후 verify-migration.js로 검증하세요.');

  if (failCount > 0) {
    console.log('\n[경고] 실패한 항목이 있습니다. 로그를 확인하고 재시도하세요.');
    process.exit(1);
  }

  process.exit(0);
}

migrate().catch(function(err) {
  console.error('마이그레이션 오류:', err);
  process.exit(1);
});
