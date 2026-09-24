create table if not exists public.shafx_api_rate_limits (
  bucket_id text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.shafx_api_rate_limits enable row level security;
drop policy if exists "No direct client access to SHAFX api rate limits" on public.shafx_api_rate_limits;
create policy "No direct client access to SHAFX api rate limits"
  on public.shafx_api_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.consume_shafx_api_rate_limit(
  p_bucket_id text,
  p_limit integer,
  p_window_seconds integer default 60,
  p_reset boolean default false
)
returns table(blocked boolean, request_count integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_started_at timestamptz;
  v_count integer;
  v_window_seconds integer := greatest(1, least(p_window_seconds, 86400));
  v_limit integer := greatest(1, least(p_limit, 100000));
begin
  if p_bucket_id is null or length(trim(p_bucket_id)) = 0 then
    raise exception 'api rate limit bucket is required';
  end if;

  insert into public.shafx_api_rate_limits (bucket_id, window_started_at, request_count, updated_at)
  values (p_bucket_id, v_now, 0, v_now)
  on conflict (bucket_id) do nothing;

  select r.window_started_at, r.request_count
    into v_started_at, v_count
    from public.shafx_api_rate_limits r
   where r.bucket_id = p_bucket_id
   for update;

  if p_reset or v_now >= v_started_at + make_interval(secs => v_window_seconds) then
    v_started_at := v_now;
    v_count := 0;
  end if;

  if not p_reset then
    v_count := v_count + 1;
  end if;

  update public.shafx_api_rate_limits
     set window_started_at = v_started_at,
         request_count = v_count,
         updated_at = v_now
   where bucket_id = p_bucket_id;

  return query
  select
    v_count > v_limit,
    v_count,
    greatest(
      1,
      ceil(
        extract(
          epoch from (v_started_at + make_interval(secs => v_window_seconds) - v_now)
        )
      )::integer
    );
end;
$$;

revoke execute on function public.consume_shafx_api_rate_limit(text, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.consume_shafx_api_rate_limit(text, integer, integer, boolean)
  to service_role;

create index if not exists shafx_api_rate_limits_updated_idx
  on public.shafx_api_rate_limits (updated_at desc);

comment on table public.shafx_api_rate_limits is
  'Server-only per-client API throttling buckets for SHAFX.';

alter function public.consume_shafx_api_rate_limit(text, integer, integer, boolean)
  set search_path = '';
