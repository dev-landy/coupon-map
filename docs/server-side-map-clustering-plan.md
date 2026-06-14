# 서버 사이드 지도 클러스터링 계획

## 배경

줌아웃 상태에서 화면 bounds를 모두 포함하도록 검색 반경을 키우면 `/api/coupon-map`이 많은 매장 row를 가져올 수 있다. 현재 클라이언트 클러스터링은 이미 받은 매장 배열을 화면 좌표 기준으로 묶기 때문에, 데이터 수가 커질수록 아래 비용이 커진다.

- Supabase `nearby_stores`가 많은 매장 row를 반환
- API가 매장별 쿠폰 view를 구성
- 브라우저가 매장/쿠폰 데이터를 파싱하고 마커/리스트 상태를 갱신
- 클라이언트가 다시 클러스터 count를 계산

줌아웃 상태에서는 실제 매장 상세가 필요하지 않으므로, Supabase에서 클러스터 row만 계산해 전달하는 구조로 전환한다.

## 목표

- 줌아웃 지도에서는 매장 목록 대신 `count + center` 클러스터만 내려준다.
- 줌인 지도에서는 기존처럼 실제 매장/쿠폰 목록을 내려준다.
- 클러스터 클릭 시 해당 클러스터 중심으로 이동하고 줌인한다.
- 쿠폰 패널은 클러스터 모드에서 무거운 매장 리스트를 렌더하지 않는다.
- 기존 `nearby_stores` 기반 UX와 데이터 정합성을 유지하면서 단계적으로 교체한다.

## 비목표

- PostGIS 타일 서버나 외부 지도 클러스터링 라이브러리 도입
- 쿠폰 랭킹 로직 전면 개편
- 서버에서 화면 픽셀 정확도까지 완전히 맞추는 클러스터링

## API 설계

기존 `/api/coupon-map`에 모드를 추가한다.

```text
/api/coupon-map?mode=stores&lat=...&lng=...&radiusMeters=...
/api/coupon-map?mode=clusters&south=...&west=...&north=...&east=...&level=...
```

응답 타입은 모드로 분기한다.

```ts
type CouponMapStoresResponse = {
  mode: 'stores';
  view: CouponMapView;
  status: CouponMapLoadStatus;
  message: string | null;
  radiusMeters: number;
};

type CouponMapClustersResponse = {
  mode: 'clusters';
  clusters: CouponMapCluster[];
  status: CouponMapLoadStatus;
  message: string | null;
};

type CouponMapCluster = {
  id: string;
  lat: number;
  lng: number;
  storeCount: number;
  activeCouponCount: number;
};
```

프론트는 지도 레벨이 `CLUSTER_MIN_MAP_LEVEL` 이상이면 `clusters` 모드, 그보다 가까우면 `stores` 모드를 요청한다.

## Supabase SQL 계획

`nearby_stores`와 별도로 클러스터 전용 RPC를 만든다. 클러스터는 bounds 안에 있고 활성 쿠폰이 있는 매장만 대상으로 한다.

초기 버전은 lat/lng grid 기반으로 구현한다. 화면 픽셀과 1:1로 맞지는 않지만 빠르고 안정적이다. grid 크기는 지도 level에 따라 SQL에서 결정하거나 API에서 `p_cell_degrees`로 넘긴다.

```sql
create or replace function public.clustered_coupon_stores(
    p_south double precision,
    p_west double precision,
    p_north double precision,
    p_east double precision,
    p_cell_degrees double precision
  )
  returns table (
    cluster_id text,
    lat double precision,
    lng double precision,
    store_count integer,
    active_coupon_count integer
  )
  language sql
  stable
  security invoker
  as $$
    with visible_stores as (
      select
        s.id,
        s.lat,
        s.lng,
        floor(s.lat / p_cell_degrees)::integer as grid_y,
        floor(s.lng / p_cell_degrees)::integer as grid_x
      from stores s
      where
        s.lat between least(p_south, p_north) and greatest(p_south, p_north)
        and s.lng between least(p_west, p_east) and greatest(p_west, p_east)
        and exists (
          select 1
          from coupons c
          where c.brand_id = s.brand_id
            and c.is_active = true
            and (c.valid_until is null or c.valid_until >= current_date)
        )
    )
    select
      concat(grid_x, ':', grid_y) as cluster_id,
      avg(lat) as lat,
      avg(lng) as lng,
      count(*)::integer as store_count,
      count(*)::integer as active_coupon_count
    from visible_stores
    group by grid_x, grid_y
    order by store_count desc;
  $$;

grant execute on function public.clustered_coupon_stores(
  double precision,
  double precision,
  double precision,
  double precision,
  double precision
) to anon, authenticated;
```

`active_coupon_count`는 1차에서는 store count와 동일하게 둔다. 쿠폰 수까지 정확히 필요해지면 `coupons` join을 추가한다. 처음부터 join을 크게 만들면 줌아웃 성능 이점이 줄어들 수 있다.

## 프론트 계획

1. Kakao map bounds를 읽어 `south/west/north/east`를 만든다.
2. 지도 레벨이 클러스터 기준 이상이면 `/api/coupon-map?mode=clusters`를 호출한다.
3. `displayView`와 별도로 `displayClusters` 상태를 둔다.
4. `MarkerLayer` props를 `stores | clusters`를 받는 형태로 확장한다.
5. 클러스터 모드에서는 쿠폰 패널에 전체 리스트 대신 가벼운 상태를 보여준다.
6. 클러스터 클릭 시 `map.setLevel(map.getLevel() - 2)` 후 cluster center로 이동한다.
7. 충분히 줌인되면 stores 모드로 전환되어 실제 매장/쿠폰을 다시 로드한다.

## 캐시 전략

- 클러스터 요청 cache key는 rounded bounds + level + cell size로 만든다.
- stores 요청 cache와 clusters 요청 cache를 분리한다.
- 줌아웃 중 이동이 잦으므로 debounce는 기존 viewport reload debounce를 재사용한다.
- 같은 level에서 작은 이동은 rounded bounds key로 캐시 히트되도록 한다.

## 검증 계획

- SQL 함수 테스트
  - bounds 밖 매장은 제외
  - 활성 쿠폰 없는 브랜드 매장은 제외
  - 같은 grid 매장은 하나의 cluster로 집계

- API 테스트
  - `mode=clusters`가 clustered RPC를 호출
  - 잘못된 bounds/cell 값은 400
  - `mode=stores` 기존 동작 유지

- 프론트 테스트
  - 줌아웃 시 cluster API 요청
  - 줌인 시 stores API 요청
  - cluster 응답이 `MarkerLayer`에서 count 마커로 표시
  - cluster 클릭 시 줌인 및 중심 이동
  - stores 모드에서는 기존 쿠폰 패널 유지

## 롤아웃 순서

1. Supabase `clustered_coupon_stores` 함수 추가
2. `lib/couponMapData.ts`에 클러스터 loader 추가
3. `/api/coupon-map`에 `mode=clusters` 분기 추가
4. 프론트 상태에 `clusters` 모드 추가
5. `MarkerLayer`에 서버 클러스터 렌더링 경로 추가
6. 클러스터 모드 패널 UI를 가볍게 처리
7. 실제 데이터로 줌아웃 성능 확인
8. 필요하면 grid 크기와 level threshold 조정

## 리스크와 대응

- 클러스터 경계가 화면 픽셀 기준과 다를 수 있다.
  - 1차는 성능 우선으로 lat/lng grid를 사용하고, 필요하면 Web Mercator tile grid 방식으로 개선한다.

- 클러스터 모드에서 쿠폰 패널 정보가 줄어든다.
  - 줌아웃에서는 "이 지역에 쿠폰 매장 N개" 같은 summary를 보여주고, 줌인 유도를 명확히 한다.

- `active_coupon_count`를 정확히 세면 SQL 비용이 늘 수 있다.
  - 1차는 `store_count`만 신뢰하고, 정확한 쿠폰 수는 stores 모드에서 보여준다.

- bounds가 너무 넓으면 cluster row도 많아질 수 있다.
  - level별 `p_cell_degrees`를 키우고, 최대 cluster row 제한을 둔다.

## 완료 기준

- 줌아웃 상태에서 `/api/coupon-map` 응답 payload가 실제 매장 row 대신 cluster row 중심으로 줄어든다.
- 대량 매장 데이터에서도 지도 이동/줌아웃이 눈에 띄게 버벅이지 않는다.
- 줌인 시 기존 매장/쿠폰 선택 경험이 유지된다.
- `npm run lint`와 관련 테스트가 통과한다.
