-- SHAFX production hardening applied to the connected Supabase project.
-- This migration is intentionally idempotent where practical.

-- Cache auth.uid() once per statement in user-scoped RLS policies.
drop policy if exists "Users can read own SHAFX profile" on public.shafx_profiles;
create policy "Users can read own SHAFX profile" on public.shafx_profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update own display name" on public.shafx_profiles;
create policy "Users can update own display name" on public.shafx_profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read own bot entitlement" on public.shafx_bot_entitlements;
create policy "Users can read own bot entitlement" on public.shafx_bot_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own bot usage" on public.shafx_bot_usage;
create policy "Users can read own bot usage" on public.shafx_bot_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own bot purchases" on public.shafx_bot_purchases;
create policy "Users can read own bot purchases" on public.shafx_bot_purchases
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own bot access" on public.shafx_user_bots;
create policy "Users can read own bot access" on public.shafx_user_bots
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Server-only tables: keep direct client access explicitly denied.
drop policy if exists "No direct client access to SHAFX bot catalog" on public.shafx_bot_catalog;
create policy "No direct client access to SHAFX bot catalog" on public.shafx_bot_catalog
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "No direct client access to SHAFX security events" on public.shafx_security_events;
create policy "No direct client access to SHAFX security events" on public.shafx_security_events
  for all to anon, authenticated
  using (false)
  with check (false);

-- Index foreign-key columns used by purchase/access relationships.
create index if not exists shafx_bot_purchases_bot_slug_idx
  on public.shafx_bot_purchases (bot_slug);
create index if not exists shafx_user_bots_bot_slug_idx
  on public.shafx_user_bots (bot_slug);
create index if not exists shafx_user_bots_source_purchase_id_idx
  on public.shafx_user_bots (source_purchase_id);

-- Remove indexes that the connected advisor identified as unused.
drop index if exists public.shafx_bot_usage_day_idx;
drop index if exists public.shafx_security_events_created_idx;

-- Pin function search paths. SECURITY DEFINER functions use empty/explicit paths.
alter function public.set_shafx_profile_updated_at() set search_path = '';
alter function public.set_shafx_bot_store_updated_at() set search_path = '';
alter function public.handle_new_shafx_user() set search_path = '';
alter function public.handle_new_shafx_user_bot_defaults() set search_path = '';
alter function public.consume_shafx_bot_cycle(uuid, text, integer) set search_path = '';
alter function public.rls_auto_enable() set search_path = 'pg_catalog';
alter function public.activate_shafx_bot_purchase(text, text, timestamptz, jsonb) set search_path = '';

-- State-changing RPCs are server-only.
revoke execute on function public.consume_shafx_bot_cycle(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.handle_new_shafx_user() from public, anon, authenticated;
revoke execute on function public.handle_new_shafx_user_bot_defaults() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.activate_shafx_bot_purchase(text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.consume_shafx_bot_cycle(uuid, text, integer) to service_role;
grant execute on function public.handle_new_shafx_user() to service_role;
grant execute on function public.handle_new_shafx_user_bot_defaults() to service_role;
grant execute on function public.rls_auto_enable() to service_role;
grant execute on function public.activate_shafx_bot_purchase(text, text, timestamptz, jsonb) to service_role;

-- Note: Supabase Auth leaked-password protection is a hosted Auth setting, not SQL.
-- Enable it in Authentication -> Providers -> Email on a supported Supabase plan.
