# 이미지 호스팅 Cloudinary 전환 — 설계 (Design)

- 작성일: 2026-05-22
- 상태: 설계 승인 완료, 구현 계획(writing-plans) 대기
- 관련: `src/config/firebase.js`, `src/data/firestore.js`, `src/data/migrate-images.js`, `src/editor/media.js`, `src/editor/renderer.js`, `src/main.js`

## 1. 배경

Firebase Storage 무료 용량 한도가 소진되어 더 이상 이미지를 호스팅할 수 없다.
기존에 Firebase Storage로 업로드된 이미지는 **이미 모두 깨진 상태**이며, 원본을
다운로드할 수 없으므로 복구가 불가능하다.

코드베이스 조사 결과, 이미지 호스팅은 **이미 Cloudinary로 상당 부분 전환되어 있다**(미커밋 상태):

- `firebase.js:18-22` — Cloudinary `cloudName`(`dayb03xfn`), unsigned preset(`acid_unsigned`) 상수 정의
- `firestore.js:562-622` — `uploadToStorage()`가 Firebase Storage가 아닌 Cloudinary `auto/upload` 엔드포인트로 업로드
- `migrate-images.js` — 기존 Firebase Storage URL을 옮기는 일회성 스크립트(미커밋 신규 파일)

따라서 이 작업은 "새 서버 도입"이 아니라 **진행 중이던 Cloudinary 전환을 검증·정리·완성**하는 것이다.

## 2. 목표

이미지 호스팅을 Cloudinary로 완전히 전환한다.

1. 업로드한 이미지는 Cloudinary 공개 CDN URL로 **다른 사람도 볼 수 있게 공유**된다.
2. **영상은 임베드 전용**(YouTube/Vimeo)으로 처리한다 — 영상 파일은 호스팅하지 않는다.
3. **무료 플랜**으로 운영하며, 가능한 한 오래(5년 목표) 지속 가능하도록 구성한다.

## 3. 확정 사항

| 항목 | 결정 | 비고 |
|------|------|------|
| 이미지 서버 | Cloudinary | 이미 `uploadToStorage`에 통합됨 |
| 비용 정책 | 무료 플랜만 | 한도 소진 시 영상은 임베드로 대체 |
| 영상 처리 | 임베드 전용 (YouTube/Vimeo) | 영상 파일 업로드 경로 제거 |
| 기존 깨진 이미지 | 완전 삭제 (`cleanupFirebaseAssets`) | **비가역적** — dry-run 후 실행 |
| 아키텍처 제약 | 백엔드 서버 없음 | unsigned 업로드만 가능, 서명 업로드 불가 |

### 대안 검토 기록

- **Google Drive**: 부적합으로 판단. 이미지 호스트가 아닌 파일 저장소이며, 웹 임베드는
  비공식 핵(`uc?export=view`)에 의존하고 구글이 반복적으로 차단해 왔다(5년 운영과 정면 충돌).
  핫링크 다운로드 할당량 때문에 다인 공유 시 이미지가 깨진다(요구사항 1 위배). CORS 미지원,
  업로드에 OAuth2 필요. 채택하지 않음.
- **Cloudinary 채택 근거**: 본 앱은 백엔드 서버가 없는 순수 클라이언트 앱이다.
  Cloudinary unsigned 업로드는 백엔드 없이 동작하는 거의 유일한 선택지이며,
  이미지 CDN 전문 서비스(2011년 설립)로 비교적 안정적이다.

## 4. 현재 상태 (Current State)

| 요소 | 현재 | 처리 방향 |
|------|------|-----------|
| `uploadToStorage()` | Cloudinary `auto/upload`로 업로드 | 검증·보강 후 유지 |
| `firebase.js` Cloudinary 상수 | 정의됨 | 유지 |
| `firebase.js:8` `storage=firebase.storage()` | 정의됨, 사용 안 함 | 제거 |
| `STORAGE_LIMIT` (5GB), `getStorageUsage`/`updateStorageUsage` | Firebase 5GB 한도 기준 | 제거 (Cloudinary는 5GB가 아닌 월 25 크레딧, 앱이 사용량 조회 불가) |
| `migrate-images.js` `migrateImagesToCloudinary` | 다운로드→재업로드 방식 | 제거 (원본 깨짐, 동작 불가) |
| `migrate-images.js` `cleanupFirebaseAssets` | 깨진 참조 제거 | 1회 실행 후 파일 삭제 |
| `video` 블록 | YouTube 임베드 + (영상 파일 업로드 경로 가능성) | 임베드 전용으로 정리 |
| 기존 Firebase Storage 이미지 | 모두 깨짐 | `cleanupFirebaseAssets`로 삭제 |

## 5. 작업 범위 (Scope)

### 5.1 Cloudinary 업로드 경로 검증·보강

- `uploadToStorage` (`firestore.js:562-622`)가 실제로 preset `acid_unsigned`로 정상 동작하는지 검증.
- 이미지 `src`를 **렌더 시점에 `sanitizeURL` 통과**시킨다. 현재는 입력 시점에만 검증해,
  FileReader 경로·임포트된 문서 JSON이 검증을 우회한다. 적용 위치:
  `renderer.js` 이미지 블록 렌더, `media.js`의 `renderSlideBlock`, `openImageViewer`/`viewerNav`.
- `uploadToStorage`의 MIME 검증 강화 (`firestore.js:567-580`): substring 매칭을 정확 비교로 교체.
- 이미지 `FileReader` 경로에 파일 크기 제한과 `onerror` 핸들러 추가 (`media.js`).

### 5.2 영상 = 임베드 전용 정리

- `media.js`에서 영상 파일 업로드 경로(존재 시)를 제거하고, `video` 블록은
  YouTube/Vimeo 임베드만 지원하도록 정리한다.
- `firebase.js:21` `ALLOWED_VIDEO_TYPES`의 사용처를 정리한다(영상 파일 업로드가 사라지면 불필요).

### 5.3 깨진 Firebase 이미지 일괄 삭제

- `cleanupFirebaseAssets(true)` dry-run으로 삭제 대상을 콘솔에서 확인한다.
- 확인 후 `cleanupFirebaseAssets(false)`로 실제 삭제하고 변경 페이지를 저장한다.
- 콘솔 1회성 작업이므로 별도 UI는 만들지 않는다.
- **비가역적 작업** — dry-run 검토는 필수.

### 5.4 죽은 Firebase Storage 코드 제거

- `firebase.js:8` `export var storage=firebase.storage();` 제거.
- `firebase.js:13` `STORAGE_LIMIT`, `firestore.js:549-559` `getStorageUsage`/`updateStorageUsage`
  및 인앱 용량 표시 UI 제거. Cloudinary 무료 플랜은 5GB가 아니라 월 25 크레딧이며,
  앱이 사용량을 조회할 수 없으므로 기존 용량 표시·제한은 의미가 없다.
- `migrate-images.js`의 `migrateImagesToCloudinary`(다운로드 기반, 동작 불가)를 제거한다.
  `cleanupFirebaseAssets`만 남기고, 5.3 실행 완료 후 파일 전체를 삭제한다.
- 위 정리 과정에서 `main.js`의 `window.migrateImages` 중복 할당(`main.js:284`, `:365`)
  회귀도 함께 해소한다.

### 5.5 Cloudinary 대시보드 하드닝 (설정 작업 — 코드 아님)

5년 운영을 위한 핵심. unsigned preset은 cloud name만 알면 누구나 업로드할 수 있어
무료 크레딧이 고갈될 수 있다. 서명 업로드는 백엔드가 필요해 불가하므로,
대시보드 제약으로 피해를 한정한다.

- unsigned preset `acid_unsigned`에 제약 적용: 최대 파일 크기, 허용 포맷 고정,
  incoming transformation 비활성, 업로드 폴더 고정.
- on-the-fly 변환을 최소화한다(변환 호출은 크레딧을 소모한다).
- Cloudinary 계정 소유자·복구 정보를 문서화한다(계정 분실 시 전체 유실 방지).

### 5.6 검증·QA 및 테스트

- 신규 이미지 업로드 → Cloudinary URL 생성 → **다른 계정/브라우저에서 공유 URL 열림 확인**(요구사항 1).
- 영상 임베드 동작 확인(요구사항 2).
- `cleanupFirebaseAssets` 실행 후 문서가 정상 표시되는지 확인.
- `uploadToStorage`에 대한 테스트 추가(성공/실패/타입 거부/크기 초과) — 현재 `firestore.test.js` 미커버.

## 6. 범위 밖 (Out of Scope)

- 영상 파일 호스팅 — 임베드로 충분.
- 기존 깨진 이미지 복구 — 원본 유실로 불가능.
- 자체 백엔드 / 서명 업로드 — 본 앱은 서버가 없다.
- Cloudinary 사용량 실시간 모니터링 — API 키가 필요하며 무료 플랜 범위 밖.

## 7. 리스크 / 한계

- **무료 크레딧 고갈 가능성**: 하드닝(5.5)으로 줄이지만 0은 아니다.
  한도 소진 시 해당 월의 업로드/전송이 제한될 수 있다.
- **5년 보장은 계약상 불가**: 어떤 무료 서비스도 5년을 보장하지 않는다.
  Cloudinary는 비교적 안정적이나 무료 정책 변경 리스크는 존재한다.
  진정한 장기 보장이 필요하면 유료 전환이 답이다.
- **5.3은 비가역적**: 깨진 이미지 블록 삭제는 되돌릴 수 없다. dry-run 검토 필수.

## 8. 성공 기준

- [ ] 신규 이미지 업로드 시 Cloudinary CDN URL이 생성되고, 다른 계정/브라우저에서 열린다.
- [ ] 영상 블록이 임베드 전용으로 동작하고, 영상 파일 업로드 경로가 제거되었다.
- [ ] `cleanupFirebaseAssets` 실행으로 깨진 Firebase Storage 참조가 데이터에서 제거되었다.
- [ ] 죽은 Firebase Storage 코드(`storage`, `STORAGE_LIMIT`, 용량 함수/UI)가 모두 제거되었다.
- [ ] `migrate-images.js`가 제거되고 `main.js`의 `window.migrateImages` 중복 할당이 해소되었다.
- [ ] `uploadToStorage` 테스트가 추가되어 통과한다.
- [ ] Cloudinary 대시보드 하드닝이 적용되고 계정 정보가 문서화되었다.
