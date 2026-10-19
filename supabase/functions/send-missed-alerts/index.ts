// =====================================================================
// send-missed-alerts: texts the Circle of everyone who missed a check-in,
// and later an "all clear" once that person taps "I'm safe".
//
// Called every minute by the database (see supabase/stage5.sql and
// supabase/improvements.sql), but only when there's something to send. The
// app also calls it right after "I'm safe" so the all-clear goes out at once.
//
// Safe to call any number of times: each text is "claimed" (marked as sent)
// before sending, so nobody is ever texted twice.
//
// Needs these Edge Function Secrets: TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), {
    auth: { persistSession: false },
  });

  // 1. Claim every missed check-in that hasn't been texted yet.
  const { data: claimed, error } = await admin
    .from('check_ins')
    .update({ alerts_sent_at: new Date().toISOString(), alerts_summary: 'Sending…' })
    .eq('status', 'missed')
    .is('alerts_sent_at', null)
    .select('id, user_id, return_by, time_zone');
  if (error) return json({ error: error.message }, 500);

  // 2. Text each person's Circle.
  for (const checkIn of claimed ?? []) {
    const [{ data: contacts }, name] = await Promise.all([
      admin.from('contacts').select('name, phone').eq('user_id', checkIn.user_id),
      displayName(admin, checkIn.user_id),
    ]);

    const backBy = formatTime(checkIn.return_by, checkIn.time_zone);
    const message =
      `🚨 Reached alert: ${name} hasn't checked in. ` +
      `They expected to be back by ${backBy}. Please try to contact them.`;

    const result = await textEveryone(contacts ?? [], message);
    await admin
      .from('check_ins')
      .update({ alerts_summary: result.summary, alerts_sent_count: result.sent })
      .eq('id', checkIn.id);
  }

  // 3. "All clear": claim every missed check-in whose owner has since tapped
  //    "I'm safe", once its alerts have finished sending.
  const { data: safeNow, error: safeError } = await admin
    .from('check_ins')
    .update({ all_clear_sent_at: new Date().toISOString(), all_clear_summary: 'Sending…' })
    .eq('status', 'missed')
    .not('confirmed_safe_at', 'is', null)
    .is('all_clear_sent_at', null)
    .not('alerts_sent_at', 'is', null)
    .neq('alerts_summary', 'Sending…')
    .select('id, user_id, alerts_sent_count, alerts_summary');
  if (safeError) return json({ error: safeError.message }, 500);

  // 4. Text the Circle that they're safe, but only if an alert really reached
  //    someone (no "all clear" about an alarm nobody received).
  for (const checkIn of safeNow ?? []) {
    if (alertsDelivered(checkIn.alerts_sent_count, checkIn.alerts_summary) === 0) {
      await admin
        .from('check_ins')
        .update({ all_clear_summary: 'Not needed: no alert was delivered' })
        .eq('id', checkIn.id);
      continue;
    }

    const [{ data: contacts }, name] = await Promise.all([
      admin.from('contacts').select('name, phone').eq('user_id', checkIn.user_id),
      displayName(admin, checkIn.user_id),
    ]);
    const message =
      `✅ Update from Reached: ${name} has checked in and is safe. ` +
      'Thank you for looking out for them.';

    const result = await textEveryone(contacts ?? [], message);
    await admin.from('check_ins').update({ all_clear_summary: result.summary }).eq('id', checkIn.id);
  }

  return json({ processed: claimed?.length ?? 0, allClear: safeNow?.length ?? 0 });
});

// How many alert texts were delivered. Older check-ins (from before the count
// was stored) only have the summary, e.g. "Texted 2 of 2 (…)".
function alertsDelivered(count: number | null, summary: string | null): number {
  if (count !== null) return count;
  const match = summary?.match(/^Texted (\d+) of/);
  return match ? Number(match[1]) : 0;
}

// "9:30 PM" in the person's own time zone (falls back to UTC).
function formatTime(iso: string, timeZone: string | null): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone ?? 'UTC',
      timeZoneName: 'short',
    });
  } catch {
    return new Date(iso).toUTCString();
  }
}

// ----- Helpers (the same ones are in send-sos) -----

type Contact = { name: string; phone: string };

async function textEveryone(contacts: Contact[], message: string) {
  if (contacts.length === 0) {
    return { sent: 0, total: 0, errors: [], summary: 'No one in Circle' };
  }
  const results = await Promise.all(contacts.map((c) => sendSms(c.phone, message)));
  const errors = results
    .map((r, i) => (r.ok ? null : `${contacts[i].name}: ${r.error}`))
    .filter((e): e is string => e !== null);
  const sent = results.filter((r) => r.ok).length;
  return {
    sent,
    total: contacts.length,
    errors,
    summary:
      `Texted ${sent} of ${contacts.length}` +
      (trialTemplate() ? ' [trial template]' : '') +
      (errors.length ? ` (${errors.join('; ')})` : ''),
  };
}

// Twilio TRIAL accounts can't send custom text, only Twilio's own sample
// templates (e.g. "sms_account_alerts"). While the secret
// TWILIO_TRIAL_TEMPLATE is set, that template is sent instead of our message,
// to test that texts arrive. Delete the secret after upgrading Twilio and the
// real messages are sent; no code change needed.
function trialTemplate(): string | null {
  return Deno.env.get('TWILIO_TRIAL_TEMPLATE') || null;
}

async function sendSms(to: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !authToken || !from) return { ok: false, error: 'Twilio is not set up' };

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: trialTemplate() ?? body }),
  });
  if (response.ok) return { ok: true };
  const details = await response.json().catch(() => ({}));
  return { ok: false, error: details.message ?? `HTTP ${response.status}` };
}

// deno-lint-ignore no-explicit-any
async function displayName(admin: any, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('display_name').eq('user_id', userId).maybeSingle();
  return data?.display_name ?? 'Someone who listed you as a trusted contact';
}

// The server's secret key (bypasses privacy rules, so it never leaves the server).
function serverKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    const first = Object.values(JSON.parse(keys))[0];
    if (typeof first === 'string') return first;
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
