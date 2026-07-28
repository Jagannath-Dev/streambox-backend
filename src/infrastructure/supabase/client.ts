import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../shared/config/env.js';

export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
