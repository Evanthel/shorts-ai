create table if not exists public.ai_rate_limits (
  client_key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_rate_limits enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_rate_limits'::regclass
      and conname = 'ai_rate_limits_count_nonnegative'
  ) then
    alter table public.ai_rate_limits
      add constraint ai_rate_limits_count_nonnegative check (count >= 0);
  end if;
end $$;

create or replace function public.consume_ai_rate_limit(
  p_client_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_client_key is null or length(p_client_key) = 0 then
    raise exception 'client key is required' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'limit must be positive' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'window must be positive' using errcode = '22023';
  end if;

  insert into public.ai_rate_limits as rate_limits (
    client_key,
    count,
    reset_at,
    updated_at
  )
  values (
    p_client_key,
    1,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (client_key) do update
  set
    count = case
      when rate_limits.reset_at <= v_now then 1
      when rate_limits.count >= p_limit then rate_limits.count
      else rate_limits.count + 1
    end,
    reset_at = case
      when rate_limits.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else rate_limits.reset_at
    end,
    updated_at = v_now
  returning rate_limits.count, rate_limits.reset_at
    into v_count, v_reset_at;

  return query
  select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_reset_at;
end;
$$;

revoke all on function public.consume_ai_rate_limit(text, integer, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.consume_ai_rate_limit(text, integer, integer) to service_role;
  end if;
end $$;
