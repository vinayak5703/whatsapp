import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

console.log('Resolved Supabase configuration:');
console.log('  SUPABASE_URL =', supabaseUrl ? supabaseUrl : 'MISSING');
console.log('  SUPABASE_KEY source =', 
  process.env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' :
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' :
  process.env.SUPABASE_KEY ? 'SUPABASE_KEY' :
  process.env.SUPABASE_PUBLISHABLE_KEY ? 'SUPABASE_PUBLISHABLE_KEY' :
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' :
  'none');
console.log('  SUPABASE_KEY present =', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase configuration is incomplete. Set SUPABASE_URL and one of SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY, SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1 });
    if (error) {
      console.error('Supabase admin listUsers failed:', error.message || error);
      return;
    }
    console.log('Supabase admin listUsers succeeded. User count on first page:', data?.length ?? 0);
  } catch (error) {
    console.error('Supabase connection test error:', error instanceof Error ? error.message : error);
  }
})();