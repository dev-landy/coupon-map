-- Re-apply this when the frontend shows:
--   permission denied for table brands
--   column brands.iphone_store_url does not exist
--
-- It restores the schema/read-only public access expected by the Next.js app.

alter table public.brands add column if not exists iphone_store_url text;

alter table public.brands enable row level security;
alter table public.stores enable row level security;
alter table public.coupons enable row level security;

drop policy if exists brands_select_anon_authenticated on public.brands;
create policy brands_select_anon_authenticated
  on public.brands
  for select
  to anon, authenticated
  using (true);

drop policy if exists stores_select_anon_authenticated on public.stores;
create policy stores_select_anon_authenticated
  on public.stores
  for select
  to anon, authenticated
  using (true);

drop policy if exists coupons_select_anon_authenticated on public.coupons;
create policy coupons_select_anon_authenticated
  on public.coupons
  for select
  to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on table public.brands, public.stores, public.coupons to anon, authenticated;
grant all on table public.brands, public.stores, public.coupons to service_role;
