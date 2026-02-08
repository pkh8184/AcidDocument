// =============================================================
// scripts/backup.js — Firestore 데이터 백업 스크립트
// =============================================================
// 사용법:
//   1. AcidDocument 앱에 로그인한 상태에서 브라우저 DevTools 콘솔 열기 (F12)
//   2. 이 스크립트 전체를 콘솔에 복사-붙여넣기
//   3. backupData() 실행
//   4. JSON 파일이 자동 다운로드됨
//
// 주의:
//   - 반드시 로그인 상태에서 실행할 것
//   - firebase.firestore()가 사용 가능한 페이지에서 실행할 것
//   - 백업 파일은 aciddocument-backup-YYYY-MM-DD.json 형식으로 저장됨
// =============================================================

async function backupData() {
  try {
    const doc = await firebase.firestore().collection('app').doc('data').get();

    if (!doc.exists) {
      console.error('백업 실패: app/data 문서가 존재하지 않습니다.');
      return;
    }

    const data = doc.data();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aciddocument-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    console.log(`백업 완료: 사용자 ${data.users?.length ?? 0}명, 페이지 ${data.pages?.length ?? 0}개`);
  } catch (err) {
    console.error('백업 중 오류 발생:', err);
  }
}
