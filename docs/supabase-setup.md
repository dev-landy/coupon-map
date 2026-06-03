# Supabase 설정

이 프로젝트는 Supabase를 크롤러와 Next.js 프론트가 함께 쓰는 공용 데이터베이스로 사용합니다.

전체 흐름은 아래와 같습니다.

```text
ADB 크롤러
→ brands / stores / coupons upsert
→ Next.js 프론트에서 Supabase 조회
→ 쿠폰맵 화면 렌더링
```

## 1. Supabase 프로젝트 만들기

Supabase에서 새 프로젝트를 만들고 Project Settings에서 아래 값을 복사합니다.

- Project URL
- anon public key
- service_role key

`service_role` key는 서버/크롤러 전용 비밀키입니다. 브라우저에 절대 노출하면 안 됩니다.

## 2. DB 스키마 적용하기

Supabase SQL Editor를 열고 [supabase/schema.sql](../supabase/schema.sql)의 내용을 실행합니다.

이 스키마는 아래 테이블을 만듭니다.

- `brands`
- `stores`
- `coupons`

또한 RLS를 켜고, `anon` 및 `authenticated` 역할에는 읽기 권한만 허용합니다.
크롤러의 쓰기 작업은 `service_role` key로 수행합니다.

## 3. 프론트 환경변수 설정하기

`.env.local.example`을 복사해서 `.env.local`을 만듭니다.

```bash
cp .env.local.example .env.local
```

`.env.local`에 아래 값을 채웁니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

이 두 값은 브라우저에 노출되는 public 값입니다. DB 읽기 권한은 Supabase RLS 정책으로 제어합니다.

## 4. 크롤러 환경변수 설정하기

`.env.crawler.example`을 복사해서 `.env.crawler.local`을 만듭니다.

```bash
cp .env.crawler.example .env.crawler.local
```

`.env.crawler.local`에 아래 값을 채웁니다.

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRAWL_SOURCES=burgerking-kr-adb,kfc-kr-adb
```

프로젝트의 Node 스크립트는 `.env.local`과 `.env.crawler.local`을 자동으로 읽습니다.

현재 맥도날드 ADB 크롤러는 앱 진입 이슈가 있어 기본 운영 source에서 제외합니다.
안정화되면 `CRAWL_SOURCES`에 `mcdonalds-kr-adb`를 다시 추가하면 됩니다.

## 5. DB에 쓰지 않고 크롤러 확인하기

먼저 dry-run으로 크롤러가 정상 동작하는지 확인합니다.

```bash
npm run crawl:all -- --sources burgerking-kr-adb,kfc-kr-adb --dry-run
```

이 명령은 앱 크롤링과 데이터 정규화까지만 수행하고 Supabase에는 저장하지 않습니다.

## 6. Supabase에 쿠폰 저장하기

dry-run이 정상이라면 실제 저장을 실행합니다.

```bash
npm run crawl:all -- --sources burgerking-kr-adb,kfc-kr-adb
```

저장 흐름은 아래와 같습니다.

- `brands`는 `source, external_id` 기준으로 upsert
- `stores`는 `brand_id, source, external_id` 기준으로 upsert
- `coupons`는 `brand_id, source, external_id` 기준으로 upsert
- 이번 크롤에서 사라진 기존 쿠폰은 삭제하지 않고 `is_active=false` 처리

## 7. 매장 데이터 넣기

프론트 지도는 `brands`, `coupons`, `stores`가 모두 있어야 매장을 표시합니다.
쿠폰만 저장되어 있고 매장 데이터가 없으면 지도에는 아무것도 뜨지 않습니다.

버거킹/KFC 매장은 공식 웹 API에서 바로 Supabase에 저장할 수 있습니다.

```bash
npm run sync:stores -- --dry-run
```

문제가 없으면 실제 저장을 실행합니다.

```bash
npm run sync:stores
```

CSV 파일을 남기고 싶다면 아래 명령으로 `data/stores.official.csv`를 생성할 수 있습니다.

```bash
npm run fetch:stores
```

직접 관리하는 매장 CSV를 넣고 싶다면 `data/stores.example.csv`를 복사해서 같은 컬럼 형식으로 작성한 뒤 `--file` 경로만 바꿔 실행합니다.

```bash
npm run import:stores -- --file data/stores.example.csv
```

CSV 컬럼은 아래 형식입니다.

```csv
brand_source,brand_external_id,source,external_id,name,lat,lng,address
```

예를 들어 `brand_source=kfc-kr-adb`, `brand_external_id=kfc`인 매장은 KFC 브랜드 row에 연결됩니다.

## 8. 프론트에서 확인하기

환경변수와 DB 데이터가 준비되면 프론트를 실행합니다.

```bash
npm run dev
```

브라우저에서 로컬 Next 앱을 열어 확인합니다.

화면이 비어 있다면 Supabase에서 아래를 확인합니다.

- 브라우저 화면에 `permission denied for table brands` 같은 메시지가 보이면
  [supabase/public-read-grants.sql](../supabase/public-read-grants.sql)을 SQL Editor에서 실행했는지
- `brands`에 row가 있는지
- `coupons`에 `is_active=true`인 row가 있는지
- `stores`에 유효한 `brand_id`, `lat`, `lng`가 있는지
- `stores.brand_id`가 쿠폰이 있는 브랜드와 연결되어 있는지

현재 쿠폰맵 화면은 활성 쿠폰이 있는 브랜드의 매장만 표시합니다.

## 9. 자동 크롤 실행 설정하기

macOS launchd로 크롤러를 자동 실행할 수 있습니다.

설치:

```bash
npm run crawler:launchd:install
```

상태 확인:

```bash
npm run crawler:launchd:status
```

제거:

```bash
npm run crawler:launchd:uninstall
```

현재 launchd 설정은 하루 한 번 `00:05`에 실행됩니다.

로그는 아래 디렉터리에 저장됩니다.

```text
logs/
```

## 10. 운영 체크리스트

운영 전에 아래를 확인합니다.

- Android emulator가 정상 실행되는지
- Burger King / KFC 앱 로그인이 유지되는지
- `.env.crawler.local`에 `SUPABASE_SERVICE_ROLE_KEY`가 들어 있는지
- Supabase SQL Editor에서 [supabase/schema.sql](../supabase/schema.sql)을 최신 버전으로 실행했는지
- `CRAWL_SOURCES`에 안정화된 source만 들어 있는지
- 매장 CSV import가 끝났는지
- Supabase에서 프론트가 `brands`, `stores`, `coupons`를 읽을 수 있는지

기본 운영 source:

```bash
CRAWL_SOURCES=burgerking-kr-adb,kfc-kr-adb
```
