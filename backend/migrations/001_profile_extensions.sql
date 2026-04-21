-- Run in Supabase SQL editor.
-- Adds range-based weekly hours, focus discipline, and optional fitness benchmarks
-- to athlete_profiles. Also adds per-week feedback and plan state columns.

-- 1) Athlete profile: new fields
alter table athlete_profiles
    add column if not exists hours_min          float,
    add column if not exists hours_max          float,
    add column if not exists focus_discipline   text,
    add column if not exists ftp                int   default 0,
    add column if not exists lthr               int   default 0,
    add column if not exists css                text  default '';

-- current_background is no longer collected in onboarding — drop the NOT NULL
-- constraint and give it a default so legacy reads stay happy.
alter table athlete_profiles
    alter column current_background drop not null,
    alter column current_background set default '';

-- Backfill hours_min/hours_max for any existing rows.
update athlete_profiles
   set hours_max = coalesce(hours_max, weekly_hours),
       hours_min = coalesce(hours_min, greatest(weekly_hours * 0.6, 1))
 where hours_max is null or hours_min is null;

-- 2) Plans: track how many weeks have been generated so far (for week-by-week flow).
alter table plans
    add column if not exists weeks_generated int default 0;

-- 3) Week feedback table — one row per (user, week_index).
create table if not exists week_feedback (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users(id) on delete cascade,
    week_index   int  not null,
    rpe          int  check (rpe between 1 and 10),
    went_well    text default '',
    didnt_go_well text default '',
    notes        text default '',
    created_at   timestamp with time zone default now(),
    unique (user_id, week_index)
);

create index if not exists week_feedback_user_week_idx
    on week_feedback (user_id, week_index);

-- Row-level security: each user can only read/write their own feedback rows.
alter table week_feedback enable row level security;

drop policy if exists "week_feedback_select_own" on week_feedback;
create policy "week_feedback_select_own"
    on week_feedback for select
    using (auth.uid() = user_id);

drop policy if exists "week_feedback_insert_own" on week_feedback;
create policy "week_feedback_insert_own"
    on week_feedback for insert
    with check (auth.uid() = user_id);

drop policy if exists "week_feedback_update_own" on week_feedback;
create policy "week_feedback_update_own"
    on week_feedback for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists "week_feedback_delete_own" on week_feedback;
create policy "week_feedback_delete_own"
    on week_feedback for delete
    using (auth.uid() = user_id);
