// scripts/migrate-auth.js
// Firebase Auth 마이그레이션 스크립트
// 기존 app/data.users[] 사용자를 Firebase Authentication으로 마이그레이션
//
// 사용법:
//   1. Firebase Admin SDK 설치: npm install firebase-admin
//   2. 서비스 계정 키 파일(serviceAccountKey.json)을 이 디렉토리에 배치
//   3. 실행: node scripts/migrate-auth.js
//
// 주의: app/data.users[] 배열은 절대 삭제하지 않음 (레거시 호환)

var admin = require('firebase-admin');
var serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://aciddocument.firebaseio.com'
});

var db = admin.firestore();
var auth = admin.auth();

async function migrate() {
  console.log('=== Firebase Auth 마이그레이션 시작 ===');

  // 1. app/data 문서에서 users 배열 읽기
  var docRef = db.collection('app').doc('data');
  var doc = await docRef.get();

  if (!doc.exists) {
    console.error('app/data 문서가 존재하지 않습니다.');
    process.exit(1);
  }

  var data = doc.data();
  var users = data.users;

  // users가 JSON 문자열인 경우 파싱
  if (typeof users === 'string') {
    try {
      users = JSON.parse(users);
    } catch (e) {
      console.error('users 파싱 실패:', e);
      process.exit(1);
    }
  }

  if (!Array.isArray(users) || users.length === 0) {
    console.log('마이그레이션할 사용자가 없습니다.');
    process.exit(0);
  }

  console.log('총 ' + users.length + '명의 사용자를 마이그레이션합니다.');

  // 2. 기존 userMapping 문서 확인
  var mappingRef = db.collection('app').doc('userMapping');
  var mappingDoc = await mappingRef.get();
  var existingMapping = mappingDoc.exists ? mappingDoc.data() : {};

  var mapping = Object.assign({}, existingMapping);
  var successCount = 0;
  var skipCount = 0;
  var failCount = 0;

  // 3. 각 사용자에 대해 Firebase Auth 계정 생성
  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    var userId = user.id;
    var email = userId + '@aciddocument.local';
    var password = user.pw;

    // 이미 마이그레이션된 사용자 건너뛰기
    if (mapping[userId]) {
      console.log('[SKIP] ' + userId + ' - 이미 마이그레이션됨 (UID: ' + mapping[userId] + ')');
      skipCount++;
      continue;
    }

    try {
      // Firebase Auth에 사용자 생성
      var userRecord = await auth.createUser({
        email: email,
        password: password,
        displayName: user.nickname || userId,
        disabled: !user.active
      });

      var uid = userRecord.uid;
      console.log('[OK] ' + userId + ' -> UID: ' + uid);

      // UID 매핑 저장
      mapping[userId] = uid;

      // users/{uid} 문서에 프로필 복사
      await db.collection('users').doc(uid).set({
        legacyId: userId,
        nickname: user.nickname || '',
        role: user.role || 'admin',
        active: user.active !== false,
        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      successCount++;
    } catch (err) {
      // auth/email-already-exists 등의 에러 처리
      if (err.code === 'auth/email-already-exists') {
        console.log('[EXISTS] ' + userId + ' - Firebase Auth에 이미 존재. UID 조회 시도...');
        try {
          var existing = await auth.getUserByEmail(email);
          mapping[userId] = existing.uid;
          console.log('[MAPPED] ' + userId + ' -> UID: ' + existing.uid);
          successCount++;
        } catch (e2) {
          console.error('[FAIL] ' + userId + ' - UID 조회 실패:', e2.message);
          failCount++;
        }
      } else {
        console.error('[FAIL] ' + userId + ':', err.message);
        failCount++;
      }
    }
  }

  // 4. userMapping 문서 저장
  await mappingRef.set(mapping);
  console.log('\n=== 마이그레이션 완료 ===');
  console.log('성공: ' + successCount);
  console.log('건너뜀: ' + skipCount);
  console.log('실패: ' + failCount);
  console.log('매핑 저장 완료: app/userMapping');

  // 5. 확인: app/data.users[]는 삭제하지 않음
  console.log('\n[중요] app/data.users[] 배열은 그대로 유지됩니다 (레거시 호환).');

  process.exit(0);
}

migrate().catch(function(err) {
  console.error('마이그레이션 오류:', err);
  process.exit(1);
});
