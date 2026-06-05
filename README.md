# coupon-map-v2

## 데이터 업데이트

Supabase에 쓰는 명령은 `.env.crawler.local` 또는 `.env.local`에 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있어야 합니다.

현재 운영 기본 쿠폰 데이터를 크롤링해서 Supabase에 반영합니다.

```bash
npm run crawl:all -- --sources burgerking-kr-adb,kfc-kr-adb
```

맥도날드 쿠폰만 지금 반영하려면 아래 명령을 실행합니다.

```bash
npm run crawl:all -- --sources mcdonalds-kr-adb
```

버거킹/KFC/맥도날드 쿠폰을 함께 반영하려면 source를 함께 지정합니다.

```bash
npm run crawl:all -- --sources burgerking-kr-adb,kfc-kr-adb,mcdonalds-kr-adb
```

DB에 쓰지 않고 먼저 확인하려면 dry-run으로 실행합니다.

```bash
npm run crawl:all -- --sources burgerking-kr-adb,kfc-kr-adb --dry-run
```

공식 매장 데이터를 fetch해서 Supabase의 매장 데이터까지 업데이트합니다.

```bash
npm run sync:stores
```

DB에 쓰지 않고 확인하려면 아래처럼 실행합니다.

```bash
npm run sync:stores -- --dry-run
```

CSV 파일만 갱신하려면 `data/stores.official.csv`를 생성하는 fetch 명령을 사용합니다.

```bash
npm run fetch:stores
```

크롤러와 Supabase 설정의 전체 흐름은 [docs/supabase-setup.md](docs/supabase-setup.md)를 참고합니다.
