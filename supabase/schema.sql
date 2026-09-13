-- SHAFX Stage 7 identity schema
-- Run this once in the Supabase SQL Editor for the SHAFX project.

create table if not exists public.shafx_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  status text not null default 'active' check (status in ('active','suspended','banned')),
  simulator_account_id text unique not null default ('SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shafx_profiles enable row level security;

create policy "Users can read own SHAFX profile"
on public.shafx_profiles for select
using (auth.uid() = id);

create policy "Users can update own display name"
on public.shafx_profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_shafx_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.shafx_profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_shafx on auth.users;
create trigger on_auth_user_created_shafx
after insert on auth.users
for each row execute procedure public.handle_new_shafx_user();

create or replace function public.set_shafx_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_shafx_profile_updated on public.shafx_profiles;
create trigger on_shafx_profile_updated
before update on public.shafx_profiles
for each row execute procedure public.set_shafx_profile_updated_at();
