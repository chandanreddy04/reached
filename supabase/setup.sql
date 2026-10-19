-- =====================================================================
-- Reached: database setup (Stage 4)
--
-- How to use: Supabase dashboard -> SQL Editor -> New query -> paste this
-- whole file -> Run. It's safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. TABLES
-- Every row has a user_id: the (anonymous) user who owns it. It's filled
-- in automatically from whoever is signed in (auth.uid()).
-- ---------------------------------------------------------------------

-- Your Circle of Trust.
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  phone       text not null check (char_length(phone) between 3 and 30),
  created_at  timestamptz not null default now()
);

-- Check-ins. status goes: 'active' -> 'safe' (you checked in)
--                                  -> 'missed' (the server noticed you didn't)
create table if not exists public.check_ins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started_at  timestamptz not null default now(),
  return_by   timestamptz not null,
  status      text not null default 'active' check (status in ('active', 'safe', 'missed')),
  ended_at    timestamptz,   -- when you tapped "I'm safe"
  missed_at   timestamptz    -- when the server marked it missed
);

-- Each person can only have one active check-in at a time.
create unique index if not exists check_ins_one_active_per_user
  on public.check_ins (user_id) where status = 'active';

-- Helps the every-minute checker find overdue check-ins quickly.
create index if not exists check_ins_active_return_by
  on public.check_ins (return_by) where status = 'active';

-- Each time someone presses SOS.
create table if not exists public.sos_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  latitude         double precision,   -- empty if location wasn't available
  longitude        double precision,
  accuracy_meters  double precision
);


-- ---------------------------------------------------------------------
-- 2. WHO CAN DO WHAT
-- "authenticated" = any signed-in user (including anonymous ones).
-- The app's public key on its own (not signed in) gets no access at all.
-- ---------------------------------------------------------------------

grant select, insert, update, delete on public.contacts   to authenticated;
grant select, insert, update        on public.check_ins  to authenticated;
grant select, insert                on public.sos_events to authenticated;


-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY: each user only sees and changes their own rows.
-- ---------------------------------------------------------------------

alter table public.contacts   enable row level security;
alter table public.check_ins  enable row level security;
alter table public.sos_events enable row level security;

-- Contacts: full control over your own contacts only.
drop policy if exists "Own contacts" on public.contacts;
create policy "Own contacts" on public.contacts
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Check-ins: see your own; start new ones as 'active'.
drop policy if exists "Read own check-ins" on public.check_ins;
create policy "Read own check-ins" on public.check_ins
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Start own check-ins" on public.check_ins;
create policy "Start own check-ins" on public.check_ins
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'active');

-- You can only change a check-in while it's still active, and only to
-- 'active' (new return time) or 'safe'. Only the server can set 'missed'.
drop policy if exists "Update own active check-ins" on public.check_ins;
create policy "Update own active check-ins" on public.check_ins
  for update to authenticated
  using      (user_id = (select auth.uid()) and status = 'active')
  with check (user_id = (select auth.uid()) and status in ('active', 'safe'));

-- SOS: record and see your own.
drop policy if exists "Own SOS events" on public.sos_events;
create policy "Own SOS events" on public.sos_events
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 4. THE MISSED CHECK-IN CHECKER
-- Marks every active check-in whose return time has passed as 'missed'.
-- Returns how many it marked. In Stage 5 this is where texts to the
-- Circle will be sent from.
-- "security definer" lets it update any user's rows, so we make sure
-- the app itself can never call it, only the scheduler.
-- ---------------------------------------------------------------------

create or replace function public.mark_missed_check_ins()
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.check_ins
       set status = 'missed', missed_at = now()
     where status = 'active'
       and return_by < now()
    returning 1
  )
  select count(*)::integer from marked;
$$;

revoke execute on function public.mark_missed_check_ins() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. RUN THE CHECKER EVERY MINUTE (pg_cron)
-- Running this again just updates the existing job (same name).
-- If "create extension" fails, enable "pg_cron" under
-- Database -> Extensions (or Integrations -> Cron) and run this file again.
-- ---------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'mark-missed-check-ins',              -- job name
  '* * * * *',                          -- every minute
  'select public.mark_missed_check_ins()'
);
