// =====================================================================
// delete-account: permanently deletes the signed-in user's account.
//
// Called from the app's Account tab. Deleting the user also deletes all
// their rows (profile, contacts, check-ins, SOS events), because every table
// references auth.users with "on delete cascade" (see supabase/setup.sql).
// Google Play requires apps with accounts to offer this.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

// Allow the app (including the web preview) to call this function.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), {
    auth: { persistSession: false },
  });

  // Only the signed-in user can delete their own account.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: 'Could not delete account: ' + error.message }, 500);

  return json({ deleted: true });
});

// The server's secret key (needed to delete users; never leaves the server).
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
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
