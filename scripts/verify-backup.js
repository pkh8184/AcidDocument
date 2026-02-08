// =============================================================
// scripts/verify-backup.js — 백업 데이터 검증 스크립트
// =============================================================
// 사용법:
//   1. 브라우저 DevTools 콘솔 열기 (F12)
//   2. 이 스크립트 전체를 콘솔에 복사-붙여넣기
//   3. 백업 JSON 파일을 읽어서 verifyBackup()에 전달:
//
//      // 방법 A: fetch로 로컬 파일 읽기 (서버에서 호스팅 시)
//      const res = await fetch('aciddocument-backup-2025-01-01.json');
//      const backup = await res.json();
//      verifyBackup(backup);
//
//      // 방법 B: FileReader 사용
//      const input = document.createElement('input');
//      input.type = 'file';
//      input.accept = '.json';
//      input.onchange = async (e) => {
//        const text = await e.target.files[0].text();
//        verifyBackup(JSON.parse(text));
//      };
//      input.click();
//
// 결과:
//   - 콘솔에 각 항목별 검증 결과가 테이블로 출력됨
//   - 모든 항목이 true이면 백업이 정상
// =============================================================

function verifyBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    console.error('검증 실패: 유효한 백업 데이터가 아닙니다.');
    return false;
  }

  const checks = {
    users: backup.users?.length > 0,
    pages: backup.pages?.length > 0,
    settings: !!backup.settings,
    allPagesHaveBlocks: backup.pages?.every(p => Array.isArray(p.blocks)),
    allUsersHaveId: backup.users?.every(u => u.id && u.pw),
  };

  console.table(checks);

  const allPassed = Object.values(checks).every(Boolean);
  if (allPassed) {
    console.log('검증 통과: 백업 데이터가 정상입니다.');
  } else {
    console.warn('검증 실패: 위 테이블에서 false 항목을 확인하세요.');
  }

  return allPassed;
}
