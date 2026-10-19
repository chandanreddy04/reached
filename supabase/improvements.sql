-- =====================================================================
-- Reached: app improvements (run AFTER setup.sql and stage5.sql)
--
-- A1. "All clear" texts: when you tap "I'm safe" after your Circle was
--     already alerted about a missed check-in, they get a follow-up text.
--
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file
-- -> Run. It's safe to run more than once.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. NEW COLUMNS ON CHECK-INS
-- ---------------------------------------------------------------------

-- How many missed-check-in alert texts were actually delivered (so we only
-- send an "all clear" if someone was really alerted).
alter table public.check_ins add column if not exists alerts_sent_count integer;

-- When you tapped "I'm safe" after the check-in was already missed.
alter table public.check_ins add column if not exists confirmed_safe_at timestamptz;

-- When the "all clear" texts were sent, and what happened ("Texted 2 of 2").
alter table public.check_ins add column if not exists all_clear_sent_at timestamptz;
alter table public.check_ins add column if not exists all_clear_summary text;


-- ---------------------------------------------------------------------
-- 2. "I'M SAFE" IN ONE STEP
-- Called by the app. Works on your own check-in only:
--   - still active  -> marked 'safe' (nobody was alerted)
--   - already missed -> remembers that you're safe, so the "all clear" can
--                       be sent; the check-in stays 'missed' in your history
-- Returns what happened, so the app can tell you the truth.
-- ---------------------------------------------------------------------

create or replace function public.confirm_safe(p_check_in_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.check_ins;
begin
  -- Only the owner can confirm their own check-in.
  select * into row
    from public.check_ins
   where id = p_check_in_id and user_id = auth.uid()
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if row.status = 'active' then
    update public.check_ins
       set status = 'safe', ended_at = now()
     where id = row.id;
    return jsonb_build_object('result', 'safe');
  end if;

  if row.status = 'missed' then
    update public.check_ins
       set confirmed_safe_at = coalesce(confirmed_safe_at, now())
     where id = row.id;
    return jsonb_build_object(
      'result', 'already_missed',
      'alerts_sent_at', row.alerts_sent_at,
      'alerts_summary', row.alerts_summary,
      'alerts_sent_count', row.alerts_sent_count
    );
  end if;

  -- Already safe (e.g. tapped twice).
  return jsonb_build_object('result', 'safe');
end;
$$;

revoke execute on function public.confirm_safe(uuid) from public, anon;
grant execute on function public.confirm_safe(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 3. EVERY MINUTE: ALSO CALL THE TEXTING FUNCTION FOR PENDING "ALL CLEAR"S
-- (Same job as before; it now also checks for all-clear texts to send.)
-- ---------------------------------------------------------------------

create or replace function public.process_missed_check_ins()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mark_missed_check_ins();

  if exists (
    select 1 from public.check_ins
     where status = 'missed'
       and (
         alerts_sent_at is null
         or (confirmed_safe_at is not null and all_clear_sent_at is null)
       )
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

-- Note: older missed check-ins never get a surprise "all clear": it's only
-- sent after someone taps "I'm safe" on that check-in (confirmed_safe_at).
