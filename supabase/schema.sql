-- 쿠폰맵 (CouponMap) database schema
-- Postgres / Supabase
--
-- Run order matters: brands first (referenced by stores and coupons).
-- pgcrypto provides gen_random_uuid() on Supabase by default.

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- Brands: the franchise. Holds deep-link + fallback targets.
create table if not exists brands (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'manual',
  external_id   text,
  name          text not null,
  app_scheme    text,          -- e.g. 'mybrandapp://' ; nullable (web-only brands)
  store_url     text not null, -- web URL used as desktop / no-scheme fallback
  app_store_url text,          -- App Store / Play Store URL for mobile fallback
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Stores: physical locations belonging to a brand.
create table if not exists stores (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands (id) on delete cascade,
  source     text not null default 'manual',
  external_id text,
  name       text not null,
  lat        double precision not null,
  lng        double precision not null,
  address    text,
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Coupons: discount offers tied to a brand (redeemed in the brand's own app).
create table if not exists coupons (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands (id) on delete cascade,
  source         text not null default 'manual',
  external_id    text,
  content_hash   text,
  title          text not null,
  discount_type  text not null check (discount_type in ('정액', '정률', '세트')),
  discount_value numeric not null,
  valid_until    date,
  is_active      boolean not null default true,
  raw_payload    jsonb,
  updated_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- User-submitted feedback. Reference fields are intentionally text because
-- reports may point at stale, deleted, or development/demo entities.
create table if not exists feedback_reports (
  id                   uuid primary key default gen_random_uuid(),
  type                 text not null check (
    type in ('coupon_incorrect', 'store_location', 'app_problem', 'feature_request', 'other')
  ),
  message              text not null check (char_length(message) between 3 and 1000),
  contact              text,
  store_id             text,
  coupon_id            text,
  brand_id             text,
  brand_name           text,
  page_path            text,
  search_radius_meters integer,
  user_agent           text,
  source               text not null default 'coupon-map-web',
  status               text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  created_at           timestamptz not null default now(),
  reviewed_at          timestamptz
);

-- Keep re-running this setup file useful for existing databases.
alter table brands add column if not exists source text not null default 'manual';
alter table brands add column if not exists external_id text;
alter table brands add column if not exists updated_at timestamptz not null default now();
alter table brands add column if not exists last_seen_at timestamptz;

alter table stores add column if not exists source text not null default 'manual';
alter table stores add column if not exists external_id text;
alter table stores add column if not exists updated_at timestamptz not null default now();
alter table stores add column if not exists last_seen_at timestamptz;
alter table stores add column if not exists location geography(Point, 4326)
  generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored;

alter table coupons add column if not exists source text not null default 'manual';
alter table coupons add column if not exists external_id text;
alter table coupons add column if not exists content_hash text;
alter table coupons add column if not exists raw_payload jsonb;
alter table coupons add column if not exists updated_at timestamptz not null default now();
alter table coupons add column if not exists last_seen_at timestamptz;

alter table feedback_reports add column if not exists contact text;
alter table feedback_reports add column if not exists store_id text;
alter table feedback_reports add column if not exists coupon_id text;
alter table feedback_reports add column if not exists brand_id text;
alter table feedback_reports add column if not exists brand_name text;
alter table feedback_reports add column if not exists page_path text;
alter table feedback_reports add column if not exists search_radius_meters integer;
alter table feedback_reports add column if not exists user_agent text;
alter table feedback_reports add column if not exists source text not null default 'coupon-map-web';
alter table feedback_reports add column if not exists status text not null default 'new';
alter table feedback_reports add column if not exists reviewed_at timestamptz;

-- Public frontend reads. Supabase service_role keeps its default RLS bypass for ingest.
alter table brands enable row level security;
alter table stores enable row level security;
alter table coupons enable row level security;
alter table feedback_reports enable row level security;

drop policy if exists brands_select_anon_authenticated on brands;
create policy brands_select_anon_authenticated
  on brands
  for select
  to anon, authenticated
  using (true);

drop policy if exists stores_select_anon_authenticated on stores;
create policy stores_select_anon_authenticated
  on stores
  for select
  to anon, authenticated
  using (true);

drop policy if exists coupons_select_anon_authenticated on coupons;
create policy coupons_select_anon_authenticated
  on coupons
  for select
  to anon, authenticated
  using (true);

-- Browser clients read with anon/authenticated roles; RLS policies above limit
-- them to SELECT-only access. Service-side crawler/import scripts use the
-- service_role key for writes. Feedback reports are written only through
-- the server API with the service_role key.
grant usage on schema public to anon, authenticated, service_role;
grant select on table brands, stores, coupons to anon, authenticated;
grant all on table brands, stores, coupons, feedback_reports to service_role;

-- Indexes for the hot lookup paths (filter map stores/coupons by brand and active validity).
create index if not exists idx_stores_brand_id on stores (brand_id);
create index if not exists idx_coupons_brand_id on coupons (brand_id);
create index if not exists idx_feedback_reports_status_created_at
  on feedback_reports (status, created_at desc);
create index if not exists idx_feedback_reports_store_id_created_at
  on feedback_reports (store_id, created_at desc)
  where store_id is not null;
create index if not exists idx_stores_brand_lat_lng
  on stores (brand_id, lat, lng);
create index if not exists idx_coupons_active_brand_valid_until
  on coupons (brand_id, valid_until)
  where is_active = true;
drop index if exists idx_coupons_brand_source_content_hash;
create unique index if not exists idx_coupons_brand_source_content_hash
  on coupons (brand_id, source, content_hash);

-- Upsert keys for crawler-managed data. Coupon content_hash supports fallback/change detection.
create unique index if not exists idx_brands_source_external_id
  on brands (source, external_id);
create unique index if not exists idx_stores_brand_source_external_id
  on stores (brand_id, source, external_id);
create unique index if not exists idx_coupons_brand_source_external_id
  on coupons (brand_id, source, external_id);


create index if not exists idx_stores_location_gist
  on stores using gist (location);

create or replace function public.nearby_stores(
    p_lat double precision,
    p_lng double precision,
    p_radius_meters integer default 1000
  )
  returns table (
    id uuid,
    brand_id uuid,
    source text,
    external_id text,
    name text,
    lat double precision,
    lng double precision,
    address text,
    updated_at timestamptz,
    last_seen_at timestamptz,
    created_at timestamptz,
    distance_meters double precision
  )
  language sql
  stable
  security invoker
  as $$
    select
      s.id,
      s.brand_id,
      s.source,
      s.external_id,
      s.name,
      s.lat,
      s.lng,
      s.address,
      s.updated_at,
      s.last_seen_at,
      s.created_at,
      st_distance(
        s.location,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) as distance_meters
    from stores s
    where st_dwithin(
      s.location,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      least(greatest(p_radius_meters, 0), 5000)
    )
    order by distance_meters asc
    limit 100;
  $$;

  grant execute on function public.nearby_stores(double precision, double precision, integer)
  to anon, authenticated;