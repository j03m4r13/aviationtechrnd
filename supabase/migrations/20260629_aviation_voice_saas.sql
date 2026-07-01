-- Aviation Voice MVP v0.3 SaaS foundation
-- Run once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_session_id text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  duration_ms bigint not null check (duration_ms > 0),
  source_language text not null,
  target_language text not null,
  status text not null check (status in ('recorded', 'processing', 'completed', 'failed')),
  original_transcript text,
  translated_transcript text,
  error_message text,
  input_name text,
  input_type text,
  transcription_model text,
  translation_model text,
  deleted_at timestamptz,
  unique (user_id, device_session_id)
);

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_session_id uuid not null references public.recording_sessions(id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  retry_count integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recording_session_id uuid not null references public.recording_sessions(id) on delete cascade,
  processing_job_id uuid not null references public.processing_jobs(id) on delete cascade,
  audio_duration_ms bigint not null check (audio_duration_ms > 0),
  billable_audio_seconds integer not null check (billable_audio_seconds > 0),
  transcription_model text not null,
  translation_model text not null,
  input_tokens bigint,
  output_tokens bigint,
  estimated_cost_usd numeric(12, 6),
  created_at timestamptz not null default now(),
  unique (processing_job_id)
);

create index if not exists recording_sessions_user_created_idx
  on public.recording_sessions(user_id, created_at desc)
  where deleted_at is null;

create index if not exists usage_events_user_created_idx
  on public.usage_events(user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.recording_sessions enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "recording_sessions_select_own" on public.recording_sessions;
create policy "recording_sessions_select_own"
  on public.recording_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "processing_jobs_select_own" on public.processing_jobs;
create policy "processing_jobs_select_own"
  on public.processing_jobs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "usage_events_select_own" on public.usage_events;
create policy "usage_events_select_own"
  on public.usage_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.recording_sessions to authenticated;
grant select on public.processing_jobs to authenticated;
grant select on public.usage_events to authenticated;
