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

export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});
