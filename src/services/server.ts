/**
 * Talking to the server (Supabase).
 *
 * The server is what makes the app trustworthy: it keeps watching your
 * check-in even if your phone dies, and marks it "missed" if you don't check
 * in on time (see supabase/setup.sql for the every-minute checker).
 *
 * Every function here returns null / false instead of throwing when the
 * server can't be reached, so the rest of the app can carry on and tell
 * you what happened.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Contact } from '@/state/safety-store';

// These come from .env.local (EXPO_PUBLIC_ values are built into the app).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// While the web version is pre-rendered on your computer there is no
// browser (no `window`), so there's nothing to connect from.
const isPreRendering = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase =
  url && key && !isPreRendering
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage, // remember the sign-in between app launches
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

if (!url || !key) {
  console.warn('Supabase URL or key missing: check .env.local. Running without a server.');
}

// Keep the sign-in fresh only while the app is open (saves battery).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// ----- Logging in with your phone number -----
//
// 1. sendLoginCode(phone): Supabase texts a 6-digit code (via Twilio).
// 2. verifyLoginCode(phone, code): if the code is right, you're logged in.
// Supabase remembers the login between app launches. Older versions of the
// app used anonymous accounts; those don't count as logged in any more.

/** The logged-in phone number (e.g. "+15551234567"), or null if not logged in. */
export async function getLoggedInPhone(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous || !user.phone) return null;
  return user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
}

/** Calls `onChange` whenever you log in or out. Returns a function to stop listening. */
export function onLoginChange(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => onChange());
  return () => data.subscription.unsubscribe();
}

/** Text a login code to this number. Returns an error message, or null if sent. */
export async function sendLoginCode(phone: string): Promise<string | null> {
  if (!supabase) return 'Not connected to the server';
  try {
    const { error } = await supabase.auth.signInWithOtp({ phone });
    return error ? error.message : null;
  } catch {
    return 'Could not reach the server. Check your internet.';
  }
}

/** Check the code. Returns an error message, or null if you're now logged in. */
export async function verifyLoginCode(phone: string, code: string): Promise<string | null> {
  if (!supabase) return 'Not connected to the server';
  try {
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    return error ? error.message : null;
  } catch {
    return 'Could not reach the server. Check your internet.';
  }
}

export async function logOut(): Promise<void> {
  await supabase?.auth.signOut().catch(() => {});
}

/**
 * Permanently delete your account and everything stored about you on the
 * server (the "delete-account" server function). Returns an error message,
 * or null if deleted.
 */
export async function deleteAccount(): Promise<string | null> {
  if (!supabase) return 'Not connected to the server';
  try {
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) {
      const details = await error.context?.json?.().catch(() => null);
      return details?.error ?? error.message;
    }
    return null;
  } catch {
    return 'Could not reach the server. Check your internet.';
  }
}

// ----- Contacts -----

export async function fetchContacts(): Promise<Contact[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .order('created_at');
  if (error) {
    console.warn('Could not load contacts from server:', error.message);
    return null;
  }
  return data;
}

export async function insertContact(name: string, phone: string): Promise<Contact | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('contacts')
    .insert({ name, phone })
    .select('id, name, phone')
    .single();
  if (error) {
    console.warn('Could not save contact:', error.message);
    return null;
  }
  return data;
}

export async function deleteContact(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) console.warn('Could not delete contact:', error.message);
  return !error;
}

// ----- Check-ins -----

export type ServerCheckInStatus = 'active' | 'safe' | 'missed';

// The phone's time zone, e.g. "America/New_York", so texts to your Circle
// show your local time.
function timeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * Start a check-in on the server, or move the return time of the one that's
 * already active (you can only have one active check-in at a time).
 * Returns the server's id for it.
 */
export async function startOrUpdateCheckIn(returnBy: Date): Promise<string | null> {
  if (!supabase) return null;
  const fields = { return_by: returnBy.toISOString(), time_zone: timeZone() };

  const updated = await supabase
    .from('check_ins')
    .update(fields)
    .eq('status', 'active')
    .select('id');
  if (updated.error) {
    console.warn('Could not update check-in:', updated.error.message);
    return null;
  }
  if (updated.data.length > 0) return updated.data[0].id;

  const inserted = await supabase
    .from('check_ins')
    .insert(fields)
    .select('id')
    .single();
  if (inserted.error) {
    console.warn('Could not start check-in:', inserted.error.message);
    return null;
  }
  return inserted.data.id;
}

// What really happened when you tapped "I'm safe".
export type EndCheckInResult =
  | { reached: false } // couldn't reach the server
  | { reached: true; alreadyMissed: false } // marked safe in time: nobody alerted
  // Too late: already missed. alertsSummary says what was actually sent,
  // e.g. "Texted 1 of 1", "Texted 0 of 2 (…errors…)" or "No one in Circle".
  | { reached: true; alreadyMissed: true; alertsSentAt: string | null; alertsSummary: string | null };

/**
 * Tell the server you're safe. Only works while the check-in is still active:
 * if the server already marked it missed, it can't be changed (the privacy
 * rules forbid it), and we report that instead of pretending it worked.
 */
export async function markCheckInSafe(id: string): Promise<EndCheckInResult> {
  if (!supabase) return { reached: false };
  const { data, error } = await supabase
    .from('check_ins')
    .update({ status: 'safe', ended_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'active')
    .select('id');
  if (error) {
    console.warn('Could not mark check-in safe:', error.message);
    return { reached: false };
  }
  if (data.length > 0) return { reached: true, alreadyMissed: false };

  // Nothing was updated, so it's no longer active: find out what happened.
  const latest = await fetchCheckInStatus(id);
  if (!latest) return { reached: false };
  if (latest.status === 'safe') return { reached: true, alreadyMissed: false };
  return {
    reached: true,
    alreadyMissed: true,
    alertsSentAt: latest.alertsSentAt,
    alertsSummary: latest.alertsSummary,
  };
}

export type ServerCheckIn = {
  status: ServerCheckInStatus;
  alertsSentAt: string | null; // when the server texted your Circle
  alertsSummary: string | null; // e.g. "Texted 2 of 2"
};

/** Ask the server what it currently knows about this check-in. */
export async function fetchCheckInStatus(id: string): Promise<ServerCheckIn | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('check_ins')
    .select('status, alerts_sent_at, alerts_summary')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: data.status as ServerCheckInStatus,
    alertsSentAt: data.alerts_sent_at,
    alertsSummary: data.alerts_summary,
  };
}

// ----- Your name -----

export async function fetchProfileName(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('display_name').maybeSingle();
  return data?.display_name ?? null;
}

export async function saveProfileName(name: string): Promise<boolean> {
  if (!supabase) return false;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return false;
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: userId, display_name: name, updated_at: new Date().toISOString() });
  if (error) console.warn('Could not save name:', error.message);
  return !error;
}

// ----- SOS -----

export type SosResult =
  // trialTemplate: Twilio is on a trial account, so a generic Twilio sample
  // text was sent instead of the real SOS message.
  | { ok: true; sent: number; total: number; errors: string[]; trialTemplate: boolean }
  | { ok: false; error: string };

/**
 * Ask the server to text your whole Circle with your location (the
 * "send-sos" server function, see supabase/functions/send-sos).
 */
export async function sendSos(
  location: { latitude: number; longitude: number; accuracyMeters: number | null } | null,
): Promise<SosResult> {
  if (!supabase) return { ok: false, error: 'Not connected to the server' };
  try {
    const { data, error } = await supabase.functions.invoke('send-sos', {
      body: location ?? {},
    });
    if (error) {
      // The function's own error message, e.g. "Too many SOS alerts…".
      const details = await error.context?.json?.().catch(() => null);
      return { ok: false, error: details?.error ?? error.message };
    }
    return {
      ok: true,
      sent: data.sent,
      total: data.total,
      errors: data.errors ?? [],
      trialTemplate: data.trialTemplate === true,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}
