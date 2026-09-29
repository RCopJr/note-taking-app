import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';

const browserAuthConfigSchema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
}).strict();

const env = import.meta.env as Record<string, string | undefined>;
const config = browserAuthConfigSchema.parse({
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
});

export const localMfaDisabled = env.VITE_LOCAL_DISABLE_MFA === 'true';
const supabaseHostname = new URL(config.url).hostname;
if (localMfaDisabled && !['127.0.0.1', 'localhost', '::1'].includes(supabaseHostname)) {
  throw new Error('VITE_LOCAL_DISABLE_MFA is allowed only with a loopback Supabase URL.');
}

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
