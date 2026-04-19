# 코드 리뷰 — 2026-04-19

> **리뷰어:** Senior Code Reviewer (Claude)
> **대상:** AcidDocument `src/` 전체 (ES Module 34개 파일 + 테스트 6개 파일 + CSS 1개 파일)
> **대상 커밋 기준:** Phase 7 완료 시점 (리팩터링 완료, Phase 8 착수 전)
> **리뷰 방식:** 파일별 전수 조사 (샘플링 없이 34개 소스 파일 + 테스트 6개 모두 라인 단위로 읽음)

---

## 1. 전체 요약

### 리뷰 범위

| 구분 | 파일 수 | 총 라인 (대략) |
|------|---------|----------------|
| auth/ | 3 + 1 테스트 | 724 |
| config/ | 1 | 49 |
| data/ | 2 + 1 테스트 | 747 |
| editor/ | 8 + 4 테스트 | 3,148 |
| features/ | 5 + 1 테스트 | 295 |
| ui/ | 3 | 1,208 |
| utils/ | 2 + 2 테스트 | 53 |
| main.js | 1 | 364 |
| styles/main.css | 1 | 496 |
| **합계** | **소스 26 + 테스트 6 + CSS 1** | **약 7,084 줄** |

### 종합 평가

Phase 1~7 리팩터링을 통해 3,492줄의 단일 `index.html`이 ES Module 기반 멀티파일 구조로 잘 분해되었다. Vitest 기반 테스트(85개), DOMPurify를 통한 XSS 방어, Firebase Auth 호환 레이어, PBKDF2 비밀번호 해싱, 접근성 개선(ARIA, 포커스 트랩) 등 계획서의 주요 목표 대부분이 달성되어 있어 **코드 품질의 기반은 양호**하다.

그러나 **프로덕션 수준에는 미치지 못한다.** `firestore.rules`에서 `app/data`가 **공개 읽기 허용(`allow read`)** 상태여서 비밀번호 해시·모든 페이지 데이터가 비로그인 사용자에게 노출된다. 또한 계획 단계의 "부분 렌더링"은 개별 블록 업데이트 API(`updateBlock`, `insertBlockEl`)가 만들어졌지만 실제 사용처가 없고 대부분 경로가 `renderBlocks()` 전체 리렌더로 돌아간다. `onclick` 인라인 핸들러가 슬라이드/차트/달력/목차/사이드바 컨텍스트 메뉴에서 수십 곳에 남아 있어 Phase 5-2 "이벤트 위임"도 완료되지 않았다. 관리자 UI에서는 마이그레이션 전 사용자의 **평문 비밀번호가 노출되는 경로**가 그대로 유지되고 있다. Phase 8(편의성 기능) 착수 전에 이 중 보안 3건은 반드시 해결해야 한다.

코드를 모르는 사용자에게 한 줄 요약: **골조는 잘 세워졌지만, 지붕에 아직 구멍(보안 규칙)과 덜 마감된 부분(인라인 이벤트)이 남아 있다.** Phase 8을 시작해도 무방하지만 아래 Critical 3건은 병행 또는 선행 수정 권장.

---

## 2. 강점 (Strengths)

Phase 1~7 리팩토링이 남긴 긍정적 결과:

1. **모듈 경계가 깔끔하게 분리됨** — `auth`, `config`, `data`, `editor`, `features`, `ui`, `utils` 폴더 구분이 일관되고 import 경로가 순환 참조 없이 대부분 단방향이다. `listeners.js` 등 일부 모듈에서 `sidebar.js`를 `import('./sidebar.js').then(...)` 동적 import로 처리해 순환 의존을 회피한 설계는 훌륭하다.
2. **상태 중앙화 성공** — `data/store.js` 단일 모듈에 모든 전역 상태(40개 키)를 모은 덕분에 기능 추가 시 "어느 변수에 저장하지?"를 고민할 필요가 없다.
3. **XSS 방어 레이어 설치** — `sanitize.js`의 `sanitizeHTML`/`sanitizeURL`, DOMPurify 허용 리스트, 블록 저장/로드 양쪽에서 sanitize 적용. 29개의 XSS 테스트 케이스(sanitize.test.js)로 커버됨.
4. **비밀번호 강화** — 평문 → SHA-256 → PBKDF2(10만 iter) 점진 마이그레이션 구조가 `crypto.js`에 잘 설계되어 있다. `isLegacyHash()` 판별 후 자동 승격(`migrateUserPassword`)이 자연스럽다.
5. **접근성 기본기 확보** — `modals.js:16` `trapFocus`, `openModal`/`closeModal`의 focus 복원, 트리/모달/슬래시 메뉴의 ARIA 속성 부여, `user-scalable=no` 제거 등 Phase 7 목표가 실제 구현되어 있다.
6. **데이터 호환 레이어 구축** — `USE_NEW_STRUCTURE` 플래그, `convertRowsForSave`/`convertRowsForLoad`의 JSON 직렬화, `loadPageFull` 서브컬렉션 분리 등이 구조 변경 중에도 구 데이터를 안전하게 읽도록 설계되어 있다.
7. **테스트 기반 구축** — `pushUndo`/`undo`/`redo`, `hasChanges`, `reorderBlock`, `sortTable`, `firestoreCall`/`batchDeletePages`, `getBacklinks`, `sanitizeHTML` 등 핵심 로직 85개 테스트로 커버.
8. **이벤트 리스너 메모리 관리** — `resetAppState()`가 타이머/인터벌을 모두 정리하고 `logout()` 시 명시적으로 호출됨. SPA 로그아웃 후 누수 방지.

---

## 3. Critical 이슈 (즉시 수정 필요)

### C-1. Firestore 규칙: `app/data` 공개 읽기 허용 — **심각한 데이터 노출**

**파일:** `firestore.rules:5-7`

```
match /app/data {
  allow read;
  allow write: if request.auth != null;
}
```

**문제:** `allow read;` 는 **비로그인 포함 모든 사용자**에게 읽기를 허용한다. `app/data` 문서에는 `users[]` 배열(각 사용자의 `id`, `pwHash`, `pwSalt`, `nickname`, `role`, `active` 포함)과 삭제 로그·IP 로그가 모두 담겨 있다. 누구든 Firestore REST 엔드포인트로 `GET https://firestore.googleapis.com/v1/projects/aciddocument/databases/(default)/documents/app/data`를 호출하면:

- 전체 사용자 ID 목록 획득 → 무차별 대입 공격 표적화
- PBKDF2 해시와 salt 획득 → 오프라인 GPU 크래킹
- 레거시 평문 `pw` 필드가 아직 남아 있다면 그대로 노출

**근거:** `firestore.js:240` `initDB`는 로그인 전에 이 문서를 읽는데, 이는 "로그인 화면에 사용자 목록을 표시" 때문이 아니라 **레거시 호환**(`users[]`로부터 `findLegacyUser`로 로그인) 때문이다. 공개 읽기로 풀어둘 필연성이 없다.

**수정 예시:**

```
// firestore.rules
match /app/data {
  // users 배열이 든 문서는 인증된 사용자만 읽기
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin','super'];
}
```

그리고 `firestore.js:initDB`를 호출 순서를 바꿔 "Firebase Auth 로그인 성공 → initDB" 로직으로 정리한다. 이미 `main.js:119-205`에서 onAuthStateChanged 이후 `initDB` 재시도 플로우가 있으므로 규칙만 바꿔도 대부분 동작한다.

**코드를 모르는 사용자에게:** 지금은 집 대문에 "열쇠는 현관 매트 아래"라고 써 붙여둔 상태입니다. 매트(Firestore 규칙)를 치워야 합니다.

---

### C-2. 관리자 화면에서 레거시 사용자의 **평문 비밀번호 노출**

**파일:** `src/ui/modals.js:305-315` (`togglePwView`)

```js
export function togglePwView(userId){
  ...
  if(el.textContent==='••••••'){
    if(u.pwHash){el.textContent='[SHA-256 해시됨]'}
    else if(u.pw){el.textContent=u.pw+' [마이그레이션 필요]'}
  }else{el.textContent='••••••'}
}
```

**문제:** 아직 PBKDF2 해시로 마이그레이션되지 않은 사용자 계정의 `u.pw`(평문)를 관리자 설정 화면의 `<code id="pw_...">` DOM에 그대로 삽입한다. 화면 공유·세션 기록·클립보드 탈취·브라우저 캐시 등으로 유출될 수 있고, "최고 관리자도 타 사용자 비밀번호를 알아선 안 된다"는 기본 원칙(Zero-Knowledge) 위배.

**근거:** `renderUsers()`(modals.js:276)가 관리자 탭을 그릴 때 `pw_<userId>` 엘리먼트를 만들고, `togglePwView`가 해당 요소의 textContent를 평문으로 교체한다. "마이그레이션 필요"라는 라벨은 노출 해명이 되지 않는다.

**수정 예시:**

```js
export function togglePwView(userId){
  var el=$('pw_'+userId);
  if(!el)return;
  var u=null;
  for(var i=0;i<state.db.users.length;i++){if(state.db.users[i].id===userId){u=state.db.users[i];break}}
  if(!u)return;
  if(el.textContent==='••••••'){
    if(u.pwHash && u.pwHash.startsWith('pbkdf2:')) el.textContent='[PBKDF2 해시됨]';
    else if(u.pwHash) el.textContent='[SHA-256 해시됨 — 재로그인 시 PBKDF2 업그레이드 예정]';
    else el.textContent='[비밀번호 초기화 필요 — 마이그레이션되지 않은 레거시 계정]';
  }else{
    el.textContent='••••••';
  }
}
```

관리자가 해당 계정의 평문을 알 수단이 반드시 필요하면, `resetPw()` 버튼(modals.js:337)이 이미 존재하므로 이를 사용하면 된다. 눈으로 확인할 수단은 제거해야 한다.

---

### C-3. 드래그 드롭 시 PDF/일반 파일 `imageStorage` 설정 무시 → base64 하드코딩

**파일:** `src/editor/listeners.js:1321-1335`

```js
}else if(file.type==='application/pdf'){
  var reader=new FileReader();
  reader.onload=function(ev){addPdfBlock(ev.target.result)};
  reader.readAsDataURL(file)
}else{
  var reader=new FileReader();
  (function(f){
    reader.onload=function(ev){
      pushUndoImmediate();
      var b={id:genId(),type:'file',url:ev.target.result,name:f.name};
      state.page.blocks.push(b);renderBlocks();triggerAutoSave()
    }
  })(file);
  reader.readAsDataURL(file)
}
```

**문제:** Phase 4 Task 4-3은 이미지 드래그 드롭에 `imageStorage` 설정을 반영했지만, PDF·일반 파일은 **항상 base64**로 저장된다. 결과:

1. 10MB PDF를 드래그 드롭 → Firestore 문서에 base64(약 13MB)가 저장 → **Firestore 문서 크기 1MB 한도 초과 에러**
2. `MAX_FILE_SIZE`(firebase.js:14, 10MB) 체크 누락
3. `ALLOWED_FILE_TYPES` 검증도 없음 → 악성 `.exe` 등도 삽입 가능
4. Storage 사용량 카운터(`storageUsage`) 미반영

**모달 경유도 동일 문제:** `media.js:299-304` `submitPdf()`, `media.js:332-342` `submitFile()`, `media.js:279-283` `submitVideo()` 모두 `reader.readAsDataURL` 로 base64 저장. 결국 이미지만 storage 경로가 있고 PDF/Video/File은 경로 자체가 없다.

**수정 예시:**

```js
// listeners.js PDF 드롭
}else if(file.type==='application/pdf'){
  var mode=state.db.settings.imageStorage||'storage';
  if(mode==='storage'){
    uploadToStorage(file,'pdfs',ALLOWED_FILE_TYPES).then(function(result){
      addPdfBlock(result.url);
    }).catch(function(err){toast(err.message||'업로드 실패','err')});
  }else{
    var reader=new FileReader();
    reader.onload=function(ev){addPdfBlock(ev.target.result)};
    reader.readAsDataURL(file);
  }
}
```

그리고 `media.js` 의 `submitPdf`/`submitFile`/`submitVideo`도 동일 패턴으로 통일한다. 기존 `submitImage`(media.js:23-41) 코드를 참조해 복제하면 된다.

---

### C-4. export.js: 에디터 innerHTML을 sanitize 없이 `document.write`

**파일:** `src/features/export.js:14, 22, 59, 62, 130`

```js
var html='<!DOCTYPE html>...<body><h1>'+esc(title)+'</h1><div>'+$('editor').innerHTML+'</div></body></html>';
// ...
printWin.document.write(html);
```

**문제:** `$('editor').innerHTML`은 DOM 상태 그대로의 HTML이다. Phase 2에서 `sanitizeHTML`은 `collectBlocks()` 저장 시점에 적용되지만, **렌더링된 DOM에는 `onclick`, `onchange` 같은 속성이 `renderer.js`에 의해 직접 삽입**된다(예: `renderer.js:171`의 `onclick="openImageViewer([...])"`, `media.js:132` 슬라이드 onclick, `calendar.js:73` `onclick="openCalEventAdd"`). 이 HTML이 새 창으로 그대로 복제되면:

1. 슬라이드 블록의 `onclick="slideTo(...)"` 등이 새 창에서 동작 시도 → `ReferenceError` 발생 또는 `window.openImageViewer`가 정의되지 않아 런타임 에러
2. 인쇄 미리보기 창이 열리지만 실제로 내보내진 PDF/HTML에 스크립트 핸들러가 박혀 있어 배포 시 XSS 벡터가 될 수 있음 (받은 사람이 파일을 브라우저로 열면 작동)
3. `<iframe>` 같은 차단 태그가 여전히 들어간 경우 popup 창에서 렌더됨

**수정 예시:**

```js
// 공통 sanitize
function getPrintableHTML(){
  var editor=$('editor').cloneNode(true);
  // 상호작용 요소 제거
  editor.querySelectorAll('[onclick],[onchange],[onerror]').forEach(function(el){
    el.removeAttribute('onclick');
    el.removeAttribute('onchange');
    el.removeAttribute('onerror');
  });
  editor.querySelectorAll('.block-handle,.block-add-below,button').forEach(function(el){el.remove()});
  return editor.innerHTML;
}
```

근본 해결은 C-5(아래)처럼 renderer의 onclick 인라인을 모두 `data-action` 위임으로 전환하는 것이다.

---

### C-5. 많은 곳에 `onclick` 인라인 — Phase 5-2 "이벤트 위임" 미완료

**파일:** `src/editor/renderer.js:171,183,206`(미완), `src/editor/media.js:132,139,140,147,154,155,161,165,166,168`, `src/editor/calendar.js:18,19,20,73,104,140,149`, `src/editor/chart.js:15,99,100,101,104`, `src/editor/blocks.js:273`, `src/ui/sidebar.js:44,51,53,54,73,210,284,287,291,295-297,346,424,430-447,462,463,471,476,477,478`, `src/ui/modals.js:210,284,287,291,295-297,336-339,475`, `src/ui/toolbar.js:27,55,105,136`, `src/features/search.js:40`, `src/features/pagelink.js:63,83`

**문제:** Phase 5-2는 "HTML 템플릿에서 `onclick="..."` → `data-action` 교체"를 요구했으나, 실제로는 에디터 영역(`renderer.js` 일부 + `listeners.js:1083-1106`)만 위임 구조로 바꿨다. 슬라이드 블록·캘린더·차트·사이드바 컨텍스트 메뉴·모달·검색·페이지링크 전부 `onclick="functionName(...)"` 인라인으로 남아 있고, 이것이 `main.js:208-358`의 거대한 `window.* = ...` 블록(**140개 이상의 전역 노출**) 원인이다.

**파급 효과:**
- 번들 크기 최적화 불가 (tree-shaking 무력화)
- XSS 위험 (사용자 입력이 섞일 때 `'`→`\'` 이스케이프가 완벽하지 않음; 예 `sidebar.js:424` `onclick="loadPage(\''+id+'\')"`, id에 `'` 포함 시 깨짐)
- CSP 적용 불가 (`script-src 'unsafe-inline'` 필수)
- popup window export(C-4)와 결합해 실제 XSS 벡터

**구체 XSS 벡터 — 문자열 이스케이프 결함:**

`sidebar.js:44`:
```js
html+='<span class="tag" onclick="removeTag(\''+esc(state.page.tags[i])+'\')">...</span>';
```
`esc`는 HTML-entity 이스케이프(`<`→`&lt;`)만 한다. 태그 값이 `a');alert(1);//`이면:
1. `esc('a\');alert(1);//')` → `a\');alert(1);//` (esc는 `'`을 바꾸지 않음; div.innerHTML로 변환하지만 **작은따옴표는 이스케이프 대상이 아님**)
2. 결과 HTML: `onclick="removeTag('a');alert(1);//')"`
3. 클릭 시 `alert(1)` 실행

**확인 방법:** 콘솔에서 `var d=document.createElement('div'); d.textContent="a');alert(1);//"; d.innerHTML` 실행 → `"a');alert(1);//"` 반환 (작은따옴표 그대로).

`submitTag()`가 `'`를 막지 않으면 공격 가능. `sidebar.js:59` `submitTag`는 `t=$('tagInput').value.trim()` 후 검증 없음.

**수정 예시 (부분):**

```js
// sidebar.js renderTags 개선
export function renderTags(){
  var html='';
  for(var i=0;i<state.page.tags.length;i++){
    html+='<span class="tag" data-action="removeTag" data-tag="'+esc(state.page.tags[i])+'">'+esc(state.page.tags[i])+' ×</span>';
  }
  // ...
  $('pageTags').innerHTML=html;
}
// 한 번만 등록
$('pageTags').addEventListener('click',function(e){
  var el=e.target.closest('[data-action]');
  if(!el)return;
  if(el.dataset.action==='removeTag')removeTag(el.dataset.tag);
});
```

Phase 8에 앞서 **최소한 보안과 직결되는 사이드바 컨텍스트 메뉴, 태그, 페이지 링크 목록**(사용자 입력이 문자열에 섞이는 곳)은 위임 구조로 전환 필수.

---

## 4. Important 이슈 (Phase 8 전 수정 권장)

### I-1. `saveCurrent`/`saveDoc`의 **중복 Firestore 쓰기**

**파일:** `src/editor/blocks.js:12`, `src/ui/sidebar.js:192`, `src/ui/modals.js:476`(selectIcon), 기타 다수

```js
// blocks.js:12
export function saveCurrent(){...p.updated=Date.now();import('../data/firestore.js').then(function(m){m.saveDB();m.savePage(p)})}
```

`saveDB()`는 `app/data` 전체 문서를 set, `savePage(p)`는 `pages/{id}` 문서를 set한다. 페이지 편집마다 Firestore에 **두 번 write**한다. USE_NEW_STRUCTURE=false 경로에선 `saveDBLegacy`가 `pages` 필드를 제외해 저장하지만, 그래도 `users`, `ipLogs`, `deleteLogs`, `settings` 등 비페이지 데이터 전체를 매번 다시 쓴다. 자동저장 인터벌(1.5초)마다 발생하므로 **요금 폭증·Firestore 쓰기 한도 근접·race condition** 위험.

**수정:** 페이지 저장 경로에선 `savePage(p)`만, 설정/사용자 변경 경로에선 `saveDB()`만 호출하도록 분리. `saveDoc`(sidebar.js:181)과 `saveCurrent`(blocks.js:12)의 `saveDB()` 호출을 제거.

### I-2. `hasChanges`가 `editBackup.blocks`와 `collectBlocks()`의 **ID 순서 차이**에 민감

**파일:** `src/ui/sidebar.js:218-228`

```js
for(var i=0;i<current.length;i++){
  if(JSON.stringify(current[i])!==JSON.stringify(backup[i]))return true;
}
```

순서가 변경되면(블록 이동) 내용이 같아도 changed=true. 의도된 것일 수 있으나, 키 삽입 순서가 다른 객체 JSON(`{type,content}` vs `{content,type}`)은 같지 않다고 판단. `blocks.js:194` `JSON.parse(JSON.stringify(orig))` 복제는 순서를 유지하나, sanitize/undo 과정에서 키 순서가 바뀌면 거짓 양성. 운영 중 "변경사항 없음인데 저장 다이얼로그" 발생 가능성.

**수정:** 비교 전 키 정렬:
```js
function canonicalStringify(obj){
  return JSON.stringify(obj, Object.keys(obj).sort());
}
```
또는 각 필드별로 비교.

### I-3. 버전 ID 충돌 방지가 일부만 적용 — `restoreVer`/`deleteVer` `==` 비교

**파일:** `src/features/versions.js:11-12`

```js
if(state.page.versions[i].id==vid){v=...}
state.page.versions=state.page.versions.filter(function(v){return v.id!=vid});
```

Phase 4 Task 4-5는 버전 ID를 `genId()` 또는 `Date.now()`로 변경하라고 했다. 실제 `sidebar.js:189`는 `id:genId()`로 생성하지만, `restoreVer`/`deleteVer`는 **루즈 비교 `==` / `!=`**를 사용. 이는 구 방식(숫자) → 새 방식(문자열) 혼재 데이터에 대한 하위호환인데, 의도를 주석으로 남기지 않으면 `===`로 교체될 우려. 주석 추가 + 마이그레이션 후 `===` 회귀 테스트 필요.

### I-4. `initDB` 경로에서 **자동 마이그레이션이 인증 전에 실행**되면 실패

**파일:** `src/data/firestore.js:238-341`

`initDBLegacy`는 `app/data` 읽기 → `pages` 컬렉션 읽기(현재 공개 아니면 실패) → `pagesSnap`이 비어 있고 `state.db.pages.length>0` 이면 `migratePagesTocollection` 실행. 그러나 `pages` 쓰기 규칙은 `allow read, write: if request.auth != null;` 이므로 **인증 전에 마이그레이션이 실패**한다. 현재는 `.catch(function(err){console.error(...)})`로 삼켜지고 앱은 기존 메모리만 사용한다. 즉 "첫 로그인 전까지는 절대 마이그레이션이 일어나지 않는" 상태인데, 이를 의도한 것인지 코드에서 불분명. 로그인 후 다시 `initDB`를 호출하는 경로도 없어(`main.js:135-139`에서 `initDB()` 재시도하지만 이미 `USE_NEW_STRUCTURE=false`면 같은 경로 반복) **영원히 레거시 구조에 머물 가능성** 있음.

**권장:** 로그인 완료 시점에 명시적으로 `migratePagesTocollection`을 한 번 호출하는 boot 로직을 `initApp`에 추가.

### I-5. 로그인 시도 실패 **경쟁 조건(race)** — 잠금이 2회 이상 덮어써짐

**파일:** `src/auth/auth.js:282-324`

`Firebase Auth signInWithEmailAndPassword` 실패 → `findLegacyUser` 실패 → `serverSt.attempts++` → `updateLoginLockState(id, serverSt)`. 그런데 `getLoginLockState`는 호출 시점에 Firestore에서 한 번 읽어온 값이므로, 두 개의 탭에서 동시에 로그인 실패를 시도하면 각 탭이 같은 `serverSt.attempts=3` 을 읽고 각각 4로 만들어 `set`한다. 실제 실패는 2회지만 카운터는 4. Firestore `FieldValue.increment(1)`를 써야 원자적.

**수정:** `firestore.collection('app').doc('loginLocks').collection('locks').doc(loginId).update({attempts: firebase.firestore.FieldValue.increment(1)})`.

### I-6. `sanitizeHTML` 허용 태그에 `font` + `color` — 구버전 HTML

**파일:** `src/utils/sanitize.js:7-8`

```js
ALLOWED_TAGS: ['b', 'i', 'u', 's', 'a', 'br', 'span', 'code', 'mark', 'sub', 'sup', 'font'],
ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'data-tag-color', 'data-user', 'data-page-id', 'color'],
```

HTML5에서 `<font>`는 deprecated. `document.execCommand('foreColor', ...)`가 구형 브라우저에서 `<font color>` 생성하므로 포함한 듯하지만, 현재 Chrome/Firefox는 `<span style="color:...">`를 생성. 장기적으로 `<font>` 제거하고 `style` 속성의 `color:` 처리에 의존하도록 검토.

### I-7. `loadPages()` 메모리 누수 조건

**파일:** `src/data/firestore.js:417-432`

```js
export function loadPages(){
  if(state.db.pages&&state.db.pages.length>0)return Promise.resolve();
  ...
}
```

`state.db.pages.length > 0` 체크는 이미 일부 페이지가 있으면 재로드하지 않는 최적화이나, 사용자가 다른 탭에서 페이지 추가 → 현재 탭 `loadPages`는 건너뜀 → 최신 상태 반영 안됨. 초기화 외 경로에선 강제 리로드 옵션 필요.

### I-8. `copyImageUrl` 크로스오리진 캔버스 오염

**파일:** `src/editor/media.js:76-103`

`img.crossOrigin='anonymous'` → Firebase Storage가 CORS 헤더를 반환하지 않으면 canvas가 tainted → `canvas.toBlob` 실패 → catch에서 URL 복사로 폴백. 동작은 하지만 `toBlob`이 null을 반환하는 경우(토스트 없음) 사용자 피드백 없이 조용히 실패한다.

**수정:** `if(!blob){ toast('URL만 복사됩니다','warn'); navigator.clipboard.writeText(b.src); return; }`.

### I-9. Phase 5 Task 5-1 "부분 렌더링" — 만들었으나 실사용 없음

**파일:** `src/editor/renderer.js:75-109` (updateBlock, insertBlockEl, removeBlockEl 정의), `src/editor/blocks.js:116,140,153` (insertBlockEl/removeBlockEl 일부 사용)

`updateBlock`은 **전혀 호출되지 않음**(grep으로 확인; renderer.js에서 export만 하고 사용처 없음). `insertBlockEl`과 `removeBlockEl`은 `insertBlock`, `deleteBlock`, `dupBlock`에서 사용되지만 대부분의 상태 변경(`moveBlockUp`, `changeBlockType`, Enter 키, Backspace 병합, Tab indent, 드래그 재배치, 테이블 편집, 미디어 추가 등)은 **여전히 `renderBlocks()` 전체 리렌더**를 호출한다. `listeners.js`와 `blocks.js`에서 `renderBlocks()` 호출이 40회 이상. 효과가 거의 없다.

**권장:** Phase 8에서 성능이 문제되는 경우(슬라이드 자동 재생, 대용량 페이지 편집)에만 선택적으로 `updateBlock`을 적용. 현재 상태면 `updateBlock`을 dead code로 제거하거나, TODO 주석으로 도입 예정임을 명시.

### I-10. 드래그 블록 정렬에서 DOM → state 동기화 시 **테이블/컬럼 블록 누락**

**파일:** `src/editor/listeners.js:1266-1278`

```js
// 드래그 전 현재 편집 중인 DOM 내용을 state에 동기화
for(var si=0;si<edChs.length;si++){
  ...
  var sCon=sEl.querySelector('.block-content');
  if(sCon)state.page.blocks[sj].content=sanitizeHTML(sCon.innerHTML);
}
```

`.block-content`만 동기화하므로 테이블 셀(`<th>/<td>`), 컬럼(`.block-col-content`), 이미지 캡션 편집 중 드래그 → 편집 내용 증발. 드래그 완료 후 `collectBlocks`를 호출하면 해결되는데 `reorderBlock`에선 호출하지 않음.

---

## 5. Minor 이슈 (여유 될 때)

### M-1. Firebase API 키가 소스 코드에 노출

**파일:** `src/config/firebase.js:3`

```js
var firebaseConfig={apiKey:"AIzaSyBqHTIoLGKnCnR8n8jFGS3a4LGhIJe5xQI",...};
```

Firebase 클라이언트 API 키는 **설계상 공개되어야 한다** (Security Rules가 진짜 보호). 따라서 이 자체는 취약점이 아니다. 다만 Git 저장소에 커밋되어 있으면 키가 노출된 사실이 감사 자동 스캐너에 걸릴 수 있어, `.env` + `import.meta.env.VITE_FIREBASE_API_KEY` 방식으로 주입하는 것이 업계 관행.

### M-2. `helpers.js:6-14` 모든 함수가 **한 줄로 minify** — 가독성 저하

Phase 1 원본 인라인 코드를 그대로 옮긴 흔적. 디버깅/수정 시 줄바꿈이 없어 스택트레이스가 무의미.

```js
// Before (line 12):
export function toast(m,t){t=t||'ok';var w=$('toastWrap'),e=document.createElement('div');e.className='toast '+t;var ic={ok:'✅',err:'❌',warn:'⚠️'};e.innerHTML='<span style="font-size:18px">'+(ic[t]||'💬')+'</span><span style="font-size:14px">'+esc(m)+'</span>';w.appendChild(e);setTimeout(function(){e.style.opacity='0';setTimeout(function(){e.remove()},200)},3000)}
```

Vite가 어차피 min화하므로 소스는 가독성 우선으로 풀어야 한다.

### M-3. `migrateImages` 내부에 `confirm`/`alert` 직접 사용

**파일:** `src/ui/modals.js:74, 110` 등

모달 UI가 있는 앱인데 네이티브 `confirm`/`alert` 사용. 일관성 저하 + 포커스 복원 실패(`trapFocus` 우회). Phase 7 a11y 목표와 어긋남. 브라우저에 따라 "이 페이지에서 추가 대화상자 생성 차단" 옵션이 켜지면 동작하지 않음. `deletePage`는 이미 모달(`deleteConfirmModal`)로 처리하므로 동일 패턴을 전파.

### M-4. `esc()`가 textContent 기반이라 `'`는 이스케이프되지 않음

**파일:** `src/utils/helpers.js:9`

```js
export function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
```

innerHTML이 반환하는 값은 `&`, `<`, `>`, `"`(특정 브라우저)만 엔티티 변환한다. `'`는 **그대로 유지**. onclick 인라인에 값 삽입 시 위험(C-5 참조). 별도 `escJs()` 필요:

```js
export function escJs(s){return String(s||'').replace(/['\\]/g,'\\$&')}
```

또는 아예 인라인 onclick 사용을 폐기(근본 해결).

### M-5. `showSlash()`의 하드코딩된 위치

**파일:** `src/ui/toolbar.js:41`

```js
export function showSlash(el){var menu=$('slashMenu');menu.style.left='320px';menu.style.top='auto';menu.style.bottom='200px';...}
```

`el` 인자를 받지만 위치 계산에 사용하지 않음. 슬래시 메뉴가 항상 화면 좌측 하단 근처에 뜸. 사이드바 접힌 경우·모바일에서 어색. `el.getBoundingClientRect()` 기반 동적 위치 권장.

### M-6. `renderUsers()`에서 사용자 ID의 문자열 리터럴 직접 삽입

**파일:** `src/ui/modals.js:284-302`

```js
html+=' <button onclick="showChangeIdInput(\''+u.id+'\')">...';
```

`validateUserId`가 `/^[a-zA-Z0-9_]+$/`로 제한하므로 현재는 안전하지만, 마이그레이션 이전에 생성된 레거시 ID가 이 규칙을 통과했는지 불명. `escJs(u.id)` 또는 data-attribute 방식으로 변경.

### M-7. 빈 번들 내보내기 (`editor event 'change'`)

**파일:** `src/editor/listeners.js:1109-1112`

```js
$('editor').addEventListener('change',function(e){
  var target=e.target.closest('[data-action]');
  if(!target)return;
});
```

`target` 확인만 하고 아무 동작 없음. 미사용 dead handler. 원래 chart 입력의 `onchange`를 위임하려고 뼈대만 만든 흔적.

### M-8. `saveCurrent`와 `saveDoc`의 버전 적립 분기

**파일:** `src/editor/blocks.js:12` vs `src/ui/sidebar.js:181-193`

`saveCurrent`(자동저장)는 `p.versions.push`를 하지 **않는다**. `saveDoc`(수동 저장)만 버전 기록. 의도된 것이지만 주석 없음. Phase 8에서 자동저장 주기를 바꾸거나 버전 정책을 수정할 때 혼동 가능.

### M-9. `downloadImage`의 파일명 하드코딩

**파일:** `src/editor/media.js:106-115`

```js
a.download='image_'+Date.now()+'.png';
```

실제 파일이 jpg/gif/webp일 수 있음. `b.src`의 확장자 또는 `b.name` (있다면) 사용 필요.

### M-10. 테스트 가독성 — 한글 문자열 이스케이프

**파일:** `src/editor/__tests__/blocks.test.js:51,76,78,80,83,...`

`'\ud14c\uc2a4\ud2b8'` 유니코드 이스케이프로 한글이 저장되어 있다. IDE 인코딩 문제 회피 의도로 보이나 가독성 크게 저하. UTF-8로 저장하면 해결.

### M-11. `listeners.js:1317,1322` 내부 `reader` 변수 재선언 누수

```js
}else if(file.type==='application/pdf'){
  var reader=new FileReader();
  ...
}else{
  var reader=new FileReader();  // ← 같은 이름
  ...
}
```

함수 스코프에서 hoisting되어 동작은 하지만, 다중 파일 드롭 시 `for(var i ...)` 루프 내부에서 `var`이 같은 스코프를 공유하므로 `reader.onload` 클로저가 마지막 `file`만 참조할 위험. 현재 `(function(f){...})(file)` IIFE로 우회했지만 한 곳은 빠짐(1317번 라인 PDF 경로). 다중 PDF 드롭 시 마지막 것만 반영될 수 있음.

### M-12. `deleteTable` 모달 재진입 버그 가능성

**파일:** `src/editor/table.js:247-258`

```js
state.deleteTableId=id;
...
state._deleteTableConfirm=function(){...};
openModal('deleteConfirmModal');
```

`state._deleteTableConfirm`이 페이지 삭제(`confirmDelete` sidebar.js:240)와 공유되는 모달에 콜백을 심는 구조. 만약 사용자가 표 삭제 모달을 띄운 상태에서 페이지 삭제를 눌러 `deleteTargetId`가 덮어쓰이면, 둘 중 하나가 원치 않게 실행될 수 있음. 현재 `confirmDelete`가 `_deleteTableConfirm` 우선이므로 페이지 삭제가 안 될 수 있다.

### M-13. `crypto.js:3` PBKDF2 iteration 10만 — 상향 여지

OWASP 2023 권장 PBKDF2-SHA256 iteration: **600,000**. 10만은 2020년 기준이나 2026년엔 낮다. 모바일 성능 고려해도 300,000 정도로 상향 권장.

### M-14. `listeners.js:1114-1132` `document.addEventListener('click', ...)` — 중복 등록 위험

`setupListeners()`가 여러 번 호출되면 document-level click 리스너가 누적된다. `init()`에서 한 번만 호출되어 현재는 문제없지만 HMR(Hot Module Reload) 개발 환경에서 누적 발생 가능.

### M-15. `sidebar.js:338` `expandedNodes=new Set()` — 페이지 새로고침 시 초기화

Phase 5-3 "트리 열림 상태 보존"은 내부 state로 Set을 만들었지만 **localStorage에 저장하지 않음**. 페이지 이동이나 새로고침 시 모두 닫힘. Task 5-3 원문은 Set 사용만 명시해 완료로 간주한 듯하나, UX 관점에선 영속화 필요.

### M-16. `listeners.js:1175` beforeunload의 **내용 비교가 title/icon만**

```js
window.addEventListener('beforeunload',function(e){
  if(state.editMode){
    if(state.editBackup){
      if($('pageTitle').value!==state.editBackup.title||$('pageIcon').textContent!==state.editBackup.icon){
        e.preventDefault();e.returnValue='작성 중인 내용이 저장되지 않았습니다.';return e.returnValue
      }
    }
  }
});
```

**블록 내용이 바뀌어도 검출 못함.** `hasChanges()` 재사용해야 하나 "circular deps 회피"로 인라인했다는 주석(1177번)이 있다. `hasChanges`를 `helpers.js`나 새 `editor/dirty.js`로 분리하면 해결.

### M-17. `chart.js`/`calendar.js`에 `renderBlocks` 의존 → 차트 데이터 하나 바꿀 때마다 전체 리렌더

`updateChartData`(chart.js:111) → `renderBlocks()` → 페이지의 모든 블록 재생성. 차트 블록 하나만 교체하면 되는데 전체. Phase 5-1 (부분 렌더링) 적용 대상.

### M-18. `listeners.js:488-492` 테이블 셀 내부 줄바꿈 붙여넣기 시 공백으로 치환

테이블 셀에 여러 줄 텍스트를 붙여넣으면 `\n`이 공백으로 대체된다. 의도 맞지만 사용자 입장에선 예상치 못함. `document.execCommand('insertText', false, txt.replace(/\n/g,'<br>'))`도 옵션.

---

## 6. Nitpick (선택)

### N-1. 스타일 일관성: 함수 선언 스타일 혼재

`export function name(){}` vs `export function name(){var ...}` 줄바꿈 여부, `for(var i=0;...)` vs `for (var i = 0;...)` 공백 여부 등이 파일마다 다름. Prettier 도입 제안.

### N-2. `store.js:27` `colWidthTableId` — 한 번만 사용되고 폐기된 듯

`Grep "colWidthTableId"` 결과: store.js와 resetAppState에서만 참조. 과거 로직의 잔재로 추정.

### N-3. `listeners.js:1153` COLOR_MAP을 **handleKey 외부**에서 정의하면 매 keydown마다 재생성 안 함

마이크로 최적화이나 루프 돌 필요 없이 모듈 상단으로 이동 가능.

### N-4. `toolbar.js:115` filterEmoji가 사실상 아무 필터링도 안 함

```js
export function filterEmoji(q){
  var items=$$('#emojiGrid .emoji-item');
  for(var i=0;i<items.length;i++)items[i].style.display='';
}
```

쿼리를 받지만 다 보여준다. 주석대로 "이모지 텍스트 검색 어려움" 이유지만 함수를 아예 제거하거나 TODO 남기기.

### N-5. 테스트 파일 네이밍 비일관

`blocks.test.js`, `dragdrop.test.js`, `history.test.js`, `table-sort.test.js` 에 하이픈/소문자 혼재. `table-sort` → `table_sort` 또는 `tableSort` 등 하나로 통일 권장.

### N-6. `loginDebug.js`에 Windows 콘솔 컬러 CSS가 남음

개발 편의용이나, 프로덕션에서도 `console.log`가 실행됨. `if(!isEnabled()) return;`이 있어 실제 출력은 안 되지만 각 호출마다 오버헤드 미세 발생. 번들 최적화 시 build 타임에 tree-shake 대상으로 분리 가능.

### N-7. `renderer.js:17 LIST_TYPES_SET`은 배열인데 이름이 `_SET`

실제 Set이 아니고 `.indexOf` 검사용 배열. `LIST_TYPES`로 단순화.

### N-8. `firebase.js:21-27` SLASH 정의의 키 축약(`s`, `i`, `t`, `c`, `n`, `d`) — 가독성 저하

`{section, items, type, caption, name, description}`로 풀면 자기 설명적.

### N-9. `calendar.js:12` `b.year||2026` — 2026 하드코딩

`new Date().getFullYear()` 가 타당.

### N-10. `media.js:131-135` 슬라이드 이미지 onclick에 **편집 모드일 때는 빈 문자열**

```js
html+='<div class="block-slide-item" onclick="'+(state.editMode?'':'openImageViewer(...)')+'">';
```

`onclick=""`가 DOM에 남음. 조건부로 속성 자체를 생성해야 함.

---

## 7. 테스트 커버리지 분석

### 커버된 영역 (85개 테스트)

| 영역 | 파일 | 테스트 수 | 상태 |
|------|------|-----------|------|
| 유틸 (genId, esc, formatDate, formatBytes, highlightText, loginState) | helpers.test.js | 23개 | 양호 |
| XSS sanitize (tag/attr whitelist, URL scheme) | sanitize.test.js | 29개 | 매우 좋음 |
| 인증 상태 관리 (resetAppState, logout, showLockTimer, getAuthErrorMessage) | auth.test.js | 6개 | 기본기만 |
| Firestore 에러 래퍼 + batch | firestore.test.js | 9개 | 양호 |
| hasChanges | blocks.test.js | 10개 | Phase 4-4 목표 달성 |
| Undo/Redo | history.test.js | 10개 | 양호 |
| 블록 재정렬 | dragdrop.test.js | 4개 | 최소 |
| 테이블 정렬 + rowColors/cellStyles 재매핑 | table-sort.test.js | 7개 | 매우 좋음 |
| 페이지 링크/백링크 | pagelink.test.js | 5개 | 최소 |

### 누락된 영역 (Critical gap)

1. **로그인 플로우 통합 테스트** — `handleLogin` 전체 경로(Firebase Auth 성공/실패, 레거시 폴백, 잠금 증가, `progressiveMigrate`)가 **0개 테스트**. 핵심 보안 로직인데 검증 없음.
2. **sanitize의 실제 블록 렌더링 적용** — `sanitizeHTML`은 테스트되지만 `createBlockEl`에서 실제로 호출되는지, 우회 경로가 없는지 E2E 테스트 부재.
3. **`convertRowsForSave`/`convertRowsForLoad`** — 테이블/차트/캘린더 직렬화 로직이 누락. 마이그레이션 안전성 미검증.
4. **테이블 열/행 추가/삭제 시 `cellStyles` 재매핑** — `deleteRow`/`deleteCol`의 키 재조정 로직(table.js:133,148)이 테스트되지 않음. 정렬만 테스트됨.
5. **드래그 앤 드롭 — collapsed 그룹 이동** — `listeners.js:1281-1293` 복잡 로직 미검증.
6. **Enter/Backspace 복잡 키 핸들링** — `handleKey`의 각 분기(빈 리스트 변환, 블록 병합, 토글 복원, 인덴트 아웃덴트) 테스트 0개. `handleKey`는 300줄인데 커버리지 0%.
7. **버전 복원/삭제** — `restoreVer`, `deleteVer`의 ID 비교 로직.
8. **검색 하이라이팅의 엣지 케이스** — HTML 포함 텍스트 / 정규식 특수문자(`.`, `*` 등)는 helpers.test.js에서 일부 커버되나 통합 `doSearch` 자체는 미테스트.
9. **Firestore Rules** — Firebase Emulator 기반 규칙 테스트가 전혀 없음. C-1 이슈가 바로 감지될 수 있었음.
10. **접근성 단위 테스트** — `trapFocus`, 키보드 내비게이션, ARIA 속성 동적 업데이트 검증 0건.

### 테스트 품질 이슈

- `blocks.test.js`는 `vi.mock('../blocks.js', ...)`으로 **자기 자신을 모킹**하고 `sidebar.js`의 `hasChanges`를 테스트한다. `hasChanges`가 진짜 `collectBlocks`를 호출하는지 검증 불가.
- 테스트 모듈 대부분이 Firebase SDK 전체를 mock하여, 실제 Firestore 쿼리 경로의 회귀가 CI에서 감지되지 않는다. Firebase Emulator Suite 도입 권장.

---

## 8. Phase 8 착수 전 권장 우선순위

코드를 모르는 사용자 기준으로 **이 순서대로** 진행하면 보안/안정성 기반을 다진 후 편의성 기능 작업이 가능합니다.

### Priority 0 (Phase 8 시작 전 필수 — 1~2일)

1. **C-1: Firestore Rules 수정** — `app/data` 읽기 규칙을 `if request.auth != null`로 변경하고, `initDB`를 인증 후 호출하도록 `main.js` 흐름을 조정. 배포 전 Firebase Emulator로 규칙 테스트.
2. **C-2: 평문 비밀번호 UI 노출 제거** — `togglePwView`에서 평문 분기 삭제. 대신 `resetPw` 안내 문구 표시.
3. **C-3: PDF/Video/File 업로드에 `imageStorage` 설정 반영** — `listeners.js` 드롭 처리와 `media.js` submit*를 동일 패턴으로 통일, `MAX_FILE_SIZE` + `ALLOWED_FILE_TYPES` 검증 추가.

### Priority 1 (Phase 8과 병행 — 2~3일)

4. **C-5 일부: 사용자 입력 삽입부의 인라인 onclick 제거** — 최소한 태그·페이지링크·사이드바 컨텍스트 메뉴·사용자 목록의 onclick을 `data-action` 위임으로 전환. XSS 벡터 차단.
5. **C-4: export 함수가 에디터 HTML을 그대로 복제하기 전에 onclick/onchange 제거**. 임시 sanitize 함수 추가.
6. **I-1: 중복 Firestore write 제거** — `saveCurrent`에서 `saveDB()` 호출 제거. 자동저장 비용 절반으로 감소.

### Priority 2 (Phase 8 중간 또는 이후 — 3~5일)

7. **I-5: 로그인 잠금 카운터를 `FieldValue.increment`로 원자화**
8. **I-4: 인증 후 마이그레이션 트리거** — `initApp`에서 `state.db.pages`가 `pages` 컬렉션과 동기화되지 않았으면 한 번 마이그레이션
9. **M-13: PBKDF2 iteration을 300,000으로 상향** — 기존 해시는 검증 시 그대로 통과, 다음 로그인 시 재해싱
10. **I-2: `hasChanges` 키 정렬 비교**
11. **M-3: 네이티브 `confirm`/`alert`을 모달로 치환**
12. **테스트 보강** — handleLogin 플로우, handleKey의 주요 키 분기, 테이블 cellStyles 재매핑

### Priority 3 (여유 될 때)

13. Minor/Nitpick 전반 정리
14. Prettier 도입
15. Firebase Emulator 기반 Rules 테스트 도입
16. Phase 5-1 부분 렌더링 실사용 도입 (성능 이슈 발견 시)

---

## 9. 종합 결론

### Phase 8 진행 가능 여부

**조건부 가능.** Priority 0 (C-1, C-2, C-3) 세 가지를 **Phase 8 착수 전 또는 첫 작업으로 병행** 해결해야 한다. 이유:

- C-1은 **모든 사용자 데이터가 세상에 공개**되는 수준이라 사고 발생 시 되돌릴 수 없다.
- C-2는 관리자 UI의 설계 결함이라 하루만 조용히 놔둬도 운영 중 유출 가능.
- C-3은 Phase 8 "편의성 기능"에 파일 업로드/업그레이드 작업이 포함되어 있어, 기반을 바로잡지 않고 새 기능을 쌓으면 같은 버그를 반복한다.

그 외 Important/Minor는 Phase 8 내에서 작업하거나 Phase 8.5로 분리해도 무방하다.

### 기술 부채 총평

- **구조적 부채: 낮음** — 모듈 분리와 상태 중앙화가 잘 되어 있어 대규모 재작업 없이 수정 가능한 상태.
- **보안 부채: 높음** — Firestore 규칙과 인라인 onclick 두 축이 나란히 살아있어 XSS/데이터 노출 표면이 넓다. Critical 5건이 모두 여기 집중되었다.
- **테스트 부채: 중간** — 85개는 적지 않지만 **가장 위험한 코드(로그인 플로우, handleKey, 실제 렌더링 결과)가 미커버**. 회귀 버그가 프로덕션에서만 드러날 가능성.
- **성능 부채: 낮음** — 현재 데이터 규모(예상 수십~수백 페이지)에서는 체감되지 않음. Phase 5-1 "부분 렌더링"은 실사용 없지만 당장 문제되지는 않는다.

### 코드를 모르는 사용자에게 한 줄 결론

> 리팩토링 덕분에 집은 잘 지어졌지만, 대문에 잠금장치가 풀려 있고(C-1) 관리실 벽에 비밀번호 메모가 붙어 있고(C-2) 차고 문이 닫히지 않는(C-3) 상태입니다. 세 가지만 고치면 새 가구(Phase 8)를 들여도 안전합니다.

---

**작성:** Senior Code Reviewer (Claude Opus 4.7 / 1M context)
**참고 자료:** `docs/plans/2026-02-08-full-refactor.md`, `docs/plans/2026-02-09-convenience-features.md`, `WorkProgress/Phase_1~7_2026-02-08.md`, `Claude.md`
