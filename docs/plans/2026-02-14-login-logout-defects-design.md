# 로그인/로그아웃 결함 수정 설계서

**날짜:** 2026-02-14
**범위:** 28개 이슈 전체 수정
**방향:** 현재 레거시 users 배열 + Firebase Auth 병행 구조 유지, 버그만 수정
**접근:** 4개 영역(Phase)으로 나눠 순차 구현

---

## Phase 1: 로그아웃 상태 초기화 (12개 이슈)

### 문제
`logout()` 함수가 `state.user`와 `state.page`만 null로 설정. 나머지 상태(타이머, 에디터, 뷰어, 컨텍스트)가 전부 남아 다음 로그인 시 이전 사용자 데이터 노출.

### 수정 대상
- `src/auth/auth.js` — `logout()` 함수 (320-338행)

### 수정 내용
1. **타이머 정리**
   - `clearTimeout(state.autoSaveTimer)`
   - `clearTimeout(state.undoTimer)`
   - `state.slideIntervals` 전체 `clearInterval` 후 빈 객체로 리셋

2. **에디터 상태 리셋**
   - `editMode=false`, `editBackup=null`
   - `undoStack=[]`, `redoStack=[]`
   - `isComposing=false`

3. **뷰어/슬라이드 상태 리셋**
   - `viewerImages=[]`, `viewerIndex=0`
   - `currentSlideIdx=null`

4. **컨텍스트 상태 리셋**
   - `slashMenuState={open:false,idx:null}`
   - `editingCommentId=null`, `panelType=null`
   - `currentEditBlockId=null`, `renamePageId=null`
   - `currentCalIdx=null`, `colWidthTableId=null`
   - `deleteTargetId=null`, `currentInsertIdx=null`
   - `dragBlockIdx=null`, `dragPageId=null`
   - `savedSelection=null`, `currentTagElement=null`
   - `lastSearchQuery=''`, `selectedEventColor='#3b82f6'`
   - `loginInProgress=false`

5. **`state.db` 유지** — 다음 로그인에 워크스페이스 데이터 필요

### 구현
`logout()` 내부에 `resetAppState()` 헬퍼 추가.

---

## Phase 2: 로그인 흐름 레이스컨디션 (6개 이슈)

### 문제 2-1: onAuthStateChanged + handleLogin 충돌
- `main.js:136-173`에서 `onAuthStateChanged`가 Firebase 세션 복원 시 `initApp()` 호출
- 동시에 `handleLogin()`으로 로그인하면 `initApp()` 2번 호출 가능

**수정:** `state.appInitialized` 플래그 추가. `initApp()` 내부에 중복 호출 방지 가드. 로그아웃 시 리셋.

### 문제 2-2: auth.signOut() 비동기 미대기
- `signOut()`의 결과를 기다리지 않고 즉시 상태 정리
- `onAuthStateChanged`가 null을 받아 추가 로직 실행 가능

**수정:** `state.loggingOut=true` 플래그 추가, `onAuthStateChanged`에서 체크.

### 문제 2-3: showLockTimer setInterval 미정리
- `setInterval` 생성하지만 참조를 저장하지 않음
- 재호출 시 이전 interval 누적

**수정:** `state.lockTimerInterval`에 저장, 새 호출 시 이전 것 `clearInterval`.

### 문제 2-4: localStorage 세션 복원 실패 시 정리
- 사용자를 못 찾았을 때 `localStorage.removeItem('ad_session')` 추가

### 문제 2-5: loginInProgress 미리셋 경로
- 모든 `.catch()` 핸들러에서 `resetLoginBtn()` 호출 보장

---

## Phase 3: 비밀번호/세션 관리 (6개 이슈)

### 문제 3-1: submitPwChange Firebase Auth 실패 무시
**수정:** 실패 시 toast 경고 표시.

### 문제 3-2: state.user.pw 평문 비밀번호 잔존
**수정:** `handleLogin` 성공 시 `state.user`에 `pw` 저장하지 않기. `submitPwChange`의 현재 비밀번호 확인은 레거시 users 배열에서 직접 확인.

### 문제 3-3: progressiveMigrate 실패 무시
**수정:** 현재 구조 유지이므로 `console.warn` 유지. 영향 없음.

### 문제 3-4: resetPw에서 Firebase Auth 미동기화
**수정:** Admin SDK 없이는 변경 불가. `console.warn` 추가 + 해당 사용자 다음 로그인 시 레거시 폴백됨을 문서화.

### 문제 3-5: changePassword에서 동일 문제
**수정:** `submitPwChange`와 동일 패턴 — Firebase Auth 업데이트 시도 + 실패 경고.

### 문제 3-6: ad_session localStorage 유지
**결정:** Firebase Auth 자체가 IndexedDB에 세션 저장하므로 `ad_session`만 sessionStorage로 바꿔도 실질적 보안 향상 없음. **localStorage 유지.**

---

## Phase 4: 에러 처리/UX (4개 이슈)

### 문제 4-1: showLockTimer 중복 interval
**수정:** `state.lockTimerInterval` 저장 + 중복 방지 (Phase 2-3과 동일)

### 문제 4-2: 로그인 실패 시 비밀번호 필드 미초기화
**수정:** 모든 실패 경로에서 `$('loginPw').value=''` 보장.

### 문제 4-3: 로그인 버튼 disabled 복원 누락
**수정:** 모든 경로에서 `resetLoginBtn()` 호출 보장. `.then(null, fn)` 패턴 유지.

### 문제 4-4: 네트워크 오류 시 사용자 피드백
**수정:** Firebase Auth 에러 코드별 한국어 메시지 매핑:
- `auth/network-request-failed` → '네트워크 연결을 확인하세요'
- `auth/too-many-requests` → '잠시 후 다시 시도하세요'
- `auth/user-disabled` → '비활성화된 계정입니다'
- 기타 → '로그인 처리 중 오류가 발생했습니다'

---

## 수정 파일 목록
- `src/auth/auth.js` — Phase 1, 2, 3, 4 (주요 수정 파일)
- `src/main.js` — Phase 2 (initApp 가드, onAuthStateChanged 로직)
- `src/ui/modals.js` — Phase 3 (resetPw, changePassword Firebase 동기화)
- `src/data/store.js` — Phase 2 (appInitialized, loggingOut, lockTimerInterval 속성 추가)
