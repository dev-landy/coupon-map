# TODOS — 쿠폰맵 (CouponMap)

office-hours + plan-eng-review (2026-06-01)에서 의도적으로 이연한 작업.
근거를 잃지 않도록 맥락 포함.

---

## 1. 딥링크 실제 검증 (최우선 / 코딩 전 블로커)
- **What:** 시작 브랜드 2개 앱을 실제 폰에 깔고, URL scheme 실행 + 미설치 시 스토어
  fallback이 실제로 동작하는지 손으로 확인.
- **Why:** "쿠폰 탭 → 브랜드 앱 실행"이 안 되면 제품 가치 절반이 사라짐. 한국 프랜차이즈
  앱의 deeplink 지원은 불확실(특정 쿠폰 화면은 거의 미지원으로 가정).
- **Pros:** 코딩 전에 핵심 가정 검증. 안 되는 브랜드면 시작 브랜드 교체.
- **Cons:** 폰 2대/2 OS 확인 필요(iOS/Android scheme 다름).
- **Context:** 결정사항 = "앱 실행까지만" 보장. 특정 쿠폰 화면 이동은 범위 밖.
  `lib/deeplink.ts openBrandApp()` 구현 전에 brand별 scheme/store_url/app_store_url 확보.
- **Depends on:** 시작 브랜드 2개 확정.

## 2. 크롤러 파이프라인 (B단계, 수요 검증 후)
- **What:** 수동 Supabase 입력을 자동 크롤링으로 전환.
- **Why:** 수동은 확장 불가. 검증되면 데이터 신선도·커버리지 위해 필요.
- **Pros:** 브랜드 다수 확장, 갱신 자동화.
- **Cons:** 앱 크롤링은 깨지기 쉬움(로그인/토큰/동적화면), 약관·법적 리스크.
- **Context:** 1순위 사업 리스크 = 쿠폰 데이터 공급. MVP는 의도적으로 회피.
  수요 검증(숙제: 신촌 5명 관찰) 통과 후 착수.
- **Depends on:** 수요 검증 완료, 시작 브랜드의 크롤링 난이도 조사.

### 2.1 맥도날드/KFC ADB 어댑터 추가
- **What:** 버거킹 ADB 크롤러 패턴을 확장해 맥도날드와 KFC 쿠폰 어댑터를 구현.
- **Targets:**
  - 맥도날드: `com.mcdonalds.mobileapp`
  - KFC: `kfc_ko.kore.kg.kfc_korea`
- **Files:**
  - `lib/ingest/adapters/mcdonaldsKrAdb.ts`
  - `lib/ingest/adapters/kfcKrAdb.ts`
  - `lib/ingest/adapters/index.ts`
  - `tests/mcdonalds-adb.test.ts`
  - `tests/kfc-adb.test.ts`
- **Acceptance Criteria:**
  - 각 앱을 ADB로 실행하고 쿠폰 화면까지 자동 진입.
  - `uiautomator dump` XML에서 쿠폰명, 유효기간, 가격/할인 정보를 파싱.
  - `CrawlPayload` 형태로 정규화되어 `normalizeCrawlPayload()` 통과.
  - `npm run ingest -- --source mcdonalds-kr-adb --dry-run` 통과.
  - `npm run ingest -- --source kfc-kr-adb --dry-run` 통과.
  - launchd runner의 `CRAWLER_COMMAND` 또는 추후 `crawl-all`에서 함께 실행 가능.
- **Notes:** 앱 화면 구조가 버거킹처럼 WebView XML에 텍스트를 노출하면 파서 방식으로 처리.
  텍스트가 XML에 없으면 스크린샷/OCR 또는 API 캡처 전략을 별도 검토.

### 2.2 Supabase 쿠폰 저장 잡 운영화
- **What:** ADB 크롤러 결과를 로컬 백엔드 잡에서 Supabase `brands`, `stores`, `coupons`에 upsert.
- **Files:**
  - `scripts/crawl-all.ts`
  - `lib/ingest/supabase.ts`
  - `lib/ingest/rows.ts`
  - `scripts/run-crawler-launchd.sh`
  - `.env.crawler.local`
- **Acceptance Criteria:**
  - 여러 source를 순차 실행하는 `crawl-all` 커맨드 추가.
  - source별 실패가 전체 잡을 중단하지 않고 다음 source로 진행.
  - 성공한 source는 Supabase upsert, 실패한 source는 기존 DB 데이터 유지.
  - 이번 크롤에서 사라진 기존 쿠폰은 즉시 삭제하지 않고 `is_active=false` 처리.
  - `last_seen_at`, `updated_at`, `raw_payload`가 저장되어 추적 가능.
  - `SUPABASE_SERVICE_ROLE_KEY`는 `.env.crawler.local`에만 두고 프론트 번들에 노출하지 않음.
  - launchd `CRAWLER_COMMAND`를 `npm run crawl:all` 또는 동등 커맨드로 운영 가능.
- **Notes:** 쿠폰 수가 갑자기 0개가 되는 크롤은 장애로 보고 비활성화 반영을 막는 guard 필요.

## 3. Supabase 쿠폰 지도 프론트
- **What:** Supabase에 저장된 브랜드/매장/쿠폰 데이터를 프론트에서 읽어 지도 기반 UI에 표시.
- **Why:** 크롤러가 만든 데이터를 실제 사용자 가치로 연결하는 핵심 화면.
- **Files:**
  - `app/page.tsx`
  - `lib/supabase.ts`
  - `lib/stores.ts`
  - `lib/coupons.ts`
  - `lib/deeplink.ts`
  - `lib/uiData.ts` 제거 또는 fallback 전용화
- **Acceptance Criteria:**
  - `brands`, `stores`, `coupons`를 Supabase에서 조회.
  - 활성 쿠폰만 표시하고 `valid_until` 만료 쿠폰은 제외.
  - 사용자 위치 또는 기본 위치 기준으로 주변 매장을 거리순 표시.
  - 매장 마커/리스트에 해당 매장의 최고 쿠폰 또는 대표 쿠폰 노출.
  - 브랜드/할인율/만료일/거리 기준 필터 또는 정렬 제공.
  - 쿠폰 선택 시 `openBrandApp()`으로 브랜드 앱/웹 fallback 이동.
  - Supabase 로딩/에러/빈 상태 UI 제공.
  - 현재 `lib/uiData.ts` 샘플 데이터 의존도를 제거하거나 개발 fallback으로만 사용.
- **Notes:** 초기 버전은 실제 지도 SDK 없이 좌표 기반 리스트/간단한 맵 플레이스홀더로 시작 가능.
  지도 SDK 도입 시 Kakao/Naver/Google 중 한국 POI/지도 사용성 기준으로 별도 결정.

## 4. PostGIS 위치쿼리 이전
- **What:** 클라이언트 반경 필터 → PostGIS 서버 쿼리(`ST_DWithin`).
- **Why:** 매장 수백·수천 개로 늘면 전체를 클라가 받아 필터링하는 게 비효율.
- **Pros:** 확장성, 페이로드 감소.
- **Cons:** 지금은 불필요(수십 개면 클라로 충분) — YAGNI, 조기 도입 금지.
- **Context:** Supabase는 PostGIS 지원. `stores` 테이블에 geography 컬럼 추가.
- **Depends on:** 매장 수 임계치 도달.

## 5. 위치기반 쿠폰 알림
- **What:** 점심 시간대 "내 주변 best 쿠폰" 푸시/알림.
- **Why:** 리텐션 강화 — 사용자가 앱을 안 열어도 가치 전달.
- **Pros:** 재방문 유도, 발견 가치 능동화.
- **Cons:** 웹 푸시 권한·PWA 제약, 알림 피로. MVP 발견 가치 검증과 무관.
- **Context:** office-hours의 접근 C(알림형)와 연결. MVP(접근 A) 검증 후 고려.
- **Depends on:** MVP 리텐션 데이터.
