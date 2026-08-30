import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { inspect } from 'node:util';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseKeySource = process.env.SUPABASE_SECRET_KEY
  ? 'SUPABASE_SECRET_KEY'
  : process.env.SUPABASE_SERVICE_ROLE_KEY
  ? 'SUPABASE_SERVICE_ROLE_KEY'
  : process.env.SUPABASE_KEY
  ? 'SUPABASE_KEY'
  : process.env.SUPABASE_PUBLISHABLE_KEY
  ? 'SUPABASE_PUBLISHABLE_KEY'
  : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  : 'none';
const isPublishableKey = Boolean(rawSupabaseKey && /publishable|anon/i.test(rawSupabaseKey));

console.log('Resolved Supabase configuration:');
console.log('  SUPABASE_URL =', supabaseUrl ? supabaseUrl : 'MISSING');
console.log('  SUPABASE_KEY source =', supabaseKeySource);
console.log('  SUPABASE_KEY present =', !!rawSupabaseKey);

if (!supabaseUrl || !rawSupabaseKey) {
  console.error('Supabase configuration is incomplete. Set SUPABASE_URL and one of SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_KEY.');
  process.exit(1);
}

if (isPublishableKey) {
  console.error('Supabase configuration error: the resolved key appears to be a publishable/anon key. Use SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for server-side auth/admin operations.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, rawSupabaseKey);

function logConnectionError(label, error) {
  console.error(label, error instanceof Error ? error.message : error);
  console.error('Error details:', inspect(error, { depth: 4, showHidden: true }));
  if (error instanceof Error && error.cause) {
    const cause = error.cause;
    console.error('Underlying network error:', {
      name: cause.name,
      code: cause.code,
      message: cause.message,
      hostname: cause.hostname,
      address: cause.address,
      port: cause.port
    });
  }
}

(async () => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) {
      logConnectionError('Supabase admin listUsers failed:', error);
      return;
    }
    console.log('Supabase admin listUsers succeeded. User count on first page:', data?.length ?? 0);
  } catch (error) {
    logConnectionError('Supabase connection test error:', error);
  }
})();
