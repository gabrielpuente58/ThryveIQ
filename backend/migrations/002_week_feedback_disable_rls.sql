-- Run in Supabase SQL editor.
-- week_feedback is written exclusively by the backend (anon key, no session),
-- so the `auth.uid() = user_id` policies from migration 001 always fail.
-- Match the pattern used by athlete_profiles / plans: disable RLS on this table.

alter table week_feedback disable row level security;

drop policy if exists "week_feedback_select_own" on week_feedback;
drop policy if exists "week_feedback_insert_own" on week_feedback;
drop policy if exists "week_feedback_update_own" on week_feedback;
drop policy if exists "week_feedback_delete_own" on week_feedback;
