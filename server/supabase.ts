import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import type { Database } from '../shared/database.types.ts';

export const serverSupabaseConfigSchema = z.object({
  url: z.url(),
  publishableKey: z.string().trim().min(1),
}).strict();

export type ServerSupabaseConfig = z.infer<typeof serverSupabaseConfigSchema>;

export function createServerSupabaseClient(
  config: ServerSupabaseConfig,
  accessToken?: string,
) {
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
