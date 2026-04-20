-- RLS hardening template for ProjectZ
-- Apply in Supabase SQL editor after checking existing data/backfill plan.

begin;

-- 1) Ensure user ownership columns exist for per-user tables
alter table public.expenses add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.expense_categories add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.card_settings add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.stock_news add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.stock_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Optional backfill if legacy rows existed without user_id.
-- update public.profiles set user_id = id where user_id is null and id is not null;

-- 1-1) Unique constraints for safe upsert patterns
create unique index if not exists card_settings_user_company_uq
  on public.card_settings (user_id, card_company);

-- 2) Enable RLS on all app tables
alter table public.profiles enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_news enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_categories enable row level security;
alter table public.card_settings enable row level security;
alter table public.market_insights enable row level security;
alter table public.stock_ai_recommendations enable row level security;

-- 3) Per-user policies (read/write only own rows)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using (user_id = auth.uid() or id = auth.uid());

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
for all to authenticated
using (user_id = auth.uid() or id = auth.uid())
with check (user_id = auth.uid() or id = auth.uid());

drop policy if exists "stock_items_own" on public.stock_items;
create policy "stock_items_own" on public.stock_items
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "stock_news_own" on public.stock_news;
create policy "stock_news_own" on public.stock_news
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "expenses_own" on public.expenses;
create policy "expenses_own" on public.expenses
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "expense_categories_own" on public.expense_categories;
create policy "expense_categories_own" on public.expense_categories
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "card_settings_own" on public.card_settings;
create policy "card_settings_own" on public.card_settings
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 4) Shared read policies (generated data)
drop policy if exists "market_insights_read_auth" on public.market_insights;
create policy "market_insights_read_auth" on public.market_insights
for select to authenticated
using (true);

drop policy if exists "stock_ai_recommendations_read_auth" on public.stock_ai_recommendations;
create policy "stock_ai_recommendations_read_auth" on public.stock_ai_recommendations
for select to authenticated
using (true);

-- No direct client writes for shared generated tables.
drop policy if exists "market_insights_no_client_write" on public.market_insights;
create policy "market_insights_no_client_write" on public.market_insights
for all to authenticated
using (false)
with check (false);

drop policy if exists "stock_ai_recommendations_no_client_write" on public.stock_ai_recommendations;
create policy "stock_ai_recommendations_no_client_write" on public.stock_ai_recommendations
for all to authenticated
using (false)
with check (false);

commit;
