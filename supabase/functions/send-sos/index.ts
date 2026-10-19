// =====================================================================
// send-sos: texts your whole Circle right away, with your location.
//
// Called by the app's SOS button. Runs on Supabase's servers (not in the
// app), so the Twilio password never leaves the server.
//
// Needs these Edge Function Secrets: TWILIO_ACCOUNT_SID,
// TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

// Allow the app (including the web preview) to call this function.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Limit: at most this many SOS alerts per person in 10 minutes (protects
// against a stuck button sending dozens of texts).
const MAX_SOS_PER_10_MIN = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), {
    auth: { persistSession: false },
  });

  // 1. Who is asking? The app sends the signed-in user's token.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  // 2. Rate limit.
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('sos_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', tenMinutesAgo);
  if ((count ?? 0) >= MAX_SOS_PER_10_MIN) {
    return json({ error: 'Too many SOS alerts in the last 10 minutes. Please call someone directly.' }, 429);
  }

  // 3. Location sent by the app (may be missing if GPS wasn't available).
  const input = await req.json().catch(() => ({}));
  const latitude = validNumber(input.latitude, -90, 90);
  const longitude = validNumber(input.longitude, -180, 180);
  const hasLocation = latitude !== null && longitude !== null;

  // 4. Record the SOS.
  const { data: sos, error: sosError } = await admin
    .from('sos_events')
    .insert({
      user_id: user.id,
      latitude: hasLocation ? latitude : null,
      longitude: hasLocation ? longitude : null,
      accuracy_meters: validNumber(input.accuracyMeters, 0, 100000),
    })
    .select('id')
    .single();
  if (sosError) return json({ error: 'Could not record SOS' }, 500);

  // 5. Text everyone in the Circle.
  const [{ data: contacts }, name] = await Promise.all([
    admin.from('contacts').select('name, phone').eq('user_id', user.id),
    displayName(admin, user.id),
  ]);
  const message =
    `🆘 SOS from ${name} via Reached. ` +
    (hasLocation
      ? `Their location: https://www.google.com/maps/search/?api=1&query=${latitude},${longitude} `
      : 'Their location is not available. ') +
    'Please contact them now.';

  const result = await textEveryone(contacts ?? [], message);

  await admin
    .from('sos_events')
    .update({ alerts_sent_at: new Date().toISOString(), alerts_summary: result.summary })
    .eq('id', sos.id);

  return json({ ...result, trialTemplate: trialTemplate() !== null });
});

// ----- Helpers (the same ones are in send-missed-alerts) -----

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

function validNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
