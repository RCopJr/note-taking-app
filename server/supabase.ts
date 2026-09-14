import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import type { Database } from '../shared/database.types.ts';
import { ApiError } from './http.ts';

const serverSupabaseConfigSchema = z.object({
  url: z.url(),
  publishableKey: z.string().min(1),
}).strict();

let cachedConfig: z.infer<typeof serverSupabaseConfigSchema> | null = null;

function getServerSupabaseConfig() {
  if (cachedConfig) return cachedConfig;

  const result = serverSupabaseConfigSchema.safeParse({
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    throw new ApiError(503, 'CONFIGURATION_ERROR', 'Supabase is not configured.');
  }
  cachedConfig = result.data;
  return cachedConfig;
}

export function createServerSupabaseClient(accessToken?: string) {
  const config = getServerSupabaseConfig();
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(accessToken ? {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    } : {}),
  });
}
