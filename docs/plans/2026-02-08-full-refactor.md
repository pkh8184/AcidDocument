# AcidDocument 전체 리팩터링 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 코드 리뷰에서 발견된 보안, 버그, 성능, 유지보수성, 접근성 문제를 체계적으로 해결하여 프로덕션 수준으로 끌어올린다.

**Architecture:** 224KB 단일 `index.html` 모놀리스를 ES Modules 기반 멀티파일 구조로 분리. Firebase Auth 도입으로 인증 체계를 교체하고, Firestore 컬렉션을 정규화. 부분 렌더링과 이벤트 위임으로 성능을 개선한다.

**Tech Stack:** Vanilla JS (ES Modules), Firebase Auth + Firestore + Storage, DOMPurify, Vite (dev server + build)

---

## 데이터 보존 원칙 (필수)

> **모든 Phase에서 기존 로그인 계정, 사용자 데이터, 게시글(페이지)을 절대 삭제하지 않는다.**

### 현재 데이터 구조

전체 앱 데이터가 **단일 Firestore 문서** `app/data`에 저장되어 있다:

```
app/data = {
  users: [
    { id, pw, role, needPw, active, nickname }
  ],
  pages: [
    { id, title, icon, parentId, blocks, tags, author, created, updated,
      versions, comments, favorite, deleted }
  ],
  templates: [ { id, name, icon, blocks } ],
  settings: { wsName, theme, notice, imageStorage, storageUsage }
}
```

### 보존 대상

| 데이터 | 보존 방식 | 관련 Phase |
|--------|-----------|------------|
| **사용자 계정** (`users[]`) | Firebase Auth로 마이그레이션 + Firestore에 원본 유지 | Phase 2 |
| **페이지/게시글** (`pages[]`) | 새 컬렉션으로 복사 후 원본 문서 보존 | Phase 3 |
| **버전 히스토리** (`pages[].versions[]`) | 서브컬렉션으로 이동 시 전체 복사 | Phase 3 |
| **댓글** (`pages[].comments[]`) | 서브컬렉션으로 이동 시 전체 복사 | Phase 3 |
| **템플릿** (`templates[]`) | 그대로 유지 | - |
| **설정** (`settings`) | 그대로 유지 | - |
| **Firebase Storage 파일** | 건드리지 않음 | - |

### 마이그레이션 철칙

1. **원본 보존**: `app/data` 문서는 마이그레이션 완료 후에도 **삭제하지 않는다**. 최소 1개월 유지.
2. **백업 먼저**: 모든 구조 변경 전 Firestore Export 또는 로컬 JSON 백업을 수행한다.
3. **복사 후 검증**: 새 구조에 데이터를 **복사**(이동이 아닌)하고, 검증 후에야 앱이 새 구조를 사용한다.
4. **롤백 코드 유지**: 마이그레이션 기간 동안 구 구조와 신 구조를 모두 읽을 수 있는 호환 레이어를 유지한다.
5. **UID 매핑 테이블**: Firebase Auth 전환 시 기존 `user.id` → 새 Firebase Auth `uid` 매핑을 Firestore에 별도 저장한다.

---

## 현황 요약

| 항목 | 현재 상태 |
|------|-----------|
| 소스 | `index.html` 단일 파일 (3,492줄, 인라인 CSS+JS) |
| 외부 JS | `app.js`, `editor.js`, `editor2.js` — **미사용 구버전** |
| 빌드 도구 | 없음 (CDN 직접 로드) |
| 테스트 | 없음 |
| 모듈 시스템 | 없음 (전역 스코프 + `window.*` 수동 노출 150개+) |
| 인증 | 클라이언트 평문 비밀번호 + localStorage 세션 |
| DB 구조 | 단일 문서 (`app/data`) or 유저별 컬렉션 |

## Phase 구성

| Phase | 내용 | 우선순위 | 의존성 |
|-------|------|----------|--------|
| 1 | 프로젝트 기반 구축 (코드 분리 + 개발 환경) | P0 | 없음 |
| 2 | 보안 강화 (Firebase Auth, XSS 방어) | P0 | Phase 1 |
| 3 | 데이터 아키텍처 개선 + 에러 처리 | P0-P1 | Phase 2 |
| 4 | 버그 수정 (확정 버그 6건+) | P1 | Phase 1 |
| 5 | 성능 최적화 (부분 렌더링, 이벤트 위임) | P1-P2 | Phase 1 |
| 6 | 아키텍처 정리 (중복 제거, 네이밍, 상태 관리) | P2 | Phase 1, 5 |
| 7 | 접근성 (시맨틱 HTML, ARIA, 키보드) | P3 | Phase 1 |

> Phase 4는 Phase 2-3과 병렬 진행 가능.

---

## Phase 1: 프로젝트 기반 구축

**Branch:** `refactor/phase-1-foundation`

### 목표
- Vite + Vitest 개발 환경 구축
- `index.html` 모놀리스를 모듈별 파일로 분리
- 구버전 `app.js`, `editor.js`, `editor2.js` 삭제
- 기본 테스트 인프라 확보

### Task 1-1: 개발 환경 설정

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `.gitignore` (node_modules, dist 추가)

**Step 1: npm 초기화 + 의존성 설치**

```bash
npm init -y
npm install -D vite vitest
npm install dompurify
```

**Step 2: Vite 설정 파일 생성**

```js
// vite.config.js
import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  build: { outDir: 'dist' }
});
```

**Step 3: .gitignore 설정**

```
node_modules/
dist/
.env
nul
```

**Step 4: 동작 확인**

Run: `npx vite --open`
Expected: index.html이 로컬 서버에서 정상 로드

**Step 5: 커밋**

```bash
git add package.json vite.config.js .gitignore
git commit -m "chore: Vite 개발 환경 설정"
```

---

### Task 1-2: CSS 분리

**Files:**
- Create: `src/styles/main.css`
- Modify: `index.html` — `<style>` 블록 제거, `<link>` 추가

**Step 1: `index.html`의 `<style>` 블록(9~387줄) 전체를 `src/styles/main.css`로 이동**

**Step 2: `index.html`에서 `<style>` 블록 제거 후 link 태그 추가**

```html
<link rel="stylesheet" href="/src/styles/main.css">
```

**Step 3: 동작 확인**

Run: `npx vite`
Expected: 스타일 정상 적용

**Step 4: 커밋**

```bash
git add src/styles/main.css index.html
git commit -m "refactor: CSS를 별도 파일로 분리"
```

---

### Task 1-3: JS 모듈 구조 설계 및 분리

**Files:**
- Create: `src/main.js` — 엔트리포인트
- Create: `src/config/firebase.js` — Firebase 초기화 + 상수
- Create: `src/utils/helpers.js` — `$`, `$$`, `genId`, `esc`, `toast`, `fmtD`, `fmtDT`, `setTheme` 등
- Create: `src/auth/auth.js` — 로그인, 회원가입, 세션 관리
- Create: `src/data/store.js` — 전역 상태 (pages, page, editMode 등)
- Create: `src/data/firestore.js` — Firestore CRUD (loadPages, savePage, uploadFile 등)
- Create: `src/ui/sidebar.js` — 사이드바, 트리, 브레드크럼
- Create: `src/ui/modals.js` — 모달, 검색, 설정
- Create: `src/ui/toolbar.js` — 서식바, 슬래시 메뉴
- Create: `src/editor/renderer.js` — renderBlocks, createBlockEl
- Create: `src/editor/blocks.js` — 블록 CRUD (insertBlock, deleteBlock, moveBlock 등)
- Create: `src/editor/listeners.js` — 키보드, 클립보드, 드래그앤드롭 이벤트
- Create: `src/editor/table.js` — 테이블 조작
- Create: `src/editor/media.js` — 이미지, 비디오, PDF, 파일, 북마크, 슬라이드
- Create: `src/editor/calendar.js` — 캘린더 블록
- Create: `src/editor/chart.js` — 차트 블록
- Create: `src/features/versions.js` — 버전 관리
- Create: `src/features/comments.js` — 댓글
- Create: `src/features/export.js` — 내보내기 (HTML, PDF)
- Create: `src/features/search.js` — 검색
- Delete: `app.js`, `editor.js`, `editor2.js` (구버전)
- Modify: `index.html` — 인라인 `<script>` 제거, `<script type="module" src="/src/main.js">` 추가

**분리 원칙:**
1. `index.html`의 인라인 JS (683~3489줄)를 정본으로 사용
2. 각 모듈은 필요한 것만 import/export
3. `window.*` 노출 전면 제거 — 이벤트 위임은 Phase 5에서 처리하므로, 이 단계에서는 각 모듈에서 직접 `window.*`에 할당하되 한 곳에서 관리
4. 전역 변수는 `src/data/store.js`로 중앙화

**Step 1: `src/data/store.js` 생성 — 전역 상태 중앙 관리**

```js
// 모든 전역 상태를 하나의 모듈에서 관리
export const state = {
  currentUser: null,
  userData: null,
  pages: [],
  page: null,
  editMode: false,
  editBackup: null,
  slashSt: { open: false, idx: null },
  autoT: null,
  isComp: false,
  dragPageId: null,
  deleteTargetId: null,
  currentEditBlockId: null,
  currentInsertIdx: null,
  currentSlideIdx: 0,
  recentIds: [],
  panelType: null,
};
```

**Step 2: Firebase 설정 분리 (`src/config/firebase.js`)**

index.html 683~710줄의 Firebase 초기화 코드를 이동. 상수(`SUPER`, `MAX_VER`, `SLASH`, `TEMPLATES`, `ICONS`, `COLORS` 등)도 여기에.

**Step 3: 유틸리티 분리 (`src/utils/helpers.js`)**

`$`, `$$`, `genId`, `esc`, `toast`, `fmtD`, `fmtDT`, `setTheme`, `toggleTheme` 등.

**Step 4: 인증 분리 (`src/auth/auth.js`)**

로그인/회원가입 폼 처리, `handleLogin`, `resetLoginState`, `skipPwChange`, `submitPwChange`, `logout` 등.

**Step 5: 데이터 계층 분리 (`src/data/firestore.js`)**

`loadUserData`, `loadPages`, `savePage`, `deletePermanently`, `uploadFile`, `convertRowsForSave`, `convertRowsForLoad` 등.

**Step 6: UI 분리 (sidebar, modals, toolbar)**

**Step 7: 에디터 분리 (renderer, blocks, listeners, table, media, calendar, chart)**

**Step 8: 기능 분리 (versions, comments, export, search)**

**Step 9: 엔트리포인트 작성 (`src/main.js`)**

```js
import { initFirebase } from './config/firebase.js';
import { init } from './auth/auth.js';
// ... 필요한 모듈 import

// Firebase 로드 대기 후 초기화
function startApp() {
  initFirebase();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
startApp();
```

**Step 10: `index.html` 정리**

- 인라인 `<script>` 블록 전체 제거
- Firebase CDN은 유지 (추후 npm 패키지로 전환 가능)
- `<script type="module" src="/src/main.js"></script>` 추가

**Step 11: 구버전 파일 삭제**

```bash
git rm app.js editor.js editor2.js
```

**Step 12: 동작 확인**

Run: `npx vite`
Expected: 로그인 → 문서 목록 → 문서 편집 → 저장이 모두 정상 동작

**Step 13: 커밋**

```bash
git add src/ index.html
git commit -m "refactor: 모놀리스를 ES Modules 기반 멀티파일 구조로 분리"
```

---

### Task 1-4: 유틸리티 함수 테스트 작성

**Files:**
- Create: `src/utils/__tests__/helpers.test.js`

**Step 1: 테스트 작성**

```js
import { describe, it, expect } from 'vitest';
import { genId, esc, fmtD, fmtDT } from '../helpers.js';

describe('genId', () => {
  it('8자리 문자열을 반환한다', () => {
    const id = genId();
    expect(id).toHaveLength(8);
    expect(typeof id).toBe('string');
  });

  it('호출마다 고유한 값을 생성한다', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });
});

describe('esc', () => {
  it('HTML 특수문자를 이스케이프한다', () => {
    expect(esc('<script>alert("xss")</script>')).not.toContain('<script>');
    expect(esc('&')).toContain('&amp;');
    expect(esc('"')).toContain('&quot;');
  });

  it('null/undefined 입력을 안전하게 처리한다', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
```

**Step 2: 테스트 실행**

Run: `npx vitest run`
Expected: PASS

**Step 3: 커밋**

```bash
git add src/utils/__tests__/
git commit -m "test: 유틸리티 함수 단위 테스트 추가"
```

---

## Phase 2: 보안 강화

**Branch:** `refactor/phase-2-security`
**의존:** Phase 1 완료

### Task 2-1: 기존 데이터 백업

**Files:**
- Create: `scripts/backup.js` — 1회성 백업 스크립트
- Create: `scripts/verify-backup.js` — 백업 검증 스크립트

**Step 1: Firestore `app/data` 문서 전체를 로컬 JSON으로 백업**

```js
// scripts/backup.js — 브라우저 콘솔 또는 Node.js Admin SDK로 실행
// 방법 1: 브라우저 콘솔에서 실행 (로그인 상태에서)
async function backupData() {
  const doc = await firebase.firestore().collection('app').doc('data').get();
  const data = doc.data();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aciddocument-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  console.log(`백업 완료: 사용자 ${data.users?.length}명, 페이지 ${data.pages?.length}개`);
}
```

**Step 2: 백업 검증**

```js
// scripts/verify-backup.js
function verifyBackup(backup) {
  const checks = {
    users: backup.users?.length > 0,
    pages: backup.pages?.length > 0,
    settings: !!backup.settings,
    allPagesHaveBlocks: backup.pages?.every(p => Array.isArray(p.blocks)),
    allUsersHaveId: backup.users?.every(u => u.id && u.pw),
  };
  console.table(checks);
  return Object.values(checks).every(Boolean);
}
```

**Step 3: Firebase Console에서 Firestore Export도 별도로 실행 (이중 백업)**

**Step 4: 커밋**

```bash
git add scripts/
git commit -m "chore: 데이터 백업/검증 스크립트 추가"
```

---

### Task 2-2: Firebase Authentication 도입 (데이터 보존)

**Files:**
- Modify: `index.html` — Firebase Auth CDN 추가
- Modify: `src/config/firebase.js` — Auth 초기화
- Modify: `src/auth/auth.js` — Firebase Auth 기반 로그인/회원가입으로 교체
- Modify: `src/data/firestore.js` — 세션 체크를 `firebase.auth().currentUser`로 변경
- Create: `firestore.rules` — Security Rules 정의
- Create: `scripts/migrate-auth.js` — 계정 마이그레이션 스크립트

> **핵심: 기존 `app/data.users[]` 배열은 삭제하지 않는다. Firebase Auth 병행 운용 후 점진 전환.**

**Step 1: Firebase Console에서 Authentication 활성화**

- Email/Password 로그인 활성화

**Step 2: UID 매핑 컬렉션 설계**

기존 사용자 ID(`admin8184` 등)와 Firebase Auth UID를 연결하는 매핑 테이블:

```
Firestore 경로: app/userMapping
{
  "admin8184": "firebase-auth-uid-xxxx",
  "user001": "firebase-auth-uid-yyyy",
  ...
}
```

**Step 3: 계정 마이그레이션 스크립트 작성**

```js
// scripts/migrate-auth.js
// Firebase Admin SDK 사용 (Node.js에서 실행)
// 기존 사용자를 Firebase Auth에 등록하고 매핑 저장

async function migrateUsers() {
  // 1. 기존 app/data에서 users 배열 읽기
  const doc = await adminFirestore.collection('app').doc('data').get();
  const users = doc.data().users;

  const mapping = {};

  for (const user of users) {
    try {
      // 2. Firebase Auth에 사용자 생성
      //    이메일: {userId}@aciddocument.local (또는 실제 이메일)
      const authUser = await adminAuth.createUser({
        email: `${user.id}@aciddocument.local`,
        password: user.pw,  // 기존 비밀번호로 생성 (첫 로그인 후 변경 유도)
        displayName: user.nickname || user.id,
      });

      // 3. 매핑 기록
      mapping[user.id] = authUser.uid;
      console.log(`✓ ${user.id} → ${authUser.uid}`);
    } catch (err) {
      console.error(`✗ ${user.id} 마이그레이션 실패:`, err.message);
    }
  }

  // 4. 매핑 테이블을 Firestore에 저장
  await adminFirestore.collection('app').doc('userMapping').set(mapping);

  // 5. 기존 users 배열은 삭제하지 않음 (원본 보존)
  console.log(`마이그레이션 완료: ${Object.keys(mapping).length}/${users.length}명`);
}
```

**Step 4: index.html에 Firebase Auth CDN 추가**

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
```

**Step 5: 인증 로직 교체 (호환 레이어 포함)**

```js
// src/auth/auth.js
// 호환 레이어: Firebase Auth 실패 시 기존 방식으로 폴백
async function handleLogin(id, pw) {
  try {
    // 1차: Firebase Auth로 시도
    const email = `${id}@aciddocument.local`;
    await firebase.auth().signInWithEmailAndPassword(email, pw);
  } catch (authErr) {
    // 2차: 기존 app/data.users[]에서 확인 (마이그레이션 미완료 사용자 대비)
    const doc = await firestore.collection('app').doc('data').get();
    const users = doc.data().users || [];
    const u = users.find(x => x.id === id && x.pw === pw && x.active !== false);
    if (!u) throw new Error('로그인 실패');

    // 기존 방식 성공 → Firebase Auth에 자동 등록 (점진적 마이그레이션)
    try {
      await firebase.auth().createUserWithEmailAndPassword(`${id}@aciddocument.local`, pw);
      // 매핑 업데이트
      const uid = firebase.auth().currentUser.uid;
      await firestore.collection('app').doc('userMapping').set(
        { [id]: uid }, { merge: true }
      );
    } catch (e) { /* 이미 등록된 경우 무시 */ }
  }
}
```

**Step 6: 사용자 프로필을 별도 컬렉션으로 복사 (원본 유지)**

```js
// 기존 사용자 정보를 새 경로에 복사 (app/data.users는 그대로 둠)
// Firestore 경로: users/{firebaseAuthUid}
async function copyUserProfile(oldUser, firebaseUid) {
  await firestore.collection('users').doc(firebaseUid).set({
    legacyId: oldUser.id,        // 기존 ID 보존
    role: oldUser.role,
    nickname: oldUser.nickname,
    active: oldUser.active,
    needPw: false,               // Firebase Auth가 관리하므로
    migratedAt: new Date().toISOString(),
  });
  // 기존 app/data.users에서 해당 사용자 삭제하지 않음
}
```

**Step 7: `isSuper()` 수정 — Firestore `users/{uid}.role`로 확인**

**Step 8: `localStorage` 세션 코드 제거 — `onAuthStateChanged()` 사용**

**Step 9: Firestore Security Rules 작성**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 기존 app/data 문서는 읽기만 허용 (마이그레이션 기간)
    match /app/data {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super';
    }
    // 새 사용자 프로필
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    // UID 매핑 (읽기 전용)
    match /app/userMapping {
      allow read: if request.auth != null;
    }
  }
}
```

**Step 10: 테스트 체크리스트**

- [ ] 기존 사용자가 기존 ID/PW로 로그인 가능
- [ ] 로그인 후 기존 페이지 목록이 모두 표시됨
- [ ] 새 사용자 생성 가능
- [ ] 로그아웃 후 세션이 정상 만료
- [ ] `app/data.users[]` 원본이 그대로 유지됨
- [ ] `app/userMapping` 문서에 매핑이 정상 저장됨

**Step 11: 커밋**

---

### Task 2-2: XSS 방어 (DOMPurify 도입)

**Files:**
- Modify: `src/editor/renderer.js` — 블록 콘텐츠 렌더링 시 DOMPurify 적용
- Create: `src/utils/sanitize.js` — sanitize 래퍼 함수
- Create: `src/utils/__tests__/sanitize.test.js`

**Step 1: sanitize 래퍼 작성**

```js
// src/utils/sanitize.js
import DOMPurify from 'dompurify';

export function sanitizeHTML(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'u', 's', 'a', 'br', 'span', 'code', 'mark', 'sub', 'sup'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'data-tag-color'],
    ALLOW_DATA_ATTR: false,
  });
}
```

**Step 2: 테스트 작성**

```js
describe('sanitizeHTML', () => {
  it('script 태그를 제거한다', () => {
    expect(sanitizeHTML('<script>alert(1)</script>')).toBe('');
  });
  it('허용된 태그는 유지한다', () => {
    expect(sanitizeHTML('<b>bold</b>')).toBe('<b>bold</b>');
  });
  it('onerror 등 이벤트 핸들러를 제거한다', () => {
    expect(sanitizeHTML('<img onerror="alert(1)">')).not.toContain('onerror');
  });
});
```

**Step 3: `createBlockEl()`에서 `b.content`를 `innerHTML`에 넣는 모든 지점에 `sanitizeHTML()` 적용**

대상 블록 타입: text, h1-h3, list, todo, toggle, quote, callout, column 내부 등

**Step 4: `exportPdf()`, `exportDoc()`에서도 sanitize 적용**

**Step 5: 미디어 URL scheme 검증 추가**

```js
// src/utils/sanitize.js
export function sanitizeURL(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) return '';
    return url;
  } catch { return ''; }
}
```

**Step 6: 테스트 실행 → 커밋**

---

### Task 2-3: 로그인 잠금 로직 개선

**Files:**
- Modify: `src/auth/auth.js`

**Step 1: 잠금 상태를 서버(Firestore)에 저장**

- IP/기기별 실패 횟수를 Firestore에 기록
- Unlock 링크 UI에서 제거
- 일정 시간 후 자동 해제 (예: 30분)

**Step 2: 테스트 → 커밋**

---

## Phase 3: 데이터 아키텍처 개선

**Branch:** `refactor/phase-3-data`
**의존:** Phase 2 완료

### Task 3-1: Firestore 컬렉션 정규화 (데이터 보존)

**Files:**
- Modify: `src/data/firestore.js` — 컬렉션 구조 변경
- Modify: `src/data/store.js` — 상태 구조 조정
- Create: `scripts/migrate-pages.js` — 페이지 마이그레이션 스크립트
- Create: `scripts/verify-migration.js` — 마이그레이션 검증 스크립트

> **핵심: `app/data` 원본 문서는 삭제하지 않는다. 새 컬렉션에 복사 후 앱을 전환한다.**

**현재 구조 (단일 문서):**
```
app/data = {
  users: [...],
  pages: [...],       ← 모든 페이지 + 블록 + 버전 + 댓글이 하나의 문서에
  templates: [...],
  settings: {...}
}
```

**변경 구조 (컬렉션 분리):**
```
app/data              — 원본 유지 (삭제 금지, 롤백용)
app/settings          — 설정 (app/data.settings + storageUsage 포함)
app/templates         — 템플릿 (app/data.templates에서 복사)
app/userMapping       — UID 매핑 (Phase 2에서 생성)
pages/{pageId}        — 페이지 메타데이터 + blocks 필드
  ├ versions/{verId}  — 버전 (서브컬렉션)
  └ comments/{cmtId}  — 댓글 (서브컬렉션)
users/{uid}           — 사용자 프로필 (Phase 2에서 생성)
```

> **이미지/미디어 관련 주의사항:**
> - Firebase Storage 파일은 Firestore와 독립적이므로 어떤 Phase에서도 건드리지 않는다.
> - 이미 Storage URL로 교체된 이미지(`https://firebasestorage.googleapis.com/...`)는 블록 복사 시 그대로 유지된다.
> - 아직 base64인 이미지도 블록의 `src` 필드에 그대로 포함되므로 데이터 손실 없이 복사된다.
> - `storageUsage` 카운터는 `app/settings`에 반드시 포함해야 한다 (누락 시 용량 표시가 0으로 초기화됨).

> `pages`를 최상위 컬렉션으로 올리고, `author` 필드로 소유자를 구분한다.
> 이렇게 하면 향후 페이지 공유/협업 확장이 가능하다.

**Step 1: 마이그레이션 스크립트 작성**

```js
// scripts/migrate-pages.js (Node.js Admin SDK)
async function migratePages() {
  // 1. 원본 읽기
  const doc = await adminFirestore.collection('app').doc('data').get();
  const data = doc.data();
  const pages = data.pages || [];
  const userMapping = (await adminFirestore.collection('app').doc('userMapping').get()).data() || {};

  let success = 0, fail = 0;

  for (const page of pages) {
    try {
      // 2. 버전과 댓글을 분리
      const { versions, comments, ...pageMeta } = page;

      // 3. author를 Firebase UID로 매핑 (매핑 없으면 기존 ID 유지)
      pageMeta.authorUid = userMapping[page.author] || null;
      pageMeta.authorLegacyId = page.author;  // 기존 ID 보존

      // 4. 페이지 메타데이터 + blocks를 새 컬렉션에 저장
      //    (blocks는 페이지 문서에 그대로 유지 — 서브컬렉션보다 단순)
      await adminFirestore.collection('pages').doc(page.id).set(pageMeta);

      // 5. 버전을 서브컬렉션에 저장
      for (const ver of (versions || [])) {
        await adminFirestore.collection('pages').doc(page.id)
          .collection('versions').doc(String(ver.id)).set(ver);
      }

      // 6. 댓글을 서브컬렉션에 저장
      for (const cmt of (comments || [])) {
        await adminFirestore.collection('pages').doc(page.id)
          .collection('comments').doc(cmt.id).set(cmt);
      }

      success++;
      console.log(`✓ [${success}/${pages.length}] ${page.title || page.id}`);
    } catch (err) {
      fail++;
      console.error(`✗ ${page.id} 실패:`, err.message);
    }
  }

  // 7. 설정과 템플릿도 별도 문서로 복사 (원본 유지)
  //    storageUsage를 settings에 반드시 포함 (누락 시 용량 표시 초기화)
  if (data.settings) {
    const settingsData = { ...data.settings };
    settingsData.storageUsage = data.storageUsage || 0;  // storageUsage 보존
    await adminFirestore.collection('app').doc('settings').set(settingsData);
  }
  if (data.templates) {
    await adminFirestore.collection('app').doc('templates').set({ items: data.templates });
  }

  console.log(`\n마이그레이션 완료: 성공 ${success}, 실패 ${fail}, 전체 ${pages.length}`);
  console.log('원본 app/data 문서는 그대로 보존됩니다.');
}
```

**Step 2: 마이그레이션 검증 스크립트**

```js
// scripts/verify-migration.js
async function verifyMigration() {
  // 1. 원본 데이터 로드
  const original = (await adminFirestore.collection('app').doc('data').get()).data();
  const originalPages = original.pages || [];

  let pass = 0, fail = 0;

  for (const origPage of originalPages) {
    const newDoc = await adminFirestore.collection('pages').doc(origPage.id).get();

    if (!newDoc.exists) {
      console.error(`✗ 페이지 누락: ${origPage.id} (${origPage.title})`);
      fail++;
      continue;
    }

    const newPage = newDoc.data();

    // 블록 수 비교
    if (newPage.blocks?.length !== origPage.blocks?.length) {
      console.error(`✗ 블록 수 불일치: ${origPage.id} (원본 ${origPage.blocks?.length} vs 신규 ${newPage.blocks?.length})`);
      fail++;
      continue;
    }

    // 버전 수 비교
    const versionsSnap = await adminFirestore.collection('pages').doc(origPage.id)
      .collection('versions').get();
    if (versionsSnap.size !== (origPage.versions?.length || 0)) {
      console.error(`✗ 버전 수 불일치: ${origPage.id}`);
      fail++;
      continue;
    }

    // 댓글 수 비교
    const commentsSnap = await adminFirestore.collection('pages').doc(origPage.id)
      .collection('comments').get();
    if (commentsSnap.size !== (origPage.comments?.length || 0)) {
      console.error(`✗ 댓글 수 불일치: ${origPage.id}`);
      fail++;
      continue;
    }

    pass++;
  }

  console.log(`\n검증 결과: 통과 ${pass}, 실패 ${fail}, 전체 ${originalPages.length}`);
  return fail === 0;
}
```

**Step 3: 앱에 호환 레이어 추가 (신/구 구조 모두 읽기)**

```js
// src/data/firestore.js
// 마이그레이션 전환 플래그
const USE_NEW_STRUCTURE = false; // 검증 완료 후 true로 변경

async function loadPages() {
  if (USE_NEW_STRUCTURE) {
    // 새 구조: pages 컬렉션에서 로드
    const snapshot = await firestore.collection('pages')
      .where('authorLegacyId', '==', state.currentUser.legacyId)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    // 기존 구조: app/data에서 로드 (현재 방식 유지)
    const doc = await firestore.collection('app').doc('data').get();
    return doc.data()?.pages || [];
  }
}
```

**Step 4: 마이그레이션 실행 순서**

> **타이밍 이슈:** 마이그레이션(복사)과 플래그 전환 사이에 사용자가 데이터를 수정하면
> 새 컬렉션에 반영되지 않는다. 이를 방지하기 위해 아래 순서를 엄격히 따른다.

1. `scripts/backup.js` 실행 → 로컬 JSON 백업
2. 서비스 점검 안내 (가능하면 사용자 접근 차단 또는 공지)
3. `scripts/migrate-pages.js` 실행 → 새 컬렉션에 복사
4. `scripts/verify-migration.js` 실행 → 데이터 무결성 확인
5. 검증 실패 시 → 새 컬렉션 삭제하고 재시도, `app/data`는 그대로
6. 검증 통과 시 → `USE_NEW_STRUCTURE = true`로 전환 + 배포
7. 전환 직후 **2차 동기화**: `app/data`의 최종 상태와 새 컬렉션을 비교, 차이가 있으면 새 컬렉션에 반영
8. 앱에서 새 구조로 정상 동작 확인
9. **`app/data` 원본은 최소 1개월 보존**
10. `migrateImages()` 함수를 새 컬렉션 구조에 맞게 수정 (Phase 3 완료 후)

**Step 5: 페이지 목록 로드 시 메타데이터만 가져오기 (lazy loading)**

```js
// 새 구조에서는 blocks 필드 제외하고 로드 가능
const snapshot = await firestore.collection('pages')
  .where('authorLegacyId', '==', legacyId)
  .select('title', 'icon', 'parentId', 'tags', 'updated', 'deleted', 'favorite', 'author')
  .get();

// 페이지 열 때만 blocks 포함 전체 로드
async function loadPageFull(pageId) {
  const doc = await firestore.collection('pages').doc(pageId).get();
  const page = { id: doc.id, ...doc.data() };

  // 버전/댓글은 서브컬렉션에서 별도 로드
  const [versionsSnap, commentsSnap] = await Promise.all([
    firestore.collection('pages').doc(pageId).collection('versions').get(),
    firestore.collection('pages').doc(pageId).collection('comments').get(),
  ]);
  page.versions = versionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  page.comments = commentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return page;
}
```

**Step 6: `savePage()`를 `update()`로 변경 (전체 덮어쓰기 → 부분 갱신)**

**Step 7: 테스트 체크리스트**

- [ ] 기존 모든 페이지가 새 컬렉션에 존재
- [ ] 각 페이지의 블록 수가 원본과 일치
- [ ] 각 페이지의 버전/댓글이 서브컬렉션에 정상 저장
- [ ] 삭제된 페이지(`deleted: true`)도 정상 마이그레이션
- [ ] 즐겨찾기, 태그 등 메타데이터 보존
- [ ] `app/data` 원본 문서가 변경되지 않음
- [ ] 앱에서 페이지 생성/편집/삭제가 정상 동작

**Step 8: 커밋**

---

### Task 3-2: 에러 처리 체계화

**Files:**
- Modify: `src/data/firestore.js` — 모든 Firestore 호출에 try-catch
- Modify: 관련 모든 async 함수

**Step 1: Firestore 호출 래퍼 작성**

```js
async function firestoreCall(operation, errorMessage) {
  try {
    return await operation();
  } catch (err) {
    console.error(errorMessage, err);
    toast(errorMessage, 'error');
    throw err;
  }
}
```

**Step 2: `savePage`, `loadPages`, `createPage`, `deletePermanently` 등에 적용**

**Step 3: `await` 누락 수정**

- `saveDoc()` 호출부 (loadPage 내부, cancelEdit 내부)에 `await` 추가
- `saveAndExit()` 호출부에 `await` 추가

**Step 4: 테스트 → 커밋**

---

### Task 3-3: emptyTrash 일괄 처리

**Files:**
- Modify: `src/data/firestore.js`

**Step 1: 순차 삭제를 Firestore batch write로 변경**

```js
async function emptyTrash() {
  const batch = firestore.batch();
  const deleted = state.pages.filter(p => p.deleted);
  for (const p of deleted) {
    batch.delete(firestore.collection('users').doc(state.currentUser.uid).collection('pages').doc(p.id));
  }
  await batch.commit();
  // 로컬 상태 업데이트
}
```

**Step 2: 테스트 → 커밋**

---

## Phase 4: 버그 수정

**Branch:** `refactor/phase-4-bugfix`
**의존:** Phase 1 완료 (Phase 2-3과 병렬 가능)

### Task 4-1: renderSidebar() 미정의 수정

**Files:**
- Modify: `src/ui/sidebar.js`

**Step 1:** `renderSidebar()` 호출을 `renderTree()`로 변경 (또는 `renderSidebar`를 `renderTree`의 alias로 export)

**Step 2: 커밋**

---

### Task 4-2: dupBlock() 이중 정의 수정

**Files:**
- Modify: `src/editor/blocks.js`

**Step 1:** 두 번째 정의(구 index.html 2978줄) 삭제, 첫 번째 정의(toast + focusBlock 포함)만 유지

**Step 2: 커밋**

---

### Task 4-3: 드래그앤드롭 imageStorage 설정 적용

**Files:**
- Modify: `src/editor/listeners.js`

**Step 1:** 드래그앤드롭 이미지 처리에서 `state.userData.settings.imageStorage` 확인 추가

```js
// 현재: 항상 base64
// 수정: 클립보드 붙여넣기와 동일하게 설정 확인
if (state.userData?.settings?.imageStorage === 'storage') {
  // Firebase Storage 업로드
} else {
  // base64 인라인
}
```

**Step 2: 커밋**

---

### Task 4-4: hasChanges() 완전한 비교

**Files:**
- Modify: `src/editor/blocks.js`
- Create: `src/editor/__tests__/blocks.test.js`

**Step 1: 테스트 작성**

```js
describe('hasChanges', () => {
  it('content 변경을 감지한다', () => { ... });
  it('type 변경을 감지한다', () => { ... });
  it('checked 변경을 감지한다', () => { ... });
  it('rows (테이블) 변경을 감지한다', () => { ... });
  it('블록 수 변경을 감지한다', () => { ... });
});
```

**Step 2: `hasChanges()` 수정**

```js
function hasChanges() {
  const current = collectBlocks();
  const backup = state.editBackup.blocks;
  if (current.length !== backup.length) return true;
  for (let i = 0; i < current.length; i++) {
    if (JSON.stringify(current[i]) !== JSON.stringify(backup[i])) return true;
  }
  return false;
}
```

**Step 3: 테스트 실행 → 커밋**

---

### Task 4-5: 버전 ID 충돌 방지

**Files:**
- Modify: `src/features/versions.js`

**Step 1:** 버전 ID를 `genId()` 또는 `Date.now()`로 변경

```js
// 변경 전: id: p.versions.length + 1
// 변경 후:
p.versions.push({
  id: genId(),
  date: new Date().toISOString(),
  blocks: JSON.parse(JSON.stringify(p.blocks)),
});
```

**Step 2: `restoreVer()`, `deleteVer()`에서 ID 비교 로직 확인 → 커밋**

---

### Task 4-6: 테이블 조작 시 데이터 동기화

**Files:**
- Modify: `src/editor/table.js`

**Step 1:** `addTblRow`, `addTblCol`, `delTblRow`, `delTblCol`, `setTblAlign` 함수 시작부에 `collectTableData(id)` 호출 추가

```js
function addTblRow(id) {
  collectTableData(id);  // DOM → state 동기화
  const b = state.page.blocks.find(x => x.id === id);
  // ... 행 추가 로직
  renderBlocks();
}
```

**Step 2: 커밋**

---

### Task 4-7: recentIds 영속화

**Files:**
- Modify: `src/data/store.js` 또는 `src/ui/sidebar.js`

**Step 1:** `recentIds`를 localStorage에 저장/복원

```js
function addRecent(pageId) {
  state.recentIds = [pageId, ...state.recentIds.filter(x => x !== pageId)].slice(0, 20);
  localStorage.setItem('ad_recent', JSON.stringify(state.recentIds));
}

function loadRecent() {
  try {
    state.recentIds = JSON.parse(localStorage.getItem('ad_recent') || '[]');
  } catch { state.recentIds = []; }
}
```

**Step 2: 커밋**

---

### Task 4-8: 중복 CSS 규칙 제거

**Files:**
- Modify: `src/styles/main.css`

**Step 1:** 중복 규칙 식별 및 제거
- `.block-table table/th/td` (127-141줄 중복)
- `.col-divider::after` (165-166줄)
- `.icon-grid` (207, 210줄)
- `.block-col:focus-within` (162, 167줄)

**Step 2: 커밋**

---

## Phase 5: 성능 최적화

**Branch:** `refactor/phase-5-performance`
**의존:** Phase 1 완료

### Task 5-1: 부분 렌더링 도입

**Files:**
- Modify: `src/editor/renderer.js`

**목표:** `renderBlocks()` 전체 리렌더링을 개별 블록 단위 업데이트로 교체

**Step 1: 블록 ID → DOM 요소 Map 유지**

```js
const blockElements = new Map(); // blockId -> DOM element
```

**Step 2: 개별 블록 업데이트 함수 작성**

```js
function updateBlock(blockId) {
  const b = state.page.blocks.find(x => x.id === blockId);
  const oldEl = blockElements.get(blockId);
  const newEl = createBlockEl(b, state.page.blocks.indexOf(b));
  oldEl.replaceWith(newEl);
  blockElements.set(blockId, newEl);
}

function insertBlockEl(block, index) {
  const el = createBlockEl(block, index);
  const editor = $('editor');
  const ref = editor.children[index];
  ref ? editor.insertBefore(el, ref) : editor.appendChild(el);
  blockElements.set(block.id, el);
}

function removeBlockEl(blockId) {
  blockElements.get(blockId)?.remove();
  blockElements.delete(blockId);
}
```

**Step 3: `renderBlocks()`는 초기 로드/페이지 전환 시에만 사용, 개별 조작은 부분 업데이트**

**Step 4: 슬라이드 자동 재생에서 전체 리렌더 대신 슬라이드 블록만 업데이트**

**Step 5: 동작 확인 → 커밋**

---

### Task 5-2: 이벤트 위임 도입

**Files:**
- Modify: `src/editor/listeners.js`
- Modify: `src/ui/sidebar.js`
- Modify: `src/editor/renderer.js` — `onclick` 속성 제거

**Step 1: 에디터 영역에 이벤트 위임 설정**

```js
$('editor').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;

  switch (action) {
    case 'copy-code': copyCode(id); break;
    case 'download-code': downloadCode(id); break;
    case 'show-block-ctx': showBlockCtx(e, id); break;
    // ...
  }
});
```

**Step 2: HTML 템플릿에서 `onclick="..."` → `data-action="..." data-id="..."`로 교체**

**Step 3: 사이드바 트리에도 동일 적용**

**Step 4: `window.*` 노출 대부분 제거 (이벤트 위임으로 불필요해진 것들)**

**Step 5: 동작 확인 → 커밋**

---

### Task 5-3: 트리 열림 상태 보존

**Files:**
- Modify: `src/ui/sidebar.js`

**Step 1:** 열림 상태를 Set으로 관리

```js
const expandedNodes = new Set();

function toggleTreeNode(pageId) {
  if (expandedNodes.has(pageId)) expandedNodes.delete(pageId);
  else expandedNodes.add(pageId);
  renderTree();
}
```

**Step 2:** `renderTreeLv()`에서 `expandedNodes` 확인하여 열림/접힘 상태 복원

**Step 3: 커밋**

---

### Task 5-4: loadPage() 불필요한 렌더링 제거

**Files:**
- Modify: 해당 모듈

**Step 1:** 버전/댓글 패널은 열려 있을 때만 렌더링

```js
function loadPage(id) {
  // ...
  renderMeta();
  renderTags();
  renderBlocks();
  renderBC();
  renderTree();
  // 패널이 열려 있을 때만:
  if (state.panelType === 'versions') renderVer();
  if (state.panelType === 'comments') renderCmt();
}
```

**Step 2: 커밋**

---

## Phase 6: 아키텍처 정리

**Branch:** `refactor/phase-6-architecture`
**의존:** Phase 1, Phase 5

### Task 6-1: 중복 코드 통합

**Files:**
- Modify: `src/ui/modals.js`
- Modify: `src/editor/media.js`
- Modify: `src/editor/blocks.js`

**Step 1: 모달 목록 패턴 통합**

`showTrash()`, `showRecent()`, `showFavorites()`, `showTemplates()` → 공통 함수로

```js
function showFilteredPageList(title, filterFn, actions) {
  const filtered = state.pages.filter(filterFn);
  const html = filtered.map(p => renderPageListItem(p, actions)).join('');
  openModal(title, html || '<p>항목이 없습니다.</p>');
}
```

**Step 2: 미디어 블록 추가 패턴 통합**

`addImageBlock`, `addVideoBlock`, `addPdfBlock`, `submitFile` → 공통 `addMediaBlock(type, url, options)` 함수로

**Step 3: 블록 ID 검색 헬퍼**

```js
// src/data/store.js
export function findBlock(id) {
  return state.page?.blocks.find(b => b.id === id);
}
export function findBlockIndex(id) {
  return state.page?.blocks.findIndex(b => b.id === id);
}
```

9개+ 함수에서 중복되는 `page.blocks.find(b => b.id === id)` 패턴을 교체.

**Step 4: `submitTag()`와 `quickTag()` 통합**

**Step 5: 커밋**

---

### Task 6-2: 네이밍 개선

**Files:**
- 전체 모듈

**Step 1: 주요 약어 변경**

| 변경 전 | 변경 후 |
|---------|---------|
| `slashSt` | `slashMenuState` |
| `autoT` | `autoSaveTimer` |
| `isComp` | `isComposing` |
| `triggerAS()` | `triggerAutoSave()` |
| `renderBC()` | `renderBreadcrumb()` |
| `renderVer()` | `renderVersions()` |
| `renderCmt()` | `renderComments()` |
| `fmtD()` | `formatDate()` |
| `fmtDT()` | `formatDateTime()` |

**Step 2: 단일 문자 파라미터를 의미있는 이름으로**

```js
// 변경 전: function renderTreeLv(p, lv, el)
// 변경 후: function renderTreeLevel(pages, depth, container)
```

**Step 3: 커밋**

---

## Phase 7: 접근성 (a11y)

**Branch:** `refactor/phase-7-a11y`
**의존:** Phase 1

### Task 7-1: 시맨틱 HTML 도입

**Files:**
- Modify: `index.html`

**Step 1: HTML 구조 개선**

```html
<!-- 변경 전 -->
<div class="sidebar">...</div>
<div class="main">...</div>

<!-- 변경 후 -->
<aside class="sidebar" role="navigation" aria-label="문서 탐색">...</aside>
<main class="main" role="main">
  <header>...</header>
  <article id="editor">...</article>
</main>
```

**Step 2: 커밋**

---

### Task 7-2: ARIA 속성 추가

**Files:**
- Modify: `index.html` — 모달, 메뉴
- Modify: `src/ui/modals.js`
- Modify: `src/ui/toolbar.js`

**Step 1: 모달에 ARIA 추가**

```html
<div id="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h3 id="modal-title">...</h3>
</div>
```

**Step 2: 슬래시 메뉴에 ARIA 추가**

```html
<div id="slashMenu" role="listbox" aria-label="블록 유형 선택">
  <div role="option" aria-selected="false">...</div>
</div>
```

**Step 3: 트리에 ARIA 추가**

```html
<div role="tree" aria-label="문서 목록">
  <div role="treeitem" aria-expanded="true">...</div>
</div>
```

**Step 4: 커밋**

---

### Task 7-3: 키보드 접근성

**Files:**
- Modify: `src/ui/modals.js` — 포커스 트랩
- Modify: `src/ui/sidebar.js` — 키보드 탐색
- Modify: `src/editor/renderer.js` — `<div onclick>` → `<button>` 또는 `tabindex` + `keydown`

**Step 1: 모달 포커스 트랩**

```js
function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    if (e.key === 'Escape') closeModal();
  });
  first?.focus();
}
```

**Step 2: `<div onclick>` 인터랙티브 요소를 `<button>` 으로 교체**

**Step 3: 커밋**

---

### Task 7-4: user-scalable 및 반응형 개선

**Files:**
- Modify: `index.html` — viewport meta
- Modify: `src/styles/main.css` — 추가 breakpoint

**Step 1: `user-scalable=no` 제거**

```html
<!-- 변경 전 -->
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<!-- 변경 후 -->
<meta name="viewport" content="width=device-width,initial-scale=1">
```

**Step 2: 태블릿 breakpoint 추가 (768px~1024px)**

**Step 3: 테이블/캘린더 블록에 `overflow-x: auto` 적용**

**Step 4: 커밋**

---

## 작업 순서 요약

```
Phase 1 (기반) ──────┬──→ Phase 2 (보안) ──→ Phase 3 (데이터)
                     │
                     ├──→ Phase 4 (버그) ──→ (Phase 2-3과 병렬)
                     │
                     ├──→ Phase 5 (성능) ──→ Phase 6 (아키텍처)
                     │
                     └──→ Phase 7 (접근성)
```

## 주의사항

1. **Phase 1이 모든 것의 기반** — 코드 분리 없이는 다른 Phase를 효율적으로 진행할 수 없다
2. **각 Phase마다 별도 브랜치** 생성 후 작업, main에 병합 전 코드 리뷰
3. **Phase 2 (보안)가 가장 시급** — Phase 1 완료 후 즉시 착수
4. **테스트 우선** — 각 Task에서 가능한 경우 테스트를 먼저 작성 (TDD)
5. **WorkProgress에 Phase별 진행 기록** — `Phase_N_yyyy-mm-dd.md` 형식

### 데이터 보존 체크리스트 (Phase 2-3 필수)

| 단계 | 확인 항목 | 시점 |
|------|-----------|------|
| 백업 | `app/data` JSON 로컬 백업 완료 | Phase 2 시작 전 |
| 백업 | Firebase Console Firestore Export 완료 | Phase 2 시작 전 |
| Auth | 기존 사용자 전원 Firebase Auth 등록 확인 | Task 2-2 완료 후 |
| Auth | `app/data.users[]` 원본 변경 없음 확인 | Task 2-2 완료 후 |
| Auth | `app/userMapping` 매핑 정상 확인 | Task 2-2 완료 후 |
| Auth | 기존 ID/PW로 로그인 가능 확인 | Task 2-2 완료 후 |
| 데이터 | 전체 페이지 수 원본과 일치 확인 | Task 3-1 마이그레이션 후 |
| 데이터 | 각 페이지 블록 수 원본과 일치 확인 | Task 3-1 마이그레이션 후 |
| 데이터 | 버전/댓글 수 원본과 일치 확인 | Task 3-1 마이그레이션 후 |
| 데이터 | `app/data` 원본 문서 변경 없음 확인 | Task 3-1 마이그레이션 후 |
| 데이터 | Firebase Storage 파일 접근 가능 확인 | Task 3-1 마이그레이션 후 |
| 전환 | `USE_NEW_STRUCTURE` 플래그 전환 후 앱 정상 동작 | Phase 3 완료 후 |
| 보존 | `app/data` 원본 1개월 이상 보존 | Phase 3 완료 후 |

> **어느 단계에서든 검증 실패 시 즉시 중단하고 원본(`app/data`)으로 롤백한다.**
