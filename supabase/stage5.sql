-- =====================================================================
-- Reached: Stage 5 database changes (text messages to your Circle)
--
-- Run AFTER setup.sql. Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. It's safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. YOUR NAME
-- Texts need to say who they're about ("Alex hasn't checked in").
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  updated_at    timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
alter table public.profiles enable row level security;

-- The server functions (send-sos, send-missed-alerts) use the server key,
-- which acts as the "service_role". It skips the privacy rules, but it still
-- needs permission to use each table, because this project doesn't expose
-- new tables automatically.
grant select, insert, update, delete
  on public.contacts, public.check_ins, public.sos_events, public.profiles
  to service_role;

drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 2. NEW COLUMNS
-- ---------------------------------------------------------------------

-- Your time zone (e.g. "America/New_York"), so texts show your local time.
alter table public.check_ins add column if not exists time_zone text;

-- When texts were sent and a short summary ("Texted 2 of 2 people").
alter table public.check_ins  add column if not exists alerts_sent_at timestamptz;
alter table public.check_ins  add column if not exists alerts_summary text;
alter table public.sos_events add column if not exists alerts_sent_at timestamptz;
alter table public.sos_events add column if not exists alerts_summary text;

-- The app may only change these check-in columns; the "texts sent"
-- columns are written only by the server.
revoke update on public.check_ins from authenticated;
grant update (return_by, time_zone, status, ended_at) on public.check_ins to authenticated;

-- Don't text anyone about check-ins that were missed before texting existed
-- (e.g. test check-ins from Stage 4).
update public.check_ins
   set alerts_sent_at = now(), alerts_summary = 'Missed before texting was set up'
 where status = 'missed' and alerts_sent_at is null;


-- ---------------------------------------------------------------------
-- 3. EVERY MINUTE: MARK MISSED CHECK-INS, THEN TEXT THE CIRCLE
-- pg_net lets the database call our "send-missed-alerts" server function.
-- It's only called when there's actually someone to text.
-- ---------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.process_missed_check_ins()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mark_missed_check_ins();

  if exists (
    select 1 from public.check_ins where status = 'missed' and alerts_sent_at is null
  ) then
    perform net.http_post(
      url     := 'https://yzhwendgklitjoslagoq.supabase.co/functions/v1/send-missed-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- the app's public key (the same one built into the app; not a secret)
        'apikey', 'sb_publishable_0QLNGKRrBuUO_0TUm4hEXQ_juGyBJJH'
      ),
      body    := '{}'::jsonb
    );
  end if;
end;
$$;

revoke execute on function public.process_missed_check_ins() from public, anon, authenticated;

-- Replace the Stage 4 job (same name) so it now also sends texts.
select cron.schedule(
  'mark-missed-check-ins',
  '* * * * *',
  'select public.process_missed_check_ins()'
);
