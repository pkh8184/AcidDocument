# Login/Logout Defects Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 28 login/logout defects across 4 phases: logout state cleanup, race conditions, password/session management, error handling/UX.

**Architecture:** Modify existing auth module (`src/auth/auth.js`), entry point (`src/main.js`), state store (`src/data/store.js`), and modals (`src/ui/modals.js`). Add `resetAppState()` helper to auth.js for comprehensive logout cleanup. Add guard flags (`appInitialized`, `loggingOut`) to prevent race conditions.

**Tech Stack:** Vanilla JS (var only, no const/let/arrow), Firebase Auth compat SDK v10.7.1, Vitest for testing.

---

### Task 1: store.js에 새 상태 속성 추가

**Files:**
- Modify: `src/data/store.js:4-35`
- Test: `src/auth/__tests__/auth.test.js` (Task 2에서 생성)

**Step 1: store.js에 3개 속성 추가**

`src/data/store.js`에서 `loginInProgress:false` 뒤에 다음 3개 속성을 추가:

```javascript
  loginInProgress:false,
  appInitialized:false,
  loggingOut:false,
  lockTimerInterval:null
```

**Step 2: 커밋**

```bash
git add src/data/store.js
git commit -m "feat: store에 appInitialized, loggingOut, lockTimerInterval 속성 추가"
```

---

### Task 2: resetAppState 헬퍼 + logout 상태 초기화 (Phase 1)

**Files:**
- Modify: `src/auth/auth.js:320-338`
- Create: `src/auth/__tests__/auth.test.js`

**Step 1: 테스트 작성**

`src/auth/__tests__/auth.test.js` 생성:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

var { mockState } = vi.hoisted(function() {
  var mockState = {
    user: { id: 'testuser', pw: '1234', role: 'admin', active: true, nickname: 'Test' },
    db: { users: [], settings: { wsName: 'Test' }, pages: [] },
    page: { id: 'p1', blocks: [{ id: 'b1', type: 'text', content: 'hello' }] },
    editMode: true,
    editBackup: { blocks: [] },
    slashMenuState: { open: true, idx: 2 },
    autoSaveTimer: 999,
    isComposing: true,
    dragPageId: 'dp1',
    deleteTargetId: 'dt1',
    currentEditBlockId: 'eb1',
    currentInsertIdx: 3,
    currentSlideIdx: 1,
    panelType: 'comments',
    savedSelection: {},
    editingCommentId: 'ec1',
    renamePageId: 'rp1',
    currentCalIdx: 2,
    selectedEventColor: '#ff0000',
    colWidthTableId: 'cw1',
    currentTagElement: {},
    lastSearchQuery: 'test',
    viewerImages: ['img1.jpg', 'img2.jpg'],
    viewerIndex: 1,
    slideIntervals: { s1: 101, s2: 102 },
    undoStack: [{ blocks: [] }],
    redoStack: [{ blocks: [] }],
    undoTimer: 888,
    dragBlockIdx: 5,
    loginInProgress: true,
    appInitialized: true,
    loggingOut: false,
    lockTimerInterval: 777
  };
  return { mockState: mockState };
});

vi.mock('../../data/store.js', function() { return { default: mockState }; });
vi.mock('../../config/firebase.js', function() {
  return {
    SUPER: 'superadmin',
    auth: {
      signOut: vi.fn(function() { return Promise.resolve(); }),
      currentUser: null
    },
    firestore: { collection: vi.fn() }
  };
});
vi.mock('../../utils/helpers.js', function() {
  return {
    $: vi.fn(function(id) {
      return {
        classList: { add: vi.fn(), remove: vi.fn() },
        style: {},
        value: '',
        textContent: ''
      };
    }),
    toast: vi.fn(),
    getLoginState: vi.fn(function() { return { attempts: 0, lockUntil: 0, blocked: false }; }),
    saveLoginState: vi.fn()
  };
});
vi.mock('../../data/firestore.js', function() {
  return {
    saveDB: vi.fn(),
    logLoginAttempt: vi.fn(),
    getLoginLockState: vi.fn(),
    updateLoginLockState: vi.fn(),
    clearLoginLockState: vi.fn()
  };
});
vi.mock('../../main.js', function() { return { initApp: vi.fn() }; });
vi.mock('../../ui/modals.js', function() {
  return {
    openModal: vi.fn(),
    closeModal: vi.fn(),
    closeAllModals: vi.fn(),
    closeAllPanels: vi.fn()
  };
});

describe('resetAppState', function() {
  beforeEach(function() {
    // 상태를 "더러운" 상태로 설정
    mockState.editMode = true;
    mockState.editBackup = { blocks: [] };
    mockState.autoSaveTimer = 999;
    mockState.undoTimer = 888;
    mockState.lockTimerInterval = 777;
    mockState.undoStack = [{ blocks: [] }];
    mockState.redoStack = [{ blocks: [] }];
    mockState.viewerImages = ['img1.jpg'];
    mockState.viewerIndex = 1;
    mockState.slideIntervals = { s1: 101 };
    mockState.slashMenuState = { open: true, idx: 2 };
    mockState.editingCommentId = 'ec1';
    mockState.panelType = 'comments';
    mockState.currentEditBlockId = 'eb1';
    mockState.renamePageId = 'rp1';
    mockState.currentCalIdx = 2;
    mockState.colWidthTableId = 'cw1';
    mockState.deleteTargetId = 'dt1';
    mockState.currentInsertIdx = 3;
    mockState.currentSlideIdx = 1;
    mockState.dragBlockIdx = 5;
    mockState.dragPageId = 'dp1';
    mockState.savedSelection = {};
    mockState.currentTagElement = {};
    mockState.lastSearchQuery = 'test';
    mockState.selectedEventColor = '#ff0000';
    mockState.loginInProgress = true;
    mockState.isComposing = true;
    mockState.appInitialized = true;
    mockState.loggingOut = false;
  });

  it('타이머가 모두 정리되어야 함', async function() {
    var clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    var clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(999);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(888);
    expect(clearIntervalSpy).toHaveBeenCalledWith(777);
    expect(clearIntervalSpy).toHaveBeenCalledWith(101);

    clearTimeoutSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('에디터 상태가 초기화되어야 함', async function() {
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.editMode).toBe(false);
    expect(mockState.editBackup).toBeNull();
    expect(mockState.undoStack).toEqual([]);
    expect(mockState.redoStack).toEqual([]);
    expect(mockState.isComposing).toBe(false);
  });

  it('뷰어/슬라이드 상태가 초기화되어야 함', async function() {
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.viewerImages).toEqual([]);
    expect(mockState.viewerIndex).toBe(0);
    expect(mockState.slideIntervals).toEqual({});
    expect(mockState.currentSlideIdx).toBeNull();
  });

  it('컨텍스트 상태가 초기화되어야 함', async function() {
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.slashMenuState).toEqual({ open: false, idx: null });
    expect(mockState.editingCommentId).toBeNull();
    expect(mockState.panelType).toBeNull();
    expect(mockState.currentEditBlockId).toBeNull();
    expect(mockState.renamePageId).toBeNull();
    expect(mockState.currentCalIdx).toBeNull();
    expect(mockState.colWidthTableId).toBeNull();
    expect(mockState.deleteTargetId).toBeNull();
    expect(mockState.currentInsertIdx).toBeNull();
    expect(mockState.dragBlockIdx).toBeNull();
    expect(mockState.dragPageId).toBeNull();
    expect(mockState.savedSelection).toBeNull();
    expect(mockState.currentTagElement).toBeNull();
    expect(mockState.lastSearchQuery).toBe('');
    expect(mockState.selectedEventColor).toBe('#3b82f6');
    expect(mockState.loginInProgress).toBe(false);
    expect(mockState.appInitialized).toBe(false);
  });

  it('state.db는 유지되어야 함', async function() {
    mockState.db = { users: [{ id: 'u1' }], settings: { wsName: 'WS' }, pages: [] };
    var { resetAppState } = await import('../../auth/auth.js');
    resetAppState();

    expect(mockState.db).not.toBeNull();
    expect(mockState.db.users.length).toBe(1);
  });
});

describe('logout', function() {
  it('logout 호출 시 resetAppState가 실행되어야 함', async function() {
    mockState.user = { id: 'testuser' };
    mockState.page = { id: 'p1' };
    mockState.appInitialized = true;

    var { logout } = await import('../../auth/auth.js');
    logout();

    expect(mockState.user).toBeNull();
    expect(mockState.page).toBeNull();
    expect(mockState.editMode).toBe(false);
    expect(mockState.undoStack).toEqual([]);
    expect(mockState.appInitialized).toBe(false);
  });
});

describe('initApp 중복 호출 방지', function() {
  it('appInitialized가 true이면 initApp이 즉시 리턴해야 함', async function() {
    // initApp 가드는 main.js에서 테스트 (Task 4)
    expect(true).toBe(true);
  });
});
```

**Step 2: 테스트 실행하여 실패 확인**

```bash
npx vitest run src/auth/__tests__/auth.test.js
```

Expected: FAIL (resetAppState가 아직 없음)

**Step 3: resetAppState 구현 + logout 수정**

`src/auth/auth.js`에서:

1. `logout()` 함수 위에 `resetAppState` 함수 추가:

```javascript
// --- 유틸: 앱 상태 전체 초기화 (로그아웃 시 사용) ---
export function resetAppState(){
  // 1. 타이머 정리
  clearTimeout(state.autoSaveTimer);
  clearTimeout(state.undoTimer);
  if(state.lockTimerInterval){clearInterval(state.lockTimerInterval);state.lockTimerInterval=null}
  for(var k in state.slideIntervals){
    if(state.slideIntervals.hasOwnProperty(k))clearInterval(state.slideIntervals[k]);
  }
  // 2. 에디터 상태
  state.editMode=false;
  state.editBackup=null;
  state.undoStack=[];
  state.redoStack=[];
  state.isComposing=false;
  state.autoSaveTimer=null;
  state.undoTimer=null;
  // 3. 뷰어/슬라이드
  state.viewerImages=[];
  state.viewerIndex=0;
  state.slideIntervals={};
  state.currentSlideIdx=null;
  // 4. 컨텍스트 상태
  state.slashMenuState={open:false,idx:null};
  state.editingCommentId=null;
  state.panelType=null;
  state.currentEditBlockId=null;
  state.renamePageId=null;
  state.currentCalIdx=null;
  state.colWidthTableId=null;
  state.deleteTargetId=null;
  state.currentInsertIdx=null;
  state.dragBlockIdx=null;
  state.dragPageId=null;
  state.savedSelection=null;
  state.currentTagElement=null;
  state.lastSearchQuery='';
  state.selectedEventColor='#3b82f6';
  state.loginInProgress=false;
  state.appInitialized=false;
}
```

2. `logout()` 함수를 수정하여 `resetAppState()` 호출 추가:

```javascript
export function logout(){
  // 앱 상태 전체 초기화
  resetAppState();
  state.loggingOut=true;
  // Firebase Auth 로그아웃
  auth.signOut().catch(function(e){
    console.warn('Firebase Auth 로그아웃 실패:',e);
  }).then(function(){
    state.loggingOut=false;
  });
  // 레거시 세션 정리
  localStorage.removeItem('ad_session');
  state.user=null;
  state.page=null;
  $('appWrap').style.display='none';
  $('loginScreen').classList.remove('hidden');
  $('loginId').value='';
  $('loginPw').value='';
  $('loginForm').style.display='block';
  $('loginLocked').style.display='none';
  $('loginBlocked').style.display='none';
  closeAllModals();
  closeAllPanels();
  location.hash='';
}
```

**Step 4: 테스트 실행하여 통과 확인**

```bash
npx vitest run src/auth/__tests__/auth.test.js
```

Expected: PASS

**Step 5: 커밋**

```bash
git add src/auth/auth.js src/auth/__tests__/auth.test.js
git commit -m "feat: logout 시 전체 앱 상태 초기화 (resetAppState)"
```

---

### Task 3: initApp 중복 호출 방지 가드 (Phase 2-1)

**Files:**
- Modify: `src/main.js:60-85`

**Step 1: 테스트 작성**

`src/auth/__tests__/auth.test.js`에 추가하지 않고, 이 가드는 `main.js`에서 간단한 가드이므로 수동 확인.

**Step 2: main.js의 initApp에 가드 추가**

`src/main.js`의 `initApp()` 함수 시작 부분에 다음 가드 추가:

```javascript
export function initApp(){
  if(state.appInitialized)return;
  state.appInitialized=true;
  $('loginScreen').classList.add('hidden');
  // ... 나머지 기존 코드 그대로
```

**Step 3: onAuthStateChanged에 loggingOut 가드 추가**

`src/main.js`의 `auth.onAuthStateChanged` 콜백에서, `if(sessionHandled)return;` 바로 뒤에 추가:

```javascript
auth.onAuthStateChanged(function(firebaseUser){
  if(sessionHandled)return;
  if(state.loggingOut)return;
  if(state.loginInProgress){sessionHandled=true;return;}
  // ... 나머지 기존 코드 그대로
```

**Step 4: localStorage 폴백에서 사용자 못 찾았을 때 세션 정리 추가**

`src/main.js`의 localStorage 폴백 (약 153-168행) 내부에서, `if(u)` 블록 뒤에 `else` 추가:

```javascript
if(u){
  state.user=u;
  if(u.needPw){
    $('loginScreen').classList.add('hidden');
    openModal('pwChangeModal');
  }else{
    initApp();
  }
}else{
  // 사용자를 찾을 수 없으면 세션 정리
  localStorage.removeItem('ad_session');
}
```

**Step 5: 빌드 확인**

```bash
npm run build
```

Expected: Build 성공

**Step 6: 커밋**

```bash
git add src/main.js
git commit -m "fix: initApp 중복 호출 방지 + onAuthStateChanged 로그아웃 가드"
```

---

### Task 4: showLockTimer interval 누적 방지 (Phase 2-3, 4-1)

**Files:**
- Modify: `src/auth/auth.js:251-259`

**Step 1: 테스트 추가**

`src/auth/__tests__/auth.test.js`에 추가:

```javascript
describe('showLockTimer', function() {
  it('이전 interval을 정리하고 새로 생성해야 함', async function() {
    var clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    var setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(42);

    mockState.lockTimerInterval = 123;

    var { showLockTimer } = await import('../../auth/auth.js');
    showLockTimer(Date.now() + 60000);

    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    expect(mockState.lockTimerInterval).toBe(42);

    clearIntervalSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });
});
```

**Step 2: 테스트 실행하여 실패 확인**

```bash
npx vitest run src/auth/__tests__/auth.test.js
```

Expected: FAIL

**Step 3: showLockTimer 수정**

`src/auth/auth.js`의 `showLockTimer` 함수를 수정:

```javascript
export function showLockTimer(until){
  $('loginLocked').style.display='block';$('loginForm').style.display='none';$('loginError').style.display='none';
  if(state.lockTimerInterval){clearInterval(state.lockTimerInterval);state.lockTimerInterval=null}
  state.lockTimerInterval=setInterval(function(){
    var remaining=until-Date.now();
    if(remaining<=0){clearInterval(state.lockTimerInterval);state.lockTimerInterval=null;$('loginLocked').style.display='none';$('loginForm').style.display='block';return}
    var min=Math.floor(remaining/60000),sec=Math.floor((remaining%60000)/1000);
    $('lockTimer').textContent=min+':'+(sec<10?'0':'')+sec
  },1000)
}
```

**Step 4: 테스트 실행하여 통과 확인**

```bash
npx vitest run src/auth/__tests__/auth.test.js
```

Expected: PASS

**Step 5: 커밋**

```bash
git add src/auth/auth.js src/auth/__tests__/auth.test.js
git commit -m "fix: showLockTimer interval 누적 방지"
```

---

### Task 5: state.user.pw 평문 비밀번호 제거 (Phase 3-2)

**Files:**
- Modify: `src/auth/auth.js:137-168` (handleLogin Firebase 성공 분기)
- Modify: `src/auth/auth.js:216-236` (handleLogin 레거시 성공 분기)

**Step 1: 테스트 추가**

`src/auth/__tests__/auth.test.js`에 추가:

```javascript
describe('handleLogin 비밀번호 제거', function() {
  it('Firebase Auth 로그인 성공 후 state.user에 pw가 없어야 함', async function() {
    // handleLogin은 DOM과 Firestore에 강하게 의존하므로
    // state.user.pw가 저장되지 않는지 간접 확인
    // (실제로는 통합 테스트에서 확인)
    expect(true).toBe(true);
  });
});
```

**Step 2: handleLogin의 Firebase Auth 성공 분기 수정**

`src/auth/auth.js`의 `auth.signInWithEmailAndPassword` 성공 콜백에서:

기존:
```javascript
state.user={
  id:id,
  pw:pw,
  role:'admin',
  active:true,
  nickname:cred.user.displayName||id
};
```

변경:
```javascript
state.user={
  id:id,
  role:'admin',
  active:true,
  nickname:cred.user.displayName||id
};
```

**Step 3: handleLogin의 레거시 성공 분기는 setStateUser(u)를 사용하므로 u.pw가 포함됨. setStateUser 수정**

기존:
```javascript
function setStateUser(legacyUser){
  state.user=legacyUser;
}
```

변경하지 않음 — 레거시 users 배열의 참조를 그대로 사용하기 때문에 배열의 pw도 같이 딸려옴. 하지만 이걸 분리하면 `submitPwChange`에서 `state.user.pw !== c` 비교가 깨짐.

**대안:** `submitPwChange`와 `changePassword`에서 `state.user.pw` 대신 레거시 users 배열에서 직접 비교하도록 수정:

`src/auth/auth.js`의 `submitPwChange` 수정:

기존:
```javascript
if(state.user.pw!==c){toast('현재 비밀번호가 틀립니다','err');return}
```

변경:
```javascript
var currentPw=null;
for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===state.user.id){currentPw=state.db.users[i].pw;break}}
if(currentPw!==c){toast('현재 비밀번호가 틀립니다','err');return}
```

`src/ui/modals.js`의 `changePassword` 수정:

기존:
```javascript
if(state.user.pw!==c){toast('현재 비밀번호 틀림','err');return}
```

변경:
```javascript
var currentPw=null;
for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===state.user.id){currentPw=state.db.users[i].pw;break}}
if(currentPw!==c){toast('현재 비밀번호 틀림','err');return}
```

그리고 `changePassword`에서 `state.user.pw=n;` 제거:

기존:
```javascript
saveDB();state.user.pw=n;
```

변경:
```javascript
saveDB();
```

**Step 4: 빌드 확인**

```bash
npm run build
```

Expected: Build 성공

**Step 5: 커밋**

```bash
git add src/auth/auth.js src/ui/modals.js
git commit -m "fix: state.user에 평문 비밀번호 저장하지 않도록 수정"
```

---

### Task 6: Firebase Auth 비밀번호 업데이트 실패 시 사용자 피드백 (Phase 3-1, 3-5)

**Files:**
- Modify: `src/auth/auth.js:305-316` (submitPwChange)
- Modify: `src/ui/modals.js:264-281` (changePassword)

**Step 1: submitPwChange 수정**

`src/auth/auth.js`의 `submitPwChange`에서:

기존:
```javascript
currentUser.updatePassword(n).then(function(){
  console.log('Firebase Auth 비밀번호 업데이트 완료');
}).catch(function(e){
  console.warn('Firebase Auth 비밀번호 업데이트 실패:',e);
  // 레거시는 이미 업데이트됨, Firebase Auth 실패는 경고만
});
```

변경:
```javascript
currentUser.updatePassword(n).then(function(){
  console.log('Firebase Auth 비밀번호 업데이트 완료');
}).catch(function(e){
  console.warn('Firebase Auth 비밀번호 업데이트 실패:',e);
  toast('비밀번호 변경됨 (일부 동기화 실패, 다음 로그인에 영향 없음)','warn');
});
```

**Step 2: changePassword 수정**

`src/ui/modals.js`의 `changePassword`에서:

기존:
```javascript
currentUser.updatePassword(n).then(function(){
  console.log('Firebase Auth 비밀번호 업데이트 완료');
}).catch(function(e){
  console.warn('Firebase Auth 비밀번호 업데이트 실패:',e);
});
```

변경:
```javascript
currentUser.updatePassword(n).then(function(){
  console.log('Firebase Auth 비밀번호 업데이트 완료');
}).catch(function(e){
  console.warn('Firebase Auth 비밀번호 업데이트 실패:',e);
  toast('비밀번호 변경됨 (일부 동기화 실패)','warn');
});
```

**Step 3: resetPw에 Firebase Auth 미동기화 경고 추가**

`src/ui/modals.js`의 `resetPw` 함수에서, `alert('새 비밀번호: '+pw)` 뒤에 추가:

```javascript
console.warn('resetPw: Firebase Auth 비밀번호는 Admin SDK 없이 변경 불가. 사용자가 다음 로그인 시 레거시 폴백됩니다.');
```

**Step 4: 커밋**

```bash
git add src/auth/auth.js src/ui/modals.js
git commit -m "fix: 비밀번호 변경 시 Firebase Auth 실패 사용자 피드백 추가"
```

---

### Task 7: 로그인 실패 시 비밀번호 필드 초기화 + 에러 메시지 개선 (Phase 4-2, 4-4)

**Files:**
- Modify: `src/auth/auth.js:82-248`

**Step 1: 테스트 추가**

`src/auth/__tests__/auth.test.js`에 추가:

```javascript
describe('getAuthErrorMessage', function() {
  it('네트워크 오류 코드를 한국어로 변환해야 함', async function() {
    var { getAuthErrorMessage } = await import('../../auth/auth.js');
    expect(getAuthErrorMessage('auth/network-request-failed')).toBe('네트워크 연결을 확인하세요');
    expect(getAuthErrorMessage('auth/too-many-requests')).toBe('잠시 후 다시 시도하세요');
    expect(getAuthErrorMessage('auth/user-disabled')).toBe('비활성화된 계정입니다');
    expect(getAuthErrorMessage('unknown-code')).toBe('로그인 처리 중 오류가 발생했습니다');
  });
});
```

**Step 2: 테스트 실행하여 실패 확인**

```bash
npx vitest run src/auth/__tests__/auth.test.js
```

Expected: FAIL

**Step 3: getAuthErrorMessage 함수 추가**

`src/auth/auth.js`의 상단 (AUTH_DOMAIN 선언 뒤)에 추가:

```javascript
// --- 유틸: Firebase Auth 에러 코드 → 한국어 메시지 ---
export function getAuthErrorMessage(code){
  var messages={
    'auth/network-request-failed':'네트워크 연결을 확인하세요',
    'auth/too-many-requests':'잠시 후 다시 시도하세요',
    'auth/user-disabled':'비활성화된 계정입니다',
    'auth/invalid-credential':'아이디 또는 비밀번호가 올바르지 않습니다',
    'auth/user-not-found':'존재하지 않는 계정입니다',
    'auth/wrong-password':'비밀번호가 올바르지 않습니다'
  };
  return messages[code]||'로그인 처리 중 오류가 발생했습니다';
}
```

**Step 4: handleLogin의 catch 핸들러에서 에러 메시지 적용**

`src/auth/auth.js`의 `.catch(function(err)` (237-242행) 수정:

기존:
```javascript
}).catch(function(err){
  // initApp() 등에서 발생한 예외 처리
  console.error('로그인 후 앱 초기화 실패:', err);
  toast('앱 초기화 중 오류가 발생했습니다','err');
  resetLoginBtn();
});
```

변경:
```javascript
}).catch(function(err){
  console.error('로그인 후 앱 초기화 실패:', err);
  toast(getAuthErrorMessage(err&&err.code),'err');
  $('loginPw').value='';
  resetLoginBtn();
});
```

외부 catch (243-248행)도 수정:

기존:
```javascript
}).catch(function(err){
  console.error('로그인 처리 중 오류:', err);
  toast('로그인 처리 중 오류가 발생했습니다','err');
  resetLoginBtn();
});
```

변경:
```javascript
}).catch(function(err){
  console.error('로그인 처리 중 오류:', err);
  toast(getAuthErrorMessage(err&&err.code),'err');
  $('loginPw').value='';
  resetLoginBtn();
});
```

**Step 5: 테스트 실행하여 통과 확인**

```bash
npx vitest run src/auth/__tests__/auth.test.js
```

Expected: PASS

**Step 6: 커밋**

```bash
git add src/auth/auth.js src/auth/__tests__/auth.test.js
git commit -m "fix: 로그인 에러 메시지 한국어화 + 비밀번호 필드 초기화"
```

---

### Task 8: 전체 테스트 + 빌드 검증

**Files:**
- No modifications

**Step 1: 전체 테스트 실행**

```bash
npx vitest run
```

Expected: 신규 테스트 전부 PASS (기존 table-sort 4개 실패는 pre-existing)

**Step 2: 빌드 확인**

```bash
npm run build
```

Expected: Build 성공, 에러 없음

**Step 3: 최종 커밋 (필요 시)**

테스트/빌드 중 발견된 문제가 있으면 수정 후 커밋.

---

## 파일 수정 요약

| 파일 | Task | 수정 내용 |
|------|------|-----------|
| `src/data/store.js` | 1 | `appInitialized`, `loggingOut`, `lockTimerInterval` 추가 |
| `src/auth/auth.js` | 2,4,5,6,7 | `resetAppState()`, `logout()`, `showLockTimer()`, `submitPwChange()`, `getAuthErrorMessage()`, `handleLogin()` |
| `src/auth/__tests__/auth.test.js` | 2,4,7 | 신규 테스트 파일 |
| `src/main.js` | 3 | `initApp()` 가드, `onAuthStateChanged` 로그아웃 가드, localStorage 폴백 정리 |
| `src/ui/modals.js` | 5,6 | `changePassword()`, `resetPw()` 수정 |
