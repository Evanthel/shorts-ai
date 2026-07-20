alter table public.profiles
  add column if not exists comfort_memory jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_comfort_memory_object;
alter table public.profiles
  add constraint profiles_comfort_memory_object
  check (jsonb_typeof(comfort_memory) = 'object');

alter table public.recommendations
  add column if not exists client_request_id uuid,
  add column if not exists engine_version text not null default 'shortsai-rules-v1',
  add column if not exists safety_policy_version text not null default 'shortsai-safety-v1',
  add column if not exists model_version text,
  add column if not exists source text not null default 'rules',
  add column if not exists selected_variant_id text,
  add column if not exists accepted_at timestamptz,
  add column if not exists feedback_due_at timestamptz;

alter table public.recommendations
  drop constraint if exists recommendations_source_check;
alter table public.recommendations
  add constraint recommendations_source_check check (source in ('rules', 'model'));

create unique index if not exists recommendations_client_request_id_key
  on public.recommendations (client_request_id)
  ;

create table if not exists public.recommendation_candidates (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  variant_id text not null,
  variant_kind text not null check (variant_kind in ('lighter', 'standard', 'warmer')),
  rank integer not null check (rank >= 1),
  candidate_payload jsonb not null,
  model_score double precision,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (recommendation_id, variant_id)
);

alter table public.feedback
  add column if not exists actually_worn text,
  add column if not exists adjustment text not null default 'none',
  add column if not exists problem_areas text[] not null default '{}'::text[],
  add column if not exists source text not null default 'web',
  add column if not exists updated_at timestamptz not null default now();

alter table public.feedback
  drop constraint if exists feedback_actually_worn_check,
  drop constraint if exists feedback_adjustment_check,
  drop constraint if exists feedback_source_check,
  drop constraint if exists feedback_problem_areas_check;
alter table public.feedback
  add constraint feedback_actually_worn_check
    check (actually_worn is null or actually_worn in ('yes', 'with_changes', 'no')),
  add constraint feedback_adjustment_check
    check (adjustment in ('none', 'added_layer', 'removed_layer', 'changed_top', 'changed_bottom', 'did_not_follow')),
  add constraint feedback_source_check check (source in ('web', 'mobile')),
  add constraint feedback_problem_areas_check
    check (problem_areas <@ array['upper', 'lower', 'hands_head', 'start', 'during', 'return']::text[]);

-- Legacy clients could create multiple ratings. Keep the newest record so future
-- corrections can use a single idempotent upsert.
with ranked_feedback as (
  select id, row_number() over (
    partition by user_id, recommendation_id
    order by created_at desc, id desc
  ) as position
  from public.feedback
)
delete from public.feedback
where id in (select id from ranked_feedback where position > 1);

create unique index if not exists feedback_user_recommendation_key
  on public.feedback (user_id, recommendation_id);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references public.recommendations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_mode text not null check (activity_mode in ('running', 'walking', 'commute')),
  intent text not null check (intent in (
    'why_outfit', 'overheating', 'rain_wind', 'return_conditions', 'carry_layer',
    'indoor_outdoor', 'adjust_warmer', 'adjust_lighter', 'avoid_item',
    'item_question', 'out_of_scope'
  )),
  action text not null check (action in ('explain', 'recalculate', 'refuse')),
  result_status text not null check (result_status in ('success', 'fallback', 'error')),
  source text not null check (source in ('shortcut', 'text')),
  created_at timestamptz not null default now()
);

create index if not exists recommendation_candidates_user_created_idx
  on public.recommendation_candidates (user_id, created_at desc);
create index if not exists recommendations_feedback_due_idx
  on public.recommendations (user_id, feedback_due_at)
  where accepted_at is not null;
create index if not exists ai_interactions_user_created_idx
  on public.ai_interactions (user_id, created_at desc);

alter table public.recommendation_candidates enable row level security;
alter table public.ai_interactions enable row level security;

drop policy if exists "Users manage their recommendation candidates" on public.recommendation_candidates;
create policy "Users manage their recommendation candidates"
  on public.recommendation_candidates for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and exists (
      select 1 from public.recommendations recommendation
      where recommendation.id = recommendation_id and recommendation.user_id = auth.uid()
    )
  );

drop policy if exists "Users manage their AI interaction metadata" on public.ai_interactions;
create policy "Users manage their AI interaction metadata"
  on public.ai_interactions for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and (
      recommendation_id is null or exists (
        select 1 from public.recommendations recommendation
        where recommendation.id = recommendation_id and recommendation.user_id = auth.uid()
      )
    )
  );

comment on column public.profiles.comfort_memory is
  'Context-scoped first-party comfort statistics. Legacy temperature_offset_c remains fallback-only.';
comment on table public.recommendation_candidates is
  'All safe candidate exposures shown for a recommendation, including non-selected variants.';
comment on table public.ai_interactions is
  'Structured intent analytics only. Raw user questions must never be stored.';
