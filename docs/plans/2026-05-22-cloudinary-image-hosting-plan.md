# 이미지 호스팅 Cloudinary 전환 — 구현 계획 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firebase Storage 한도 소진에 따라 이미지 호스팅을 Cloudinary로 완전 전환하고, 죽은 Firebase Storage 코드를 제거한다.

**Architecture:** 이미지 업로드는 이미 `uploadToStorage()`가 Cloudinary unsigned 업로드로 동작 중이다. 이 계획은 (1) 업로드/렌더 경로의 검증·보안을 보강하고, (2) 영상을 임베드 전용으로 정리하고, (3) 죽은 Firebase Storage 코드와 깨진 이미지 데이터를 제거한다. 백엔드 서버가 없으므로 unsigned 업로드 방식을 유지한다.

**Tech Stack:** Vanilla JS (ES modules, `var` 스타일), Vite, Vitest + jsdom, Cloudinary unsigned upload API, DOMPurify.

**관련 설계 문서:** `docs/plans/2026-05-22-cloudinary-image-hosting-design.md`

**테스트 실행:** 전체 `npm test` / 단일 파일 `npx vitest run <경로>`

---

## Task 1: `validateUploadFile` 추출 + MIME 검증 강화 + `uploadToStorage` 테스트

**배경:** `uploadToStorage`의 타입 검증(`firestore.js:567-580`)이 substring 매칭이라 `application/png-fake` 같은 값이 통과한다. 검증 로직을 순수 함수로 분리해 정확히 일치하도록 고치고 테스트한다.

**Files:**
- Modify: `src/data/firestore.js:562-585`
- Test: `src/data/__tests__/firestore.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/data/__tests__/firestore.test.js`의 import 줄(52행)을 다음으로 교체:

```js
import { firestoreCall, batchDeletePages, uploadToStorage, validateUploadFile } from '../firestore.js';
```

firebase.js mock(22-27행)에 Cloudinary 상수를 추가 — 다음으로 교체:

```js
vi.mock('../../config/firebase.js', () => ({
  firestore: mockFirestore,
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  CLOUDINARY_CLOUD_NAME: 'testcloud',
  CLOUDINARY_UPLOAD_PRESET: 'testpreset',
}));
```

파일 끝에 다음 describe 블록 2개를 추가:

```js
describe('validateUploadFile', () => {
  it('허용 타입과 정확히 일치하면 null을 반환한다', () => {
    var file = { type: 'image/png', name: 'a.png', size: 1000 };
    expect(validateUploadFile(file, ['image/png', 'image/jpeg'], 10 * 1024 * 1024)).toBeNull();
  });
  it('허용되지 않은 타입이면 에러 메시지를 반환한다', () => {
    var file = { type: 'application/x-msdownload', name: 'a.exe', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).toContain('허용되지 않는');
  });
  it('substring 매칭으로 우회되지 않는다', () => {
    var file = { type: 'application/png-fake', name: 'a.dat', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).not.toBeNull();
  });
  it('MIME이 비어있으면 확장자로 폴백한다', () => {
    var file = { type: '', name: 'photo.PNG', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).toBeNull();
  });
  it('MIME이 비어있고 확장자도 허용 목록 밖이면 거부한다', () => {
    var file = { type: '', name: 'photo.exe', size: 1000 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).not.toBeNull();
  });
  it('파일 크기가 maxSize를 초과하면 에러를 반환한다', () => {
    var file = { type: 'image/png', name: 'a.png', size: 20 * 1024 * 1024 };
    expect(validateUploadFile(file, ['image/png'], 10 * 1024 * 1024)).toContain('너무 큽니다');
  });
  it('allowedTypes가 없으면 타입 검사를 건너뛴다', () => {
    var file = { type: 'application/zip', name: 'a.zip', size: 1000 };
    expect(validateUploadFile(file, null, 10 * 1024 * 1024)).toBeNull();
  });
});

describe('uploadToStorage', () => {
  it('허용되지 않은 타입이면 reject한다', async () => {
    var file = { type: 'application/x-msdownload', name: 'a.exe', size: 100 };
    await expect(uploadToStorage(file, 'images', ['image/png'])).rejects.toThrow('허용되지 않는');
  });
  it('크기 초과면 reject한다', async () => {
    var file = { type: 'image/png', name: 'a.png', size: 20 * 1024 * 1024 };
    await expect(uploadToStorage(file, 'images', ['image/png'])).rejects.toThrow('너무 큽니다');
  });
  it('Cloudinary 성공 응답 시 secure_url을 반환한다', async () => {
    var fakeXHR = {
      open: vi.fn(), upload: {}, status: 0, responseText: '',
      send: function () {
        this.status = 200;
        this.responseText = JSON.stringify({ secure_url: 'https://res.cloudinary.com/x.png' });
        this.onload();
      },
    };
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => fakeXHR));
    var file = { type: 'image/png', name: 'a.png', size: 100 };
    var result = await uploadToStorage(file, 'images', ['image/png']);
    expect(result.url).toBe('https://res.cloudinary.com/x.png');
    vi.unstubAllGlobals();
  });
  it('네트워크 오류 시 reject한다', async () => {
    var fakeXHR = {
      open: vi.fn(), upload: {}, status: 0, responseText: '',
      send: function () { this.onerror(); },
    };
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => fakeXHR));
    var file = { type: 'image/png', name: 'a.png', size: 100 };
    await expect(uploadToStorage(file, 'images', ['image/png'])).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/data/__tests__/firestore.test.js`
Expected: FAIL — `validateUploadFile is not a function` / `uploadToStorage` 정의 변경 전이라 substring 테스트 등 실패

- [ ] **Step 3: `validateUploadFile` 추가 + `uploadToStorage` 리팩터**

`src/data/firestore.js`에서 `uploadToStorage` 함수(562행) 바로 앞에 다음을 추가:

```js
// 업로드 파일 검증 — 통과 시 null, 실패 시 에러 메시지(string) 반환
export function validateUploadFile(file,allowedTypes,maxSize){
  var fileType=(file&&file.type)||'';
  if(allowedTypes&&allowedTypes.length){
    var ok=allowedTypes.indexOf(fileType)!==-1;
    if(!ok&&!fileType){
      // 일부 브라우저는 MIME을 비워 전달 — 확장자로만 폴백
      var ext=((file&&file.name)||'').split('.').pop().toLowerCase();
      var extMap={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'};
      if(extMap[ext]&&allowedTypes.indexOf(extMap[ext])!==-1)ok=true;
    }
    if(!ok)return '허용되지 않는 파일 형식입니다.\n파일 타입: '+(fileType||'(알 수 없음)')+'\n허용: '+allowedTypes.join(', ');
  }
  if(file&&maxSize&&file.size>maxSize)return '파일 크기가 너무 큽니다.\n최대: '+formatBytes(maxSize);
  return null;
}
```

`uploadToStorage` 본문 시작(563-585행, `return new Promise(...){` 안의 타입/크기 검증 블록)을 다음으로 교체:

```js
export function uploadToStorage(file,folder,allowedTypes){
  return new Promise(function(resolve,reject){
    var validationError=validateUploadFile(file,allowedTypes,MAX_FILE_SIZE);
    if(validationError){reject(new Error(validationError));return;}
    // Cloudinary unsigned 업로드 — auto/upload 가 이미지/비디오/raw 자동 판별
```

(이후 `var formData=new FormData();`부터 기존 코드 유지)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/data/__tests__/firestore.test.js`
Expected: PASS (모든 describe 통과)

- [ ] **Step 5: 커밋**

```bash
git add src/data/firestore.js src/data/__tests__/firestore.test.js
git commit -m "refactor: 업로드 파일 검증을 validateUploadFile로 분리, MIME 정확 매칭"
```

---

## Task 2: base64 이미지 경로 크기 제한 + onerror 처리

**배경:** `imageStorage` 설정이 `base64`일 때 `FileReader.readAsDataURL`로 이미지를 문서에 직접 저장한다. 현재 크기 제한도 `onerror`도 없어, 대용량 파일이 Firestore 1MB 문서 한도를 깨거나 읽기 실패 시 무반응이다. 공용 헬퍼 `readFileAsDataURL`을 만들어 적용한다.

**Files:**
- Modify: `src/config/firebase.js:14` (상수 추가)
- Modify: `src/utils/helpers.js` (헬퍼 추가)
- Modify: `src/editor/media.js` (submitImage, submitSlideImage)
- Modify: `src/editor/listeners.js` (paste, drop 핸들러)
- Test: `src/utils/__tests__/helpers.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/utils/__tests__/helpers.test.js`의 `../helpers.js` import 줄에 `readFileAsDataURL`를 추가한다(기존 import 목록에 심볼만 추가).

파일 끝에 추가:

```js
describe('readFileAsDataURL', () => {
  it('파일을 data URL로 읽는다', async () => {
    var file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    var result = await readFileAsDataURL(file, 1024 * 1024);
    expect(result).toMatch(/^data:/);
  });
  it('maxSize 초과 시 reject한다', async () => {
    var big = new File([new Uint8Array(2000)], 'big.png', { type: 'image/png' });
    await expect(readFileAsDataURL(big, 1000)).rejects.toThrow('너무 큽니다');
  });
  it('파일이 없으면 reject한다', async () => {
    await expect(readFileAsDataURL(null, 1000)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/utils/__tests__/helpers.test.js`
Expected: FAIL — `readFileAsDataURL is not a function`

- [ ] **Step 3: 헬퍼 + 상수 추가**

`src/config/firebase.js`의 14행(`export var MAX_FILE_SIZE=...`) 바로 아래에 추가:

```js
// base64(문서 내 저장) 모드 이미지 최대 크기 — base64는 ~33% 팽창, Firestore 문서 한도 1MB 고려한 보수값
export var MAX_BASE64_IMAGE_SIZE=800*1024;
```

`src/utils/helpers.js` 끝에 추가:

```js
// 파일을 data URL(base64)로 읽음 — maxSize(bytes) 초과 시 거부, 읽기 실패 시 reject
export function readFileAsDataURL(file,maxSize){
  return new Promise(function(resolve,reject){
    if(!file){reject(new Error('파일이 없습니다'));return}
    if(maxSize&&file.size>maxSize){
      reject(new Error('파일이 너무 큽니다 (최대 '+Math.round(maxSize/1024)+'KB). Storage 저장 방식을 사용하세요.'));
      return;
    }
    var reader=new FileReader();
    reader.onload=function(e){resolve(e.target.result)};
    reader.onerror=function(){reject(new Error('파일을 읽지 못했습니다'))};
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/utils/__tests__/helpers.test.js`
Expected: PASS

- [ ] **Step 5: media.js 적용**

`src/editor/media.js`의 import 부분 수정:
- 4행 `import {ALLOWED_IMAGE_TYPES} from '../config/firebase.js';` → `import {ALLOWED_IMAGE_TYPES,MAX_BASE64_IMAGE_SIZE} from '../config/firebase.js';`
- 5행 `import {$,genId,esc,toast} from '../utils/helpers.js';` → `import {$,genId,esc,toast,readFileAsDataURL} from '../utils/helpers.js';`

`submitImage`의 base64 분기(34-38행)를 교체:

```js
    }else{
      readFileAsDataURL(file,MAX_BASE64_IMAGE_SIZE).then(function(dataUrl){
        addImageBlock(dataUrl);
      }).catch(function(err){
        toast(err.message||'이미지 읽기 실패','err');
      });
    }
```

`submitSlideImage`의 base64 분기(227-231행)를 교체:

```js
    }else{
      readFileAsDataURL(file,MAX_BASE64_IMAGE_SIZE).then(function(dataUrl){
        addSlideImageSrc(dataUrl);
      }).catch(function(err){
        toast(err.message||'이미지 읽기 실패','err');
      });
    }
```

- [ ] **Step 6: listeners.js 적용**

`src/editor/listeners.js`의 import에 `readFileAsDataURL`(helpers.js)와 `MAX_BASE64_IMAGE_SIZE`(config/firebase.js)를 추가한다(기존 helpers.js / firebase.js import 목록에 심볼만 추가).

`handlePaste`의 base64 분기(464-475행)를 교체:

```js
        }else{
          readFileAsDataURL(file,MAX_BASE64_IMAGE_SIZE).then(function(dataUrl){
            pushUndoImmediate();
            var b={id:genId(),type:'image',src:dataUrl,caption:''};
            var idx=state.currentInsertIdx!==null?state.currentInsertIdx+1:state.page.blocks.length;
            state.page.blocks.splice(idx,0,b);
            renderBlocks();triggerAutoSave();
            toast('이미지 삽입');
          }).catch(function(err){
            toast(err.message||'이미지 읽기 실패','err');
          });
        }
```

드롭 핸들러의 base64 분기(1318-1322행)를 교체:

```js
        }else{
          readFileAsDataURL(file,MAX_BASE64_IMAGE_SIZE).then(function(dataUrl){
            addImageBlock(dataUrl);
          }).catch(function(err){
            toast(err.message||'이미지 읽기 실패','err');
          });
        }
```

- [ ] **Step 7: 전체 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS (전체)
Run: `npm run build`
Expected: 빌드 성공 (import 오류 없음)

- [ ] **Step 8: 커밋**

```bash
git add src/config/firebase.js src/utils/helpers.js src/utils/__tests__/helpers.test.js src/editor/media.js src/editor/listeners.js
git commit -m "feat: base64 이미지 경로에 크기 제한·읽기 오류 처리 추가"
```

---

## Task 3: 이미지 src 렌더 시점 `sanitizeURL` 적용

**배경:** 이미지 `src`는 입력 시점에만 `sanitizeURL`을 거친다. FileReader 경로·임포트된 문서 JSON은 검증을 우회하므로, 렌더 시점에도 `sanitizeURL`을 통과시킨다. `sanitizeURL`은 `http/https/data`만 허용하므로 base64 이미지(`data:`)는 정상 통과한다.

**Files:**
- Modify: `src/editor/renderer.js` (import, image 블록)
- Modify: `src/editor/media.js` (renderSlideBlock, openImageViewer, viewerNav)

- [ ] **Step 1: renderer.js 수정**

`src/editor/renderer.js`의 5행 import를 수정:

```js
import {sanitizeHTML,sanitizeURL} from '../utils/sanitize.js';
```

`case'image':` 블록에서 `<img>` 줄(171행)을 교체:

```js
      var safeSrc=esc(sanitizeURL(b.src||''));
      inner+='<img src="'+safeSrc+'" style="width:100%;border-radius:var(--rad);display:block;cursor:'+(state.editMode?'default':'zoom-in')+'" onerror="this.style.display=\'none\'"'+(state.editMode?'':' onclick="openImageViewer([\''+safeSrc+'\'],0)"')+'>';
```

- [ ] **Step 2: media.js renderSlideBlock 수정**

`renderSlideBlock`의 슬라이드 이미지(133행)를 교체:

```js
      html+='<img src="'+esc(sanitizeURL(images[i]))+'" onerror="this.style.display=\'none\'">';
```

편집 모드 썸네일(165행)의 `src` 부분을 교체:

```js
      html+='<div style="position:relative"><img class="block-slide-thumb'+(i===current?' active':'')+'" src="'+esc(sanitizeURL(images[i]))+'" onclick="slideTo('+idx+','+i+')">';
```

- [ ] **Step 3: media.js 이미지 뷰어 수정**

`openImageViewer`의 52행을 교체:

```js
  $('viewerImg').src=sanitizeURL(state.viewerImages[state.viewerIndex]||'');
```

`viewerNav`의 67행을 교체:

```js
  $('viewerImg').src=sanitizeURL(state.viewerImages[state.viewerIndex]||'');
```

- [ ] **Step 4: 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS (기존 sanitize 테스트 포함 전체 통과)
Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/editor/renderer.js src/editor/media.js
git commit -m "fix: 이미지 src를 렌더 시점에 sanitizeURL로 검증"
```

---

## Task 4: 영상 임베드 전용 전환

**배경:** 영상은 임베드 전용(YouTube)으로 한다. 영상 파일 업로드 경로(`submitVideo` 파일 분기, `videoFileInput`)를 제거한다. 단, 기존에 업로드된 영상 파일 블록(`isFile:true`, base64)이 깨지지 않도록 `renderer.js`의 `isFile` 렌더 분기는 하위 호환용으로 유지한다.

**Files:**
- Modify: `src/editor/media.js` (insertVideo, submitVideo, addVideoBlock)
- Modify: `index.html:290` (videoUploadModal)

- [ ] **Step 1: media.js `insertVideo` 수정**

`insertVideo`(277행)를 교체 — `videoFileInput` 참조 제거:

```js
export function insertVideo(){openModal('videoUploadModal');$('videoUrlInput').value=''}
```

- [ ] **Step 2: media.js `submitVideo` 수정**

`submitVideo`(278-291행)를 교체 — 파일 분기 제거:

```js
export function submitVideo(){
  var url=$('videoUrlInput').value.trim();
  if(!url){toast('YouTube URL을 입력하세요','err');return}
  var safe=sanitizeURL(url);
  if(!safe){toast('유효하지 않은 URL입니다','err');return}
  var vid=getYTId(safe);
  if(!vid){toast('유효한 YouTube URL을 입력하세요','err');return}
  addVideoBlock(safe);
}
```

- [ ] **Step 3: media.js `addVideoBlock` 수정**

`addVideoBlock`(292-296행)을 교체 — `isFile`/`fileName` 제거:

```js
export function addVideoBlock(src){
  var b={id:genId(),type:'video',url:src};
  insertMediaBlock(b);
  renderBlocks();triggerAutoSave();closeModal('videoUploadModal');toast('동영상 삽입')
}
```

- [ ] **Step 4: index.html videoUploadModal 수정**

`index.html` 290행의 `videoUploadModal` 안 `<div class="modal-body">...</div>`를 교체 — "또는" 구분선과 파일 업로드 `<div class="fg">` 제거:

```html
<div class="modal-body"><div class="fg"><label>YouTube URL</label><input type="text" id="videoUrlInput" placeholder="https://youtube.com/..."></div></div>
```

- [ ] **Step 5: 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS
Run: `npm run build`
Expected: 빌드 성공

> 참고: `renderer.js:182`의 `if(b.isFile){...<video>...}` 분기는 하위 호환을 위해 그대로 둔다. 신규 영상 블록은 `isFile`을 설정하지 않으므로 항상 YouTube 임베드 분기로 렌더된다.

- [ ] **Step 6: 커밋**

```bash
git add src/editor/media.js index.html
git commit -m "feat: 영상을 YouTube 임베드 전용으로 전환, 영상 파일 업로드 제거"
```

---

## Task 5: 죽은 Firebase Storage 코드 제거

**배경:** Firebase Storage가 더 이상 사용되지 않으므로 관련 죽은 코드를 제거한다 — `storage` 인스턴스, `STORAGE_LIMIT`, 용량 사용량 추적(`getStorageUsage`/`updateStorageUsage`/`storageUsage`), 설정 화면의 용량 표시 UI, base64→Firebase Storage 마이그레이션 함수(`modals.js`의 `migrateImages`). `imageStorage` 모드 토글과 base64 경로는 유지한다.

**Files:**
- Modify: `src/config/firebase.js`
- Modify: `src/data/firestore.js`
- Modify: `src/ui/modals.js`
- Modify: `index.html` (tabStorage)
- Modify: `src/main.js`
- Modify: `src/data/__tests__/firestore.test.js`

- [ ] **Step 1: firebase.js 정리**

`src/config/firebase.js`에서 다음 2줄을 삭제:
- 8행 `export var storage=firebase.storage();`
- 13행 `export var STORAGE_LIMIT=5*1024*1024*1024; // 5GB`

- [ ] **Step 2: firestore.js 정리**

`src/data/firestore.js`에서:
- `getStorageUsage`(549-553행)와 `updateStorageUsage`(555-559행) 함수 전체 삭제
- `uploadToStorage` 성공 콜백 안의 `updateStorageUsage(file.size);` 호출(약 605행) 삭제
- initDB의 storageUsage 처리 삭제: `var storageUsage=settings.storageUsage||0;`와 `delete settings.storageUsage;`(372-373행) 삭제, `state.db={...}` 객체에서 `storageUsage:storageUsage,`(394행) 삭제
- `saveDBNewStructure`의 `settingsData.storageUsage=state.db.storageUsage||0;`(471행) 삭제

- [ ] **Step 3: modals.js 정리**

`src/ui/modals.js`의 import 수정:
- 4행 → `import {ICONS,auth} from '../config/firebase.js';`
- 5행 → `import {$,$$,esc,toast,formatDate} from '../utils/helpers.js';`
- 6행 → `import {saveDB,savePage,batchUpdateUserIdInPages,updateUserIdInLogs,getErrorLogs,clearErrorLogs} from '../data/firestore.js';`
- 12행 `import {storage} from '../config/firebase.js';` → 줄 전체 삭제

`migrateImages` 함수(72-160행) 전체 삭제.

`renderStorageUsage` 함수(61-71행)를 다음으로 교체 (용량 바 제거, 이름 변경):

```js
export function renderStorageSettings(){
  var mode=state.db.settings.imageStorage||'storage';
  $('imgStorageOn').checked=(mode==='storage');
  $('imgStorageOff').checked=(mode==='base64');
}
```

`showSettingsTab`(59행)의 `if(tab==='storage')renderStorageUsage()`를 `if(tab==='storage')renderStorageSettings()`로 교체.

- [ ] **Step 4: index.html tabStorage 정리**

`index.html`의 `<div class="tab-panel" id="tabStorage">`부터 그 닫는 `</div>`까지(212-245행)를 다음으로 교체:

```html
<div class="tab-panel" id="tabStorage">
<div style="padding:16px;background:var(--bg3);border-radius:8px;font-size:13px;margin-bottom:16px">
<p style="margin-bottom:12px"><strong>⚙️ 이미지 저장 방식</strong></p>
<label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px">
<input type="radio" name="imgStorage" value="storage" id="imgStorageOn" onchange="setImageStorageMode('storage')">
<span><strong>외부 호스팅 사용</strong> (권장) - 이미지를 Cloudinary에 업로드해 공유 URL로 저장</span>
</label>
<label style="display:flex;align-items:center;gap:8px;cursor:pointer">
<input type="radio" name="imgStorage" value="base64" id="imgStorageOff" onchange="setImageStorageMode('base64')">
<span><strong>문서 내 저장 (Base64)</strong> - 작은 이미지를 문서에 직접 저장 (대용량 비권장)</span>
</label>
</div>
<div style="padding:16px;background:var(--bg3);border-radius:8px;font-size:13px;color:var(--t3)">
<p style="margin-bottom:8px"><strong>📌 안내</strong></p>
<ul style="margin-left:16px;line-height:1.8">
<li>이미지는 Cloudinary에 업로드되어 공유 URL로 표시됩니다</li>
<li>파일당 최대: 10MB</li>
<li>허용 이미지: JPEG, PNG, GIF, WebP</li>
<li>동영상은 YouTube 임베드만 지원합니다</li>
</ul>
</div>
</div>
```

- [ ] **Step 5: main.js 정리**

`src/main.js`에서:
- 50행 `migrateImages,setImageStorageMode,` → `setImageStorageMode,` (modals.js import에서 `migrateImages` 제거)
- 284행 `window.migrateImages=migrateImages;` 줄 전체 삭제

- [ ] **Step 6: firestore.test.js mock 정리**

`src/data/__tests__/firestore.test.js`의 store mock(36-49행)에서 `storageUsage: 0,` 줄 삭제. (firebase.js mock은 Task 1에서 이미 `storage`/`STORAGE_LIMIT`를 제거함)

- [ ] **Step 7: 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS (전체)
Run: `npm run build`
Expected: 빌드 성공 (제거된 export 참조 오류 없음)

- [ ] **Step 8: 앱 수동 확인**

Run: `npm run dev` 후 브라우저에서 로그인 → 설정 → "저장소" 탭 진입
Expected: 콘솔 오류 없음, 이미지 저장 방식 라디오가 정상 표시, 용량 바·마이그레이션 버튼이 사라짐

- [ ] **Step 9: 커밋**

```bash
git add src/config/firebase.js src/data/firestore.js src/ui/modals.js index.html src/main.js src/data/__tests__/firestore.test.js
git commit -m "refactor: 죽은 Firebase Storage 코드 제거 (storage/STORAGE_LIMIT/용량추적/마이그레이션UI)"
```

---

## Task 6: 깨진 Firebase 이미지 데이터 정리 (수동 콘솔 실행)

**배경:** 기존 Firebase Storage 이미지는 모두 깨졌고 복구 불가능하다. `migrate-images.js`의 `cleanupFirebaseAssets`로 깨진 참조를 데이터에서 완전히 제거한다. **비가역적 작업** — dry-run 검토 필수.

**Files:** 코드 변경 없음 — `src/main.js`에 이미 노출된 콘솔 전역(`cleanupBrokenImagesDryRun`, `cleanupBrokenImages`) 사용.

- [ ] **Step 1: 앱 실행 + 로그인**

Run: `npm run dev` → 브라우저에서 최고관리자 계정으로 로그인 (데이터가 로드되어야 함)

- [ ] **Step 2: dry-run으로 삭제 대상 확인**

브라우저 콘솔에서 실행:

```js
await cleanupBrokenImagesDryRun()
```

Expected: 콘솔에 삭제 대상 블록 목록과 개수 출력. 목록을 검토해 의도치 않은 삭제가 없는지 확인한다.

- [ ] **Step 3: 실제 정리 실행**

dry-run 결과가 타당하면 콘솔에서 실행:

```js
await cleanupBrokenImages()
```

Expected: `[cleanup] 완료` 출력. 페이지 새로고침 후 깨진 이미지 블록이 사라졌는지 확인.

- [ ] **Step 4: 결과 기록**

삭제된 블록 수를 WorkProgress Phase 파일(Task 9에서 작성)에 기록한다. 코드 커밋 없음 (데이터 변경만).

---

## Task 7: `migrate-images.js` 및 마이그레이션 전역 제거

**배경:** Task 6 완료 후 `migrate-images.js`는 더 이상 필요 없다. `migrateImagesToCloudinary`(다운로드 기반, 동작 불가)와 `cleanupFirebaseAssets`(1회 실행 완료)를 모두 제거하고, `main.js`의 관련 콘솔 전역을 제거한다.

**Files:**
- Delete: `src/data/migrate-images.js`
- Modify: `src/main.js`

- [ ] **Step 1: migrate-images.js 삭제**

```bash
git rm src/data/migrate-images.js
```

- [ ] **Step 2: main.js 마이그레이션 전역 제거**

`src/main.js`의 362-368행(이미지 마이그레이션 / 깨진 이미지 정리 콘솔 전역 블록 전체 — `window.migrateImagesDryRun`, `window.migrateImages`, `window.cleanupBrokenImagesDryRun`, `window.cleanupBrokenImages`와 그 위 주석 2줄)을 삭제.

- [ ] **Step 3: 잔여 참조 확인**

Run: `npx vitest run` 후 추가로 `migrate-images` 문자열 검색으로 잔여 import가 없는지 확인.
Expected: `migrate-images`에 대한 참조 0건

- [ ] **Step 4: 테스트 + 빌드 확인**

Run: `npm test`
Expected: PASS
Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: 일회성 migrate-images.js 및 마이그레이션 콘솔 전역 제거"
```

---

## Task 8: Cloudinary 대시보드 하드닝 + 설정 문서화

**배경:** unsigned upload preset은 cloud name만 알면 누구나 업로드할 수 있어 무료 크레딧이 고갈될 수 있다. 백엔드가 없어 서명 업로드는 불가하므로, Cloudinary 대시보드 제약으로 피해를 한정하고 운영 정보를 문서화한다. (코드 변경 없음 — 대시보드 설정 + 문서)

**Files:**
- Create: `docs/cloudinary-setup.md`

- [ ] **Step 1: Cloudinary 대시보드에서 unsigned preset 제약 적용**

Cloudinary 콘솔 → Settings → Upload → `acid_unsigned` preset에서 다음을 설정:
- Allowed formats: `jpg, jpeg, png, gif, webp, mp4` (영상 임베드 전용이지만 `auto/upload` 호환을 위해 mp4 유지 여부는 선택)
- Max file size: 10 MB (앱의 `MAX_FILE_SIZE`와 일치)
- Incoming transformations: 비활성 (또는 고정 변환만)
- Folder: `aciddocument/` 등 고정 폴더 지정
- Unique filename / overwrite: 기본값 유지

- [ ] **Step 2: 설정 문서 작성**

`docs/cloudinary-setup.md`를 생성하고 다음을 기록:
- Cloudinary 계정 소유자(이메일), 로그인 방법, 복구 연락처
- `cloud name`, unsigned preset 이름
- preset에 적용한 제약 목록 (Step 1)
- 무료 플랜 한도 요약 (월 25 크레딧 = 저장/전송/변환 합산)
- 한도 소진 시 대응: 영상은 이미 임베드 전용, 이미지는 base64 모드로 임시 전환 가능
- 5년 운영 주의: 무료 정책은 변경될 수 있으므로 분기별로 사용량 점검 권장

- [ ] **Step 3: 커밋**

```bash
git add docs/cloudinary-setup.md
git commit -m "docs: Cloudinary 운영 설정 및 대시보드 하드닝 문서 추가"
```

---

## Task 9: 최종 검증 / QA

**배경:** 설계 문서의 성공 기준(8장)을 실제 앱에서 검증하고, 사전 QA로 결함 가능성을 점검한다.

**Files:**
- Create: `WorkProgress/Phase_9_2026-05-22.md` (또는 다음 Phase 번호)

- [ ] **Step 1: 전체 자동 테스트**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 2: 이미지 업로드·공유 검증 (요구사항 1)**

`npm run dev`로 실행 후:
- 이미지 저장 방식을 "외부 호스팅"으로 설정
- 이미지 블록에 파일 업로드 → `res.cloudinary.com` URL이 `src`에 들어가는지 확인
- 그 URL을 다른 브라우저(또는 시크릿 창)에서 직접 열어 표시되는지 확인 (공유 가능 확인)

- [ ] **Step 3: 영상 임베드 검증 (요구사항 2)**

- 동영상 삽입 모달에 파일 업로드 입력이 없는지 확인
- YouTube URL 입력 → 임베드 정상 재생 확인
- 잘못된 URL 입력 → 오류 토스트 확인

- [ ] **Step 4: 회귀 점검 (사전 QA)**

- base64 모드로 전환 후 큰 이미지(800KB 초과) 업로드 → 크기 초과 오류 토스트 확인
- 슬라이드 블록에 이미지 추가 → 정상 표시 확인
- 클립보드 이미지 붙여넣기 / 이미지 파일 드롭 → 정상 동작 확인
- 설정 "저장소" 탭 → 콘솔 오류 없음
- Task 6 정리 후 기존 페이지들 → 깨진 이미지 아이콘 없음

- [ ] **Step 5: Phase 기록 작성**

`WorkProgress/` 폴더에 `Phase_9_2026-05-22.md`(직전 Phase가 8이므로 9) 생성. 설계 문서 기준 형식(Phase/Status/LastUpdate/Branch/RecentWork/MainWork/ResolvedWork/MainIssues/ResolvedIssues/RelatedPhases)으로 작업 내역, Task 6 삭제 블록 수, 발견된 결함을 기록.

- [ ] **Step 6: 커밋**

```bash
git add WorkProgress/Phase_9_2026-05-22.md
git commit -m "docs: Phase 9 — Cloudinary 이미지 호스팅 전환 작업 기록"
```

- [ ] **Step 7: Phase 완료 코드 리뷰**

`/requesting-code-review`를 실행해 전체 변경을 검토한다.

---

## 자체 검토 (Self-Review) 결과

**Spec coverage:** 설계 문서 5.1→Task 1·2·3, 5.2→Task 4, 5.3→Task 6, 5.4→Task 5·7, 5.5→Task 8, 5.6→Task 1 테스트·Task 9. 모든 설계 항목이 태스크로 매핑됨.

**알려진 설계-구현 차이:**
- 설계 문서는 영상 임베드를 "YouTube/Vimeo"로 적었으나 현재 코드는 YouTube 전용(`getYTId`)이다. Vimeo 지원은 추가 기능이므로 본 계획 범위에서 제외(YAGNI). 필요 시 별도 작업.
- `renderer.js`의 `isFile` 영상 렌더 분기는 기존 영상 파일 블록 하위 호환을 위해 유지한다(설계의 "임베드 전용"은 신규 업로드 기준).

**Placeholder scan:** 모든 스텝에 실제 코드/명령 포함, 플레이스홀더 없음.

**Type consistency:** `validateUploadFile`/`readFileAsDataURL`/`renderStorageSettings` 명칭이 정의·호출부에서 일치.
